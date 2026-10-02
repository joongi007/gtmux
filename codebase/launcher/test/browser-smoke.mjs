// GTMUX_TEST_BINARY must point to a freshly built server. Own temporary data only.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { Supervisor } from '../src/supervisor.mjs';
import { ProxyManager } from '../src/proxy.mjs';
import { controlServer } from '../src/control.mjs';
if (!process.env.GTMUX_TEST_BINARY) throw new Error('Set GTMUX_TEST_BINARY to an isolated build.');
const root = await mkdtemp(join(tmpdir(), 'gtmux-browser-smoke-'));
const supervisor = new Supervisor({ root, binary: process.env.GTMUX_TEST_BINARY,
  frontend: process.env.GTMUX_TEST_FRONTEND ?? resolve('../../.artifacts/frontend') });
await supervisor.load(); const proxy = new ProxyManager(supervisor);
const control = await controlServer({ supervisor, proxy });
let browser;
try {
  const probe = createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port; await new Promise(r => probe.close(r));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(control.url);
  await page.waitForFunction(() => document.querySelector('#platform').textContent !== '');
  assert.equal(await page.locator('#server h1').evaluate(el => getComputedStyle(el).fontSize),'16px');
  assert.equal(await page.locator('#setup [name="port"]').evaluate(el => getComputedStyle(el).height),'32px');
  const toggle=page.locator('#setup [role="switch"]');
  assert.deepEqual(await toggle.evaluate(el=>({width:getComputedStyle(el).width,height:getComputedStyle(el).height})),{width:'28px',height:'16px'});
  if(process.env.GTMUX_SCREENSHOTS) {
    await mkdir(process.env.GTMUX_SCREENSHOTS,{recursive:true});
    for(const theme of ['dark','light']) {
      await page.locator('[name="theme"]').selectOption(theme);
      await page.screenshot({path:join(process.env.GTMUX_SCREENSHOTS,`first-setup-${theme}.png`),fullPage:true,animations:'disabled'});
    }
  }
  await page.locator('[name="workspace"]').fill(root);
  await page.locator('[name="port"]').fill(String(port));
  await page.getByRole('button', { name: 'Save setup', exact: true }).click();
  await page.getByRole('button', { name: 'Start server', exact: true }).click();
  await page.locator('#state').filter({ hasText: /^running$/ }).waitFor({ timeout: 30000 });
  assert.equal(await page.locator('[role="switch"]').count(), 3);
  const token = new URL(supervisor.openURL()).searchParams.get('token');
  const response = await fetch(`http://127.0.0.1:${port}/api/sessions`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'smoke', workspace_root: root, confirm: true }) });
  assert(response.ok, `session creation: ${response.status} ${await response.text()}`);
  const oldPid = supervisor.child.pid;
  await page.getByRole('button', { name: 'Restart…', exact: true }).click();
  await page.locator('#confirm-stop').click();
  await page.waitForFunction(() => document.querySelector('#message').textContent === 'Server operation complete.');
  assert.notEqual(supervisor.child.pid, oldPid);
  await page.getByRole('button', { name: 'External access', exact: true }).click();
  await page.locator('[name="domain"]').fill('terminal.example.com');
  await page.locator('#proxy-form [name=mode]').selectOption('existing');
  await page.locator('#https-enabled').click();
  await page.locator('#plan:not([hidden])').waitFor();
  assert.equal(await page.locator('#https-enabled').isChecked(), false, 'preview must not claim HTTPS is enabled');
  await page.locator('#apply').click();
  await page.waitForFunction(() => document.querySelector('#https-enabled').checked);
  await page.locator('#https-enabled').click();
  await page.locator('#stop-confirm:not([hidden])').waitFor();
  assert.equal(await page.locator('#https-enabled').isChecked(), true, 'off requires confirmation');
  await page.locator('#cancel-stop').click();
  assert.equal(await page.locator('#https-enabled').isChecked(), true);
  await page.locator('#https-enabled').click();
  await page.locator('#confirm-stop').click();
  await page.waitForFunction(() => !document.querySelector('#https-enabled').checked);
  await page.reload();
  await page.getByRole('button', { name: 'External access', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#proxy-form [name=domain]').value === 'terminal.example.com');
  await page.locator('#https-enabled').click();
  await page.locator('#plan:not([hidden])').waitFor();
  await page.setViewportSize({ width: 700, height: 800 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'manager must not overflow narrow desktop window');
  await page.getByRole('button', { name: 'Agent activity', exact: true }).click();
  await page.locator('#agent').selectOption('claude');
  await page.locator('#agent-generate').click();
  await page.waitForFunction(() => document.querySelector('#agent-configuration').textContent.includes('PermissionRequest'));
  await page.locator('#agent').selectOption('codex');
  assert.equal(await page.locator('#agent-configuration').textContent(), '');
  assert.equal(await page.locator('#agent-copy').isDisabled(), true);
  await page.getByRole('button', { name: 'Server', exact: true }).click();
  if (process.env.GTMUX_SCREENSHOTS) {
    await mkdir(process.env.GTMUX_SCREENSHOTS, {recursive:true});
    for (const theme of ['light','dark']) {
      await page.locator('[name="theme"]').selectOption(theme);
      for (const section of ['Server','External access','Agent activity','Updates']) {
        await page.getByRole('button', {name:section,exact:true}).click();
        await page.screenshot({path:join(process.env.GTMUX_SCREENSHOTS,`manager-${section.replaceAll(' ','-')}-${theme}.png`),fullPage:true});
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      await page.getByRole('button', { name: 'Server', exact: true }).click();
    }
  }
  assert.deepEqual(errors, []);
  await page.getByRole('button', { name: 'Server', exact: true }).click();
  await page.getByRole('button', { name: 'Stop server…', exact: true }).click();
  await page.locator('#confirm-stop').click();
  await page.locator('#state').filter({ hasText: /^stopped$/ }).waitFor({ timeout: 30000 });
  console.log('Browser setup, native server start, session creation, restart, proxy preview, layout and stop passed.');
} finally {
  await browser?.close(); await proxy.stop(); await supervisor.stop(); await control.close();
  await rm(root, { recursive: true, force: true });
}
