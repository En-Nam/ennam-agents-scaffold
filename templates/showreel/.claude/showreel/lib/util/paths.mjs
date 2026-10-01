// Host-repo layout (C2). Every path is relative to hostRoot (POSIX separators), except
// `tool`, which is toolDir(hostRoot) and may be absolute (SHOWREEL_TOOL_DIR).
import { toolDir } from './tooldeps.mjs';

export function paths(hostRoot) {
  return {
    toolkit: '.claude/showreel',
    tool: toolDir(hostRoot),
    work: 'showreel',
    build: 'showreel/build',
    facts: 'showreel/facts.json',
    factsMeta: 'showreel/build/facts.meta.json',
    storyboard: 'showreel/storyboard.json',
    timeline: 'showreel/build/timeline.json',
    resolved: 'showreel/build/resolved.json',
    scoreWav: 'showreel/build/score.wav',
    sheet: 'showreel/build/sheet.png',
    manifest: 'showreel/build/manifest.json',
    out: (slug, N) => `showreel/${slug}-${N}s.mp4`,
  };
}
