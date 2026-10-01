// v1.14 — mergeJson is user-wins on arrays: when the user already defines
// hooks.<Event>, the scaffold's entry for that event is dropped without a trace.
// This names the dropped commands so the CLI can tell the user (Rule 12).
// Pure: no I/O, safe on arbitrary JSON.

export interface BlockedHook {
  event: string;
  commands: string[];   // scaffold commands that did not land
  replaces: string[];   // user commands that are older scaffold forms of the same hook script
}

type Json = Record<string, unknown>;

const HOOK_SCRIPT = /\.claude\/hooks\/([\w.-]+?)\.(?:sh|ps1)\b/;

function hookCommands(entries: unknown): string[] {
  if (!Array.isArray(entries)) return [];
  const out: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Json;
    if (typeof e.command === 'string') out.push(e.command);  // legacy bare {command} shape
    if (Array.isArray(e.hooks)) {
      for (const h of e.hooks) {
        if (typeof h === 'object' && h !== null && typeof (h as Json).command === 'string') {
          out.push((h as Json).command as string);
        }
      }
    }
  }
  return out;
}

/** Script stem a command runs, e.g. `bash .claude/hooks/session-start.sh` → `session-start`. */
function scriptOf(command: string): string | undefined {
  return HOOK_SCRIPT.exec(command)?.[1];
}

export function findBlockedHooks(userBefore: Json, scaffold: Json): BlockedHook[] {
  const scaffoldHooks = scaffold.hooks as Json | undefined ?? {};
  const hasUserHooks = 'hooks' in userBefore;
  const raw = userBefore.hooks;
  const userIsObject = typeof raw === 'object' && raw !== null && !Array.isArray(raw);
  const userHooks = userIsObject ? (raw as Json) : {};

  const blocked: BlockedHook[] = [];
  for (const [event, entries] of Object.entries(scaffoldHooks)) {
    const ours = hookCommands(entries);
    // A non-object `hooks` survives user-wins merging wholesale → every scaffold hook is dropped.
    if (hasUserHooks && !userIsObject) {
      blocked.push({ event, commands: ours, replaces: [] });
      continue;
    }
    if (!(event in userHooks)) continue;  // merge adds the whole event — nothing dropped
    const have = hookCommands(userHooks[event]);
    const missing = ours.filter(c => !have.includes(c));
    if (!missing.length) continue;
    const stems = new Set(missing.map(scriptOf).filter(Boolean));
    const replaces = have.filter(c => stems.has(scriptOf(c)));
    blocked.push({ event, commands: missing, replaces });
  }
  return blocked;
}
