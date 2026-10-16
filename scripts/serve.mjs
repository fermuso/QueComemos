import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.env.QC_STATIC_ROOT || fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.env.PORT || 8080);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.pdf': 'application/pdf' };
const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const target = path.resolve(root, '.' + pathname);
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part.startsWith('.') || part === 'node_modules')) {
      response.writeHead(403).end('Acceso denegado'); return;
    }
    const data = await readFile(target);
    const info = await stat(target);
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Content-Length': data.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Last-Modified': info.mtime.toUTCString() });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 400).end('Recurso no disponible');
  }
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`QuéComemos: http://127.0.0.1:${port}\n`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
