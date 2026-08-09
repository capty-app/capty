import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  animateWindowIn,
  animateWindowMove,
  getInitialBounds,
  isWindowAnimating,
  moveWindowInstantly,
} from '@/main/utils/window-animation';

interface FakeWindow {
  setBounds: ReturnType<typeof vi.fn>;
  setPosition: ReturnType<typeof vi.fn>;
  getBounds: () => { x: number; y: number; width: number; height: number };
  isDestroyed: ReturnType<typeof vi.fn>;
}

function makeFakeWindow(
  initial = { x: 0, y: 0, width: 400, height: 300 }
): FakeWindow {
  return {
    setBounds: vi.fn(),
    setPosition: vi.fn(),
    getBounds: () => initial,
    isDestroyed: vi.fn(() => false),
  };
}

describe('window-animation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getInitialBounds', () => {
    it('returns scaled-down bounds centered on target', () => {
      const result = getInitialBounds({
        x: 100,
        y: 100,
        width: 400,
        height: 300,
      });
      expect(result.width).toBe(320);
      expect(result.height).toBe(240);
      expect(result.x).toBe(140);
      expect(result.y).toBe(130);
    });

    it('accepts custom scale', () => {
      const result = getInitialBounds(
        { x: 0, y: 0, width: 200, height: 100 },
        0.5
      );
      expect(result.width).toBe(100);
      expect(result.height).toBe(50);
    });
  });

  describe('animateWindowIn', () => {
    it('runs N steps and arrives at target bounds', () => {
      const win = makeFakeWindow();
      const target = { x: 0, y: 0, width: 400, height: 300 };
      animateWindowIn(win as never, target, { steps: 4, duration: 40 });

      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(10);
      }

      const calls = win.setBounds.mock.calls;
      expect(calls.length).toBe(4);
      const finalBounds = calls[calls.length - 1][0] as typeof target;
      expect(finalBounds.width).toBe(400);
      expect(finalBounds.height).toBe(300);
    });

    it('stops when window is destroyed', () => {
      const win = makeFakeWindow();
      win.isDestroyed = vi.fn(() => true);
      animateWindowIn(
        win as never,
        { x: 0, y: 0, width: 100, height: 100 },
        { steps: 4, duration: 40 }
      );
      vi.advanceTimersByTime(100);
      expect(win.setBounds).not.toHaveBeenCalled();
    });
  });

  describe('animateWindowMove', () => {
    it('no-ops when target equals current position', () => {
      const win = makeFakeWindow({ x: 50, y: 50, width: 100, height: 100 });
      animateWindowMove(win as never, { x: 50, y: 50 });
      expect(win.setPosition).not.toHaveBeenCalled();
    });

    it('eases toward the target', () => {
      const win = makeFakeWindow({ x: 0, y: 0, width: 100, height: 100 });
      animateWindowMove(
        win as never,
        { x: 100, y: 100 },
        { steps: 4, duration: 40 }
      );
      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(10);
      }
      const calls = win.setPosition.mock.calls;
      expect(calls.length).toBe(4);
      expect(calls[calls.length - 1]).toEqual([100, 100]);
    });

    it('stops on destroyed window', () => {
      const win = makeFakeWindow({ x: 0, y: 0, width: 100, height: 100 });
      win.isDestroyed = vi.fn(() => true);
      animateWindowMove(
        win as never,
        { x: 100, y: 100 },
        { steps: 4, duration: 40 }
      );
      vi.advanceTimersByTime(100);
      expect(win.setPosition).not.toHaveBeenCalled();
    });
  });

  describe('moveWindowInstantly', () => {
    it('sets the position without waiting for timers', () => {
      const win = makeFakeWindow({ x: 0, y: 0, width: 100, height: 100 });
      moveWindowInstantly(win as never, { x: 300, y: 400 });

      expect(win.setPosition).toHaveBeenCalledTimes(1);
      expect(win.setPosition).toHaveBeenCalledWith(300, 400);
      expect(isWindowAnimating(win as never)).toBe(false);
    });

    it('supersedes an in-flight move', () => {
      const win = makeFakeWindow({ x: 0, y: 0, width: 100, height: 100 });
      animateWindowMove(
        win as never,
        { x: 100, y: 100 },
        { steps: 4, duration: 40 }
      );
      vi.advanceTimersByTime(10);

      const callsBeforeTakeover = win.setPosition.mock.calls.length;
      moveWindowInstantly(win as never, { x: 500, y: 500 });
      vi.advanceTimersByTime(1000);

      expect(win.setPosition.mock.calls.length).toBe(callsBeforeTakeover + 1);
      expect(win.setPosition.mock.calls[callsBeforeTakeover]).toEqual([
        500, 500,
      ]);
    });

    it('snaps an interrupted entry animation to full size before moving', () => {
      const win = makeFakeWindow({ x: 0, y: 0, width: 400, height: 300 });
      const target = { x: 10, y: 20, width: 400, height: 300 };
      animateWindowIn(win as never, target, { steps: 4, duration: 40 });
      vi.advanceTimersByTime(10);

      const callsBeforeTakeover = win.setBounds.mock.calls.length;
      moveWindowInstantly(win as never, { x: 500, y: 500 });
      vi.advanceTimersByTime(1000);

      expect(win.setBounds.mock.calls[callsBeforeTakeover][0]).toEqual(target);
      expect(win.setBounds.mock.calls.length).toBe(callsBeforeTakeover + 1);
      expect(win.setPosition).toHaveBeenCalledWith(500, 500);
    });

    it('skips the position update on a destroyed window', () => {
      const win = makeFakeWindow({ x: 0, y: 0, width: 100, height: 100 });
      win.isDestroyed = vi.fn(() => true);
      moveWindowInstantly(win as never, { x: 500, y: 500 });

      expect(win.setPosition).not.toHaveBeenCalled();
      expect(isWindowAnimating(win as never)).toBe(false);
    });
  });

  describe('animation ownership', () => {
    it('takes over an in-flight move instead of interleaving', () => {
      const win = makeFakeWindow({ x: 0, y: 0, width: 100, height: 100 });
      animateWindowMove(
        win as never,
        { x: 100, y: 100 },
        { steps: 4, duration: 40 }
      );
      vi.advanceTimersByTime(10);

      const callsBeforeTakeover = win.setPosition.mock.calls.length;
      animateWindowMove(
        win as never,
        { x: 200, y: 200 },
        { steps: 4, duration: 40 }
      );
      vi.advanceTimersByTime(1000);

      const calls = win.setPosition.mock.calls;
      expect(calls.length).toBe(callsBeforeTakeover + 4);
      expect(calls[calls.length - 1]).toEqual([200, 200]);
      expect(calls.slice(callsBeforeTakeover)).not.toContainEqual([100, 100]);
    });

    it('snaps to the entry animation target before taking it over', () => {
      const win = makeFakeWindow({ x: 0, y: 0, width: 400, height: 300 });
      const target = { x: 10, y: 20, width: 400, height: 300 };
      animateWindowIn(win as never, target, { steps: 4, duration: 40 });
      vi.advanceTimersByTime(10);

      const callsBeforeTakeover = win.setBounds.mock.calls.length;
      animateWindowMove(
        win as never,
        { x: 500, y: 500 },
        { steps: 4, duration: 40 }
      );

      expect(win.setBounds.mock.calls[callsBeforeTakeover][0]).toEqual(target);

      vi.advanceTimersByTime(1000);
      expect(win.setBounds.mock.calls.length).toBe(callsBeforeTakeover + 1);
    });

    it('reports animating state during a run and clears it afterwards', () => {
      const win = makeFakeWindow({ x: 0, y: 0, width: 100, height: 100 });
      animateWindowMove(
        win as never,
        { x: 100, y: 100 },
        { steps: 4, duration: 40 }
      );
      expect(isWindowAnimating(win as never)).toBe(true);

      vi.advanceTimersByTime(100);
      expect(isWindowAnimating(win as never)).toBe(false);
    });

    it('releases ownership when the window is destroyed mid-move', () => {
      const win = makeFakeWindow({ x: 0, y: 0, width: 100, height: 100 });
      animateWindowMove(
        win as never,
        { x: 100, y: 100 },
        { steps: 4, duration: 40 }
      );
      vi.advanceTimersByTime(10);
      win.isDestroyed = vi.fn(() => true);
      vi.advanceTimersByTime(100);

      expect(isWindowAnimating(win as never)).toBe(false);
    });

    it('releases ownership when the window is destroyed mid-entry', () => {
      const win = makeFakeWindow({ x: 0, y: 0, width: 400, height: 300 });
      animateWindowIn(
        win as never,
        { x: 0, y: 0, width: 400, height: 300 },
        { steps: 4, duration: 40 }
      );
      vi.advanceTimersByTime(10);
      win.isDestroyed = vi.fn(() => true);
      vi.advanceTimersByTime(100);

      expect(isWindowAnimating(win as never)).toBe(false);
    });

    it('reports no animation after a zero-delta move', () => {
      const win = makeFakeWindow({ x: 50, y: 50, width: 100, height: 100 });
      animateWindowMove(win as never, { x: 50, y: 50 });
      expect(isWindowAnimating(win as never)).toBe(false);
    });
  });
});
