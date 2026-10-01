// Timeline compiler (C8 / D10). storyboard + resolved + archetypes → build/timeline.json,
// the ONLY time source for picture and audio. Pure and dependency-free: the same inputs
// always produce the same timeline (no clock, no randomness, inputs never mutated).
import { ShowreelError } from '../util/out.mjs';

// The compiler owns every time constant. Engine, archetypes and score read them from the
// timeline (test-enforced: no literal seconds outside lib/compile).
const MUSIC = { bpm: 120, key: 'F#m' };
const GRID = 60 / MUSIC.bpm / 4; // one 1/16 note (0.125 s at 120 bpm)
const ZOOM_OVERLAP = 3 * GRID; // 0.375 s
const MIN_BEAT_S = 1.0;
const TYPING_START = 0.45; // after the beat window opens
const TYPING_INTERVAL = 0.052; // max seconds per character
const TYPING_SETTLE = 0.2; // pause between the last character and ENTER
const PEAK_MARK = 0.6; // body beats whose core midpoint is at/after 60% of the film are "peak"
const FPS = [30, 60];
const MIN_CHAR_INTERVAL = 1 / Math.max(...FPS); // at most one typed char per --final frame
const EPS = 1e-9;

/** Nearest multiple of q; exact ties round DOWN (never drifts later). */
function snap(x, q) {
  return Math.ceil(x / q - 0.5 - EPS) * q;
}

/** Nearest frame time; exact ties round down. Expressed as k/fps so the result is frame-exact. */
function snapFrame(x, fps) {
  return Math.ceil(x * fps - 0.5 - EPS) / fps;
}

function inputError(message, fix) {
  return new ShowreelError('E_TIMELINE_INPUT', message, fix);
}

/**
 * Core (pre-overlap) boundaries on the grid, with every beat at least max(1.0 s, minWeight-scaled).
 * Returns cuts[0..n] with cuts[0] = 0 and cuts[n] = durationS.
 */
function coreBoundaries(beats, specs, durationS) {
  const total = beats.reduce((s, b) => s + b.weight, 0);
  const n = beats.length;
  const cuts = [0];
  let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    acc += beats[i].weight;
    cuts.push(snap((acc / total) * durationS, GRID));
  }
  cuts.push(durationS);

  const minLen = specs.map((s) => Math.max(MIN_BEAT_S, (s.minWeight / total) * durationS));
  const len = (i) => cuts[i + 1] - cuts[i];
  const canGive = (j) => j >= 0 && j < n && len(j) - GRID >= minLen[j] - EPS;

  for (let i = 0; i < n; i++) {
    while (len(i) < minLen[i] - EPS) {
      // Steal one grid step from the LONGEST neighbour that can spare it (ties → earlier beat).
      const options = [i - 1, i + 1].filter(canGive).sort((a, b) => len(b) - len(a) || a - b);
      if (options.length === 0) {
        throw new ShowreelError(
          'E_TIMELINE_BUDGET',
          `Beat ${beats[i].id} (${beats[i].archetype}) gets ${len(i).toFixed(3)} s but needs at least ${minLen[i].toFixed(3)} s, and no neighbouring beat can give time in a ${durationS} s film.`,
          `Raise the weight of ${beats[i].id}, lower the weights of its neighbours, or use fewer beats.`,
        );
      }
      const j = options[0];
      if (j < i) cuts[i] -= GRID;
      else cuts[i + 1] += GRID;
    }
  }
  return cuts;
}

/**
 * @param {object} storyboard  C4 storyboard (already schema-validated)
 * @param {object} resolved    C7 resolved.json (only typing-slot text is read)
 * @param {object} archetypes  C5 archetypes.json
 * @param {{fps: number}} opts
 * @returns {object} C8 timeline
 */
export function compileTimeline(storyboard, resolved, archetypes, { fps } = {}) {
  if (!FPS.includes(fps)) {
    throw inputError(`fps must be one of ${FPS.join(', ')} (got ${fps}).`, 'Use --final (60 fps) or --draft (30 fps).');
  }
  const durationS = storyboard.durationS;
  const beats = storyboard.beats;
  if (!Array.isArray(beats) || beats.length === 0) {
    throw inputError('storyboard.beats is empty.', 'Add beats to showreel/storyboard.json.');
  }
  const specs = beats.map((b) => {
    const spec = archetypes.archetypes[b.archetype];
    if (!spec) {
      throw inputError(`Beat ${b.id} uses unknown archetype "${b.archetype}".`, `Use one of: ${Object.keys(archetypes.archetypes).join(', ')}.`);
    }
    return spec;
  });

  const cuts = coreBoundaries(beats, specs, durationS);
  const n = beats.length;

  // Overlaps straddle each core boundary B. Centred would be B ± overlap/2 (off grid), so each
  // edge is snapped with the same ties-down rule: outgoing t1 = B + GRID, incoming t0 = B − 2·GRID.
  const overlapAfter = beats.map((b, i) => (i < n - 1 && b.transitionOut === 'zoom-through' ? ZOOM_OVERLAP : 0));
  const outBeats = beats.map((b, i) => {
    const overlapIn = i > 0 ? overlapAfter[i - 1] : 0;
    const overlapOut = overlapAfter[i];
    const t0 = Math.max(0, overlapIn ? cuts[i] - (ZOOM_OVERLAP - snap(ZOOM_OVERLAP / 2, GRID)) : cuts[i]);
    const t1 = Math.min(durationS, overlapOut ? cuts[i + 1] + snap(ZOOM_OVERLAP / 2, GRID) : cuts[i + 1]);
    return { id: b.id, archetype: b.archetype, variant: b.variant, t0, t1, overlapIn, overlapOut, transitionOut: b.transitionOut };
  });

  // Hits: archetype default cues merged with storyboard cues (storyboard wins by name).
  const frames = durationS * fps;
  const lastFrameT = (frames - 1) / fps;
  const hits = [];
  beats.forEach((b, i) => {
    const merged = new Map();
    for (const c of specs[i].defaultCues || []) merged.set(c.name, c);
    for (const c of b.cues || []) merged.set(c.name, c);
    const { t0, t1 } = outBeats[i];
    for (const c of merged.values()) {
      const t = Math.min(lastFrameT, snapFrame(snap(t0 + c.at * (t1 - t0), GRID), fps));
      hits.push({ t, kind: c.kind, amp: c.amp, beatId: b.id, cue: c.name, order: i });
    }
  });
  hits.sort((a, b) => a.t - b.t || a.order - b.order || (a.cue < b.cue ? -1 : a.cue > b.cue ? 1 : 0));
  for (const h of hits) delete h.order;

  // Typing: archetypes with a `typing` slot type that slot's first resolved item, ENTER = `enter` hit.
  const typing = [];
  beats.forEach((b, i) => {
    const slot = specs[i].typing;
    if (!slot) return;
    const text = resolved?.beats?.[b.id]?.slots?.[slot]?.items?.[0]?.text;
    if (typeof text !== 'string') {
      throw inputError(`Beat ${b.id} (${b.archetype}) types its "${slot}" slot but resolved.json has no text for it.`, 'Re-run check so resolved.json is rebuilt from the storyboard.');
    }
    const enter = hits.find((h) => h.beatId === b.id && h.cue === 'enter');
    if (!enter) {
      throw inputError(`Beat ${b.id} (${b.archetype}) types its "${slot}" slot but has no "enter" cue.`, `Add an "enter" cue to beat ${b.id}.`);
    }
    // Characters are Unicode code points, not UTF-16 units: an emoji is ONE keystroke. The
    // engine typewriter must advance by code point ([...text]) to finish before ENTER.
    const chars = [...text].length;
    if (chars === 0) {
      throw inputError(`Beat ${b.id} (${b.archetype}): resolved text for slot "${slot}" is empty.`, `Give the "${slot}" slot of ${b.id} a non-empty command, then re-run check.`);
    }
    const t0 = outBeats[i].t0 + TYPING_START;
    const room = enter.t - t0 - TYPING_SETTLE;
    if (room <= 0) {
      throw new ShowreelError(
        'E_TIMELINE_TYPING',
        `Beat ${b.id}: ENTER lands at ${enter.t.toFixed(3)} s, before typing of ${chars} chars can start at ${t0.toFixed(3)} s.`,
        `Move the "enter" cue of ${b.id} later (raise its "at") or raise the beat weight.`,
      );
    }
    const interval = Math.min(TYPING_INTERVAL, room / chars);
    // Faster than one character per --final frame means several chars pop in per frame: the
    // command appears rather than being typed. A fixed threshold (not the render fps) keeps the
    // rule the same for --draft and --final; only cases within half a frame of it can differ.
    if (interval < MIN_CHAR_INTERVAL - EPS) {
      throw new ShowreelError(
        'E_TIMELINE_TYPING',
        `Beat ${b.id}: ${chars} chars must be typed in ${room.toFixed(3)} s (${interval.toFixed(4)} s each), faster than one char per frame at ${Math.max(...FPS)} fps.`,
        `Shorten the command, move the "enter" cue of ${b.id} later (raise its "at"), or raise the beat weight.`,
      );
    }
    typing.push({ beatId: b.id, t0, interval, chars, enterAt: enter.t });
  });

  // Sections on the contiguous core windows: open → intro, close → outro, body → build/peak.
  const sections = [];
  beats.forEach((b, i) => {
    const role = specs[i].role;
    const mid = (cuts[i] + cuts[i + 1]) / 2;
    const name = role === 'open' ? 'intro' : role === 'close' ? 'outro' : mid >= PEAK_MARK * durationS ? 'peak' : 'build';
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.t1 = cuts[i + 1];
    else sections.push({ name, t0: cuts[i], t1: cuts[i + 1] });
  });

  return {
    version: 1,
    fps,
    durationS,
    frames,
    seed: storyboard.seed,
    palette: storyboard.palette ?? 'violet',
    beats: outBeats,
    hits,
    typing,
    sections,
    music: { ...MUSIC },
  };
}
