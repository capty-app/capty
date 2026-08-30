import {
  CanvasSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
} from 'mediabunny';

import { ticksForFrames } from '@/editor-v2/time/timebase';
import {
  evaluateSequence,
  getSequenceOutputDuration,
} from '@/editor-v2/timeline';
import { createBrowserCompositionEngine } from '@/renderer/editor-v2/composition/browser-composition-engine';
import {
  EDITOR_EXPORT_CHUNK_SIZE,
  type EditorExportSnapshot,
} from '@/types/editor-v2';

import { createExportChunkStream } from './export-chunk-stream';
import {
  resolveExportBitrate,
  resolveExportDimensions,
} from './export-settings';

interface RenderEditorExportOptions {
  jobId: string;
  projectToken: string;
  snapshot: EditorExportSnapshot;
  signal: AbortSignal;
}

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
};

export const renderEditorExport = async ({
  jobId,
  projectToken,
  snapshot,
  signal,
}: RenderEditorExportOptions): Promise<void> => {
  const { project } = snapshot;
  const settings = snapshot.workspace.exportSettings;
  const firstEvaluation = evaluateSequence(project, 0);
  const dimensions = resolveExportDimensions(
    firstEvaluation.composition.width,
    firstEvaluation.composition.height,
    settings.resolution
  );
  const framesPerSecond =
    settings.frameRate.numerator / settings.frameRate.denominator;
  const renderCanvas = document.createElement('canvas');
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = dimensions.width;
  outputCanvas.height = dimensions.height;
  const outputContext = outputCanvas.getContext('2d');
  if (!outputContext) throw new Error('Export canvas is unavailable');
  const engine = createBrowserCompositionEngine(projectToken, project.assets);
  const stream = createExportChunkStream({
    jobId,
    write: chunk => window.editorV2.writeExportChunk(chunk),
  });
  const target = new StreamTarget(stream, {
    chunked: true,
    chunkSize: EDITOR_EXPORT_CHUNK_SIZE,
  });
  const output = new Output({
    format: new Mp4OutputFormat({
      fastStart: 'fragmented',
      minimumFragmentDuration: 1,
    }),
    target,
  });
  const source = new CanvasSource(outputCanvas, {
    codec: 'avc',
    bitrate: resolveExportBitrate(
      dimensions.width,
      dimensions.height,
      framesPerSecond,
      settings.quality
    ),
  });
  output.addVideoTrack(source, { frameRate: framesPerSecond });
  const durationTicks = getSequenceOutputDuration(project);
  const totalFrames = Math.max(
    1,
    Math.ceil(
      (durationTicks * settings.frameRate.numerator) /
        (project.timebase.ticksPerSecond * settings.frameRate.denominator)
    )
  );
  const frameDuration = 1 / framesPerSecond;
  let completedFrames = 0;
  try {
    throwIfAborted(signal);
    await output.start();
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      throwIfAborted(signal);
      const tick = Math.min(
        Math.max(0, durationTicks - 1),
        ticksForFrames(frameIndex, settings.frameRate, 'nearest')
      );
      const evaluation = evaluateSequence(project, tick);
      const rendered = await engine.render(renderCanvas, evaluation);
      if (rendered.issues.length > 0) {
        const issue = rendered.issues[0];
        throw new Error(
          issue.kind === 'missing-source'
            ? `Media ${issue.assetId} is missing`
            : issue.error || `Media ${issue.assetId} could not decode`
        );
      }
      outputContext.clearRect(0, 0, dimensions.width, dimensions.height);
      outputContext.drawImage(
        renderCanvas,
        0,
        0,
        dimensions.width,
        dimensions.height
      );
      await source.add(frameIndex * frameDuration, frameDuration);
      completedFrames = frameIndex + 1;
      window.editorV2.reportExportProgress({
        jobId,
        stage: 'video',
        completed: completedFrames,
        total: totalFrames,
      });
    }
    source.close();
    throwIfAborted(signal);
    await output.finalize();
  } catch (error) {
    if (output.state === 'started' || output.state === 'finalizing') {
      await output.cancel();
    }
    throw error;
  } finally {
    engine.dispose();
  }
};
