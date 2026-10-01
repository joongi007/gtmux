import { mkdir, readFile, writeFile, chmod, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lookup } from 'node:dns/promises';
import { parse, stringify } from 'smol-toml';
import { x as untar } from 'tar';
import { atomicWrite, readOptional, revision } from './files.mjs';
const exec = promisify(execFile);
export const CADDY_VERSION = '2.11.4';
export function validateDomain(value) {
  if (typeof value !== 'string' || value.length > 253 || !value.includes('.') ||
    !value.split('.').every(s => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(s)) ||
    /^[0-9.]+$/.test(value) || /\.(localhost|local|test|invalid)$/i.test(value)) throw new Error('Enter a public DNS hostname, without scheme, port or path.');
  return value.toLowerCase();
}
export function proxyConfiguration(domain, port, httpPort = 80, httpsPort = 443) {
  domain = validateDomain(domain);
  for (const value of [httpPort, httpsPort]) if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('Proxy ports must be from 1 to 65535.');
  if (httpPort === httpsPort || [httpPort, httpsPort].includes(port)) throw new Error('Backend, HTTP and HTTPS ports must be different.');
  return { admin: { disabled: true }, apps: { http: { http_port: httpPort, https_port: httpsPort,
    servers: { gtmux: { listen: [`:${httpsPort}`], routes: [{ match: [{ host: [domain] }],
      handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: `127.0.0.1:${port}` }] }] }] } } } } };
}
export class ProxyManager {
  constructor(supervisor, { platform = process.platform, arch = process.arch, run = exec, launch = spawn, resolveDNS = lookup } = {}) {
    this.resolveDNS = resolveDNS; this.server = supervisor; this.platform = platform; this.arch = arch; this.run = run; this.launch = launch;
    this.root = join(supervisor.root, 'proxy'); this.binary = join(this.root, platform === 'win32' ? 'caddy.exe' : 'caddy');
    this.child = null; this.error = ''; this.plan = null; this.busy = false;
  }
  async status() { return { installed: Boolean(await readOptional(join(this.root, 'version'))),
    running: Boolean(this.child), error: this.error, version: CADDY_VERSION,
    configuration: JSON.parse(await readOptional(join(this.root, 'exposure.json')) ?? 'null') }; }
  async install() {
    if (this.busy) throw new Error('A proxy operation is already in progress.');
    if (this.child) throw new Error('Stop the proxy before replacing its executable.');
    this.busy = true;
    try {
      const os = { linux: 'linux', darwin: 'mac', win32: 'windows' }[this.platform];
      const arch = { x64: 'amd64', arm64: 'arm64' }[this.arch];
      if (!os || !arch) throw new Error('Select a supported Linux/WSL or macOS runtime for the proxy.');
      const name = `caddy_${CADDY_VERSION}_${os === 'mac' ? 'mac' : os}_${arch}.${os === 'windows' ? 'zip' : 'tar.gz'}`;
      const base = `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/`;
      const fetchChecked = async name => { const r = await fetch(base + name, { signal: AbortSignal.timeout(120000) }); if (!r.ok) throw new Error(`Proxy download failed (${r.status}).`); return r; };
      const checksums = await (await fetchChecked(`caddy_${CADDY_VERSION}_checksums.txt`)).text();
      const expected = checksums.split(/\r?\n/).map(line => line.trim().split(/\s+/)).find(([, file]) => file === name)?.[0];
      if (!expected || !/^(?:[0-9a-f]{64}|[0-9a-f]{128})$/i.test(expected)) throw new Error('Release checksum missing.');
      const data = Buffer.from(await (await fetchChecked(name)).arrayBuffer());
      if (createHash(expected.length === 128 ? 'sha512' : 'sha256').update(data).digest('hex') !== expected.toLowerCase()) throw new Error('Proxy checksum mismatch; nothing installed.');
      const temporary = await mkdtemp(join(tmpdir(), 'gtmux-proxy-'));
      try {
        await writeFile(join(temporary, 'proxy.tar.gz'), data);
        if (os === 'windows') {
          await writeFile(join(temporary, 'proxy.zip'), data);
          await this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:GTMUX_ARCHIVE -DestinationPath $env:GTMUX_EXTRACT -Force'], { env: { ...process.env, GTMUX_ARCHIVE: join(temporary, 'proxy.zip'), GTMUX_EXTRACT: temporary }, windowsHide: true, timeout: 30000 });
        } else await untar({ file: join(temporary, 'proxy.tar.gz'), cwd: temporary,
          filter: (path, entry) => path === 'caddy' && entry.type === 'File', strict: true });
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        await copyFile(join(temporary, os === 'windows' ? 'caddy.exe' : 'caddy'), this.binary + '.new'); if (this.server.adapter) await this.server.adapter.chmod(this.binary + '.new'); else await chmod(this.binary + '.new', 0o700);
        const { rename } = await import('node:fs/promises'); await rename(this.binary + '.new', this.binary);
        await atomicWrite(join(this.root, 'version'), CADDY_VERSION);
      } finally { await rm(temporary, { recursive: true, force: true }); }
      return this.status();
    } finally { this.busy = false; }
  }
  async preview(input) {
    if ((await this.status()).configuration) throw new Error('Restore local access before configuring a different public endpoint.');
    const domain = validateDomain(input.domain); const mode = input.mode;
    if (!['managed', 'existing'].includes(mode)) throw new Error('Choose a managed or existing local proxy.');
    const before = await readOptional(this.server.configPath); if (!before) throw new Error('Complete server setup first.');
    const config = parse(before); const port = config.server.port;
    const proxy = proxyConfiguration(domain, port, input.httpPort ?? 80, input.httpsPort ?? 443);
    if (this.platform === 'win32') {
      const { createServer } = await import('node:net'); const probe = createServer();
      await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
      const address = `127.0.0.1:${probe.address().port}`; await new Promise(resolve => probe.close(resolve));
      proxy.admin = { listen: address, enforce_origin: true, origins: [address] };
    } else proxy.admin = { listen: 'unix/' + await this.server.serverPath(join(this.root, 'admin.sock')) };
    let addresses = []; let dnsError = '';
    try { addresses = (await this.resolveDNS(domain, { all: true })).map(a => a.address); } catch (e) { dnsError = e.message; }
    config.public_origin = `https://${domain}`;
    config.server.bind = '127.0.0.1';
    config.security = { ...config.security, cors_origins: [`https://${domain}`, `http://127.0.0.1:${port}`],
      host_allowlist: [domain, `127.0.0.1:${port}`, `localhost:${port}`] };
    config.cloud = { tls_required: false, trusted_proxy_ips: ['127.0.0.1/32'], trusted_proxy_ips_required: true,
      rate_limit_auth_failures_per_minute: 10 };
    this.plan = { id: randomUUID(), revision: revision(before), before, after: stringify(config), proxy,
      domain, mode, httpPort: input.httpPort ?? 80, httpsPort: input.httpsPort ?? 443, addresses, dnsError };
    return { ...this.plan, before: undefined, after: undefined,
      changes: ['Back up server.toml and replace it with the generated proxy configuration.',
        'Keep the backend bound to 127.0.0.1; enable cloud authentication and secure cookies.',
        mode === 'managed' ? 'Start a dedicated Caddy process with automatic HTTPS and certificate renewal.' : 'Use your existing TLS proxy on this same computer.',
        'Restart this managed server. Running terminal programs will end.'],
      prerequisites: ['Point DNS A/AAAA records at this computer or its public gateway.',
        'Forward public TCP ports 80 and 443 to the selected HTTP/HTTPS proxy ports.',
        'Allow inbound traffic in your firewall. This application does not modify your router or firewall.'] };
  }
  async apply({ planId, confirmed, credential }) {
    if (!confirmed || !this.plan || this.plan.id !== planId) throw new Error('Review and confirm a current deployment plan.');
    if (this.busy) throw new Error('A proxy operation is already in progress.');
    this.busy = true;
    const plan = this.plan; let changed = false; const wasRunning = Boolean(this.server.child);
    try {
      if (revision(await readFile(this.server.configPath, 'utf8')) !== plan.revision) throw new Error('Server config changed. Preview again before applying.');
      if (plan.mode === 'managed' && !(await this.status()).installed) throw new Error('Install the managed proxy first.');
      await this.server.stop(credential); await this.stop();
      if (revision(await readFile(this.server.configPath, 'utf8')) !== plan.revision) throw new Error('Config changed while stopping. Preview again.');
      await atomicWrite(join(this.root, 'server.before.toml'), plan.before);
      await atomicWrite(this.server.configPath, plan.after); changed = true;
      await atomicWrite(join(this.root, 'caddy.json'), JSON.stringify(plan.proxy, null, 2));
      await atomicWrite(join(this.root, 'exposure.json'), JSON.stringify({ domain: plan.domain, mode: plan.mode,
        httpPort: plan.httpPort, httpsPort: plan.httpsPort, appliedRevision: revision(plan.after) }));
      await this.server.start();
      if (plan.mode === 'managed') await this.start();
      this.plan = null; return this.status();
    } catch (error) {
      try {
      if (changed) {
        await this.server.stop(credential); await this.stop();
        if (revision(await readFile(this.server.configPath, 'utf8')) !== revision(plan.after)) throw new Error(`${error.message} Rollback stopped because the config was edited externally; restore server.before.toml after reviewing your changes.`);
        await atomicWrite(this.server.configPath, plan.before);
        await atomicWrite(join(this.root, 'exposure.json'), 'null');
      }
      if (wasRunning && !this.server.child) await this.server.start();
      } catch (rollback) { throw new Error(`${error.message} Recovery requires attention: ${rollback.message}`); }
      throw error;
    } finally { this.busy = false; }
  }
  async start() {
    if (this.child) return this.status();
    const configPath = join(this.root, 'caddy.json');
    const current = await this.server.config();
    const saved = JSON.parse(await readFile(configPath, 'utf8'));
    const exposure = (await this.status()).configuration;
    if (!exposure || current.public_origin !== `https://${exposure.domain}`) throw new Error('Public origin differs from the deployed proxy. Review configuration before starting.');
    saved.apps.http.servers.gtmux.routes[0].handle[0].upstreams[0].dial = `127.0.0.1:${current.server.port}`;
    await atomicWrite(configPath, JSON.stringify(saved, null, 2));
    const path = await this.server.serverPath(configPath);
    const env = { ...process.env, XDG_DATA_HOME: await this.server.serverPath(join(this.root, 'data')), XDG_CONFIG_HOME: await this.server.serverPath(join(this.root, 'config')) };
    const command = async args => this.server.adapter ? this.server.adapter.command(this.binary, args, env) : { binary: this.binary, args, env };
    const validate = await command(['validate', '--config', path]);
    await this.run(validate.binary, validate.args, { env: validate.env, timeout: 15000, windowsHide: true });
    const start = await command(['run', '--config', path]);
    const child = this.launch(start.binary, start.args, { windowsHide: true, env: start.env, stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child; this.error = '';
    child.stderr.on('data', data => { this.error = data.toString().slice(-4000); });
    child.stdout.on('data', () => {});
    child.on('error', error => { this.error = error.message; if (this.child === child) this.child = null; });
    child.on('exit', () => { if (this.child === child) this.child = null; });
    await new Promise(resolve => setTimeout(resolve, 500));
    if (!this.child) throw new Error(`Proxy could not start: ${this.error}. Check port permissions and conflicts.`);
    return this.status();
  }
  async stop() {
    const child = this.child; if (!child) return this.status();
    const config = JSON.parse(await readFile(join(this.root, 'caddy.json'), 'utf8'));
    const args = ['stop', '--address', config.admin.listen];
    const stop = this.server.adapter ? await this.server.adapter.command(this.binary, args, {}) : { binary: this.binary, args };
    await this.run(stop.binary, stop.args, { env: stop.env, timeout: 10000, windowsHide: true });
    for (let i = 0; i < 100 && this.child === child; i++) await new Promise(r => setTimeout(r, 100));
    if (this.child === child) throw new Error('Proxy is still stopping. It was not forcibly terminated.');
    return this.status();
  }
  async disable(credential) {
    const exposure = (await this.status()).configuration;
    if (!exposure) return this.status();
    const current = await readFile(this.server.configPath, 'utf8');
    if (revision(current) !== exposure.appliedRevision) throw new Error('Config was edited after deployment. Restore the saved server.before.toml manually to preserve your edits.');
    const before = await readFile(join(this.root, 'server.before.toml'), 'utf8');
    await this.server.stop(credential); await this.stop();
    await atomicWrite(this.server.configPath, before); await atomicWrite(join(this.root, 'exposure.json'), 'null');
    await this.server.start(); return this.status();
  }
  async workspaceURL() {
    await this.server.refreshToken?.();
    const url = new URL(this.server.openURL());
    const exposure = (await this.status()).configuration;
    if (exposure) {
      // Never send a bootstrap credential to an unverified DNS/proxy target.
      await this.verify();
      url.hostname = exposure.domain; url.protocol = 'https:'; url.port = '';
    }
    return url.href;
  }
  async verify() {
    const exposure = (await this.status()).configuration;
    if (!exposure) throw new Error('No public endpoint configured.');
    const response = await fetch(`https://${exposure.domain}/healthz`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Public endpoint returned ${response.status}.`);
    if (!this.server.instanceId || response.headers.get('x-gtmux-server-id') !== this.server.instanceId) throw new Error('HTTPS responds, but it is not this running gtmux server. Check your proxy target.');
    return { verified: true, url: `https://${exposure.domain}`, checkedAt: new Date().toISOString() };
  }
}
