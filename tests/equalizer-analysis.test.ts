import { existsSync } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/main/utils/ffmpeg', () => ({
  getFFmpegPath: () =>
    path.join(process.cwd(), 'src/main/binaries/ffmpeg/ffmpeg'),
}));

import { analyzeEqualizerAudio } from '@/main/capture/video/equalizer-analysis';
import { EQUALIZER_ANALYSIS_VALUE_SCALE } from '@/types/equalizer';

const temporaryDirectories: string[] = [];
const ffmpegPath = path.join(process.cwd(), 'src/main/binaries/ffmpeg/ffmpeg');
const ffmpegIt = existsSync(ffmpegPath) ? it : it.skip;

function createWaveFile(durationSeconds: number, amplitude: number): Buffer {
  const sampleRate = 48000;
  const sampleCount = Math.floor(durationSeconds * sampleRate);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index++) {
    const sample = Math.sin((index / sampleRate) * 440 * Math.PI * 2);
    buffer.writeInt16LE(Math.round(sample * amplitude * 32767), 44 + index * 2);
  }

  return buffer;
}

async function writeWaveFile(
  durationSeconds: number,
  amplitude: number
): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'capty-equalizer-')
  );
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, 'source.wav');
  await fs.writeFile(filePath, createWaveFile(durationSeconds, amplitude));
  return filePath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('equalizer FFmpeg analysis', () => {
  ffmpegIt(
    'extracts reactive spectrum and waveform values from real audio',
    async () => {
      const filePath = await writeWaveFile(1, 0.8);

      const analysis = await analyzeEqualizerAudio(filePath);
      const valuesPerFrame =
        analysis.spectrumBandCount + analysis.waveformPointCount;
      let maxSpectrum = 0;
      let maxWaveform = 0;

      for (
        let offset = 0;
        offset < analysis.frames.length;
        offset += valuesPerFrame
      ) {
        for (let index = 0; index < analysis.spectrumBandCount; index++) {
          maxSpectrum = Math.max(
            maxSpectrum,
            analysis.frames[offset + index] / EQUALIZER_ANALYSIS_VALUE_SCALE
          );
        }
        for (let index = 0; index < analysis.waveformPointCount; index++) {
          maxWaveform = Math.max(
            maxWaveform,
            Math.abs(
              analysis.frames[offset + analysis.spectrumBandCount + index] /
                EQUALIZER_ANALYSIS_VALUE_SCALE
            )
          );
        }
      }

      expect(analysis.duration).toBeGreaterThan(0.8);
      expect(maxSpectrum).toBeGreaterThan(0.2);
      expect(maxWaveform).toBeGreaterThan(0.6);
    }
  );

  ffmpegIt('terminates analysis when aborted', async () => {
    const filePath = await writeWaveFile(30, 0.8);
    const controller = new AbortController();

    const analysis = analyzeEqualizerAudio(filePath, controller.signal);
    controller.abort();

    await expect(analysis).rejects.toMatchObject({ name: 'AbortError' });
  });
});
