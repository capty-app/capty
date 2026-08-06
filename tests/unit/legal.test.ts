import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcMainOn = vi.fn();
const mockOpenPath = vi.fn();
const mockGetLicenseNoticesPath = vi.fn(
  () => '/resources/licenses/THIRD_PARTY_NOTICES.txt'
);

vi.mock('electron', () => ({
  ipcMain: { on: mockIpcMainOn },
  shell: { openPath: mockOpenPath },
}));

vi.mock('@/main/utils/paths', () => ({
  getLicenseNoticesPath: mockGetLicenseNoticesPath,
}));

describe('legal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockOpenPath.mockResolvedValue('');
  });

  it('registers the license notice handler', async () => {
    const legal = await import('@/main/legal');

    legal.init();

    expect(mockIpcMainOn).toHaveBeenCalledWith(
      'legal:open-notices',
      expect.any(Function)
    );
  });

  it('opens the packaged license notices', async () => {
    const legal = await import('@/main/legal');
    legal.init();
    const handler = mockIpcMainOn.mock.calls[0][1] as () => Promise<void>;

    await handler();

    expect(mockGetLicenseNoticesPath).toHaveBeenCalledOnce();
    expect(mockOpenPath).toHaveBeenCalledWith(
      '/resources/licenses/THIRD_PARTY_NOTICES.txt'
    );
  });

  it('reports failures to open the notices', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockOpenPath.mockResolvedValue('Unable to open file');
    const legal = await import('@/main/legal');
    legal.init();
    const handler = mockIpcMainOn.mock.calls[0][1] as () => Promise<void>;

    await handler();

    expect(consoleError).toHaveBeenCalledWith(
      'Failed to open license notices:',
      'Unable to open file'
    );
    consoleError.mockRestore();
  });
});
