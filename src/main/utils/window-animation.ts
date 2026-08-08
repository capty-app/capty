import type { BrowserWindow, Rectangle } from 'electron';

interface WindowAnimation {
  token: symbol;
  finalBounds?: Rectangle;
}

interface AnimationOptions {
  steps?: number;
  duration?: number;
  initialScale?: number;
}

interface MoveAnimationOptions {
  steps?: number;
  duration?: number;
}

const DEFAULT_OPTIONS: Required<AnimationOptions> = {
  steps: 8,
  duration: 120,
  initialScale: 0.8,
};

const DEFAULT_MOVE_OPTIONS: Required<MoveAnimationOptions> = {
  steps: 8,
  duration: 120,
};

const activeAnimations = new WeakMap<BrowserWindow, WindowAnimation>();

function beginAnimation(
  window: BrowserWindow,
  finalBounds?: Rectangle
): symbol {
  const previous = activeAnimations.get(window);

  if (previous?.finalBounds && !window.isDestroyed()) {
    window.setBounds(previous.finalBounds);
  }

  const token = Symbol('window-animation');
  activeAnimations.set(window, { token, finalBounds });

  return token;
}

function ownsAnimation(window: BrowserWindow, token: symbol): boolean {
  return activeAnimations.get(window)?.token === token;
}

function endAnimation(window: BrowserWindow, token: symbol): void {
  if (!ownsAnimation(window, token)) return;

  activeAnimations.delete(window);
}

export function isWindowAnimating(window: BrowserWindow): boolean {
  return activeAnimations.has(window);
}

export function animateWindowIn(
  window: BrowserWindow,
  targetBounds: { x: number; y: number; width: number; height: number },
  options: AnimationOptions = {}
): void {
  const { steps, duration, initialScale } = { ...DEFAULT_OPTIONS, ...options };
  const stepDuration = duration / steps;
  const scaleStep = (1 - initialScale) / steps;
  const token = beginAnimation(window, targetBounds);

  let currentStep = 0;

  const animate = () => {
    if (!ownsAnimation(window, token)) return;

    if (window.isDestroyed()) {
      endAnimation(window, token);
      return;
    }

    currentStep++;
    const scale = initialScale + scaleStep * currentStep;

    const width = Math.round(targetBounds.width * scale);
    const height = Math.round(targetBounds.height * scale);
    const x = Math.round(targetBounds.x + (targetBounds.width - width) / 2);
    const y = Math.round(targetBounds.y + (targetBounds.height - height) / 2);

    window.setBounds({ x, y, width, height });

    if (currentStep < steps) {
      setTimeout(animate, stepDuration);
      return;
    }

    endAnimation(window, token);
  };

  animate();
}

export function animateWindowMove(
  window: BrowserWindow,
  targetPosition: { x: number; y: number },
  options: MoveAnimationOptions = {}
): void {
  const { steps, duration } = { ...DEFAULT_MOVE_OPTIONS, ...options };
  const stepDuration = duration / steps;
  const token = beginAnimation(window);

  const currentBounds = window.getBounds();
  const deltaX = targetPosition.x - currentBounds.x;
  const deltaY = targetPosition.y - currentBounds.y;

  if (deltaX === 0 && deltaY === 0) {
    endAnimation(window, token);
    return;
  }

  let currentStep = 0;

  const animate = () => {
    if (!ownsAnimation(window, token)) return;

    if (window.isDestroyed()) {
      endAnimation(window, token);
      return;
    }

    currentStep++;
    const progress = currentStep / steps;
    const easeProgress = 1 - Math.pow(1 - progress, 2);

    const x = Math.round(currentBounds.x + deltaX * easeProgress);
    const y = Math.round(currentBounds.y + deltaY * easeProgress);

    window.setPosition(x, y);

    if (currentStep < steps) {
      setTimeout(animate, stepDuration);
      return;
    }

    endAnimation(window, token);
  };

  animate();
}

export function moveWindowInstantly(
  window: BrowserWindow,
  targetPosition: { x: number; y: number }
): void {
  const token = beginAnimation(window);

  endAnimation(window, token);

  if (window.isDestroyed()) return;

  window.setPosition(targetPosition.x, targetPosition.y);
}

export function getInitialBounds(
  targetBounds: { x: number; y: number; width: number; height: number },
  initialScale: number = DEFAULT_OPTIONS.initialScale
): { x: number; y: number; width: number; height: number } {
  const width = Math.round(targetBounds.width * initialScale);
  const height = Math.round(targetBounds.height * initialScale);
  const x = Math.round(targetBounds.x + (targetBounds.width - width) / 2);
  const y = Math.round(targetBounds.y + (targetBounds.height - height) / 2);

  return { x, y, width, height };
}
