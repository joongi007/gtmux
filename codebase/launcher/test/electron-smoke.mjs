// Run against an unpacked package. Creates its own application profile and server.
import { _electron as electron } from 'playwright';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
if (!process.env.GTMUX_TEST_APP) throw new Error('Set GTMUX_TEST_APP to an unpacked desktop executable.');
const root = await mkdtemp(join(tmpdir(), 'gtmux-electron-smoke-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'));
env.GTMUX_DESKTOP_DATA_DIR = root;
let app, page;
try {
  const probe = createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port; await new Promise(r => probe.close(r));
  app = await electron.launch({ executablePath: process.env.GTMUX_TEST_APP, env, timeout: 30000 });
  page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded');
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), root);
  await page.locator('#setup [name="mode"]').selectOption('app');
  await page.locator('[name="workspace"]').fill(root);
  // Stub only the OS picker result in this isolated app; exercise the real UI,
  // authenticated manager route and main-process dialog callback.
  await app.evaluate(({dialog},root)=>{
    globalThis.originalFolderDialog=dialog.showOpenDialog;
    globalThis.folderDialogCalls=[];
    dialog.showOpenDialog=async(_window,options)=>{
      globalThis.folderDialogCalls.push(options);
      return globalThis.folderDialogCalls.length===1?{canceled:true,filePaths:[]}:{canceled:false,filePaths:[root]};
    };
  },root);
  await page.locator('#workspace-browse').click();
  await page.waitForFunction(()=>!document.querySelector('#workspace-browse').disabled);
  assert.equal(await page.locator('[name="workspace"]').inputValue(),root,'cancel retains the typed path');
  await page.locator('[name="workspace"]').fill('');
  await page.locator('#workspace-browse').click();
  await page.waitForFunction(expected=>document.querySelector('[name="workspace"]').value===expected,root);
  const calls=await app.evaluate(({dialog})=>{dialog.showOpenDialog=globalThis.originalFolderDialog;return globalThis.folderDialogCalls;});
  assert.equal(calls.length,2);assert.deepEqual(calls[0].properties,['openDirectory']);assert.equal(calls[0].defaultPath,root);
  await page.locator('[name="port"]').fill(String(port));
  await page.getByRole('button', { name: 'Save setup', exact: true }).click();
  await page.waitForFunction(()=>!document.querySelector('#workspace-browse').disabled);
  await page.reload();
  await page.waitForFunction(()=>!document.querySelector('#workspace-browse').disabled);
  const nextWorkspace = join(root,'projects'); await mkdir(nextWorkspace);
  await app.evaluate(({dialog},folder)=>{
    globalThis.originalFolderDialog=dialog.showOpenDialog;
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});
  },nextWorkspace);
  await page.locator('#workspace-browse').click();
  await page.waitForFunction(expected=>document.querySelector('[name="workspace"]').value===expected,nextWorkspace);
  await app.evaluate(({dialog})=>{dialog.showOpenDialog=globalThis.originalFolderDialog;});
  await page.getByRole('button', { name: 'Save setup', exact: true }).click();
  await page.waitForFunction(()=>document.querySelector('#message').textContent==='Setup saved.');
  await page.reload();
  await page.waitForFunction(expected=>document.querySelector('[name="workspace"]').value===expected,nextWorkspace);
  await page.getByRole('button', { name: 'Start server', exact: true }).click();
  await page.locator('#state').filter({ hasText: /^running$/ }).waitFor({ timeout: 30000 });
  const next = app.waitForEvent('window');
  await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
  const workspace = await next;
  // Bootstrap redirects once; the initial document can disappear after load.
  await workspace.getByRole('button', {name:'Open existing',exact:false}).waitFor();
  assert.equal(new URL(workspace.url()).hostname, '127.0.0.1');
  assert.equal(await workspace.evaluate(() => typeof window.require), 'undefined');
  await page.getByRole('button', { name: 'Stop server…', exact: true }).click();
  await page.locator('#confirm-stop').click();
  await page.locator('#state').filter({ hasText: /^stopped$/ }).waitFor({ timeout: 30000 });
  // Close the manager first while the workspace remains open: this reproduced the
  // destroyed-manager callback during application shutdown.
  const child = app.process();
  const processExit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const managerId = await (await app.browserWindow(page)).evaluate(window => window.id);
  const exited = app.waitForEvent('close', { timeout: 30000 });
  await app.evaluate(({ BrowserWindow }, id) => { setImmediate(() => BrowserWindow.fromId(id).close()); }, managerId);
  await exited;
  app = null;
  assert.deepEqual(await processExit, { code: 0, signal: null });
} finally {
  // Even an assertion failure must stop this test's server before closing Electron.
  if (app && page && !page.isClosed()) await page.evaluate(async () => {
    await fetch('/api/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }) });
  }).catch(() => {});
  await app?.close(); await rm(root, { recursive: true, force: true });
}

console.log('Packaged Electron startup, isolated profile, native server, sandboxed workspace, server stop and complete application exit passed.');
