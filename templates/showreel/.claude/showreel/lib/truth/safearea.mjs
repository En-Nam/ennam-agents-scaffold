// Safe-area judge (C16). Pure and dependency-free: takes manifest entries {text, source, bbox} from
// window.SHOWREEL.manifest() (bbox = device-space bounds of the text drawn in the LATEST frame, or null
// when the entry was not drawn in it) and returns the entries whose bbox leaves the frame minus a safe
// margin. Text that touches the frame edge (or sits where players overscan) is a clipped beat, never
// acceptable silently: callers fail on a non-empty result.
// Scope: solo frames. During a transition overlap the engine records no boxes (every bbox is null), because
// both beats are drawn on scratch layers the transition moves / scales / clips (engine/core.mjs); judging an
// overlap frame here would judge pre-blit rectangles. Glow / bloom sprites are not text and carry no box.

/** offFrame(entries, {W, H, margin}) → [{text, source, bbox}] — entries with a bbox outside [margin, W−margin]×[margin, H−margin]. */
export function offFrame(entries, { W = 1920, H = 1080, margin = 48 } = {}) {
  return entries.filter(({ bbox }) => {
    if (!bbox) return false;
    return bbox.x < margin || bbox.y < margin || bbox.x + bbox.w > W - margin || bbox.y + bbox.h > H - margin;
  });
}
