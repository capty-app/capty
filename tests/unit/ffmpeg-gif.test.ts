import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'child_process';

const mockSpawn = vi.fn();
const mockExecFile = vi.fn();
const mockExistsSync = vi.fn();
const mockUnlinkSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockRmSync = vi.fn();

vi.mock('child_process', () => ({
  spawn: mockSpawn,
  execFile: mockExecFile,
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => mockExecFile),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    unlinkSync: mockUnlinkSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
    rmSync: mockRmSync,
  },
  existsSync: mockExistsSync,
  unlinkSync: mockUnlinkSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  rmSync: mockRmSync,
}));

vi.mock('os', () => ({
  default: { cpus: () => [{ model: 'CPU 1' }, { model: 'CPU 2' }] },
  cpus: () => [{ model: 'CPU 1' }, { model: 'CPU 2' }],
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/mock/app',
    getPath: (n: string) => (n === 'temp' ? '/tmp' : `/mock/${n}`),
  },
}));

function createMockProcess(exitCode = 0, stderr = ''): Partial<ChildProcess> {
  return {
    stderr: {
      on: vi.fn((event: string, listener: (data: Buffer) => void) => {
        if (event === 'data' && stderr) {
          setTimeout(() => listener(Buffer.from(stderr)), 0);
        }
      }),
    } as unknown as ChildProcess['stderr'],
    on: vi.fn((event: string, listener: (code: number | null) => void) => {
      if (event === 'close') {
        setTimeout(() => listener(exitCode), 10);
      }
    }) as unknown as ChildProcess['on'],
    kill: vi.fn(),
  };
}

describe('ffmpeg gif export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockExistsSync.mockReturnValue(true);
    mockSpawn.mockReturnValue(createMockProcess(0));
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });
  });

  it('returns error when ffmpeg binary not found', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      // ffmpeg binary path - return false; everything else true
      return !String(p).includes('ffmpeg');
    });
    const { convertMp4ToGif } = await import('@/main/utils/ffmpeg');
    const result = await convertMp4ToGif({
      inputPath: '/p/in.mp4',
      outputPath: '/p/out.gif',
      resolution: '720p',
      frameRate: '20',
    });
    expect(result.success).toBe(false);
  });

  it('returns error when input file missing', async () => {
    mockExistsSync.mockImplementation((p: string) =>
      String(p).includes('/binaries/')
    );
    const { convertMp4ToGif } = await import('@/main/utils/ffmpeg');
    const result = await convertMp4ToGif({
      inputPath: '/p/missing.mp4',
      outputPath: '/p/out.gif',
      resolution: '720p',
      frameRate: '20',
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('Input file not found');
  });

  it('removes existing output file before converting', async () => {
    let callCount = 0;
    mockExistsSync.mockImplementation(() => {
      callCount++;
      return true;
    });
    const { convertMp4ToGif } = await import('@/main/utils/ffmpeg');
    await convertMp4ToGif({
      inputPath: '/p/in.mp4',
      outputPath: '/p/out.gif',
      resolution: '1080p',
      frameRate: '30',
    });
    expect(mockUnlinkSync).toHaveBeenCalledWith('/p/out.gif');
    expect(callCount).toBeGreaterThan(0);
  });

  it('parses duration from ffmpeg stderr', async () => {
    mockExecFile.mockImplementation(() => {
      const err = Object.assign(new Error('expected'), {
        stderr: 'Duration: 00:01:30.50, start: 0',
      });
      throw err;
    });
    const { convertMp4ToGif } = await import('@/main/utils/ffmpeg');
    const result = await convertMp4ToGif({
      inputPath: '/p/in.mp4',
      outputPath: '/p/out.gif',
      resolution: '720p',
      frameRate: '20',
    });
    expect(result.success).toBe(true);
  });

  it('uses the shared fallback for a malformed frame rate', async () => {
    const { convertMp4ToGif } = await import('@/main/utils/ffmpeg');

    await convertMp4ToGif({
      inputPath: '/p/in.mp4',
      outputPath: '/p/out.gif',
      resolution: '720p',
      frameRate: '30fps' as never,
    });

    const args = mockSpawn.mock.calls[0][1] as string[];
    expect(args.find(arg => arg.startsWith('[0:v]fps='))).toContain(
      '[0:v]fps=60,'
    );
  });

  it('returns error when output not created after ffmpeg', async () => {
    let calls = 0;
    mockExistsSync.mockImplementation(() => {
      calls++;
      // binary check + input check yes; before unlink yes; after spawn no
      if (calls === 1 || calls === 2) return true;
      if (calls === 3) return true;
      return false;
    });
    const { convertMp4ToGif } = await import('@/main/utils/ffmpeg');
    const result = await convertMp4ToGif({
      inputPath: '/p/in.mp4',
      outputPath: '/p/out.gif',
      resolution: '720p',
      frameRate: '20',
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('GIF file was not created');
  });

  it('handles all resolution values', async () => {
    const { convertMp4ToGif } = await import('@/main/utils/ffmpeg');
    for (const resolution of [
      'original',
      '4k',
      '1080p',
      '720p',
      '480p',
    ] as const) {
      const result = await convertMp4ToGif({
        inputPath: '/p/in.mp4',
        outputPath: '/p/out.gif',
        resolution,
        frameRate: '20',
      });
      expect(result.success).toBe(true);
    }
  });

  it('returns error message on spawn failure', async () => {
    mockSpawn.mockReturnValue(createMockProcess(1, 'codec not found'));
    const { convertMp4ToGif } = await import('@/main/utils/ffmpeg');
    const result = await convertMp4ToGif({
      inputPath: '/p/in.mp4',
      outputPath: '/p/out.gif',
      resolution: '720p',
      frameRate: '20',
    });
    expect(result.success).toBe(false);
  });
});
