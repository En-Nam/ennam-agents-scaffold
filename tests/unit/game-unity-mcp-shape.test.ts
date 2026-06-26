import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Lock the shape of templates/game-unity/.mcp.json.partial.hbs against the
// CoplayDev v9.7.3 README invocation. If CoplayDev changes the uvx command or
// the env requirement, this snapshot fails — surfacing it for the maintainer
// to re-run scripts/verify-game-unity-bake.mjs before publish.
//
// Per Judge objection #3 + spec §9: this is a static shape check; the live
// handshake against a real Unity Editor is the maintainer's pre-publish gate.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PARTIAL_PATH = path.resolve(HERE, '..', '..', 'templates', 'game-unity', '.mcp.json.partial.hbs');

describe('game-unity .mcp.json.partial.hbs shape (CoplayDev v9.7.3 README pin)', () => {
  it('parses as valid JSON', async () => {
    const txt = await readFile(PARTIAL_PATH, 'utf8');
    // The partial has no Handlebars expressions today (pure JSON). Parse straight.
    expect(() => JSON.parse(txt)).not.toThrow();
  });

  it('declares a single "unity" server using uvx + coplay-mcp-server + stdio transport', async () => {
    const obj = JSON.parse(await readFile(PARTIAL_PATH, 'utf8'));
    expect(Object.keys(obj.mcpServers)).toEqual(['unity']);

    const u = obj.mcpServers.unity;
    expect(u.command).toBe('uvx');
    // Args MUST contain --python >=3.11, --from coplay-mcp-server, mcp-for-unity, --transport stdio.
    expect(u.args).toContain('--python');
    expect(u.args).toContain('>=3.11');
    expect(u.args).toContain('--from');
    expect(u.args).toContain('coplay-mcp-server');
    expect(u.args).toContain('mcp-for-unity');
    expect(u.args).toContain('--transport');
    expect(u.args).toContain('stdio');
  });

  it('declares MCP_TOOL_TIMEOUT env (CoplayDev recommends 720000 for long PlayMode tests)', async () => {
    const obj = JSON.parse(await readFile(PARTIAL_PATH, 'utf8'));
    const u = obj.mcpServers.unity;
    expect(u.env).toBeDefined();
    expect(u.env.MCP_TOOL_TIMEOUT).toBeDefined();
    // The exact value is a tuning knob; assert it parses as a positive int >= 60_000ms (1min).
    expect(Number.parseInt(u.env.MCP_TOOL_TIMEOUT, 10)).toBeGreaterThanOrEqual(60_000);
  });
});
