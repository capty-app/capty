import { screen } from 'electron';
import { daemon } from '@/main/daemon';
import * as settings from '@/main/settings';

const FOLLOW_DWELL_MS = 300;
const ACTIVE_DISPLAY_MODULE = 'active-display';

interface FollowActiveDisplayDeps {
  getStackedCount: () => number;
  onRelocate: () => void;
}

let deps: FollowActiveDisplayDeps | null = null;
let activeDisplayId: number | null = null;
let dwellTimer: NodeJS.Timeout | null = null;
let monitoring = false;

function getCursorDisplay(): Electron.Display {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function callActiveDisplay(method: string, onFailure?: () => void): void {
  daemon.call(ACTIVE_DISPLAY_MODULE, method).catch(error => {
    console.error(error);
    onFailure?.();
  });
}

function startActiveDisplay(): void {
  callActiveDisplay('start', () => {
    monitoring = false;
  });
}

function clearDwellTimer(): void {
  if (!dwellTimer) return;

  clearTimeout(dwellTimer);
  dwellTimer = null;
}

function handleDwellElapsed(): void {
  dwellTimer = null;

  if (!monitoring) return;
  if (!deps) return;

  const display = getCursorDisplay();

  if (display.id === activeDisplayId) return;

  activeDisplayId = display.id;
  deps.onRelocate();
}

function restartDwellTimer(): void {
  clearDwellTimer();
  dwellTimer = setTimeout(handleDwellElapsed, FOLLOW_DWELL_MS);
}

function handleDaemonEvent(event: string): void {
  switch (event) {
    case 'active-display:changed':
      restartDwellTimer();
      return;
    case 'system:ready':
      if (!monitoring) {
        syncFollowMonitor();
        return;
      }

      startActiveDisplay();
      restartDwellTimer();
      return;
    default:
      return;
  }
}

export function syncFollowMonitor(): boolean {
  if (!deps) return false;

  const shouldRun =
    settings.getConfig().preview.followActiveDisplay &&
    deps.getStackedCount() > 0;

  if (shouldRun === monitoring) return false;

  if (shouldRun) {
    monitoring = true;
    activeDisplayId = getCursorDisplay().id;
    startActiveDisplay();
    return true;
  }

  monitoring = false;
  activeDisplayId = null;
  clearDwellTimer();
  callActiveDisplay('stop');

  return true;
}

export function getFollowDisplay(): Electron.Display | null {
  if (!settings.getConfig().preview.followActiveDisplay) return null;

  if (monitoring && activeDisplayId !== null) {
    const trackedDisplay = screen
      .getAllDisplays()
      .find(display => display.id === activeDisplayId);

    if (trackedDisplay) return trackedDisplay;
  }

  return getCursorDisplay();
}

export function initFollowActiveDisplay(
  newDeps: FollowActiveDisplayDeps
): void {
  deps = newDeps;

  daemon.onEvent(handleDaemonEvent);

  settings.setPreviewConfigListener(() => {
    if (!syncFollowMonitor()) return;

    newDeps.onRelocate();
  });
}
