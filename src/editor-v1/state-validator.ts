import type { VideoEditorState } from '@/types/video-editor-state';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(item => typeof item === 'number');
}

function isLinePoints(
  value: unknown
): value is [number, number, number, number] {
  return isNumberArray(value) && value.length === 4;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === 'number';
}

function isValidBendOffset(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return typeof value.x === 'number' && typeof value.y === 'number';
}

function isValidBackgroundPadding(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return typeof value.x === 'number' && typeof value.y === 'number';
}

function isValidDrawingAnnotation(annotation: unknown): boolean {
  if (!isRecord(annotation)) return false;
  if (typeof annotation.id !== 'string') return false;

  switch (annotation.type) {
    case 'pen':
      return (
        isNumberArray(annotation.points) &&
        typeof annotation.stroke === 'string' &&
        typeof annotation.strokeWidth === 'number'
      );
    case 'highlight':
      return (
        isNumberArray(annotation.points) &&
        typeof annotation.fill === 'string' &&
        typeof annotation.opacity === 'number' &&
        typeof annotation.strokeWidth === 'number'
      );
    case 'rectangle':
      return (
        typeof annotation.x === 'number' &&
        typeof annotation.y === 'number' &&
        typeof annotation.width === 'number' &&
        typeof annotation.height === 'number' &&
        typeof annotation.stroke === 'string' &&
        typeof annotation.strokeWidth === 'number' &&
        isOptionalString(annotation.fill)
      );
    case 'circle':
      return (
        typeof annotation.x === 'number' &&
        typeof annotation.y === 'number' &&
        typeof annotation.radius === 'number' &&
        typeof annotation.stroke === 'string' &&
        typeof annotation.strokeWidth === 'number' &&
        isOptionalString(annotation.fill)
      );
    case 'line':
      return (
        isLinePoints(annotation.points) &&
        typeof annotation.stroke === 'string' &&
        typeof annotation.strokeWidth === 'number'
      );
    case 'arrow':
      return (
        isLinePoints(annotation.points) &&
        typeof annotation.stroke === 'string' &&
        typeof annotation.strokeWidth === 'number' &&
        isOptionalString(annotation.arrowStyle) &&
        isValidBendOffset(annotation.bendOffset)
      );
    case 'text':
      return (
        typeof annotation.x === 'number' &&
        typeof annotation.y === 'number' &&
        typeof annotation.text === 'string' &&
        typeof annotation.fontSize === 'number' &&
        typeof annotation.fill === 'string' &&
        isOptionalString(annotation.fontFamily) &&
        isOptionalString(annotation.backgroundColor) &&
        isOptionalNumber(annotation.backgroundOpacity) &&
        isValidBackgroundPadding(annotation.backgroundPadding) &&
        isOptionalNumber(annotation.backgroundRadius) &&
        isOptionalNumber(annotation.rotation)
      );
    case 'number':
      return (
        typeof annotation.x === 'number' &&
        typeof annotation.y === 'number' &&
        typeof annotation.value === 'number' &&
        typeof annotation.displayValue === 'string' &&
        typeof annotation.fill === 'string' &&
        typeof annotation.size === 'string'
      );
    case 'redact':
      return (
        typeof annotation.x === 'number' &&
        typeof annotation.y === 'number' &&
        typeof annotation.width === 'number' &&
        typeof annotation.height === 'number' &&
        typeof annotation.style === 'string' &&
        typeof annotation.intensity === 'number'
      );
    default:
      return false;
  }
}

export function isValidV1EditorState(
  state: unknown
): state is VideoEditorState {
  if (!state || typeof state !== 'object') return false;

  const s = state as Record<string, unknown>;

  if (s.version !== 1) return false;
  if (typeof s.savedAt !== 'string') return false;
  if (!Array.isArray(s.segments)) return false;
  if (!s.cursorStyle || typeof s.cursorStyle !== 'object') return false;
  if (!s.cameraStyle || typeof s.cameraStyle !== 'object') return false;
  if (!s.keyboardStyle || typeof s.keyboardStyle !== 'object') return false;
  if (!Array.isArray(s.zoomSegments)) return false;
  if (!s.zoomSettings || typeof s.zoomSettings !== 'object') return false;
  if (!s.ui || typeof s.ui !== 'object') return false;

  const zoomSettings = s.zoomSettings as Record<string, unknown>;
  if (typeof zoomSettings.transitionInDuration !== 'number') return false;
  if (typeof zoomSettings.transitionOutDuration !== 'number') return false;
  if (typeof zoomSettings.easing !== 'string') return false;
  if (
    zoomSettings.followSmoothness !== undefined &&
    typeof zoomSettings.followSmoothness !== 'number'
  ) {
    return false;
  }
  if (
    zoomSettings.lookAhead !== undefined &&
    typeof zoomSettings.lookAhead !== 'number'
  ) {
    return false;
  }

  for (const seg of s.segments) {
    if (!seg || typeof seg !== 'object') return false;
    const segment = seg as Record<string, unknown>;
    if (typeof segment.id !== 'string') return false;
    if (typeof segment.originalStart !== 'number') return false;
    if (typeof segment.originalEnd !== 'number') return false;
  }

  for (const zoom of s.zoomSegments) {
    if (!zoom || typeof zoom !== 'object') return false;
    const zoomSegment = zoom as Record<string, unknown>;
    if (typeof zoomSegment.id !== 'string') return false;
    if (typeof zoomSegment.startTime !== 'number') return false;
    if (typeof zoomSegment.endTime !== 'number') return false;
    if (typeof zoomSegment.zoomLevel !== 'number') return false;
    if (
      zoomSegment.transitionInDuration !== undefined &&
      typeof zoomSegment.transitionInDuration !== 'number'
    ) {
      return false;
    }
    if (
      zoomSegment.transitionOutDuration !== undefined &&
      typeof zoomSegment.transitionOutDuration !== 'number'
    ) {
      return false;
    }
  }

  if (s.drawingSegments !== undefined) {
    if (!Array.isArray(s.drawingSegments)) return false;

    for (const drawing of s.drawingSegments) {
      if (!drawing || typeof drawing !== 'object') return false;
      const drawingSegment = drawing as Record<string, unknown>;
      if (typeof drawingSegment.id !== 'string') return false;
      if (typeof drawingSegment.startTime !== 'number') return false;
      if (typeof drawingSegment.endTime !== 'number') return false;
      if (typeof drawingSegment.canvasWidth !== 'number') return false;
      if (typeof drawingSegment.canvasHeight !== 'number') return false;
      if (!Array.isArray(drawingSegment.annotations)) return false;
      if (!drawingSegment.annotations.every(isValidDrawingAnnotation)) {
        return false;
      }
    }
  }

  return true;
}
