import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Supervisor, checkPort } from '../src/supervisor.mjs';
async function port() { const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const p = server.address().port; await new Promise(r => server.close(r)); return p; }
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'gtmux-supervisor-test-'));
  const manager = new Supervisor({ root, binary: process.execPath, frontend: root,
    launch: (_binary, args, options) => spawn(process.execPath, [fileURLToPath(new URL('./server-fixture.mjs', import.meta.url)), ...args], options) });
  t.after(async () => { await manager.stop(); await rm(root, { recursive: true, force: true }); });
  await manager.load(); await manager.configure({ port: await port(), workspace: root, mode: 'both', background: false });
  return manager;
}
test('owned start/restart/stop serializes requests, preserves config and redacts token logs', async t => {
  const manager = await fixture(t); const original = await readFile(manager.configPath, 'utf8');
  await Promise.all([manager.start(), manager.start()]); const pid = manager.child.pid;
  assert.equal(manager.phase, 'running'); assert.equal(manager.instanceId, 'fixture');
  await assert.rejects(manager.stop('wrong'), /Shutdown rejected/); assert.equal(manager.child.pid, pid);
  await manager.restart(); assert.notEqual(manager.child.pid, pid);
  assert.equal(await readFile(manager.configPath, 'utf8'), original);
  await manager.stop(); assert.equal(manager.child, null);
  const log = await readFile(manager.logPath, 'utf8'); assert(!log.includes('fixture-token')); assert(log.includes('[redacted]'));
});
test('occupied port is rejected without taking ownership or editing preferences', async t => {
  const manager = await fixture(t); const server = createServer();
  await new Promise(r => server.listen(manager.preferences.port, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  await assert.rejects(manager.start(), /EADDRINUSE/); assert.equal(manager.child, null);
});
test('existing configuration cannot be overwritten through startup form', async t => {
  const manager = await fixture(t); const before = await readFile(manager.configPath, 'utf8');
  await assert.rejects(manager.configure({ ...manager.preferences, port: manager.preferences.port + 1 }), /already has a TOML/);
  assert.equal(await readFile(manager.configPath, 'utf8'), before);
  await manager.configure({ ...manager.preferences, mode: 'web', background: true });
  assert.equal(manager.preferences.mode, 'web');
});
test('invalid port fails before opening a socket', async () => {
  for (const value of [0, 443, 65536, 9001.5, '9001']) await assert.rejects(checkPort(value));
});
