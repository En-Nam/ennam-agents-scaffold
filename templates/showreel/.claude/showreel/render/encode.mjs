// Frames → H.264 (Task 8). JPEG frames are piped to ffmpeg image2pipe as they are captured
// (no frame files on disk). libx264 High, yuv420p, preset slow, crf per policy, +faststart.
// Colour (M2, CTO overrule): canvas JPEGs are JFIF = full-range BT.601 YCbCr. HD players decode with
// the BT.709 matrix, so the encode converts the matrix + range explicitly AND tags the stream to match.
// Tagging without converting (or converting without tagging) shifts hues; color.test.ts round-trips
// solid brand colours through this exact path and fails on ΔE76 > 3.
import { startPipe } from '../lib/render/ffmpeg.mjs';

/** Capture format (M0 ruling: JPEG q0.97 — PNG/raw readback measured ~2× slower). */
export const JPEG_QUALITY = 0.97;

/** JPEG (full-range BT.601) → limited-range BT.709, the matrix the tags below declare. */
export const COLOR_FILTER = 'scale=in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=tv';
export const COLOR_TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

export function encodeArgs({ out, fps, crf }) {
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-vf', COLOR_FILTER,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    ...COLOR_TAGS,
    '-r', String(fps), '-movflags', '+faststart',
    out,
  ];
}

/** → {write(jpegBuffer), end(), abort()} */
export function startEncoder({ ffmpeg, out, fps, crf }) {
  return startPipe(ffmpeg, encodeArgs({ out, fps, crf }), { what: 'encode' });
}
