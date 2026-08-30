import { scaleTicks } from '@/editor-v2/time/timebase';
import { getAudioEnvelopeGain } from '@/editor-v2/timeline/audio-plan';
import { KEYBOARD_SOUND_SAMPLES_PER_TYPE } from '@/types/audio';
import {
  EDITOR_V2_TICKS_PER_SECOND,
  type AudioTimelinePlan,
  type AudioTimelineRegionPlan,
  type EditorProjectV2,
  type KeyboardSoundPlan,
} from '@/types/editor-v2';

interface ScheduledSource {
  stop: () => void;
}

interface PlaybackAnchor {
  contextTime: number;
  outputTick: number;
}

export interface AudioMediaChunk {
  buffer: AudioBuffer;
  sourceStartSeconds: number;
  sourceDurationSeconds: number;
}

export interface AudioMediaStream {
  next: () => Promise<AudioMediaChunk | null>;
  dispose: () => void;
}

export interface CreateAudioMediaStreamInput {
  url: string;
  streamIndex: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
}

export interface AudioSchedulerOptions {
  projectToken: string;
  createContext?: () => AudioContext;
  createMediaStream?: (
    input: CreateAudioMediaStreamInput
  ) => Promise<AudioMediaStream>;
  onError?: (error: string) => void;
}

interface PreparedRegion {
  region: AudioTimelineRegionPlan;
  stream: AudioMediaStream;
  chunks: AudioMediaChunk[];
}

const MEDIA_LOOKAHEAD_SECONDS = 2;
const MEDIA_CHUNK_QUEUE_SIZE = 8;

const ticksToSeconds = (ticks: number): number =>
  ticks / EDITOR_V2_TICKS_PER_SECOND;

const secondsToTicks = (seconds: number): number =>
  Math.round(seconds * EDITOR_V2_TICKS_PER_SECOND);

const keyboardSampleUrl = (sound: KeyboardSoundPlan): string => {
  const index =
    sound.sampleIndex % Math.max(1, KEYBOARD_SOUND_SAMPLES_PER_TYPE);
  return `sounds/keyboard/${sound.soundType}/press-${index + 1}.mp3`;
};

const configureLinearEnvelope = (
  parameter: AudioParam,
  contextStart: number,
  outputStart: number,
  outputEnd: number,
  range: { start: number; end: number },
  direction: 'in' | 'out'
): void => {
  const duration = Math.max(1, range.end - range.start);
  const factorAt = (tick: number) => {
    const progress = Math.min(1, Math.max(0, (tick - range.start) / duration));
    return direction === 'in' ? progress : 1 - progress;
  };
  parameter.setValueAtTime(factorAt(outputStart), contextStart);
  const rampStart = Math.max(outputStart, range.start);
  const rampEnd = Math.min(outputEnd, range.end);
  if (rampStart > outputStart && rampStart < outputEnd) {
    parameter.setValueAtTime(
      factorAt(rampStart),
      contextStart + ticksToSeconds(rampStart - outputStart)
    );
  }
  if (rampEnd > rampStart) {
    parameter.linearRampToValueAtTime(
      factorAt(rampEnd),
      contextStart + ticksToSeconds(rampEnd - outputStart)
    );
  }
};

const getStreamIndex = (
  project: EditorProjectV2,
  region: AudioTimelineRegionPlan
): number => {
  const asset = project.assets[region.assetId];
  if (!asset || asset.kind === 'image') return 0;
  if (asset.kind !== 'capty-recording' || region.sourceRole === 'primary') {
    const index = asset.audioStreams.findIndex(
      stream => stream.id === region.sourceStreamId
    );
    return Math.max(0, index);
  }
  const streams =
    region.sourceRole === 'system-audio'
      ? asset.sources.systemAudio?.streams
      : region.sourceRole === 'microphone-audio'
        ? asset.sources.microphoneAudio?.streams
        : undefined;
  const index = streams?.findIndex(
    stream => stream.id === region.sourceStreamId
  );
  return Math.max(0, index ?? 0);
};

const createDefaultMediaStream = async ({
  url,
  streamIndex,
  sourceStartSeconds,
  sourceEndSeconds,
}: CreateAudioMediaStreamInput): Promise<AudioMediaStream> => {
  const { ALL_FORMATS, AudioSampleSink, Input, UrlSource } =
    await import('mediabunny');
  const input = new Input({
    formats: ALL_FORMATS,
    source: new UrlSource(url, { maxCacheSize: 16 * 1024 * 1024 }),
  });
  const tracks = await input.getAudioTracks();
  const track = tracks[streamIndex] ?? tracks[0];
  if (!track) {
    input.dispose();
    throw new Error('The media source has no decodable audio track');
  }
  const firstTimestamp = await input.getFirstTimestamp([track]);
  const sink = new AudioSampleSink(track);
  const iterator = sink.samples(
    firstTimestamp + sourceStartSeconds,
    firstTimestamp + sourceEndSeconds
  );
  let disposed = false;
  return {
    async next() {
      while (!disposed) {
        const result = await iterator.next();
        if (result.done) return null;
        const sample = result.value;
        const normalizedStart = sample.timestamp - firstTimestamp;
        const normalizedEnd = normalizedStart + sample.duration;
        const selectedStart = Math.max(sourceStartSeconds, normalizedStart);
        const selectedEnd = Math.min(sourceEndSeconds, normalizedEnd);
        if (selectedEnd <= selectedStart) {
          sample.close();
          continue;
        }
        const frameStart = Math.max(
          0,
          Math.ceil((selectedStart - normalizedStart) * sample.sampleRate)
        );
        const frameEnd = Math.min(
          sample.numberOfFrames,
          Math.floor((selectedEnd - normalizedStart) * sample.sampleRate)
        );
        if (frameEnd <= frameStart) {
          sample.close();
          continue;
        }
        const selected =
          frameStart === 0 && frameEnd === sample.numberOfFrames
            ? sample
            : sample.trim(frameStart, frameEnd);
        const chunk = {
          buffer: selected.toAudioBuffer(),
          sourceStartSeconds: normalizedStart + frameStart / sample.sampleRate,
          sourceDurationSeconds: selected.duration,
        };
        if (selected !== sample) selected.close();
        sample.close();
        return chunk;
      }
      return null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      input.dispose();
    },
  };
};

export class EditorV2AudioScheduler {
  private context: AudioContext | null = null;
  private playbackAnchor: PlaybackAnchor | null = null;
  private generation = 0;
  private readonly scheduled = new Set<ScheduledSource>();
  private readonly streams = new Set<AudioMediaStream>();
  private readonly keyboardBuffers = new Map<string, Promise<AudioBuffer>>();

  constructor(private readonly options: AudioSchedulerOptions) {}

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = this.options.createContext?.() ?? new AudioContext();
    }
    return this.context;
  }

  private async decodeUrl(
    url: string,
    context: AudioContext
  ): Promise<AudioBuffer> {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Audio source returned ${response.status}`);
    return context.decodeAudioData(await response.arrayBuffer());
  }

  private async loadKeyboardBuffer(
    context: AudioContext,
    sound: KeyboardSoundPlan
  ): Promise<AudioBuffer> {
    const url = keyboardSampleUrl(sound);
    const cached = this.keyboardBuffers.get(url);
    if (cached) return cached;
    const pending = this.decodeUrl(url, context).catch(error => {
      this.keyboardBuffers.delete(url);
      throw error;
    });
    this.keyboardBuffers.set(url, pending);
    return pending;
  }

  private stopScheduled(): void {
    for (const source of this.scheduled) source.stop();
    this.scheduled.clear();
    for (const stream of this.streams) stream.dispose();
    this.streams.clear();
  }

  private connectRegionEnvelope(
    context: AudioContext,
    source: AudioBufferSourceNode,
    region: AudioTimelineRegionPlan,
    contextStart: number,
    outputStart: number,
    outputEnd: number
  ): void {
    const baseGain = context.createGain();
    baseGain.gain.setValueAtTime(region.muted ? 0 : region.gain, contextStart);
    source.connect(baseGain);
    let tail: AudioNode = baseGain;
    const appendEnvelope = (
      range: { start: number; end: number },
      direction: 'in' | 'out'
    ) => {
      const node = context.createGain();
      configureLinearEnvelope(
        node.gain,
        contextStart,
        outputStart,
        outputEnd,
        range,
        direction
      );
      tail.connect(node);
      tail = node;
    };
    if (region.envelope.fadeIn) {
      appendEnvelope(region.envelope.fadeIn, 'in');
    }
    if (region.envelope.fadeOut) {
      appendEnvelope(region.envelope.fadeOut, 'out');
    }
    if (region.envelope.crossfade) {
      appendEnvelope(
        region.envelope.crossfade,
        region.envelope.crossfade.role === 'incoming' ? 'in' : 'out'
      );
    }
    tail.connect(context.destination);
  }

  private scheduleMediaChunk(
    context: AudioContext,
    chunk: AudioMediaChunk,
    region: AudioTimelineRegionPlan,
    startTick: number,
    contextOrigin: number,
    generation: number,
    onEnded: () => void,
    maximumOutputEnd = region.outputEnd
  ): void {
    if (generation !== this.generation || region.muted) return;
    const rate =
      region.playbackRate.numerator / region.playbackRate.denominator;
    const sourceOffsetSeconds =
      chunk.sourceStartSeconds - ticksToSeconds(region.sourceStart);
    const outputStart =
      region.outputStart + secondsToTicks(sourceOffsetSeconds / rate);
    const outputDuration = secondsToTicks(chunk.sourceDurationSeconds / rate);
    const outputEnd = Math.min(maximumOutputEnd, outputStart + outputDuration);
    const visibleStart = Math.max(startTick, outputStart);
    if (outputEnd <= visibleStart) {
      onEnded();
      return;
    }
    const intendedContextStart =
      contextOrigin + ticksToSeconds(visibleStart - startTick);
    const contextStart = Math.max(context.currentTime, intendedContextStart);
    const lateOutputSeconds = Math.max(0, contextStart - intendedContextStart);
    const sourceOffset =
      ticksToSeconds(visibleStart - outputStart) * rate +
      lateOutputSeconds * rate;
    const sourceDuration = Math.min(
      chunk.sourceDurationSeconds - sourceOffset,
      ticksToSeconds(outputEnd - visibleStart) * rate - lateOutputSeconds * rate
    );
    if (sourceDuration <= 0) {
      onEnded();
      return;
    }
    const effectiveOutputStart =
      visibleStart + secondsToTicks(lateOutputSeconds);
    const effectiveOutputEnd =
      effectiveOutputStart + secondsToTicks(sourceDuration / rate);
    const source = context.createBufferSource();
    source.buffer = chunk.buffer;
    source.playbackRate.value = rate;
    this.connectRegionEnvelope(
      context,
      source,
      region,
      contextStart,
      effectiveOutputStart,
      effectiveOutputEnd
    );
    const scheduledSource: ScheduledSource = {
      stop: () => {
        try {
          source.stop();
        } catch {
          return;
        }
      },
    };
    this.scheduled.add(scheduledSource);
    source.onended = () => {
      this.scheduled.delete(scheduledSource);
      onEnded();
    };
    source.start(contextStart, sourceOffset, sourceDuration);
  }

  private async createPreparedRegion(
    project: EditorProjectV2,
    region: AudioTimelineRegionPlan,
    initialChunks: number,
    startAtOutputTick: number
  ): Promise<PreparedRegion> {
    const result = await window.editorV2.getMediaStatus({
      projectToken: this.options.projectToken,
      assetId: region.assetId,
      sourceStreamId: region.sourceStreamId,
      sourceRole: region.sourceRole,
    });
    if (result.status !== 'resolved' || !result.asset.mediaUrl) {
      throw new Error(
        result.status === 'failed'
          ? result.error
          : `Audio source ${region.assetId} is unavailable`
      );
    }
    const effectiveOutputStart = Math.max(
      region.outputStart,
      startAtOutputTick
    );
    const effectiveSourceStart =
      region.sourceStart +
      scaleTicks(
        effectiveOutputStart - region.outputStart,
        region.playbackRate,
        'floor'
      );
    const stream = await (
      this.options.createMediaStream ?? createDefaultMediaStream
    )({
      url: result.asset.mediaUrl,
      streamIndex: getStreamIndex(project, region),
      sourceStartSeconds: ticksToSeconds(effectiveSourceStart),
      sourceEndSeconds: ticksToSeconds(region.sourceEnd),
    });
    this.streams.add(stream);
    const chunks: AudioMediaChunk[] = [];
    try {
      for (let index = 0; index < initialChunks; index += 1) {
        const chunk = await stream.next();
        if (!chunk) break;
        chunks.push(chunk);
      }
      return { region, stream, chunks };
    } catch (error) {
      stream.dispose();
      this.streams.delete(stream);
      throw error;
    }
  }

  private schedulePreparedRegion(
    context: AudioContext,
    prepared: PreparedRegion,
    startTick: number,
    contextOrigin: number,
    generation: number,
    maximumOutputEnd?: number
  ): void {
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      prepared.stream.dispose();
      this.streams.delete(prepared.stream);
    };
    let pumpQueue = Promise.resolve();
    const pump = () => {
      pumpQueue = pumpQueue.then(async () => {
        if (ended || generation !== this.generation) {
          finish();
          return;
        }
        try {
          const chunk = await prepared.stream.next();
          if (!chunk) {
            finish();
            return;
          }
          this.scheduleMediaChunk(
            context,
            chunk,
            prepared.region,
            startTick,
            contextOrigin,
            generation,
            advance,
            maximumOutputEnd
          );
        } catch (error) {
          finish();
          this.report(error);
        }
      });
    };
    const advance = () => {
      if (maximumOutputEnd === undefined) {
        pump();
        return;
      }
      finish();
    };
    if (generation !== this.generation) {
      finish();
      return;
    }
    for (const chunk of prepared.chunks) {
      this.scheduleMediaChunk(
        context,
        chunk,
        prepared.region,
        startTick,
        contextOrigin,
        generation,
        advance,
        maximumOutputEnd
      );
    }
    if (prepared.chunks.length === 0) finish();
  }

  private scheduleDeferredRegion(
    context: AudioContext,
    project: EditorProjectV2,
    region: AudioTimelineRegionPlan,
    startTick: number,
    contextOrigin: number,
    generation: number
  ): void {
    const triggerTick = Math.max(
      startTick,
      region.outputStart -
        Math.round(MEDIA_LOOKAHEAD_SECONDS * EDITOR_V2_TICKS_PER_SECOND)
    );
    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, context.sampleRate);
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(context.destination);
    const scheduledSource: ScheduledSource = {
      stop: () => {
        try {
          source.stop();
        } catch {
          return;
        }
      },
    };
    this.scheduled.add(scheduledSource);
    source.onended = () => {
      this.scheduled.delete(scheduledSource);
      if (generation !== this.generation) return;
      void this.createPreparedRegion(
        project,
        region,
        MEDIA_CHUNK_QUEUE_SIZE,
        region.outputStart
      )
        .then(prepared =>
          this.schedulePreparedRegion(
            context,
            prepared,
            startTick,
            contextOrigin,
            generation
          )
        )
        .catch(error => this.report(error));
    };
    source.start(contextOrigin + ticksToSeconds(triggerTick - startTick));
  }

  private scheduleKeyboardSound(
    context: AudioContext,
    buffer: AudioBuffer,
    sound: KeyboardSoundPlan,
    startTick: number,
    contextOrigin: number
  ): void {
    if (sound.outputTick < startTick) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value =
      sound.playbackRate.numerator / sound.playbackRate.denominator;
    const gain = context.createGain();
    gain.gain.value = sound.volume;
    source.connect(gain);
    gain.connect(context.destination);
    const scheduledSource: ScheduledSource = {
      stop: () => {
        try {
          source.stop();
        } catch {
          return;
        }
      },
    };
    this.scheduled.add(scheduledSource);
    source.onended = () => this.scheduled.delete(scheduledSource);
    source.start(contextOrigin + ticksToSeconds(sound.outputTick - startTick));
  }

  async prepare(): Promise<void> {
    await this.getContext().resume();
  }

  async play(
    project: EditorProjectV2,
    plan: AudioTimelinePlan,
    startTick: number
  ): Promise<void> {
    const generation = ++this.generation;
    this.playbackAnchor = null;
    this.stopScheduled();
    const context = this.getContext();
    await context.resume();
    const lookaheadEnd =
      startTick +
      Math.round(MEDIA_LOOKAHEAD_SECONDS * EDITOR_V2_TICKS_PER_SECOND);
    const immediate = plan.regions.filter(
      region =>
        !region.muted &&
        region.outputEnd > startTick &&
        region.outputStart <= lookaheadEnd
    );
    const deferred = plan.regions.filter(
      region => !region.muted && region.outputStart > lookaheadEnd
    );
    const sounds = plan.keyboardSounds.filter(
      sound => sound.outputTick >= startTick
    );
    const [preparedResults, soundResults] = await Promise.all([
      Promise.allSettled(
        immediate.map(region =>
          this.createPreparedRegion(
            project,
            region,
            MEDIA_CHUNK_QUEUE_SIZE,
            startTick
          )
        )
      ),
      Promise.allSettled(
        sounds.map(sound => this.loadKeyboardBuffer(context, sound))
      ),
    ]);
    const prepared = preparedResults.flatMap(result =>
      result.status === 'fulfilled' ? [result.value] : []
    );
    const soundBuffers = soundResults.flatMap(result =>
      result.status === 'fulfilled' ? [result.value] : []
    );
    const failure = [...preparedResults, ...soundResults].find(
      result => result.status === 'rejected'
    );
    if (failure?.status === 'rejected') {
      prepared.forEach(region => {
        region.stream.dispose();
        this.streams.delete(region.stream);
      });
      if (generation === this.generation) this.stop();
      throw failure.reason;
    }
    if (generation !== this.generation) {
      prepared.forEach(region => {
        region.stream.dispose();
        this.streams.delete(region.stream);
      });
      return;
    }
    const contextOrigin = context.currentTime + 0.02;
    this.playbackAnchor = { contextTime: contextOrigin, outputTick: startTick };
    prepared.forEach(region =>
      this.schedulePreparedRegion(
        context,
        region,
        startTick,
        contextOrigin,
        generation
      )
    );
    deferred.forEach(region =>
      this.scheduleDeferredRegion(
        context,
        project,
        region,
        startTick,
        contextOrigin,
        generation
      )
    );
    sounds.forEach((sound, index) =>
      this.scheduleKeyboardSound(
        context,
        soundBuffers[index],
        sound,
        startTick,
        contextOrigin
      )
    );
  }

  async scrub(
    project: EditorProjectV2,
    plan: AudioTimelinePlan,
    outputTick: number
  ): Promise<void> {
    const generation = ++this.generation;
    this.playbackAnchor = null;
    this.stopScheduled();
    const context = this.getContext();
    await context.resume();
    const regions = plan.regions.filter(
      region =>
        !region.muted &&
        outputTick >= region.outputStart &&
        outputTick < region.outputEnd
    );
    const preparedResults = await Promise.allSettled(
      regions.map(region =>
        this.createPreparedRegion(project, region, 1, outputTick)
      )
    );
    const prepared = preparedResults.flatMap(result =>
      result.status === 'fulfilled' ? [result.value] : []
    );
    const failure = preparedResults.find(
      result => result.status === 'rejected'
    );
    if (failure?.status === 'rejected') {
      prepared.forEach(region => {
        region.stream.dispose();
        this.streams.delete(region.stream);
      });
      if (generation === this.generation) this.stop();
      throw failure.reason;
    }
    if (generation !== this.generation) {
      prepared.forEach(region => {
        region.stream.dispose();
        this.streams.delete(region.stream);
      });
      return;
    }
    const scrubEnd = outputTick + Math.round(EDITOR_V2_TICKS_PER_SECOND * 0.06);
    prepared.forEach(region =>
      this.schedulePreparedRegion(
        context,
        region,
        outputTick,
        context.currentTime,
        generation,
        scrubEnd
      )
    );
  }

  getGainAt(region: AudioTimelineRegionPlan, outputTick: number): number {
    return region.gain * getAudioEnvelopeGain(region, outputTick);
  }

  getPlaybackTick(): number | null {
    if (!this.context || !this.playbackAnchor) return null;
    const elapsed = Math.max(
      0,
      this.context.currentTime - this.playbackAnchor.contextTime
    );
    return (
      this.playbackAnchor.outputTick +
      Math.floor(elapsed * EDITOR_V2_TICKS_PER_SECOND)
    );
  }

  stop(): void {
    this.generation += 1;
    this.playbackAnchor = null;
    this.stopScheduled();
  }

  async dispose(): Promise<void> {
    this.stop();
    this.keyboardBuffers.clear();
    const context = this.context;
    this.context = null;
    if (context) await context.close();
  }

  report(error: unknown): void {
    this.options.onError?.(
      error instanceof Error ? error.message : String(error)
    );
  }
}
