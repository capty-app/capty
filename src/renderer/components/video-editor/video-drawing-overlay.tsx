import { useCallback, useEffect, useMemo, useRef } from 'react';
import type {
  Annotation,
  ArrowStyle,
  HighlightColor,
  HighlightOpacity,
  NumberSize,
  NumberStyle,
  RedactIntensity,
  RedactStyle,
  ShapeFillMode,
  TextFontFamily,
  TextFontSize,
} from '@/types/editor';
import type { DrawingSegment, VideoDrawingTool } from '@/types/drawing';
import { useDrawingTools } from '@/renderer/hooks/useDrawingTools';
import { useBrushCursor } from '@/renderer/hooks/useBrushCursor';
import { getFontFamilyCSS } from '@/renderer/components/editor/text/text-utils';
import { getDisplayValue } from '@/renderer/components/editor/number/number-utils';
import SvgAnnotationsOverlay from '@/renderer/components/editor/svg-annotations-overlay';
import {
  renderPen,
  renderHighlight,
  renderRectangle,
  renderCircle,
  renderLine,
  renderArrow,
  renderText,
  renderNumber,
} from '@/renderer/components/editor/annotations';
import {
  inverseScaleAnnotationUpdates,
  scaleAnnotationToComposition,
} from './composition/drawing-scale';
import { mapAnnotationIdsToSegmentIds } from './utils';
import { shouldIgnoreGlobalKeyboardShortcuts } from '@/renderer/utils/keyboard';

interface VideoDrawingOverlayProps {
  activeTool: VideoDrawingTool;
  selectedColor: string;
  strokeWidth: number;
  arrowStyle: ArrowStyle;
  highlightColor: HighlightColor;
  highlightOpacity: HighlightOpacity;
  numberStyle: NumberStyle;
  numberSize: NumberSize;
  numberStartValue: number;
  textBackground: boolean;
  textFontSize: TextFontSize;
  textFontFamily: TextFontFamily;
  redactStyle: RedactStyle;
  redactIntensity: RedactIntensity;
  shapeFillMode: ShapeFillMode;
  drawingSegments: DrawingSegment[];
  selectedDrawingIds: string[];
  timelinePosition: number;
  canvasWidth: number;
  canvasHeight: number;
  displayScale: number;
  onAddDrawingSegment: (params: {
    annotation: Annotation;
    timelinePosition: number;
    canvasWidth: number;
    canvasHeight: number;
  }) => void;
  onSelectDrawing: (id: string | null, addToSelection?: boolean) => void;
  onSelectMultipleDrawings: (ids: string[]) => void;
  onSelectAllDrawings: (ids: string[]) => void;
  onUpdateDrawingAnnotation: (id: string, updates: Partial<Annotation>) => void;
  onUpdateDrawingAnnotationsMultiple: (
    updates: Array<{ id: string; updates: Partial<Annotation> }>
  ) => void;
  onCommitDrawingGesture: () => void;
  onAnnotationAdded?: (tool: VideoDrawingTool) => void;
}

function renderPreview(
  annotation: Annotation,
  displayScale: number
): JSX.Element | null {
  const commonProps = {
    offsetX: 0,
    offsetY: 0,
    isSelected: false,
    isPreview: true,
    onMouseDown: undefined,
    onDoubleClick: undefined,
  };

  switch (annotation.type) {
    case 'pen':
      return renderPen({ annotation, ...commonProps });
    case 'highlight':
      return renderHighlight({ annotation, ...commonProps });
    case 'rectangle':
      return renderRectangle({ annotation, ...commonProps });
    case 'circle':
      return renderCircle({ annotation, ...commonProps });
    case 'line':
      return renderLine({ annotation, ...commonProps });
    case 'arrow':
      return renderArrow({ annotation, ...commonProps });
    case 'text':
      return renderText({ annotation, ...commonProps, editingTextId: null });
    case 'number':
      return renderNumber({ annotation, ...commonProps });
    case 'redact': {
      const rectX =
        annotation.width < 0 ? annotation.x + annotation.width : annotation.x;
      const rectY =
        annotation.height < 0 ? annotation.y + annotation.height : annotation.y;
      const strokeWidth = displayScale > 0 ? 2 / displayScale : 2;
      return (
        <rect
          x={rectX}
          y={rectY}
          width={Math.abs(annotation.width)}
          height={Math.abs(annotation.height)}
          fill="rgba(59, 130, 246, 0.15)"
          stroke="#3b82f6"
          strokeWidth={strokeWidth}
          strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 1.5}`}
          rx={2}
        />
      );
    }
    default:
      return null;
  }
}

export default function VideoDrawingOverlay({
  activeTool,
  selectedColor,
  strokeWidth,
  arrowStyle,
  highlightColor,
  highlightOpacity,
  numberStyle,
  numberSize,
  numberStartValue,
  textBackground,
  textFontSize,
  textFontFamily,
  redactStyle,
  redactIntensity,
  shapeFillMode,
  drawingSegments,
  selectedDrawingIds,
  timelinePosition,
  canvasWidth,
  canvasHeight,
  displayScale,
  onAddDrawingSegment,
  onSelectDrawing,
  onSelectMultipleDrawings,
  onSelectAllDrawings,
  onUpdateDrawingAnnotation,
  onUpdateDrawingAnnotationsMultiple,
  onCommitDrawingGesture,
  onAnnotationAdded,
}: VideoDrawingOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelinePositionRef = useRef(timelinePosition);
  timelinePositionRef.current = timelinePosition;

  const numberValue = useMemo(() => {
    const numberCount = drawingSegments.reduce((count, segment) => {
      return (
        count +
        segment.annotations.filter(annotation => annotation.type === 'number')
          .length
      );
    }, 0);

    return numberStartValue + numberCount;
  }, [drawingSegments, numberStartValue]);

  const handleAnnotationAdd = useCallback(
    (annotation: Annotation) => {
      onAddDrawingSegment({
        annotation,
        timelinePosition: timelinePositionRef.current,
        canvasWidth,
        canvasHeight,
      });
    },
    [canvasHeight, canvasWidth, onAddDrawingSegment]
  );

  const {
    isDrawing,
    currentAnnotation,
    startDrawing,
    updateAnnotation,
    finishDrawing,
  } = useDrawingTools({
    activeTool,
    selectedColor,
    strokeWidth,
    arrowStyle,
    highlightColor,
    highlightOpacity,
    redactStyle,
    redactIntensity,
    shapeFillMode,
    onAnnotationAdd: handleAnnotationAdd,
  });

  const brushCursor = useBrushCursor({
    activeTool,
    redactStyle,
    highlightColor,
  });

  const selectableSegments = useMemo(
    () =>
      drawingSegments.filter(
        segment =>
          timelinePosition >= segment.startTime &&
          timelinePosition <= segment.endTime &&
          segment.canvasWidth > 0 &&
          segment.canvasHeight > 0
      ),
    [drawingSegments, timelinePosition]
  );

  const annotationScaleMap = useMemo(() => {
    const map = new Map<
      string,
      { segmentId: string; scaleX: number; scaleY: number }
    >();

    for (const segment of selectableSegments) {
      const scaleX = canvasWidth / segment.canvasWidth;
      const scaleY = canvasHeight / segment.canvasHeight;
      for (const annotation of segment.annotations) {
        map.set(annotation.id, { segmentId: segment.id, scaleX, scaleY });
      }
    }

    return map;
  }, [selectableSegments, canvasWidth, canvasHeight]);

  const displayAnnotations = useMemo(
    () =>
      selectableSegments.flatMap(segment => {
        const scaleX = canvasWidth / segment.canvasWidth;
        const scaleY = canvasHeight / segment.canvasHeight;
        return segment.annotations.map(annotation =>
          scaleAnnotationToComposition(annotation, scaleX, scaleY)
        );
      }),
    [selectableSegments, canvasWidth, canvasHeight]
  );

  const selectedIdSet = useMemo(
    () => new Set(selectedDrawingIds),
    [selectedDrawingIds]
  );

  const selectedAnnotationIds = useMemo(
    () =>
      selectableSegments
        .filter(segment => selectedIdSet.has(segment.id))
        .flatMap(segment =>
          segment.annotations.map(annotation => annotation.id)
        ),
    [selectableSegments, selectedIdSet]
  );

  const handleSelectAnnotation = useCallback(
    (annotationId: string | null, addToSelection = false) => {
      if (annotationId === null) {
        onSelectDrawing(null);
        return;
      }
      const entry = annotationScaleMap.get(annotationId);
      if (entry) {
        onSelectDrawing(entry.segmentId, addToSelection);
      }
    },
    [annotationScaleMap, onSelectDrawing]
  );

  const annotationToSegment = useMemo(() => {
    const map = new Map<string, string>();
    for (const [annotationId, entry] of annotationScaleMap) {
      map.set(annotationId, entry.segmentId);
    }
    return map;
  }, [annotationScaleMap]);

  const handleSelectMultipleAnnotations = useCallback(
    (annotationIds: string[]) => {
      onSelectMultipleDrawings(
        mapAnnotationIdsToSegmentIds(annotationIds, annotationToSegment)
      );
    },
    [annotationToSegment, onSelectMultipleDrawings]
  );

  const handleAnnotationUpdate = useCallback(
    (annotationId: string, updates: Partial<Annotation>) => {
      const entry = annotationScaleMap.get(annotationId);
      if (!entry) return;
      onUpdateDrawingAnnotation(
        entry.segmentId,
        inverseScaleAnnotationUpdates(updates, entry.scaleX, entry.scaleY)
      );
    },
    [annotationScaleMap, onUpdateDrawingAnnotation]
  );

  const handleAnnotationsUpdateMultiple = useCallback(
    (updates: Array<{ id: string; updates: Partial<Annotation> }>) => {
      const segmentUpdates: Array<{
        id: string;
        updates: Partial<Annotation>;
      }> = [];
      for (const { id: annotationId, updates: annotationUpdates } of updates) {
        const entry = annotationScaleMap.get(annotationId);
        if (!entry) continue;
        segmentUpdates.push({
          id: entry.segmentId,
          updates: inverseScaleAnnotationUpdates(
            annotationUpdates,
            entry.scaleX,
            entry.scaleY
          ),
        });
      }
      onUpdateDrawingAnnotationsMultiple(segmentUpdates);
    },
    [annotationScaleMap, onUpdateDrawingAnnotationsMultiple]
  );

  const getPosition = useCallback(
    (event: React.MouseEvent | MouseEvent): { x: number; y: number } | null => {
      const container = containerRef.current;
      if (!container) return null;

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;

      return {
        x: ((event.clientX - rect.left) / rect.width) * canvasWidth,
        y: ((event.clientY - rect.top) / rect.height) * canvasHeight,
      };
    },
    [canvasHeight, canvasWidth]
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (activeTool === 'select') return;

      event.preventDefault();
      event.stopPropagation();

      const position = getPosition(event);
      if (!position) return;

      if (activeTool === 'text') {
        handleAnnotationAdd({
          id: crypto.randomUUID(),
          type: 'text',
          x: position.x,
          y: position.y,
          text: 'Text',
          fontSize: textFontSize,
          fontFamily: getFontFamilyCSS(textFontFamily),
          fill: selectedColor,
          backgroundColor: textBackground ? 'rgba(0, 0, 0, 0.75)' : undefined,
          backgroundPadding: textBackground ? { x: 8, y: 4 } : undefined,
          backgroundRadius: textBackground ? 4 : undefined,
        });
        onAnnotationAdded?.('text');
        return;
      }

      if (activeTool === 'number') {
        handleAnnotationAdd({
          id: crypto.randomUUID(),
          type: 'number',
          x: position.x,
          y: position.y,
          value: numberValue,
          displayValue: getDisplayValue(numberValue, numberStyle),
          fill: selectedColor,
          size: numberSize,
        });
        onAnnotationAdded?.('number');
        return;
      }

      startDrawing(position);
    },
    [
      activeTool,
      getPosition,
      handleAnnotationAdd,
      textFontSize,
      textFontFamily,
      selectedColor,
      textBackground,
      numberValue,
      numberStyle,
      numberSize,
      startDrawing,
      onAnnotationAdded,
    ]
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const position = getPosition(event);
      if (!position) return;

      updateAnnotation(position, event.shiftKey);
    },
    [getPosition, updateAnnotation]
  );

  const handleMouseUp = useCallback(() => {
    const committedTool = currentAnnotation?.type as
      VideoDrawingTool | undefined;
    finishDrawing();
    if (
      committedTool &&
      committedTool !== 'pen' &&
      committedTool !== 'highlight'
    ) {
      onAnnotationAdded?.(committedTool);
    }
  }, [currentAnnotation, finishDrawing, onAnnotationAdded]);

  useEffect(() => {
    if (!isDrawing) return;

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDrawing, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (activeTool !== 'select') return;

    const handleSelectAll = (event: KeyboardEvent) => {
      if (event.key !== 'a' || !(event.metaKey || event.ctrlKey)) return;
      if (shouldIgnoreGlobalKeyboardShortcuts(event.target)) return;
      if (selectableSegments.length === 0) return;

      event.preventDefault();
      onSelectAllDrawings(selectableSegments.map(segment => segment.id));
    };

    window.addEventListener('keydown', handleSelectAll);
    return () => window.removeEventListener('keydown', handleSelectAll);
  }, [activeTool, selectableSegments, onSelectAllDrawings]);

  if (activeTool === 'select') {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: canvasWidth,
            height: canvasHeight,
            transform: `scale(${displayScale})`,
            transformOrigin: 'top left',
          }}
        >
          <SvgAnnotationsOverlay
            annotations={displayAnnotations}
            currentAnnotation={null}
            width={canvasWidth}
            height={canvasHeight}
            selectedAnnotationIds={selectedAnnotationIds}
            onSelect={handleSelectAnnotation}
            onSelectMultiple={handleSelectMultipleAnnotations}
            onAnnotationUpdate={handleAnnotationUpdate}
            onAnnotationsUpdateMultiple={handleAnnotationsUpdateMultiple}
            onDragEnd={onCommitDrawingGesture}
            editingTextId={null}
            zoom={displayScale}
            activeTool="select"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ cursor: brushCursor }}
      onMouseDown={handleMouseDown}
    >
      {currentAnnotation && (
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          className="pointer-events-none absolute inset-0"
        >
          {renderPreview(currentAnnotation, displayScale)}
        </svg>
      )}
    </div>
  );
}
