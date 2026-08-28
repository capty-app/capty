import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'child_process';
import type { VideoExportOptions, VideoQualityPreset } from '@/types/video';

// Mock child_process
const mockSpawn = vi.fn();
const mockExecFile = vi.fn();

vi.mock('child_process', () => ({
  spawn: mockSpawn,
  execFile: mockExecFile,
}));

// Mock promisify to return our mock execFile
vi.mock('util', () => ({
  promisify: vi.fn(() => mockExecFile),
}));

// Mock fs
const mockFs = {
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
  unlinkSync: mockFs.unlinkSync,
  mkdirSync: mockFs.mkdirSync,
  writeFileSync: mockFs.writeFileSync,
  rmSync: mockFs.rmSync,
}));

// Mock os
const mockCpus = vi.fn(() => [
  { model: 'CPU 1' },
  { model: 'CPU 2' },
  { model: 'CPU 3' },
  { model: 'CPU 4' },
]);

vi.mock('os', () => ({
  default: { cpus: mockCpus },
  cpus: mockCpus,
}));

// Mock Electron app
const mockApp = {
  isPackaged: false,
  getAppPath: vi.fn(() => '/mock/app'),
  getPath: vi.fn((name: string) => {
    if (name === 'temp') return '/mock/tmp';
    return `/mock/${name}`;
  }),
};

vi.mock('electron', () => ({
  app: mockApp,
}));

// Helper to create a mock child process
function createMockProcess(exitCode = 0, stderr = ''): Partial<ChildProcess> {
  const stderrListeners: Array<(data: Buffer) => void> = [];
  const closeListeners: Array<(code: number | null) => void> = [];
  const errorListeners: Array<(err: Error) => void> = [];

  return {
    stderr: {
      on: vi.fn((event: string, listener: (data: Buffer) => void) => {
        if (event === 'data') {
          stderrListeners.push(listener);
          if (stderr) {
            setTimeout(() => listener(Buffer.from(stderr)), 0);
          }
        }
      }),
    } as unknown as ChildProcess['stderr'],
    on: vi.fn(
      (event: string, listener: (codeOrErr: number | null | Error) => void) => {
        if (event === 'close') {
          closeListeners.push(listener as (code: number | null) => void);
          setTimeout(() => listener(exitCode), 10);
        } else if (event === 'error') {
          errorListeners.push(listener as (err: Error) => void);
        }
      }
    ) as unknown as ChildProcess['on'],
    kill: vi.fn(),
  };
}

describe('FFmpeg Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockApp.isPackaged = false;
    mockApp.getAppPath.mockReturnValue('/mock/app');
    mockFs.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getFFmpegPath', () => {
    it('should return development path when not packaged', async () => {
      mockApp.isPackaged = false;
      mockApp.getAppPath.mockReturnValue('/mock/app');

      const { getFFmpegPath } = await import('@/main/utils/ffmpeg');
      const ffmpegPath = getFFmpegPath();

      expect(ffmpegPath).toBe('/mock/app/src/main/binaries/ffmpeg/ffmpeg');
    });

    it('should return production path when dev path not found', async () => {
      // Mock process.resourcesPath for packaged app
      const originalResourcesPath = process.resourcesPath;
      Object.defineProperty(process, 'resourcesPath', {
        value: '/mock/resources',
        writable: true,
        configurable: true,
      });

      // Mock fs.existsSync to simulate production: dev path doesn't exist, prod path does
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p === '/mock/app/src/main/binaries/ffmpeg/ffmpeg') return false;
        if (p === '/mock/resources/binaries/ffmpeg/ffmpeg') return true;
        return true;
      });

      const { getFFmpegPath } = await import('@/main/utils/ffmpeg');
      const ffmpegPath = getFFmpegPath();

      expect(ffmpegPath).toBe('/mock/resources/binaries/ffmpeg/ffmpeg');

      // Restore
      Object.defineProperty(process, 'resourcesPath', {
        value: originalResourcesPath,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('trimVideo', () => {
    it('should return error when ffmpeg binary not found', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('ffmpeg')) return false;
        return true;
      });

      const { trimVideo } = await import('@/main/utils/ffmpeg');
      const result = await trimVideo({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        startTime: 0,
        endTime: 10,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('FFmpeg binary not found');
    });

    it('should return error when input file not found', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('ffmpeg')) return true;
        if (p === '/input/video.mov') return false;
        return true;
      });

      const { trimVideo } = await import('@/main/utils/ffmpeg');
      const result = await trimVideo({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        startTime: 0,
        endTime: 10,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Input file not found');
    });

    it('should remove existing output file before processing', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const { trimVideo } = await import('@/main/utils/ffmpeg');
      await trimVideo({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        startTime: 0,
        endTime: 10,
      });

      expect(mockFs.unlinkSync).toHaveBeenCalledWith('/output/video.mp4');
    });

    it('should call ffmpeg with correct arguments for MP4', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const { trimVideo } = await import('@/main/utils/ffmpeg');
      await trimVideo({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        startTime: 5,
        endTime: 15,
      });

      expect(mockSpawn).toHaveBeenCalled();
      const args = mockSpawn.mock.calls[0][1];

      // Check seek position
      expect(args).toContain('-ss');
      expect(args[args.indexOf('-ss') + 1]).toBe('5');

      // Check duration
      expect(args).toContain('-t');
      expect(args[args.indexOf('-t') + 1]).toBe('10');

      // Check input file
      expect(args).toContain('-i');
      expect(args[args.indexOf('-i') + 1]).toBe('/input/video.mov');

      // Check output codec
      expect(args).toContain('-c:v');
      expect(args).toContain('libx264');
      expect(args).toContain('-preset');
      expect(args[args.indexOf('-preset') + 1]).toBe('medium');

      // Check output file
      expect(args).toContain('/output/video.mp4');
    });

    it('should apply export options for resolution', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const exportOptions: VideoExportOptions = {
        format: 'mp4',
        resolution: '720p',
        compression: 'high',
        frameRate: '30',
      };

      const { trimVideo } = await import('@/main/utils/ffmpeg');
      await trimVideo({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        startTime: 0,
        endTime: 10,
        exportOptions,
      });

      const args = mockSpawn.mock.calls[0][1];

      // Check scale filter is applied
      expect(args).toContain('-vf');
      const vfIndex = args.indexOf('-vf');
      expect(args[vfIndex + 1]).toContain('scale=1280:720');

      // Check frame rate
      expect(args).toContain('-r');
      expect(args[args.indexOf('-r') + 1]).toBe('30');
    });

    it('should apply compression settings', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const exportOptions: VideoExportOptions = {
        format: 'mp4',
        resolution: 'original',
        qualityPreset: 'web-low',
        frameRate: '60',
        exportSpeed: 'fast',
      };

      const { trimVideo } = await import('@/main/utils/ffmpeg');
      await trimVideo({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        startTime: 0,
        endTime: 10,
        exportOptions,
      });

      const args = mockSpawn.mock.calls[0][1];

      // Check quality value (web-low = 25% quality -> CRF 26)
      expect(args).toContain('-crf');
      expect(args[args.indexOf('-crf') + 1]).toBe('26');
    });

    it('should map quality presets to CRF values', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const presets: Array<[VideoQualityPreset, string]> = [
        ['studio', '18'],
        ['social', '21'],
        ['web', '23'],
        ['web-low', '26'],
      ];

      const { trimVideo } = await import('@/main/utils/ffmpeg');

      for (const [qualityPreset] of presets) {
        await trimVideo({
          inputPath: '/input/video.mov',
          outputPath: '/output/video.mp4',
          startTime: 0,
          endTime: 10,
          exportOptions: {
            format: 'mp4',
            resolution: 'original',
            qualityPreset,
            frameRate: '60',
          },
        });
      }

      presets.forEach(([, crf], index) => {
        const args = mockSpawn.mock.calls[index][1];
        expect(args[args.indexOf('-crf') + 1]).toBe(crf);
      });
    });

    it('should return success when output file is created', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const { trimVideo } = await import('@/main/utils/ffmpeg');
      const result = await trimVideo({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        startTime: 0,
        endTime: 10,
      });

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('/output/video.mp4');
    });

    it('should return error when ffmpeg exits with non-zero code', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(1, 'Error processing video'));

      const { trimVideo } = await import('@/main/utils/ffmpeg');
      const result = await trimVideo({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        startTime: 0,
        endTime: 10,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('FFmpeg exited with code 1');
    });

    it('should handle abort signal', async () => {
      const abortController = new AbortController();
      mockFs.existsSync.mockReturnValue(true);

      const mockProcess = createMockProcess(0);
      mockSpawn.mockReturnValue(mockProcess);

      // Abort immediately
      abortController.abort();

      const { trimVideo } = await import('@/main/utils/ffmpeg');
      const result = await trimVideo({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        startTime: 0,
        endTime: 10,
        abortSignal: abortController.signal,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Aborted');
    });

    it('should not time out while ffmpeg keeps producing output', async () => {
      vi.useFakeTimers();

      try {
        mockFs.existsSync.mockReturnValue(true);

        let stderrListener: ((data: Buffer) => void) | undefined;
        const kill = vi.fn();
        mockSpawn.mockReturnValue({
          stderr: {
            on: vi.fn((event: string, listener: (data: Buffer) => void) => {
              if (event === 'data') stderrListener = listener;
            }),
          },
          on: vi.fn(),
          kill,
        });

        const { trimVideo } = await import('@/main/utils/ffmpeg');
        const resultPromise = trimVideo({
          inputPath: '/input/video.mov',
          outputPath: '/output/video.mp4',
          startTime: 0,
          endTime: 10,
        });

        for (let i = 0; i < 3; i++) {
          await vi.advanceTimersByTimeAsync(250000);
          stderrListener?.(Buffer.from('frame=100 time=00:04:10.00'));
        }
        expect(kill).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(300000);
        expect(kill).toHaveBeenCalledWith('SIGKILL');

        const result = await resultPromise;
        expect(result.success).toBe(false);
        expect(result.message).toBe('FFmpeg timeout');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('generateVideoThumbnail', () => {
    it('should return error when ffmpeg binary not found', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('ffmpeg')) return false;
        return true;
      });

      const { generateVideoThumbnail } = await import('@/main/utils/ffmpeg');
      const result = await generateVideoThumbnail({
        inputPath: '/input/video.mov',
        outputPath: '/output/thumb.jpg',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('FFmpeg binary not found');
    });

    it('should return error when input file not found', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('ffmpeg')) return true;
        if (p === '/input/video.mov') return false;
        return true;
      });

      const { generateVideoThumbnail } = await import('@/main/utils/ffmpeg');
      const result = await generateVideoThumbnail({
        inputPath: '/input/video.mov',
        outputPath: '/output/thumb.jpg',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Input file not found');
    });

    it('should call ffmpeg with correct arguments for thumbnail', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      const { generateVideoThumbnail } = await import('@/main/utils/ffmpeg');
      await generateVideoThumbnail({
        inputPath: '/input/video.mov',
        outputPath: '/output/thumb.jpg',
        time: 5,
      });

      expect(mockExecFile).toHaveBeenCalled();
      const args = mockExecFile.mock.calls[0][1];

      // Check seek position
      expect(args).toContain('-ss');
      expect(args[args.indexOf('-ss') + 1]).toBe('5');

      // Check single frame extraction
      expect(args).toContain('-vframes');
      expect(args[args.indexOf('-vframes') + 1]).toBe('1');

      // Check quality
      expect(args).toContain('-q:v');
      expect(args[args.indexOf('-q:v') + 1]).toBe('2');

      // Check output
      expect(args).toContain('/output/thumb.jpg');
    });

    it('should use default time of 0 when not specified', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      const { generateVideoThumbnail } = await import('@/main/utils/ffmpeg');
      await generateVideoThumbnail({
        inputPath: '/input/video.mov',
        outputPath: '/output/thumb.jpg',
      });

      const args = mockExecFile.mock.calls[0][1];
      expect(args[args.indexOf('-ss') + 1]).toBe('0');
    });

    it('should return success when thumbnail is created', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      const { generateVideoThumbnail } = await import('@/main/utils/ffmpeg');
      const result = await generateVideoThumbnail({
        inputPath: '/input/video.mov',
        outputPath: '/output/thumb.jpg',
      });

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('/output/thumb.jpg');
    });

    it('should return error on ffmpeg failure', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockExecFile.mockRejectedValue(new Error('FFmpeg error'));

      const { generateVideoThumbnail } = await import('@/main/utils/ffmpeg');
      const result = await generateVideoThumbnail({
        inputPath: '/input/video.mov',
        outputPath: '/output/thumb.jpg',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('FFmpeg error');
    });
  });

  describe('processVideoSegments', () => {
    it('should return error when no segments provided', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const { processVideoSegments } = await import('@/main/utils/ffmpeg');
      const result = await processVideoSegments({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        segments: [],
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('No segments provided');
    });

    it('should use trimVideo for single segment', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const { processVideoSegments } = await import('@/main/utils/ffmpeg');
      const result = await processVideoSegments({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        segments: [{ start: 0, end: 10 }],
      });

      expect(result.success).toBe(true);
      // Should have called spawn once for the trim operation
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('should process multiple segments and concatenate', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const { processVideoSegments } = await import('@/main/utils/ffmpeg');
      const result = await processVideoSegments({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        segments: [
          { start: 0, end: 5 },
          { start: 10, end: 15 },
        ],
      });

      expect(result.success).toBe(true);
      // Should have called spawn multiple times:
      // 2 for segments + 1 for concat
      expect(mockSpawn.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should create temp directory for segment processing', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const { processVideoSegments } = await import('@/main/utils/ffmpeg');
      await processVideoSegments({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        segments: [
          { start: 0, end: 5 },
          { start: 10, end: 15 },
        ],
      });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('/mock/tmp/video-edit-'),
        { recursive: true }
      );
    });

    it('should clean up temp files after processing', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const { processVideoSegments } = await import('@/main/utils/ffmpeg');
      await processVideoSegments({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        segments: [
          { start: 0, end: 5 },
          { start: 10, end: 15 },
        ],
      });

      expect(mockFs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('/mock/tmp/video-edit-'),
        { recursive: true, force: true }
      );
    });

    it('should clean up on error', async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p.includes('ffmpeg')) return true;
        if (p === '/input/video.mov') return true;
        if (p.includes('video-edit-')) return true;
        return false;
      });

      // First spawn succeeds (first segment), second fails
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createMockProcess(0);
        }
        return createMockProcess(1, 'Error');
      });

      const { processVideoSegments } = await import('@/main/utils/ffmpeg');
      const result = await processVideoSegments({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        segments: [
          { start: 0, end: 5 },
          { start: 10, end: 15 },
        ],
      });

      expect(result.success).toBe(false);
      // Should still clean up temp directory on error
      expect(mockFs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('/mock/tmp/video-edit-'),
        { recursive: true, force: true }
      );
    });

    it('should handle abort signal during segment processing', async () => {
      const abortController = new AbortController();
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      // Abort after first segment
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          abortController.abort();
        }
        return createMockProcess(0);
      });

      const { processVideoSegments } = await import('@/main/utils/ffmpeg');
      const result = await processVideoSegments({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        segments: [
          { start: 0, end: 5 },
          { start: 10, end: 15 },
        ],
        abortSignal: abortController.signal,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Aborted');
    });

    it('should apply export options to all segments', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const exportOptions: VideoExportOptions = {
        format: 'mp4',
        resolution: '720p',
        compression: 'medium',
        frameRate: '30',
      };

      const { processVideoSegments } = await import('@/main/utils/ffmpeg');
      await processVideoSegments({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        segments: [
          { start: 0, end: 5 },
          { start: 10, end: 15 },
        ],
        exportOptions,
      });

      // Check that first segment uses the export options
      const firstSegmentArgs = mockSpawn.mock.calls[0][1];
      expect(firstSegmentArgs).toContain('-vf');
      const vfIndex = firstSegmentArgs.indexOf('-vf');
      expect(firstSegmentArgs[vfIndex + 1]).toContain('scale=1280:720');
      expect(firstSegmentArgs).toContain('-r');
      expect(firstSegmentArgs[firstSegmentArgs.indexOf('-r') + 1]).toBe('30');
    });
  });

  describe('Social Media Preset', () => {
    it('should apply high bitrate encoding for social media preset', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const exportOptions: VideoExportOptions = {
        format: 'mp4',
        preset: 'social',
        resolution: '1080p',
        compression: 'high',
        frameRate: '60',
        socialPreset: {
          resolution: '1080p',
          frameRate: '60',
          bitrate: 15000,
        },
      };

      const { trimVideo } = await import('@/main/utils/ffmpeg');
      await trimVideo({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        startTime: 0,
        endTime: 10,
        exportOptions,
      });

      const args = mockSpawn.mock.calls[0][1];

      // Check bitrate
      expect(args).toContain('-b:v');
      expect(args[args.indexOf('-b:v') + 1]).toBe('15000k');
      expect(args).toContain('-maxrate');
      expect(args[args.indexOf('-maxrate') + 1]).toBe('15000k');
      expect(args).toContain('-bufsize');
      expect(args[args.indexOf('-bufsize') + 1]).toBe('30000k');
    });

    it('should use H.264 High Profile with CABAC for social media preset', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const exportOptions: VideoExportOptions = {
        format: 'mp4',
        preset: 'social',
        resolution: '1080p',
        compression: 'high',
        frameRate: '60',
        socialPreset: {
          resolution: '1080p',
          frameRate: '60',
          bitrate: 15000,
        },
      };

      const { trimVideo } = await import('@/main/utils/ffmpeg');
      await trimVideo({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        startTime: 0,
        endTime: 10,
        exportOptions,
      });

      const args = mockSpawn.mock.calls[0][1];

      // Check High Profile
      expect(args).toContain('-profile:v');
      expect(args[args.indexOf('-profile:v') + 1]).toBe('high');
      expect(args).toContain('-level');
      expect(args[args.indexOf('-level') + 1]).toBe('4.2');
      // Check CABAC entropy coding
      expect(args).toContain('-coder');
      expect(args[args.indexOf('-coder') + 1]).toBe('cabac');
    });

    it('should use level 5.2 for 4k social media preset', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const exportOptions: VideoExportOptions = {
        format: 'mp4',
        preset: 'social',
        resolution: '4k',
        qualityPreset: 'social',
        frameRate: '60',
        socialPreset: {
          resolution: '4k',
          frameRate: '60',
          bitrate: 45000,
        },
      };

      const { trimVideo } = await import('@/main/utils/ffmpeg');
      await trimVideo({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        startTime: 0,
        endTime: 10,
        exportOptions,
      });

      const args = mockSpawn.mock.calls[0][1];

      expect(args[args.indexOf('-level') + 1]).toBe('5.2');
    });

    it('should set GOP size and B-frames for social media preset', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const exportOptions: VideoExportOptions = {
        format: 'mp4',
        preset: 'social',
        resolution: '1080p',
        compression: 'high',
        frameRate: '30',
        socialPreset: {
          resolution: '1080p',
          frameRate: '30',
          bitrate: 12000,
        },
      };

      const { trimVideo } = await import('@/main/utils/ffmpeg');
      await trimVideo({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        startTime: 0,
        endTime: 10,
        exportOptions,
      });

      const args = mockSpawn.mock.calls[0][1];

      // Check GOP size (2 seconds at 30fps = 60 frames)
      expect(args).toContain('-g');
      expect(args[args.indexOf('-g') + 1]).toBe('60');
      // Check B-frames
      expect(args).toContain('-bf');
      expect(args[args.indexOf('-bf') + 1]).toBe('2');
    });

    it('should enable faststart for social media preset', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const exportOptions: VideoExportOptions = {
        format: 'mp4',
        preset: 'social',
        resolution: '720p',
        compression: 'high',
        frameRate: '60',
        socialPreset: {
          resolution: '720p',
          frameRate: '60',
          bitrate: 10000,
        },
      };

      const { trimVideo } = await import('@/main/utils/ffmpeg');
      await trimVideo({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        startTime: 0,
        endTime: 10,
        exportOptions,
      });

      const args = mockSpawn.mock.calls[0][1];

      // Check faststart
      expect(args).toContain('-movflags');
      expect(args[args.indexOf('-movflags') + 1]).toBe('+faststart');
    });

    it('should set 48kHz audio at 256kbps for social media preset', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const exportOptions: VideoExportOptions = {
        format: 'mp4',
        preset: 'social',
        resolution: '1080p',
        compression: 'high',
        frameRate: '60',
        socialPreset: {
          resolution: '1080p',
          frameRate: '60',
          bitrate: 15000,
        },
      };

      const { trimVideo } = await import('@/main/utils/ffmpeg');
      await trimVideo({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        startTime: 0,
        endTime: 10,
        exportOptions,
      });

      const args = mockSpawn.mock.calls[0][1];

      // Check audio sample rate
      expect(args).toContain('-ar');
      expect(args[args.indexOf('-ar') + 1]).toBe('48000');
      // Check higher audio bitrate
      expect(args).toContain('-b:a');
      expect(args[args.indexOf('-b:a') + 1]).toBe('256k');
    });

    it('should apply social media preset to multi-segment export', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const exportOptions: VideoExportOptions = {
        format: 'mp4',
        preset: 'social',
        resolution: '720p',
        compression: 'high',
        frameRate: '30',
        socialPreset: {
          resolution: '720p',
          frameRate: '30',
          bitrate: 8000,
        },
      };

      const { processVideoSegments } = await import('@/main/utils/ffmpeg');
      await processVideoSegments({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        segments: [
          { start: 0, end: 5 },
          { start: 10, end: 15 },
        ],
        exportOptions,
      });

      // Check that first segment uses high bitrate encoding
      const firstSegmentArgs = mockSpawn.mock.calls[0][1];
      expect(firstSegmentArgs).toContain('-b:v');
      expect(firstSegmentArgs[firstSegmentArgs.indexOf('-b:v') + 1]).toBe(
        '8000k'
      );
      expect(firstSegmentArgs).toContain('-profile:v');
      expect(firstSegmentArgs[firstSegmentArgs.indexOf('-profile:v') + 1]).toBe(
        'high'
      );
      expect(firstSegmentArgs).toContain('-coder');
      expect(firstSegmentArgs[firstSegmentArgs.indexOf('-coder') + 1]).toBe(
        'cabac'
      );
      expect(firstSegmentArgs).toContain('-maxrate');
      expect(firstSegmentArgs[firstSegmentArgs.indexOf('-level') + 1]).toBe(
        '4.2'
      );
    });

    it('should use level 5.2 for 4k multi-segment social export', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockSpawn.mockReturnValue(createMockProcess(0));

      const exportOptions: VideoExportOptions = {
        format: 'mp4',
        preset: 'social',
        resolution: '4k',
        qualityPreset: 'social',
        frameRate: '60',
        socialPreset: {
          resolution: '4k',
          frameRate: '60',
          bitrate: 45000,
        },
      };

      const { processVideoSegments } = await import('@/main/utils/ffmpeg');
      await processVideoSegments({
        inputPath: '/input/video.mov',
        outputPath: '/output/video.mp4',
        segments: [
          { start: 0, end: 5 },
          { start: 10, end: 15 },
        ],
        exportOptions,
      });

      const firstSegmentArgs = mockSpawn.mock.calls[0][1];
      expect(firstSegmentArgs).toContain('libx264');
      expect(firstSegmentArgs[firstSegmentArgs.indexOf('-level') + 1]).toBe(
        '5.2'
      );
    });
  });
});
