// Numeric verification of build/score.wav: header, peak, DC, clipping, loudness arc, per-hit onset check.
//   node audio/analyze-score.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const TL = createRequire(import.meta.url)('../timeline.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const buf = fs.readFileSync(path.resolve(here, '../build/score.wav'));

// ---- header
const hdr = {
  riff: buf.toString('ascii', 0, 4), wave: buf.toString('ascii', 8, 12), fmt: buf.toString('ascii', 12, 16),
  pcm: buf.readUInt16LE(20), ch: buf.readUInt16LE(22), sr: buf.readUInt32LE(24), bits: buf.readUInt16LE(34),
  data: buf.toString('ascii', 36, 40), bytes: buf.readUInt32LE(40),
};
const SR = hdr.sr, N = hdr.bytes / 4;
const headerOk = hdr.riff === 'RIFF' && hdr.wave === 'WAVE' && hdr.fmt === 'fmt ' && hdr.pcm === 1 && hdr.ch === 2 && SR === 48000 && hdr.bits === 16
  && hdr.data === 'data' && buf.length === 44 + hdr.bytes && buf.readUInt32LE(4) === 36 + hdr.bytes;
console.log(`header ok=${headerOk}  ${hdr.ch}ch ${SR}Hz ${hdr.bits}-bit  frames/ch=${N} (expect 720000)  dur=${(N / SR).toFixed(4)}s`);

const L = new Float64Array(N), R = new Float64Array(N);
for (let i = 0; i < N; i++) { L[i] = buf.readInt16LE(44 + i * 4) / 32768; R[i] = buf.readInt16LE(46 + i * 4) / 32768; }
const M = new Float64Array(N);
let peak = 0, clip = 0, nan = 0, dcL = 0, dcR = 0;
for (let i = 0; i < N; i++) {
  if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) nan++;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  if (Math.abs(L[i]) >= 0.99997 || Math.abs(R[i]) >= 0.99997) clip++;
  dcL += L[i]; dcR += R[i]; M[i] = (L[i] + R[i]) / 2;
}
const db = x => 20 * Math.log10(Math.max(x, 1e-9));
console.log(`peak=${peak.toFixed(4)} (${db(peak).toFixed(2)} dBFS)  clipped samples=${clip}  NaN=${nan}  DC L=${(dcL / N).toExponential(2)} R=${(dcR / N).toExponential(2)}`);
console.log(`first sample=${L[0]} last sample=${L[N - 1]}`);

// ---- band filters (one-pole): low < ~250 Hz, high > ~3 kHz
const lpCoef = fc => 1 - Math.exp(-2 * Math.PI * fc / SR);
function lowpass(x, fc) { const a = lpCoef(fc), o = new Float64Array(x.length); let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); o[i] = y; } return o; }
const lo = lowpass(lowpass(M, 250), 250);
const hi = (() => { const l = lowpass(lowpass(M, 3000), 3000), o = new Float64Array(N); for (let i = 0; i < N; i++) o[i] = M[i] - l[i]; return o; })();
const rms = (x, a, b) => { a = Math.max(0, Math.round(a * SR)); b = Math.min(N, Math.round(b * SR)); let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };

// ---- 0.1 s table (compact) + ASCII arc
console.log('\nLoudness arc (RMS dBFS per 0.25 s; L=low band, H=high band):');
const rows = [];
for (let t = 0; t < 15; t += 0.25) {
  const r = db(rms(M, t, t + 0.25)), l = db(rms(lo, t, t + 0.25)), h = db(rms(hi, t, t + 0.25));
  rows.push({ t, r, l, h });
  const bar = '#'.repeat(Math.max(0, Math.round((r + 60) * 1.0)));
  console.log(`${t.toFixed(2).padStart(5)}s ${r.toFixed(1).padStart(6)} L${l.toFixed(0).padStart(4)} H${h.toFixed(0).padStart(4)} |${bar}`);
}
const avg = (a, b) => db(rms(M, a, b));
console.log(`\nSection RMS (dBFS): 0-2.3 ${avg(0, 2.3).toFixed(1)} | 2.3-5.6 ${avg(2.3, 5.6).toFixed(1)} | 5.6-8.9 ${avg(5.6, 8.9).toFixed(1)} | 8.9-12.1 ${avg(8.9, 12.1).toFixed(1)} | 12.2-15 ${avg(12.2, 15).toFixed(1)}  overall ${avg(0, 15).toFixed(1)}`);

// ---- per-hit onset check: energy 40 ms after vs 80 ms before; best of full / low / high bands
console.log('\nHit onset check (dB jump of 40ms-after vs 80ms-before RMS):');
let fails = 0;
for (const h of TL.hits) {
  const j = (x) => db(rms(x, h.t, h.t + 0.04)) - db(rms(x, h.t - 0.08, h.t));
  const jf = j(M), jl = j(lo), jh = j(hi), best = Math.max(jf, jl, jh);
  const ok = best >= 3;
  if (!ok) fails++;
  console.log(`${h.t.toFixed(2).padStart(6)}s ${h.kind.padEnd(6)} amp=${h.amp.toFixed(2)}  full ${jf.toFixed(1).padStart(6)}  low ${jl.toFixed(1).padStart(6)}  high ${jh.toFixed(1).padStart(6)}  post-RMS ${db(rms(M, h.t, h.t + 0.1)).toFixed(1).padStart(6)}  ${ok ? 'OK' : 'WEAK'}`);
}
console.log(`\nhit onsets failing +3 dB: ${fails}`);

// keystrokes onset sanity (just aggregate): high-band energy in the typing window vs the 0.1 s before it
const ty = TL.typing;
console.log(`typing window 0.45-1.95s high-band RMS ${db(rms(hi, ty.start, ty.start + ty.interval * ty.text.length)).toFixed(1)} dB vs bed-only 0-0.4s ${db(rms(hi, 0, 0.4)).toFixed(1)} dB`);
const pass = headerOk && N === 720000 && nan === 0 && clip === 0 && peak <= 0.9 && peak >= 0.88 && Math.abs(dcL / N) < 1e-3;
console.log(`\nSTRUCTURAL CHECKS: ${pass ? 'PASS' : 'FAIL'}`);
