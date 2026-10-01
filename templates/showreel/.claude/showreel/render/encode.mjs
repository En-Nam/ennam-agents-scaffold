// Frames → H.264 (Task 8). JPEG frames are piped to ffmpeg image2pipe as they are captured
// (no frame files on disk). libx264 High, yuv420p, preset slow, crf per policy, +faststart.
import { startPipe } from '../lib/render/ffmpeg.mjs';

/** Capture format (M0 ruling: JPEG q0.97 — PNG/raw readback measured ~2× slower). */
export const JPEG_QUALITY = 0.97;

export function encodeArgs({ out, fps, crf }) {
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-r', String(fps), '-movflags', '+faststart',
    out,
  ];
}

/** → {write(jpegBuffer), end(), abort()} */
export function startEncoder({ ffmpeg, out, fps, crf }) {
  return startPipe(ffmpeg, encodeArgs({ out, fps, crf }), { what: 'encode' });
}
