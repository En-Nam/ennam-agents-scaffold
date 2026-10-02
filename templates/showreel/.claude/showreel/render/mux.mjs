// Video + score WAV → final MP4 (Task 8). Video stream copied; audio AAC 48 kHz stereo 256k.
// NO -shortest (D12/D13): the WAV is exactly N×48000 samples and the video exactly N×fps frames,
// both from build/timeline.json; -shortest would let a stream boundary trim the other silently.
import { runFfmpeg } from '../lib/render/ffmpeg.mjs';

export function muxArgs({ video, wav, out }) {
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', video, '-i', wav,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart',
    out,
  ];
}

export async function mux({ ffmpeg, video, wav, out }) {
  await runFfmpeg(ffmpeg, muxArgs({ video, wav, out }), { what: 'mux' });
}
