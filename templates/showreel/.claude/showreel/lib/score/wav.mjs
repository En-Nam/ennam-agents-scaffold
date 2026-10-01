// 16-bit stereo PCM WAV encoder (D12). Interleaved L/R, 48 kHz.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const q16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));

/** Encode {left, right, sampleRate} as a RIFF/WAVE PCM buffer (44-byte header). */
export function encodeWav(score) {
  const { left, right, sampleRate } = score;
  const n = left.length;
  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(q16(left[i]), i * 4);
    data.writeInt16LE(q16(right[i]), i * 4 + 2);
  }
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0, 'ascii'); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8, 'ascii');
  hdr.write('fmt ', 12, 'ascii'); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
  hdr.writeUInt32LE(sampleRate, 24); hdr.writeUInt32LE(sampleRate * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36, 'ascii'); hdr.writeUInt32LE(data.length, 40);
  return Buffer.concat([hdr, data]);
}

export function writeWav(path, score) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodeWav(score));
}
