import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

// No Vite preview rewriting or SPA fallback: missing files are real 404s.
export async function startStaticTestServer(directory, mounts) {
  const root = resolve(directory);
  const prefixes = [...mounts].sort((a, b) => b.length - a.length);
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
  };
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const prefix = prefixes.find((p) => pathname.startsWith(p));
      if (!prefix) {
        res.writeHead(404).end();
        return;
      }
      const relative = pathname.slice(prefix.length) || 'index.html';
      const file = resolve(root, relative);
      if (!file.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      const contents = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
      res.end(contents);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((accept, reject) => server.close((error) => (error ? reject(error) : accept()))),
  };
}
