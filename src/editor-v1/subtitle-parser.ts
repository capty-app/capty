import type { SubtitleData } from '@/types/subtitle';

const parseSrtTimestamp = (timestamp: string): number => {
  const [time, milliseconds] = timestamp.split(',');
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds + Number(milliseconds) / 1_000;
};

export const parseSrtToSubtitleData = (
  content: string,
  generatedAt: string
): SubtitleData => {
  const blocks = content.trim().split(/\n\n+/);
  const segments: SubtitleData['segments'] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;
    const timeMatch = lines[1].match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!timeMatch) continue;
    const start = parseSrtTimestamp(timeMatch[1]);
    const end = parseSrtTimestamp(timeMatch[2]);
    const text = lines.slice(2).join(' ').trim();
    if (!text || end <= start) continue;
    segments.push({ start, end, text });
  }
  return {
    segments,
    meta: {
      generatedAt,
      language: 'en',
      model: 'imported',
    },
  };
};
