// Local static server for the engine page (C12). node:http only — no deps. Static, GET/HEAD only,
// path-traversal safe, bound to 127.0.0.1 on an ephemeral port.
//   /engine/*            ← <toolkitDir>/engine
//   /archetypes/*        ← <toolkitDir>/archetypes
//   /fonts/<pkg>/*       ← <toolDir>/node_modules/@fontsource-variable/<pkg>
//   /build/*             ← <buildDir>
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

export const MIME = Object.freeze({
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.html': 'text/html; charset=utf-8',
});

function mountFor(pathname, { toolkitDir, toolDir, buildDir }) {
  const segs = pathname.split('/'); // ['', mount, ...rest]
  const head = segs[1];
  if (head === 'engine' || head === 'archetypes') return { root: join(toolkitDir, head), rest: segs.slice(2) };
  if (head === 'build') return { root: buildDir, rest: segs.slice(2) };
  if (head === 'fonts' && /^[a-z0-9-]+$/.test(segs[2] ?? '')) {
    return { root: join(toolDir, 'node_modules', '@fontsource-variable', segs[2]), rest: segs.slice(3) };
  }
  return null;
}

/** Resolve a request path to a file inside a mount root, or null (→ 404/403). */
export function resolveRequest(rawUrl, dirs) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://127.0.0.1').pathname);
  } catch {
    return { status: 400 };
  }
  // reject anything that could step outside a mount even before normalisation
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some((s) => s === '..' || s === '.')) return { status: 403 };
  const m = mountFor(pathname, dirs);
  if (!m || !m.rest.length || m.rest.some((s) => s === '')) return { status: 404 };
  const root = resolve(m.root);
  const file = resolve(root, ...m.rest);
  if (!file.startsWith(root + sep)) return { status: 403 };
  const type = MIME[extname(file).toLowerCase()];
  if (!type) return { status: 404 };
  return { status: 200, file, type };
}

/** startServer({toolkitDir, toolDir, buildDir}) → { url: 'http://127.0.0.1:<port>', close() } */
export async function startServer({ toolkitDir, toolDir, buildDir }) {
  for (const [k, v] of Object.entries({ toolkitDir, toolDir, buildDir })) {
    if (typeof v !== 'string' || !v) throw new Error(`startServer: ${k} is required`);
  }
  const dirs = { toolkitDir, toolDir, buildDir };
  const server = createServer(async (req, res) => {
    const end = (status, body = '') => { res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end(body); };
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('allow', 'GET, HEAD'); return end(405, 'method not allowed'); }
    const r = resolveRequest(req.url ?? '/', dirs);
    if (r.status !== 200) return end(r.status, r.status === 403 ? 'forbidden' : 'not found');
    try {
      const st = await stat(r.file);
      if (!st.isFile()) return end(404, 'not found');
      const body = await readFile(r.file);
      res.writeHead(200, { 'content-type': r.type, 'content-length': body.length, 'cache-control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      end(404, 'not found');
    }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((ok) => { server.closeAllConnections?.(); server.close(() => ok()); }),
  };
}
