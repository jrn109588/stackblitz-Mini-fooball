/* Servidor estático mínimo (sem dependências) para a pasta dist/.
   Usado pelo container: `npm start` -> porta PORT (padrão 8080). */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};
const GZIP = new Set(['.html', '.js', '.css', '.json', '.svg', '.map']);
const cache = new Map(); // caminho -> { raw, gz }

async function load(file) {
  if (!cache.has(file)) {
    const raw = await readFile(file);
    cache.set(file, { raw, gz: GZIP.has(extname(file)) ? gzipSync(raw) : null });
  }
  return cache.get(file);
}

createServer(async (req, res) => {
  const send = (code, body, headers = {}) => {
    res.writeHead(code, { 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD')
    return send(405, 'Method Not Allowed');

  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return send(400, 'Bad Request');
  }
  if (path === '/healthz') return send(200, 'ok', { 'Content-Type': 'text/plain' });

  let file = resolve(ROOT, '.' + path);
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return send(403, 'Forbidden');
  if (path.endsWith('/')) file = resolve(file, 'index.html');

  let entry;
  try {
    entry = await load(file);
  } catch {
    // Arquivo com extensão que não existe = 404; rota sem extensão = SPA (index.html)
    if (extname(path)) return send(404, 'Not Found');
    file = resolve(ROOT, 'index.html');
    try {
      entry = await load(file);
    } catch {
      return send(500, 'Build não encontrado: rode "npm run build".');
    }
  }

  const ext = extname(file);
  const headers = {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': path.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
    Vary: 'Accept-Encoding',
  };
  if (entry.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    headers['Content-Encoding'] = 'gzip';
    return send(200, entry.gz, headers);
  }
  send(200, entry.raw, headers);
}).listen(PORT, '0.0.0.0', () => console.log(`Mini Soccer em http://0.0.0.0:${PORT}`));
