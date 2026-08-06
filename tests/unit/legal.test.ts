import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcMainOn = vi.fn();
const mockOpenPath = vi.fn();
const mockShowMessageBox = vi.fn();
const mockFromWebContents = vi.fn();
const mockGetLicenseNoticesPath = vi.fn(
  () => '/resources/licenses/THIRD_PARTY_NOTICES.txt'
);

vi.mock('electron', () => ({
  ipcMain: { on: mockIpcMainOn },
  shell: { openPath: mockOpenPath },
  dialog: { showMessageBox: mockShowMessageBox },
  BrowserWindow: { fromWebContents: mockFromWebContents },
}));

vi.mock('@/main/utils/paths', () => ({
  getLicenseNoticesPath: mockGetLicenseNoticesPath,
}));

type NoticesHandler = (event: { sender: object }) => Promise<void>;

const event = { sender: {} };

async function initAndGetHandler(): Promise<NoticesHandler> {
  const legal = await import('@/main/legal');
  legal.init();

  return mockIpcMainOn.mock.calls[0][1] as NoticesHandler;
}

describe('legal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockOpenPath.mockResolvedValue('');
    mockShowMessageBox.mockResolvedValue({ response: 0 });
    mockFromWebContents.mockReturnValue(undefined);
  });

  it('registers the license notice handler', async () => {
    await initAndGetHandler();

    expect(mockIpcMainOn).toHaveBeenCalledWith(
      'legal:open-notices',
      expect.any(Function)
    );
  });

  it('opens the packaged license notices', async () => {
    const handler = await initAndGetHandler();

    await handler(event);

    expect(mockGetLicenseNoticesPath).toHaveBeenCalledOnce();
    expect(mockOpenPath).toHaveBeenCalledWith(
      '/resources/licenses/THIRD_PARTY_NOTICES.txt'
    );
    expect(mockShowMessageBox).not.toHaveBeenCalled();
  });

  it('reports failures to open the notices', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockOpenPath.mockResolvedValue('Unable to open file');
    const handler = await initAndGetHandler();

    await handler(event);

    expect(consoleError).toHaveBeenCalledWith(
      'Failed to open license notices:',
      'Unable to open file'
    );
    expect(mockShowMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', detail: 'Unable to open file' })
    );
    consoleError.mockRestore();
  });

  it('parents the failure dialog to the sender window', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const parentWindow = { id: 1 };
    mockOpenPath.mockResolvedValue('Unable to open file');
    mockFromWebContents.mockReturnValue(parentWindow);
    const handler = await initAndGetHandler();

    await handler(event);

    expect(mockShowMessageBox).toHaveBeenCalledWith(
      parentWindow,
      expect.objectContaining({ type: 'error' })
    );
  });
});
