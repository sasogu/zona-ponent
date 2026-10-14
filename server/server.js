// Relé de diapositivas y almacenamiento cifrado de anotaciones de la Zona docente.
'use strict';
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT || '8110', 10);
const HOST = process.env.HOST || '127.0.0.1';
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:8110,http://127.0.0.1:8110').split(',').map(s => s.trim()).filter(Boolean);
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || path.join(__dirname, '..', 'dist'));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SYNC_AUTH_SECRET_HEX = process.env.SYNC_AUTH_SECRET || '';
if (!/^[a-f0-9]{64}$/.test(SYNC_AUTH_SECRET_HEX)) throw new Error('SYNC_AUTH_SECRET no está configurado correctamente');
const SYNC_AUTH_SECRET = Buffer.from(SYNC_AUTH_SECRET_HEX, 'hex');
const TOPIC_RE = /^[a-z0-9-]{16,64}$/;
const MAX_MSG = 512;
const MAX_BODY = 2 * 1024 * 1024;
const MAX_TOPICS = 200;
const MAX_CLIENTS_PER_TOPIC = 20;
const STATE_TTL = 12 * 3600 * 1000;
const RATE_PER_SEC = 10;
const KEEP_BACKUPS = 20;

const topics = new Map(); // canal → { clients: Set, last: string|null, at: number }
const writes = new Map();

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function fileFor(topic) { return path.join(DATA_DIR, topic + '.json'); }
async function readState(topic) {
  try { return JSON.parse(await fs.readFile(fileFor(topic), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return { revision: 0, blob: null }; throw e; }
}

function withTopicLock(topic, fn) {
  const prior = writes.get(topic) || Promise.resolve();
  const task = prior.catch(() => {}).then(fn);
  writes.set(topic, task);
  task.finally(() => { if (writes.get(topic) === task) writes.delete(topic); }).catch(() => {});
  return task;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch (_) { throw Object.assign(new Error('invalid json'), { status: 400 }); }
}

function validBlob(blob) {
  return !!blob && blob.v === 1 && typeof blob.iv === 'string' && /^[A-Za-z0-9_-]{16}$/.test(blob.iv) &&
    typeof blob.data === 'string' && /^[A-Za-z0-9_-]{16,1900000}$/.test(blob.data);
}

async function writeState(topic, state) {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  const current = await readState(topic);
  if (current.revision) {
    const backupName = `${topic}.${String(current.revision).padStart(8, '0')}.json`;
    await fs.writeFile(path.join(DATA_DIR, backupName), JSON.stringify(current), { mode: 0o600 });
    const backups = (await fs.readdir(DATA_DIR)).filter(n => n !== `${topic}.json` && n.startsWith(topic + '.') && n.endsWith('.json')).sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - KEEP_BACKUPS))) await fs.unlink(path.join(DATA_DIR, old));
  }
  const tmp = fileFor(topic) + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(state), { mode: 0o600 });
  await fs.rename(tmp, fileFor(topic));
}

async function handleData(req, res, url) {
  // Los navegadores pueden omitir Origin en un GET same-origin. Si la cabecera
  // está presente, se valida; todas las peticiones siguen exigiendo el HMAC.
  const origin = req.headers.origin || '';
  if (origin && !ORIGINS.includes(origin)) return json(res, 403, { error: 'origin' });
  const topic = url.searchParams.get('topic') || '';
  const token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
  const expected = crypto.createHmac('sha256', SYNC_AUTH_SECRET).update(topic).digest();
  const received = token ? Buffer.from(token[1], 'hex') : Buffer.alloc(expected.length);
  if (!TOPIC_RE.test(topic) || !token || !crypto.timingSafeEqual(expected, received)) return json(res, 401, { error: 'unauthorized' });
  if (req.method === 'GET') {
    try { return json(res, 200, await readState(topic)); }
    catch (_) { return json(res, 500, { error: 'storage' }); }
  }
  if (req.method !== 'PUT') return json(res, 405, { error: 'method' });
  let body;
  try { body = await readBody(req); }
  catch (e) { return json(res, e.status || 400, { error: e.status === 413 ? 'too_large' : 'invalid' }); }
  if (!body || typeof body !== 'object' || !Number.isSafeInteger(body.revision) || body.revision < 0 || !validBlob(body.blob)) return json(res, 400, { error: 'invalid' });
  try {
    const saved = await withTopicLock(topic, async () => {
      const current = await readState(topic);
      if (current.revision !== body.revision) return { conflict: true, revision: current.revision };
      const next = { revision: current.revision + 1, blob: body.blob };
      await writeState(topic, next);
      return { conflict: false, revision: next.revision };
    });
    if (!saved.conflict) {
      const room = topics.get(topic);
      if (room) {
        const notice = JSON.stringify({ type: 'annotations-updated', revision: saved.revision });
        for (const ws of room.clients) if (ws.readyState === 1) ws.send(notice);
      }
    }
    return json(res, saved.conflict ? 409 : 200, saved);
  } catch (_) { return json(res, 500, { error: 'storage' }); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/sync/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return res.end('ok');
  }
  if (url.pathname === '/sync/data') return handleData(req, res, url);
  return serveStatic(req, res, url);
});

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let parts;
  try { parts = decodeURIComponent(url.pathname).split('/').filter(Boolean); }
  catch (_) { res.writeHead(400); return res.end(); }
  if (parts.some(p => p.startsWith('.') || p.includes('\\') || p.includes('\0'))) { res.writeHead(404); return res.end(); }
  let file = path.join(PUBLIC_DIR, ...parts);
  try {
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const real = await fs.realpath(file);
    const root = await fs.realpath(PUBLIC_DIR);
    if (!real.startsWith(root + path.sep)) { res.writeHead(404); return res.end(); }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
    const body = await fs.readFile(real);
    res.writeHead(200, { 'Content-Type': types[path.extname(real)] || 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (_) { res.writeHead(404); res.end(); }
}

function validWebSocketToken(req, topic) {
  const protocols = (req.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim());
  const token = protocols.find(s => /^auth\.[a-f0-9]{64}$/.test(s));
  if (!token) return false;
  const expected = crypto.createHmac('sha256', SYNC_AUTH_SECRET).update(topic).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(token.slice(5), 'hex'));
}

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG });

server.on('upgrade', (req, socket, head) => {
  const m = /^\/sync\/([^/?]+)/.exec(req.url || '');
  const origin = req.headers.origin || '';
  if (!m || !TOPIC_RE.test(m[1]) || !ORIGINS.includes(origin) || !validWebSocketToken(req, m[1])) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return socket.destroy();
  }
  const name = m[1];
  let t = topics.get(name);
  if (!t) {
    if (topics.size >= MAX_TOPICS) { socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n'); return socket.destroy(); }
    t = { clients: new Set(), last: null, at: 0 };
    topics.set(name, t);
  }
  if (t.clients.size >= MAX_CLIENTS_PER_TOPIC) { socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n'); return socket.destroy(); }
  wss.handleUpgrade(req, socket, head, (ws) => attach(ws, name, t));
});

function attach(ws, name, t) {
  t.clients.add(ws);
  ws.isAlive = true;
  ws.bucket = { n: 0, ts: Date.now() };
  if (t.last && Date.now() - t.at < STATE_TTL) ws.send(t.last);

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    const now = Date.now();
    if (now - ws.bucket.ts > 1000) ws.bucket = { n: 0, ts: now };
    if (++ws.bucket.n > RATE_PER_SEC) return;
    const msg = data.toString();
    try { JSON.parse(msg); } catch (_) { return; }
    t.last = msg; t.at = now;
    for (const c of t.clients) if (c !== ws && c.readyState === 1) c.send(msg);
  });
  ws.on('close', () => {
    t.clients.delete(ws);
    if (t.clients.size === 0 && Date.now() - t.at > STATE_TTL) topics.delete(name);
  });
}

setInterval(() => {
  for (const [name, t] of topics) {
    for (const ws of t.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false; ws.ping();
    }
    if (t.clients.size === 0 && Date.now() - t.at > STATE_TTL) topics.delete(name);
  }
}, 25000);

server.listen(PORT, HOST, () => console.log(`ponente-sync escuchando en ${HOST}:${server.address().port}`));
