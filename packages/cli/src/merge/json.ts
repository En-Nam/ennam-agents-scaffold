type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

/**
 * Deep merge two JSON-compatible objects with **user-wins** policy.
 *
 * Rules per key (when both `user` and `scaffold` have the key):
 *   - User value `null` → keep user's null (explicit user choice)
 *   - Both objects (not arrays) → recurse
 *   - Otherwise → keep user value (arrays, scalars)
 *
 * Keys present only in `scaffold` are added.
 * Inputs are NOT mutated; the result is a fresh object.
 *
 * Note: This is NOT RFC 7396 — RFC 7396 has scaffold-wins semantics. We use user-wins
 * because the typical scaffold scenario is "ship sensible defaults; respect any user customisation."
 */
export function mergeJson(user: JsonObject, scaffold: JsonObject): JsonObject {
  const out: JsonObject = { ...user };
  for (const key of Object.keys(scaffold)) {
    if (!(key in user)) {
      out[key] = deepClone(scaffold[key]!);
      continue;
    }
    const u = user[key];
    const s = scaffold[key];
    if (isPlainObject(u) && isPlainObject(s)) {
      out[key] = mergeJson(u, s);
    } else {
      out[key] = deepClone(u as JsonValue);  // user wins (including null)
    }
  }
  return out;
}

function isPlainObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepClone<T extends JsonValue>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
