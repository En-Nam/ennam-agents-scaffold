const BEGIN_RE = /<!--\s*ennam-agents-scaffold:begin v[^\s>]*\s*-->/;
const BEGIN_RE_GLOBAL = /<!--\s*ennam-agents-scaffold:begin v[^\s>]*\s*-->/g;
const END_MARKER = '<!-- ennam-agents-scaffold:end -->';

/**
 * Insert or replace the scaffold-managed block in `existing`.
 *
 * - If existing has no begin marker → append block at end (with a blank line separator).
 * - If existing has a begin marker → find matching end marker, replace span.
 * - If a begin marker exists without an end marker → throw (malformed).
 * - If multiple begin markers exist → throw (refuses to silently leave stale blocks).
 *
 * Trailing newline normalization: result always ends with exactly one `\n`.
 */
export function mergeMarker(existing: string, block: string): string {
  if (existing.length === 0) {
    return block.endsWith('\n') ? block : block + '\n';
  }

  // Fail loud on duplicate scaffold blocks. Otherwise we would silently update
  // only the first block and leave the second (stale) block in place (Rule 12).
  const allBegins = existing.match(BEGIN_RE_GLOBAL);
  if (allBegins && allBegins.length > 1) {
    throw new Error(
      'Multiple ennam-agents-scaffold begin markers found; refusing to merge. ' +
      'Please consolidate to a single managed block before re-running the scaffold.',
    );
  }

  const beginMatch = existing.match(BEGIN_RE);
  if (!beginMatch) {
    // No marker — append
    const sep = existing.endsWith('\n') ? '\n' : '\n\n';
    const trailing = block.endsWith('\n') ? '' : '\n';
    return existing + sep + block + trailing;
  }

  // Marker present — find matching end
  const beginStart = beginMatch.index!;
  const afterBegin = beginStart + beginMatch[0].length;
  const endIndex = existing.indexOf(END_MARKER, afterBegin);
  if (endIndex === -1) {
    throw new Error('Marker block malformed: begin marker found but end marker not found');
  }
  const afterEnd = endIndex + END_MARKER.length;

  const before = existing.slice(0, beginStart);
  const after = existing.slice(afterEnd);
  return before + block + after;
}
