import { describe, it, expect } from 'vitest';
import { mergeJson } from '../../packages/cli/src/merge/json.js';

describe('mergeJson — user wins on conflicts', () => {
  it('adds scaffold keys when user does not have them', () => {
    const user = { mcpServers: { existing: { command: 'a' } } };
    const scaffold = { mcpServers: { existing: { command: 'a' }, new: { command: 'b' } } };
    expect(mergeJson(user, scaffold)).toEqual({
      mcpServers: { existing: { command: 'a' }, new: { command: 'b' } },
    });
  });

  it('preserves user scalar value over scaffold scalar', () => {
    const user = { outputStyle: 'custom' };
    const scaffold = { outputStyle: 'default' };
    expect(mergeJson(user, scaffold)).toEqual({ outputStyle: 'custom' });
  });

  it('merges nested objects recursively', () => {
    const user = { mcpServers: { serena: { command: 'mybin' } } };
    const scaffold = { mcpServers: { serena: { command: 'uvx', args: ['--x'] } } };
    expect(mergeJson(user, scaffold)).toEqual({
      mcpServers: { serena: { command: 'mybin', args: ['--x'] } },
    });
  });

  it('user array beats scaffold array (no append/dedup)', () => {
    const user = { allowList: ['user-cmd'] };
    const scaffold = { allowList: ['scaffold-cmd-1', 'scaffold-cmd-2'] };
    expect(mergeJson(user, scaffold)).toEqual({ allowList: ['user-cmd'] });
  });

  it('scaffold array used when user has no array', () => {
    const user = {};
    const scaffold = { allowList: ['scaffold-cmd'] };
    expect(mergeJson(user, scaffold)).toEqual({ allowList: ['scaffold-cmd'] });
  });

  it('deep merge does not mutate inputs', () => {
    const user = { a: { b: 1 } };
    const scaffold = { a: { c: 2 } };
    const userCopy = JSON.parse(JSON.stringify(user));
    const scaffoldCopy = JSON.parse(JSON.stringify(scaffold));
    mergeJson(user, scaffold);
    expect(user).toEqual(userCopy);
    expect(scaffold).toEqual(scaffoldCopy);
  });

  it('idempotent on already-merged value', () => {
    const user = { mcpServers: { a: { x: 1 }, b: { y: 2 } } };
    const scaffold = { mcpServers: { b: { y: 2 } } };
    const once = mergeJson(user, scaffold);
    const twice = mergeJson(once, scaffold);
    expect(twice).toEqual(once);
  });

  it('null in user wins (explicit user choice)', () => {
    const user = { feature: null };
    const scaffold = { feature: { enabled: true } };
    expect(mergeJson(user, scaffold)).toEqual({ feature: null });
  });
});
