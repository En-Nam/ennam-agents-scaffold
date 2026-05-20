import { describe, it, expect } from 'vitest';
import { renderString, buildContext } from '../../packages/cli/src/render.js';

describe('render', () => {
  it('substitutes scaffoldVersion and profile', () => {
    const ctx = buildContext({ profile: 'next', cwd: '/tmp/my-app', version: '0.1.0' });
    const out = renderString('v={{scaffoldVersion}} p={{profile}}', ctx);
    expect(out).toBe('v=0.1.0 p=next');
  });

  it('exposes cwd and projectName', () => {
    const ctx = buildContext({ profile: 'next', cwd: '/tmp/my-cool-app', version: '0.1.0' });
    expect(ctx.cwd).toBe('/tmp/my-cool-app');
    expect(ctx.projectName).toBe('my-cool-app');
  });

  it('passes non-template content through verbatim', () => {
    const ctx = buildContext({ profile: 'next', cwd: '/tmp/x', version: '0.1.0' });
    expect(renderString('plain text', ctx)).toBe('plain text');
  });

  it('builds context with current year and ISO date', () => {
    const ctx = buildContext({ profile: 'next', cwd: '/tmp/x', version: '0.1.0' });
    expect(ctx.year).toBe(new Date().getUTCFullYear());
    expect(ctx.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
