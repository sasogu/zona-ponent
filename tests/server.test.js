'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { WebSocket } = require('ws');

test('API cifrada, revisiones, permisos, WebSocket autenticado y aislamiento de archivos', async t => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ponente-test-'));
  const publicDir = path.join(tmp, 'public');
  const dataDir = path.join(tmp, 'data');
  await fs.mkdir(publicDir);
  await fs.writeFile(path.join(publicDir, 'index.html'), 'demo');
  await fs.writeFile(path.join(tmp, 'private.txt'), 'private-test-only');
  await fs.symlink(path.join(tmp, 'private.txt'), path.join(publicDir, 'escape.txt'));
  const secret = crypto.randomBytes(32);
  const topic = 'p-fictional-test-topic';
  const token = crypto.createHmac('sha256', secret).update(topic).digest('hex');
  const origin = 'https://example.invalid';
  const proc = spawn(process.execPath, ['server/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', ALLOWED_ORIGINS: origin,
      DATA_DIR: dataDir, PUBLIC_DIR: publicDir, SYNC_AUTH_SECRET: secret.toString('hex') },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  t.after(async () => {
    if (proc.exitCode === null) { proc.kill(); await once(proc, 'exit'); }
    await fs.rm(tmp, { recursive: true, force: true });
  });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor de prueba no arrancó')), 5000);
    proc.once('exit', () => { clearTimeout(timeout); reject(new Error('El servidor de prueba terminó')); });
    proc.stdout.on('data', data => {
      const match = /escuchando en 127\.0\.0\.1:(\d+)/.exec(data.toString());
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const endpoint = `${base}/sync/data?topic=${topic}`;
  const auth = { Authorization: `Bearer ${token}` };
  assert.equal((await fetch(`${base}/sync/health`)).status, 200);
  assert.equal((await fetch(endpoint)).status, 401);
  assert.equal((await fetch(endpoint, { headers: { ...auth, Origin: 'https://other.invalid' } })).status, 403);
  assert.deepEqual(await (await fetch(endpoint, { headers: auth })).json(), { revision: 0, blob: null });
  assert.equal((await fetch(endpoint, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: 'null' })).status, 400);
  const aes = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aes, iv);
  const plaintext = 'Nota ficticia privada';
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const blob = { v: 1, iv: iv.toString('base64url'), data: encrypted.toString('base64url') };
  const put = revision => fetch(endpoint, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision, blob }) });
  assert.equal((await put(0)).status, 200);
  assert.equal((await put(0)).status, 409);
  const stored = await fs.readFile(path.join(dataDir, topic + '.json'), 'utf8');
  assert.equal(stored.includes(plaintext), false);
  assert.equal((await fs.stat(path.join(dataDir, topic + '.json'))).mode & 0o777, 0o600);
  assert.equal((await fs.stat(dataDir)).mode & 0o777, 0o700);
  const remote = (await (await fetch(endpoint, { headers: auth })).json()).blob;
  const bytes = Buffer.from(remote.data, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', aes, Buffer.from(remote.iv, 'base64url'));
  decipher.setAuthTag(bytes.subarray(-16));
  assert.equal(Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString(), plaintext);
  assert.equal((await put(1)).status, 200);
  assert.equal((await fs.readdir(dataDir)).filter(n => n.includes('.00000001.')).length, 1);
  assert.equal(await (await fetch(base + '/')).text(), 'demo');
  assert.equal((await fetch(base + '/escape.txt')).status, 404);
  assert.equal((await fetch(base + '/%2eenv')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e%2fprivate.txt')).status, 404);
  assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);

  const wsUrl = base.replace('http:', 'ws:') + '/sync/' + topic;
  const rejected = new WebSocket(wsUrl, { origin });
  rejected.on('error', () => {});
  const response = await new Promise(resolve => rejected.once('unexpected-response', (_, res) => {
    resolve(res.statusCode); res.resume(); rejected.terminate();
  }));
  assert.equal(response, 403);
  const options = { origin };
  const first = new WebSocket(wsUrl, ['ponente-v1', `auth.${token}`], options);
  const second = new WebSocket(wsUrl, ['ponente-v1', `auth.${token}`], options);
  t.after(() => { first.terminate(); second.terminate(); });
  await Promise.all([once(first, 'open'), once(second, 'open')]);
  const next = once(second, 'message');
  first.send(JSON.stringify({ h: 2, v: 0, f: -1 }));
  assert.equal(JSON.parse((await next)[0]).h, 2);
});
