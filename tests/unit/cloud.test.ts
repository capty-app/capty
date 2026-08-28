import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'stream';
import type { CloudConfig } from '@/types/settings';
import { DEFAULT_CLOUD_CONFIG } from '@/types/settings';

const mockNotificationShow = vi.fn();
const mockNotificationConstructor = vi.fn();
const mockIpcMainHandle = vi.fn();
const mockIpcMainOn = vi.fn();
const mockClipboardWriteText = vi.fn();

class MockNotification {
  static isSupported = () => true;
  show = mockNotificationShow;

  constructor(options: unknown) {
    mockNotificationConstructor(options);
  }
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcMainHandle,
    on: mockIpcMainOn,
  },
  Notification: MockNotification,
  clipboard: {
    writeText: (...args: unknown[]) => mockClipboardWriteText(...args),
  },
}));

const mockPutObject = vi.fn();
const mockHeadBucket = vi.fn();
const mockS3ClientConstructor = vi.fn();

class MockS3Client {
  config: Record<string, unknown>;
  constructor(config: Record<string, unknown>) {
    mockS3ClientConstructor(config);
    this.config = config;
  }
  putObject = mockPutObject;
  headBucket = mockHeadBucket;
}

vi.mock('@/main/cloud/s3-client', () => ({
  S3Client: MockS3Client,
}));

const mockCaptyUpload = vi.fn();
const mockCaptyTestConnection = vi.fn();
const mockCaptyClientConstructor = vi.fn();

class MockCaptyCloudClient {
  constructor(credentials: Record<string, unknown>) {
    mockCaptyClientConstructor(credentials);
  }
  upload = mockCaptyUpload;
  testConnection = mockCaptyTestConnection;
}

vi.mock('@/main/cloud/capty-client', () => ({
  CaptyCloudClient: MockCaptyCloudClient,
}));

const mockGetCachedLicense = vi.fn();
const mockIsPro = vi.fn();

vi.mock('@/main/license/cache.ts', () => ({
  getCachedLicense: () => mockGetCachedLicense(),
}));

vi.mock('@/main/license/validation.ts', () => ({
  isPro: () => mockIsPro(),
}));

const mockStat = vi.fn();
const mockCreateReadStream = vi.fn();

vi.mock('fs', () => ({
  default: {
    promises: {
      stat: (...args: unknown[]) => mockStat(...args),
    },
    createReadStream: (...args: unknown[]) => mockCreateReadStream(...args),
  },
}));

const mockS3CloudConfig: CloudConfig = {
  enabled: true,
  activeProvider: 's3',
  s3: {
    endpoint: 'https://s3.amazonaws.com',
    region: 'us-east-1',
    bucket: 'my-bucket',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    pathPrefix: '',
    customDomain: '',
  },
  rest: {
    url: '',
    headers: [],
    fileFieldName: 'file',
    responseIsPlainText: false,
    responseUrlPath: '',
  },
};

const mockRestCloudConfig: CloudConfig = {
  enabled: true,
  activeProvider: 'rest',
  s3: { ...mockS3CloudConfig.s3 },
  rest: {
    url: 'https://api.example.com/upload',
    headers: [{ key: 'Authorization', value: 'Bearer token' }],
    fileFieldName: 'file',
    responseIsPlainText: false,
    responseUrlPath: 'data.url',
  },
};

const mockCaptyCloudConfig: CloudConfig = {
  ...DEFAULT_CLOUD_CONFIG,
  enabled: true,
  activeProvider: 'capty',
};

const mockGetConfig = vi.fn(() => ({
  cloud: { ...mockS3CloudConfig },
}));

vi.mock('@/main/settings', () => ({
  getConfig: () => mockGetConfig(),
}));

function invokeUploadFile(
  senderId: number,
  filePath: string
): Promise<unknown> {
  const handler = mockIpcMainHandle.mock.calls.find(
    call => call[0] === 'cloud:uploadFile'
  )?.[1] as (event: unknown, filePath: string) => Promise<unknown>;

  return handler({ sender: { id: senderId } }, filePath);
}

function invokeCancelUpload(senderId: number): void {
  const handler = mockIpcMainOn.mock.calls.find(
    call => call[0] === 'cloud:cancelUpload'
  )?.[1] as (event: unknown) => void;

  handler({ sender: { id: senderId } });
}

function pendingUploadUntilAborted(params: {
  signal?: AbortSignal;
}): Promise<never> {
  return new Promise((_resolve, reject) => {
    const signal = params.signal;
    if (!signal) return;

    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }

    signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
}

describe('Cloud Upload Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockReturnValue({ cloud: { ...mockS3CloudConfig } });
    mockPutObject.mockResolvedValue(undefined);
    mockHeadBucket.mockResolvedValue(undefined);
    mockCaptyUpload.mockResolvedValue('https://capty.test/s/share-slug');
    mockCaptyTestConnection.mockResolvedValue(undefined);
    mockGetCachedLicense.mockReturnValue({
      email: 'user@example.com',
      licenseKey: 'license-key',
    });
    mockIsPro.mockReturnValue(true);
    mockS3ClientConstructor.mockClear();
    mockStat.mockResolvedValue({ size: 'fake-video-data'.length });
    mockCreateReadStream.mockImplementation(() =>
      Readable.from(Buffer.from('fake-video-data'))
    );
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('isCloudConfigured (S3)', () => {
    it('returns true when all required S3 fields are configured', async () => {
      const { isCloudConfigured } = await import('@/main/cloud/index');
      expect(isCloudConfigured()).toBe(true);
    });

    it('returns false when cloud is disabled', async () => {
      mockGetConfig.mockReturnValue({
        cloud: { ...mockS3CloudConfig, enabled: false },
      });
      const { isCloudConfigured } = await import('@/main/cloud/index');
      expect(isCloudConfigured()).toBe(false);
    });

    it('returns false when S3 endpoint is missing', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockS3CloudConfig,
          s3: { ...mockS3CloudConfig.s3, endpoint: '' },
        },
      });
      const { isCloudConfigured } = await import('@/main/cloud/index');
      expect(isCloudConfigured()).toBe(false);
    });

    it('returns false when S3 bucket is missing', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockS3CloudConfig,
          s3: { ...mockS3CloudConfig.s3, bucket: '' },
        },
      });
      const { isCloudConfigured } = await import('@/main/cloud/index');
      expect(isCloudConfigured()).toBe(false);
    });

    it('returns true with the default config and an active license', async () => {
      mockGetConfig.mockReturnValue({
        cloud: { ...DEFAULT_CLOUD_CONFIG },
      });
      const { isCloudConfigured } = await import('@/main/cloud/index');
      expect(isCloudConfigured()).toBe(true);
    });
  });

  describe('isCloudConfigured (Capty Cloud)', () => {
    it('returns true when cloud is enabled and a license is active', async () => {
      mockGetConfig.mockReturnValue({ cloud: { ...mockCaptyCloudConfig } });
      const { isCloudConfigured } = await import('@/main/cloud/index');
      expect(isCloudConfigured()).toBe(true);
    });

    it('returns false without a cached license', async () => {
      mockGetConfig.mockReturnValue({ cloud: { ...mockCaptyCloudConfig } });
      mockGetCachedLicense.mockReturnValue(null);
      const { isCloudConfigured } = await import('@/main/cloud/index');
      expect(isCloudConfigured()).toBe(false);
    });

    it('returns false when the cached license is not active', async () => {
      mockGetConfig.mockReturnValue({ cloud: { ...mockCaptyCloudConfig } });
      mockIsPro.mockReturnValue(false);
      const { isCloudConfigured } = await import('@/main/cloud/index');
      expect(isCloudConfigured()).toBe(false);
    });
  });

  describe('isCloudConfigured (REST)', () => {
    it('returns true when REST url and json path are set', async () => {
      mockGetConfig.mockReturnValue({ cloud: { ...mockRestCloudConfig } });
      const { isCloudConfigured } = await import('@/main/cloud/index');
      expect(isCloudConfigured()).toBe(true);
    });

    it('returns true when REST url is set and plain-text mode is on', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockRestCloudConfig,
          rest: {
            ...mockRestCloudConfig.rest,
            responseIsPlainText: true,
            responseUrlPath: '',
          },
        },
      });
      const { isCloudConfigured } = await import('@/main/cloud/index');
      expect(isCloudConfigured()).toBe(true);
    });

    it('returns false when REST url is missing', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockRestCloudConfig,
          rest: { ...mockRestCloudConfig.rest, url: '' },
        },
      });
      const { isCloudConfigured } = await import('@/main/cloud/index');
      expect(isCloudConfigured()).toBe(false);
    });

    it('returns false when json mode is on but path is empty', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockRestCloudConfig,
          rest: {
            ...mockRestCloudConfig.rest,
            responseIsPlainText: false,
            responseUrlPath: '',
          },
        },
      });
      const { isCloudConfigured } = await import('@/main/cloud/index');
      expect(isCloudConfigured()).toBe(false);
    });
  });

  describe('testConnection (S3)', () => {
    it('returns success when S3 connection works', async () => {
      mockHeadBucket.mockResolvedValue(undefined);
      const { testConnection } = await import('@/main/cloud/index');
      const result = await testConnection();
      expect(result).toEqual({ success: true });
    });

    it('returns error when S3 connection fails', async () => {
      mockHeadBucket.mockRejectedValue(new Error('Access Denied'));
      const { testConnection } = await import('@/main/cloud/index');
      const result = await testConnection();
      expect(result).toEqual({ success: false, error: 'Access Denied' });
    });

    it('returns missing configuration error when S3 fields are empty', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockS3CloudConfig,
          s3: { ...mockS3CloudConfig.s3, endpoint: '' },
        },
      });
      const { testConnection } = await import('@/main/cloud/index');
      const result = await testConnection();
      expect(result).toEqual({
        success: false,
        error: 'Missing required configuration',
      });
    });

    it('builds S3Client with the correct configuration', async () => {
      mockHeadBucket.mockResolvedValue(undefined);
      const { testConnection } = await import('@/main/cloud/index');
      await testConnection();
      expect(mockS3ClientConstructor).toHaveBeenCalledWith({
        endpoint: 'https://s3.amazonaws.com',
        region: 'us-east-1',
        bucket: 'my-bucket',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      });
    });

    it('uses "auto" region when region is empty', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockS3CloudConfig,
          s3: { ...mockS3CloudConfig.s3, region: '' },
        },
      });
      mockHeadBucket.mockResolvedValue(undefined);
      const { testConnection } = await import('@/main/cloud/index');
      await testConnection();
      expect(mockS3ClientConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'auto' })
      );
    });

    it('adds https when endpoint lacks protocol', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockS3CloudConfig,
          s3: { ...mockS3CloudConfig.s3, endpoint: 's3.amazonaws.com' },
        },
      });
      mockHeadBucket.mockResolvedValue(undefined);
      const { testConnection } = await import('@/main/cloud/index');
      await testConnection();
      expect(mockS3ClientConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'https://s3.amazonaws.com' })
      );
    });
  });

  describe('testConnection (REST)', () => {
    it('uploads a test pixel and reports success when URL is returned', async () => {
      mockGetConfig.mockReturnValue({ cloud: { ...mockRestCloudConfig } });
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { url: 'https://x/y.png' } }), {
          status: 200,
        })
      );
      vi.stubGlobal('fetch', fetchMock);
      const { testConnection } = await import('@/main/cloud/index');
      const result = await testConnection();
      expect(result).toEqual({ success: true });
      expect(fetchMock).toHaveBeenCalledOnce();
      vi.unstubAllGlobals();
    });

    it('reports error when REST upload fails', async () => {
      mockGetConfig.mockReturnValue({ cloud: { ...mockRestCloudConfig } });
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('boom', { status: 500 }));
      vi.stubGlobal('fetch', fetchMock);
      const { testConnection } = await import('@/main/cloud/index');
      const result = await testConnection();
      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
      vi.unstubAllGlobals();
    });

    it('reports missing configuration when REST url is empty', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockRestCloudConfig,
          rest: { ...mockRestCloudConfig.rest, url: '' },
        },
      });
      const { testConnection } = await import('@/main/cloud/index');
      const result = await testConnection();
      expect(result).toEqual({
        success: false,
        error: 'Missing required configuration',
      });
    });
  });

  describe('Capty Cloud routing', () => {
    beforeEach(() => {
      mockGetConfig.mockReturnValue({ cloud: { ...mockCaptyCloudConfig } });
    });

    it('tests the usage endpoint through the Capty Cloud client', async () => {
      const { testConnection } = await import('@/main/cloud/index');
      const result = await testConnection();

      expect(result).toEqual({ success: true });
      expect(mockCaptyTestConnection).toHaveBeenCalledOnce();
      expect(mockCaptyClientConstructor).toHaveBeenCalledWith({
        email: 'user@example.com',
        licenseKey: 'license-key',
      });
    });

    it('uploads images through the Capty Cloud client', async () => {
      const { uploadImage } = await import('@/main/cloud/index');
      const url = await uploadImage(
        Buffer.from('fake-image-data').toString('base64')
      );

      expect(url).toBe('https://capty.test/s/share-slug');
      expect(mockCaptyUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'image/png',
          filename: expect.stringMatching(/^screenshot-.+\.png$/),
        })
      );
    });

    it('rejects uploads when the active license is unavailable', async () => {
      mockIsPro.mockReturnValue(false);
      const { uploadImage } = await import('@/main/cloud/index');

      await expect(
        uploadImage(Buffer.from('fake-image-data').toString('base64'))
      ).rejects.toThrow('Cloud provider is not configured');
      expect(mockCaptyUpload).not.toHaveBeenCalled();
    });
  });

  describe('uploadImage via S3', () => {
    const testImageBase64 = Buffer.from('fake-image-data').toString('base64');

    it('uploads image and returns a path-style URL', async () => {
      mockPutObject.mockResolvedValue(undefined);
      const { uploadImage } = await import('@/main/cloud/index');
      const url = await uploadImage(testImageBase64);
      expect(url).toMatch(
        /^https:\/\/s3\.amazonaws\.com\/my-bucket\/screenshot-\d+-[a-z0-9]+\.png$/
      );
    });

    it('throws when cloud upload is disabled', async () => {
      mockGetConfig.mockReturnValue({
        cloud: { ...mockS3CloudConfig, enabled: false },
      });
      const { uploadImage } = await import('@/main/cloud/index');
      await expect(uploadImage(testImageBase64)).rejects.toThrow(
        'Cloud upload is not enabled'
      );
    });

    it('throws when config is incomplete', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockS3CloudConfig,
          s3: { ...mockS3CloudConfig.s3, endpoint: '' },
        },
      });
      const { uploadImage } = await import('@/main/cloud/index');
      await expect(uploadImage(testImageBase64)).rejects.toThrow(
        'Cloud provider is not configured'
      );
    });

    it('uses custom domain when configured', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockS3CloudConfig,
          s3: {
            ...mockS3CloudConfig.s3,
            customDomain: 'https://cdn.example.com',
          },
        },
      });
      const { uploadImage } = await import('@/main/cloud/index');
      const url = await uploadImage(testImageBase64);
      expect(url).toMatch(
        /^https:\/\/cdn\.example\.com\/screenshot-\d+-[a-z0-9]+\.png$/
      );
    });

    it('includes the path prefix when configured', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockS3CloudConfig,
          s3: { ...mockS3CloudConfig.s3, pathPrefix: 'screenshots/' },
        },
      });
      const { uploadImage } = await import('@/main/cloud/index');
      const url = await uploadImage(testImageBase64);
      expect(url).toMatch(/screenshots\/screenshot-\d+-[a-z0-9]+\.png$/);
    });

    it('uses virtual-hosted style URL when endpoint contains bucket', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockS3CloudConfig,
          s3: {
            ...mockS3CloudConfig.s3,
            endpoint: 'https://my-bucket.s3.amazonaws.com',
            bucket: 'my-bucket',
          },
        },
      });
      const { uploadImage } = await import('@/main/cloud/index');
      const url = await uploadImage(testImageBase64);
      expect(url).toMatch(
        /^https:\/\/my-bucket\.s3\.amazonaws\.com\/screenshot-\d+-[a-z0-9]+\.png$/
      );
    });

    it('propagates putObject errors', async () => {
      mockPutObject.mockRejectedValue(new Error('NoSuchBucket'));
      const { uploadImage } = await import('@/main/cloud/index');
      await expect(uploadImage(testImageBase64)).rejects.toThrow(
        'NoSuchBucket'
      );
    });

    it('calls putObject with content-type and public-read ACL', async () => {
      const { uploadImage } = await import('@/main/cloud/index');
      await uploadImage(testImageBase64);
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'image/png',
          acl: 'public-read',
        })
      );
    });

    it('generates unique filenames across uploads', async () => {
      const { uploadImage } = await import('@/main/cloud/index');
      const u1 = await uploadImage(testImageBase64);
      const u2 = await uploadImage(testImageBase64);
      expect(u1).not.toBe(u2);
    });
  });

  describe('uploadImage via REST', () => {
    const testImageBase64 = Buffer.from('test').toString('base64');

    it('POSTs multipart body and extracts URL from JSON path', async () => {
      mockGetConfig.mockReturnValue({ cloud: { ...mockRestCloudConfig } });
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { url: 'https://cdn.example.com/abc.png' },
          }),
          { status: 200 }
        )
      );
      vi.stubGlobal('fetch', fetchMock);

      const { uploadImage } = await import('@/main/cloud/index');
      const url = await uploadImage(testImageBase64);

      expect(url).toBe('https://cdn.example.com/abc.png');
      expect(fetchMock).toHaveBeenCalledOnce();
      const [calledUrl, init] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe('https://api.example.com/upload');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer token'
      );
      expect(
        (init.headers as Record<string, string>)['Content-Type']
      ).toContain('multipart/form-data; boundary=');
      vi.unstubAllGlobals();
    });

    it('treats plain-text response as URL when enabled', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockRestCloudConfig,
          rest: {
            ...mockRestCloudConfig.rest,
            responseIsPlainText: true,
            responseUrlPath: '',
          },
        },
      });
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response('https://cdn.example.com/raw.png\n', { status: 200 })
        );
      vi.stubGlobal('fetch', fetchMock);

      const { uploadImage } = await import('@/main/cloud/index');
      const url = await uploadImage(testImageBase64);

      expect(url).toBe('https://cdn.example.com/raw.png');
      vi.unstubAllGlobals();
    });

    it('throws when response JSON path is missing', async () => {
      mockGetConfig.mockReturnValue({ cloud: { ...mockRestCloudConfig } });
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ other: 'value' }), { status: 200 })
        );
      vi.stubGlobal('fetch', fetchMock);

      const { uploadImage } = await import('@/main/cloud/index');
      await expect(uploadImage(testImageBase64)).rejects.toThrow(
        /URL not found at path/
      );
      vi.unstubAllGlobals();
    });

    it('throws when HTTP response is not ok', async () => {
      mockGetConfig.mockReturnValue({ cloud: { ...mockRestCloudConfig } });
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('forbidden', { status: 403 }));
      vi.stubGlobal('fetch', fetchMock);

      const { uploadImage } = await import('@/main/cloud/index');
      await expect(uploadImage(testImageBase64)).rejects.toThrow(/403/);
      vi.unstubAllGlobals();
    });
  });

  describe('uploadFile via S3', () => {
    it('uploads an mp4 and returns a path-style URL', async () => {
      const { uploadFile } = await import('@/main/cloud/index');
      const url = await uploadFile('/tmp/recording.mp4');
      expect(url).toMatch(
        /^https:\/\/s3\.amazonaws\.com\/my-bucket\/capture-\d+-[a-z0-9]+\.mp4$/
      );
    });

    it('reads the file from the given path', async () => {
      const { uploadFile } = await import('@/main/cloud/index');
      await uploadFile('/tmp/recording.mp4');
      expect(mockStat).toHaveBeenCalledWith('/tmp/recording.mp4');
    });

    it('uploads mp4 with the video content type and public-read ACL', async () => {
      const { uploadFile } = await import('@/main/cloud/index');
      await uploadFile('/tmp/recording.mp4');
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'video/mp4',
          acl: 'public-read',
        })
      );
    });

    it('uploads gif with the gif content type', async () => {
      const { uploadFile } = await import('@/main/cloud/index');
      await uploadFile('/tmp/recording.gif');
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'image/gif' })
      );
    });

    it('uploads png screenshots with the png content type', async () => {
      const { uploadFile } = await import('@/main/cloud/index');
      await uploadFile('/tmp/screenshot.png');
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'image/png' })
      );
    });

    it('falls back to octet-stream for unknown extensions', async () => {
      const { uploadFile } = await import('@/main/cloud/index');
      await uploadFile('/tmp/recording.mov');
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'application/octet-stream' })
      );
    });

    it('includes the path prefix when configured', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockS3CloudConfig,
          s3: { ...mockS3CloudConfig.s3, pathPrefix: 'videos/' },
        },
      });
      const { uploadFile } = await import('@/main/cloud/index');
      const url = await uploadFile('/tmp/recording.mp4');
      expect(url).toMatch(/videos\/capture-\d+-[a-z0-9]+\.mp4$/);
    });

    it('throws when cloud upload is disabled', async () => {
      mockGetConfig.mockReturnValue({
        cloud: { ...mockS3CloudConfig, enabled: false },
      });
      const { uploadFile } = await import('@/main/cloud/index');
      await expect(uploadFile('/tmp/recording.mp4')).rejects.toThrow(
        'Cloud upload is not enabled'
      );
    });

    it('throws when config is incomplete', async () => {
      mockGetConfig.mockReturnValue({
        cloud: {
          ...mockS3CloudConfig,
          s3: { ...mockS3CloudConfig.s3, bucket: '' },
        },
      });
      const { uploadFile } = await import('@/main/cloud/index');
      await expect(uploadFile('/tmp/recording.mp4')).rejects.toThrow(
        'Cloud provider is not configured'
      );
    });

    it('propagates file read errors', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));
      const { uploadFile } = await import('@/main/cloud/index');
      await expect(uploadFile('/tmp/missing.mp4')).rejects.toThrow('ENOENT');
    });
  });

  describe('uploadFile via REST', () => {
    it('POSTs the video as multipart and extracts the URL', async () => {
      mockGetConfig.mockReturnValue({ cloud: { ...mockRestCloudConfig } });
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ data: { url: 'https://cdn.example.com/v.mp4' } }),
            { status: 200 }
          )
        );
      vi.stubGlobal('fetch', fetchMock);

      const { uploadFile } = await import('@/main/cloud/index');
      const url = await uploadFile('/tmp/recording.mp4');

      expect(url).toBe('https://cdn.example.com/v.mp4');
      const [, init] = fetchMock.mock.calls[0];
      expect(
        (init.headers as Record<string, string>)['Content-Type']
      ).toContain('multipart/form-data; boundary=');
      vi.unstubAllGlobals();
    });
  });

  describe('init', () => {
    it('registers cloud:upload handler', async () => {
      const { init } = await import('@/main/cloud/index');
      init();
      expect(mockIpcMainHandle).toHaveBeenCalledWith(
        'cloud:upload',
        expect.any(Function)
      );
    });

    it('registers cloud:uploadFile handler', async () => {
      const { init } = await import('@/main/cloud/index');
      init();
      expect(mockIpcMainHandle).toHaveBeenCalledWith(
        'cloud:uploadFile',
        expect.any(Function)
      );
    });

    it('registers cloud:testConnection handler', async () => {
      const { init } = await import('@/main/cloud/index');
      init();
      expect(mockIpcMainHandle).toHaveBeenCalledWith(
        'cloud:testConnection',
        expect.any(Function)
      );
    });

    it('registers cloud:isConfigured handler', async () => {
      const { init } = await import('@/main/cloud/index');
      init();
      expect(mockIpcMainHandle).toHaveBeenCalledWith(
        'cloud:isConfigured',
        expect.any(Function)
      );
    });

    it('registers cloud:has-hosted-access handler', async () => {
      const { init } = await import('@/main/cloud/index');
      init();
      expect(mockIpcMainHandle).toHaveBeenCalledWith(
        'cloud:has-hosted-access',
        expect.any(Function)
      );
    });

    it('registers cloud:cancelUpload listener', async () => {
      const { init } = await import('@/main/cloud/index');
      init();
      expect(mockIpcMainOn).toHaveBeenCalledWith(
        'cloud:cancelUpload',
        expect.any(Function)
      );
    });

    it('copies the uploaded url to the clipboard on success', async () => {
      const { init } = await import('@/main/cloud/index');
      init();
      const result = (await invokeUploadFile(1, '/tmp/recording.mp4')) as {
        success: boolean;
        url?: string;
      };
      expect(result.success).toBe(true);
      expect(mockClipboardWriteText).toHaveBeenCalledWith(result.url);
    });

    it('notifies with the media kind of the uploaded file', async () => {
      const { init } = await import('@/main/cloud/index');
      init();

      await invokeUploadFile(1, '/tmp/recording.mp4');
      expect(mockNotificationConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Video Uploaded' })
      );

      await invokeUploadFile(1, '/tmp/screenshot.png');
      expect(mockNotificationConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Image Uploaded' })
      );
    });

    it('notifies gif exports as video uploads', async () => {
      const { init } = await import('@/main/cloud/index');
      init();

      await invokeUploadFile(1, '/tmp/recording.gif');
      expect(mockNotificationConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Video Uploaded' })
      );
    });

    it('returns a cancelled result when the upload is aborted', async () => {
      mockPutObject.mockImplementation(pendingUploadUntilAborted);
      const { init } = await import('@/main/cloud/index');
      init();

      const pending = invokeUploadFile(1, '/tmp/recording.mp4');
      await vi.waitFor(() => expect(mockPutObject).toHaveBeenCalled());
      invokeCancelUpload(1);

      const result = (await pending) as { success: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toBe('Upload cancelled');
    });

    it('cancels only the upload started by the requesting window', async () => {
      mockPutObject.mockImplementation(pendingUploadUntilAborted);
      const { init } = await import('@/main/cloud/index');
      init();

      const editorUpload = invokeUploadFile(1, '/tmp/recording.mp4');
      const previewUpload = invokeUploadFile(2, '/tmp/screenshot.png');
      await vi.waitFor(() => expect(mockPutObject).toHaveBeenCalledTimes(2));

      invokeCancelUpload(2);

      const previewResult = (await previewUpload) as {
        success: boolean;
        error?: string;
      };
      expect(previewResult.error).toBe('Upload cancelled');

      let editorSettled = false;
      void editorUpload.then(() => {
        editorSettled = true;
      });
      await Promise.resolve();
      expect(editorSettled).toBe(false);

      invokeCancelUpload(1);
      await editorUpload;
    });

    it('does not abort another window upload when a new upload starts', async () => {
      mockPutObject.mockImplementation(pendingUploadUntilAborted);
      const { init } = await import('@/main/cloud/index');
      init();

      const editorUpload = invokeUploadFile(1, '/tmp/recording.mp4');
      await vi.waitFor(() => expect(mockPutObject).toHaveBeenCalledTimes(1));

      const previewUpload = invokeUploadFile(2, '/tmp/screenshot.png');
      await vi.waitFor(() => expect(mockPutObject).toHaveBeenCalledTimes(2));

      let editorSettled = false;
      void editorUpload.then(() => {
        editorSettled = true;
      });
      await Promise.resolve();
      expect(editorSettled).toBe(false);

      invokeCancelUpload(1);
      invokeCancelUpload(2);
      await Promise.all([editorUpload, previewUpload]);
    });
  });
});
