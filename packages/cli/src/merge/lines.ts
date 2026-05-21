/**
 * Append lines from `incoming` to `user` content, skipping any line whose trimmed
 * value already appears in `user`. Preserves order: user's lines first, then
 * incoming lines that are new.
 *
 * Used for `.gitignore` and similar line-oriented append-only files.
 */
export function mergeLines(user: string, incoming: string): string {
  const userLines = user.split('\n');
  // Drop the artifact empty string at the end if user ends with \n.
  if (userLines.length > 0 && userLines[userLines.length - 1] === '') {
    userLines.pop();
  }
  const userSet = new Set(userLines.map(l => l.trim()));

  const incomingLines = incoming.split('\n');
  if (incomingLines.length > 0 && incomingLines[incomingLines.length - 1] === '') {
    incomingLines.pop();
  }

  const toAppend: string[] = [];
  for (const line of incomingLines) {
    if (userSet.has(line.trim())) continue;
    toAppend.push(line);
    userSet.add(line.trim());
  }

  const all = [...userLines, ...toAppend];
  return all.join('\n') + '\n';
}
