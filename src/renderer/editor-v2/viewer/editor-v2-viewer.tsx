import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  LoaderCircle,
  Maximize2,
  Pause,
  Play,
  Scan,
  SkipBack,
  SkipForward,
  TriangleAlert,
} from 'lucide-react';

import { ticksForFrames } from '@/editor-v2/time/timebase';
import {
  evaluateSequence,
  getSequenceOutputDuration,
} from '@/editor-v2/timeline';
import { Button } from '@/renderer/components/ui/button';
import { EditorV2CompositionEngine } from '../composition/composition-engine';
import { createLegacyCaptyEffectAdapter } from '../composition/legacy-capty-effect-adapter';
import { BrowserCompositionSourceProvider } from '../composition/source-provider';
import DirectManipulationOverlay from './direct-manipulation-overlay';
import { formatViewerTimecode } from './timecode';
import {
  EDITOR_V2_TICKS_PER_SECOND,
  type EditorProjectV2,
} from '@/types/editor-v2';

interface EditorV2ViewerProps {
  projectToken: string;
  project: EditorProjectV2;
  currentTick?: number;
  onCurrentTickChange?: (tick: number) => void;
  directManipulation?: boolean;
}

type ViewerStatus =
  | { kind: 'empty' }
  | { kind: 'gap' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'missing-source'; assetIds: string[] }
  | { kind: 'decode-error'; error: string };

export default function EditorV2Viewer({
  projectToken,
  project,
  currentTick: controlledCurrentTick,
  onCurrentTickChange,
  directManipulation = false,
}: EditorV2ViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef(0);
  const renderQueueRef = useRef(Promise.resolve());
  const currentTickRef = useRef(0);
  const [internalCurrentTick, setInternalCurrentTick] = useState(0);
  const currentTick = controlledCurrentTick ?? internalCurrentTick;
  const setCurrentTick = useCallback(
    (update: React.SetStateAction<number>) => {
      const next =
        typeof update === 'function' ? update(currentTickRef.current) : update;
      setInternalCurrentTick(next);
      onCurrentTickChange?.(next);
    },
    [onCurrentTickChange]
  );
  const [playing, setPlaying] = useState(false);
  const [fit, setFit] = useState(true);
  const [status, setStatus] = useState<ViewerStatus>({ kind: 'empty' });
  const duration = getSequenceOutputDuration(project);
  const frameTicks = ticksForFrames(
    1,
    project.timebase.displayFrameRate,
    'nearest'
  );
  const evaluation = useMemo(
    () => evaluateSequence(project, currentTick),
    [currentTick, project]
  );
  const engine = useMemo(() => {
    const mediaAssets = project.assets;
    return new EditorV2CompositionEngine(
      new BrowserCompositionSourceProvider(
        (assetId, sourceStreamId, sourceRole) => {
          if (!mediaAssets[assetId]) {
            return Promise.resolve({
              status: 'failed',
              error: `Asset ${assetId} does not exist`,
            });
          }
          return window.editorV2.getMediaStatus({
            projectToken,
            assetId,
            sourceStreamId,
            sourceRole,
          });
        }
      ),
      createLegacyCaptyEffectAdapter(async (kind, locator) => {
        const result = await window.editorV2.readData({
          projectToken,
          kind,
          locator,
        });
        if (result.status === 'failed') throw new Error(result.error);
        return result.data;
      })
    );
  }, [project.assets, projectToken]);

  useEffect(() => () => engine.dispose(), [engine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (!canvas) return;
    setStatus({ kind: 'loading' });
    renderQueueRef.current = renderQueueRef.current.then(async () => {
      if (requestRef.current !== requestId) return;
      try {
        const renderCanvas = document.createElement('canvas');
        const result = await engine.render(renderCanvas, evaluation);
        if (requestRef.current !== requestId) return;
        canvas.width = renderCanvas.width;
        canvas.height = renderCanvas.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D rendering is unavailable');
        context.drawImage(renderCanvas, 0, 0);
        const missing = result.issues
          .filter(issue => issue.kind === 'missing-source')
          .map(issue => issue.assetId);
        if (missing.length > 0) {
          setStatus({
            kind: 'missing-source',
            assetIds: [...new Set(missing)],
          });
          return;
        }
        const decodeError = result.issues.find(
          issue => issue.kind === 'decode-error'
        );
        if (decodeError) {
          setStatus({
            kind: 'decode-error',
            error: decodeError.error ?? 'Media decode failed',
          });
          return;
        }
        const hasSequenceVisual = evaluation.composition.effects.some(
          effect => {
            if (!effect.enabled) return false;
            if (effect.kind === 'wallpaper') {
              return effect.background.kind !== 'none';
            }
            if (effect.kind === 'annotation') {
              return (
                evaluation.outputTick >= effect.range.start &&
                evaluation.outputTick < effect.range.end &&
                effect.annotations.length > 0
              );
            }
            return effect.kind === 'device-frame';
          }
        );
        if (evaluation.layers.length === 0 && !hasSequenceVisual) {
          setStatus(duration === 0 ? { kind: 'empty' } : { kind: 'gap' });
          return;
        }
        setStatus({ kind: 'ready' });
      } catch (reason) {
        if (requestRef.current !== requestId) return;
        setStatus({
          kind: 'decode-error',
          error: reason instanceof Error ? reason.message : String(reason),
        });
      }
    });
  }, [duration, engine, evaluation]);

  useEffect(() => {
    currentTickRef.current = currentTick;
  }, [currentTick]);

  useEffect(() => {
    if (!playing) return;
    if (duration <= 0 || currentTickRef.current >= duration) {
      setPlaying(false);
      return;
    }
    const startedAt = performance.now();
    const startTick = currentTickRef.current;
    let frameId = 0;
    const update = (now: number) => {
      const elapsedTicks = Math.floor(
        ((now - startedAt) * EDITOR_V2_TICKS_PER_SECOND) / 1_000
      );
      const nextTick = Math.min(duration, startTick + elapsedTicks);
      setCurrentTick(nextTick);
      if (nextTick >= duration) {
        setPlaying(false);
        return;
      }
      frameId = requestAnimationFrame(update);
    };
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [duration, playing, setCurrentTick]);

  useEffect(() => {
    if (currentTick <= duration) return;
    setCurrentTick(duration);
  }, [currentTick, duration, setCurrentTick]);

  const togglePlayback = useCallback(() => {
    if (duration <= 0) return;
    if (currentTick >= duration) setCurrentTick(0);
    setPlaying(current => !current);
  }, [currentTick, duration, setCurrentTick]);

  const step = useCallback(
    (direction: -1 | 1) => {
      setPlaying(false);
      setCurrentTick(current =>
        Math.min(duration, Math.max(0, current + direction * frameTicks))
      );
    },
    [duration, frameTicks, setCurrentTick]
  );

  return (
    <main
      aria-label="Viewer"
      className="bg-background flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/70 p-6">
        <div
          className={
            fit
              ? 'relative max-h-full max-w-full shadow-2xl'
              : 'relative shrink-0 shadow-2xl'
          }
          style={
            fit
              ? {
                  width: evaluation.composition.width,
                  aspectRatio: `${evaluation.composition.width} / ${evaluation.composition.height}`,
                }
              : {
                  width: evaluation.composition.width,
                  height: evaluation.composition.height,
                }
          }
        >
          <canvas
            ref={canvasRef}
            aria-label="Composition canvas"
            className="block size-full object-contain"
          />
          {directManipulation ? (
            <DirectManipulationOverlay
              width={evaluation.composition.width}
              height={evaluation.composition.height}
            />
          ) : null}
        </div>
        {status.kind !== 'ready' ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center">
            <div className="rounded-md bg-black/70 px-4 py-3 text-white shadow-lg">
              {status.kind === 'loading' ? (
                <>
                  <LoaderCircle className="mx-auto size-5 animate-spin" />
                  <span className="sr-only">Loading frame</span>
                </>
              ) : status.kind === 'missing-source' ? (
                <>
                  <TriangleAlert className="mx-auto size-5" />
                  <p className="mt-2 text-sm font-medium">Media is missing</p>
                  <p className="mt-1 text-xs text-white/60">
                    Relink {status.assetIds.join(', ')} in the Project browser.
                  </p>
                </>
              ) : status.kind === 'decode-error' ? (
                <>
                  <TriangleAlert className="mx-auto size-5" />
                  <p className="mt-2 text-sm font-medium">
                    Media could not decode
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-white/60">
                    {status.error}
                  </p>
                </>
              ) : (
                <>
                  <Scan className="mx-auto size-5" />
                  <p className="mt-2 text-sm font-medium">
                    {status.kind === 'empty'
                      ? 'This project has no timeline media.'
                      : 'No visual layer at this time.'}
                  </p>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
      <div className="border-border bg-card flex h-14 shrink-0 flex-col border-t px-3 py-1">
        <input
          aria-label="Viewer playhead"
          type="range"
          min={0}
          max={Math.max(0, duration)}
          step={1}
          value={Math.min(currentTick, duration)}
          disabled={duration === 0}
          onChange={event => {
            setPlaying(false);
            setCurrentTick(Number(event.currentTarget.value));
          }}
          className="accent-primary h-2 w-full"
        />
        <div className="flex min-h-0 flex-1 items-center justify-between">
          <span className="text-muted-foreground w-28 font-mono text-xs">
            {formatViewerTimecode(
              currentTick,
              project.timebase.displayFrameRate
            )}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Previous frame"
              disabled={currentTick === 0}
              onClick={() => step(-1)}
            >
              <SkipBack className="size-3.5" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="size-8"
              aria-label={playing ? 'Pause' : 'Play'}
              disabled={duration === 0}
              onClick={togglePlayback}
            >
              {playing ? (
                <Pause className="size-4 fill-current" />
              ) : (
                <Play className="size-4 fill-current" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Next frame"
              disabled={currentTick >= duration}
              onClick={() => step(1)}
            >
              <SkipForward className="size-3.5" />
            </Button>
          </div>
          <Button
            variant={fit ? 'secondary' : 'ghost'}
            size="icon"
            className="size-7"
            aria-label={fit ? 'Show viewer at 100%' : 'Fit viewer'}
            onClick={() => setFit(current => !current)}
          >
            <Maximize2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </main>
  );
}
