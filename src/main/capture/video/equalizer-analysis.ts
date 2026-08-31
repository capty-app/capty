import { spawn } from 'child_process';
import { getFFmpegPath } from '@/main/utils/ffmpeg';
import type { AudioAnalysisData } from '@/types/equalizer';
import {
  EQUALIZER_ANALYSIS_FRAME_RATE,
  EQUALIZER_ANALYSIS_HEIGHT,
  EQUALIZER_RAW_FRAME_SIZE,
  EQUALIZER_SPECTRUM_BANDS,
  EQUALIZER_VALUES_PER_FRAME,
  EQUALIZER_WAVEFORM_POINTS,
  parseEqualizerVideoFrame,
} from './equalizer-frame-parser';

const MAX_ANALYSIS_DURATION_SECONDS = 6 * 60 * 60;
const ANALYSIS_STALL_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_ANALYSIS_FRAMES =
  MAX_ANALYSIS_DURATION_SECONDS * EQUALIZER_ANALYSIS_FRAME_RATE;

const FILTER_GRAPH =
  `[0:a]asplit=2[f][w];` +
  `[f]showfreqs=s=${EQUALIZER_SPECTRUM_BANDS}x${EQUALIZER_ANALYSIS_HEIGHT}:mode=bar:fscale=log:ascale=sqrt:rate=${EQUALIZER_ANALYSIS_FRAME_RATE},format=gray[fv];` +
  `[w]showwaves=s=${EQUALIZER_WAVEFORM_POINTS}x${EQUALIZER_ANALYSIS_HEIGHT}:mode=point:rate=${EQUALIZER_ANALYSIS_FRAME_RATE},format=gray[wv];` +
  `[fv][wv]hstack=inputs=2,format=gray[out]`;

function growFrames(
  frames: Int8Array<ArrayBufferLike>,
  minimumLength: number
): Int8Array<ArrayBufferLike> {
  if (frames.length >= minimumLength) return frames;

  let nextLength = Math.max(
    EQUALIZER_VALUES_PER_FRAME * 256,
    Math.ceil(frames.length * 1.5)
  );
  while (nextLength < minimumLength) nextLength = Math.ceil(nextLength * 1.5);

  const next = new Int8Array(nextLength);
  next.set(frames);
  return next;
}

function createAbortError(): Error {
  const error = new Error('Audio analysis cancelled');
  error.name = 'AbortError';
  return error;
}

export async function analyzeEqualizerAudio(
  inputPath: string,
  signal?: AbortSignal
): Promise<AudioAnalysisData> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const ffmpeg = spawn(
      getFFmpegPath(),
      [
        '-v',
        'error',
        '-nostdin',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        inputPath,
        '-t',
        MAX_ANALYSIS_DURATION_SECONDS.toString(),
        '-filter_complex',
        FILTER_GRAPH,
        '-map',
        '[out]',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'gray',
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let frames: Int8Array<ArrayBufferLike> = new Int8Array(
      EQUALIZER_VALUES_PER_FRAME * 256
    );
    let frameCount = 0;
    let stderr = '';
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', handleAbort);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const resetStallTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        ffmpeg.kill('SIGKILL');
        fail(new Error('Audio analysis timed out'));
      }, ANALYSIS_STALL_TIMEOUT_MS);
    };

    const handleAbort = () => {
      ffmpeg.kill('SIGKILL');
      fail(createAbortError());
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
    resetStallTimeout();

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      if (settled) return;
      resetStallTimeout();
      pending = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk;
      let offset = 0;

      while (pending.length - offset >= EQUALIZER_RAW_FRAME_SIZE) {
        if (frameCount >= MAX_ANALYSIS_FRAMES) {
          ffmpeg.kill('SIGKILL');
          fail(new Error('Audio source exceeds the analysis duration limit'));
          return;
        }

        const targetOffset = frameCount * EQUALIZER_VALUES_PER_FRAME;
        frames = growFrames(frames, targetOffset + EQUALIZER_VALUES_PER_FRAME);
        parseEqualizerVideoFrame(
          pending.subarray(offset, offset + EQUALIZER_RAW_FRAME_SIZE),
          frames,
          targetOffset
        );
        frameCount++;
        offset += EQUALIZER_RAW_FRAME_SIZE;
      }

      pending = offset > 0 ? pending.subarray(offset) : pending;
    });

    ffmpeg.stderr.setEncoding('utf8');
    ffmpeg.stderr.on('data', (chunk: string) => {
      if (settled) return;
      resetStallTimeout();
      stderr = `${stderr}${chunk}`.slice(-4000);
    });

    ffmpeg.on('error', error => fail(error));
    ffmpeg.on('close', code => {
      if (settled) return;
      if (signal?.aborted) {
        fail(createAbortError());
        return;
      }
      if (code !== 0) {
        fail(new Error(stderr.trim() || `Audio analysis exited with ${code}`));
        return;
      }

      settled = true;
      cleanup();
      const values = frames.subarray(
        0,
        frameCount * EQUALIZER_VALUES_PER_FRAME
      );
      resolve({
        frameRate: EQUALIZER_ANALYSIS_FRAME_RATE,
        spectrumBandCount: EQUALIZER_SPECTRUM_BANDS,
        waveformPointCount: EQUALIZER_WAVEFORM_POINTS,
        duration: frameCount / EQUALIZER_ANALYSIS_FRAME_RATE,
        frames: values,
      });
    });
  });
}
