import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockShow = vi.fn();
const mockOn = vi.fn();
const mockIsSupported = vi.fn();
const constructorArgs: unknown[] = [];

class MockNotification {
  static isSupported = () => mockIsSupported();
  constructor(args: unknown) {
    constructorArgs.push(args);
  }
  on(...args: unknown[]) {
    mockOn(...args);
  }
  show() {
    mockShow();
  }
}

vi.mock('electron', () => ({
  Notification: MockNotification,
}));

describe('showNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    constructorArgs.length = 0;
    mockIsSupported.mockReturnValue(true);
  });

  it('shows a notification with the given title and body', async () => {
    const { showNotification } = await import('@/main/utils/notifications');
    showNotification({ title: 'Hello', body: 'World' });
    expect(constructorArgs).toEqual([{ title: 'Hello', body: 'World' }]);
    expect(mockShow).toHaveBeenCalledOnce();
  });

  it('does nothing when notifications are unsupported', async () => {
    mockIsSupported.mockReturnValue(false);
    const { showNotification } = await import('@/main/utils/notifications');
    showNotification({ title: 'Hello', body: 'World' });
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('attaches a click handler when provided', async () => {
    const { showNotification } = await import('@/main/utils/notifications');
    const onClick = vi.fn();
    showNotification({ title: 'Hello', body: 'World', onClick });
    expect(mockOn).toHaveBeenCalledWith('click', onClick);
  });

  it('does not attach a click handler when omitted', async () => {
    const { showNotification } = await import('@/main/utils/notifications');
    showNotification({ title: 'Hello', body: 'World' });
    expect(mockOn).not.toHaveBeenCalled();
  });
});
