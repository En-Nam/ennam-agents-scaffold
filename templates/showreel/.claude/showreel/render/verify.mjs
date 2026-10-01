// D13 measurements with ffmpeg only (ffprobe is not shipped by ffmpeg-static) + WAV decode (Task 8).
//   video frames  = decode the video stream to the null muxer, read the FINAL `frame=` stats line
//   audio samples = decode the audio stream to s16le stereo on stdout, count bytes / 4
//   streams       = codec/profile/pix_fmt/size/fps + AAC rate/layout from the `-i` stream banner
import { runFfmpeg } from '../lib/render/ffmpeg.mjs';

/** Last `frame=N` in ffmpeg stats output (progress lines are \r-separated). null when absent. */
export function parseFrameCount(stderr) {
  const all = [...String(stderr).matchAll(/frame=\s*(\d+)/g)];
  return all.length ? Number(all[all.length - 1][1]) : null;
}

/** Stream banner → {video:{codec, profile, pixFmt, width, height, fps}|null, audio:{codec, rate, layout}|null} */
export function parseStreams(stderr) {
  const s = String(stderr);
  const v = /Stream #\d+:\d+[^:]*: Video: (\w+)(?: \(([^)]+)\))?[^,]*, (\w+)[^,]*?(?:\([^)]*\))?, (\d+)x(\d+)[^\n]*?, ([\d.]+) fps/.exec(s);
  const a = /Stream #\d+:\d+[^:]*: Audio: (\w+)[^,]*, (\d+) Hz, ([\w.()]+)/.exec(s);
  return {
    video: v ? { codec: v[1], profile: v[2] ?? null, pixFmt: v[3], width: Number(v[4]), height: Number(v[5]), fps: Number(v[6]) } : null,
    audio: a ? { codec: a[1], rate: Number(a[2]), layout: a[3] } : null,
  };
}

/** → {frames, streams} for an MP4. */
export async function probeVideo(ffmpeg, file) {
  const { stderr } = await runFfmpeg(ffmpeg, ['-hide_banner', '-nostats', '-i', file, '-map', '0:v:0', '-f', 'null', '-'], { what: 'verify (video frames)' });
  return { frames: parseFrameCount(stderr), streams: parseStreams(stderr) };
}

/** Decoded audio sample frames (per channel) of an MP4's first audio stream. */
export async function countAudioSamples(ffmpeg, file) {
  let bytes = 0;
  await runFfmpeg(
    ffmpeg,
    ['-hide_banner', '-v', 'error', '-i', file, '-map', '0:a:0', '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '2', '-'],
    { what: 'verify (audio samples)', onStdout: (chunk) => { bytes += chunk.length; } },
  );
  return bytes / 4;
}

/** Decode a 16-bit PCM stereo WAV buffer (as written by lib/score/wav.mjs) → {left, right, sampleRate}. */
export function decodeWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('decodeWav: not a RIFF/WAVE file');
  let pos = 12;
  let fmt = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === 'data') {
      if (!fmt || fmt.format !== 1 || fmt.channels !== 2 || fmt.bits !== 16) throw new Error('decodeWav: expected 16-bit PCM stereo');
      const n = Math.floor(size / 4);
      const left = new Float32Array(n);
      const right = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        left[i] = buf.readInt16LE(body + i * 4) / 32767;
        right[i] = buf.readInt16LE(body + i * 4 + 2) / 32767;
      }
      return { left, right, sampleRate: fmt.sampleRate };
    }
    pos = body + size + (size & 1);
  }
  throw new Error('decodeWav: no data chunk');
}
