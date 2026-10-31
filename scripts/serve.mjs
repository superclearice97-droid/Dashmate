// Tiny static server for trying the app in a desktop browser:
//   node scripts/serve.mjs   ->  http://localhost:8080
// (Camera and GPS need localhost or https, which this satisfies.)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const www = fileURLToPath(new URL('../www/', import.meta.url));
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream',
};
const port = Number(process.env.PORT || 8080);

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(www, path.endsWith('/') ? path + 'index.html' : path);
  if (!file.startsWith(www)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`DashMate on http://localhost:${port}`));
