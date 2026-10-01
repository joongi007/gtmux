import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const ui = new URL('../ui/', import.meta.url);
const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
const equal = (a, b) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function controlServer({ supervisor, proxy, platform = process.platform, onOpen, onPreferences }) {
  let operation = Promise.resolve();
  const secret = randomBytes(32).toString('hex'); let origin, cookieName;
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    try {
      if (req.headers.host !== new URL(origin).host) return reply(403, { error: 'Unrecognized management host.' });
      const url = new URL(req.url, origin);
      if (req.method === 'GET' && url.pathname === '/' && equal(url.searchParams.get('token'), secret)) {
        res.setHeader('Set-Cookie', `${cookieName}=${secret}; HttpOnly; SameSite=Strict; Path=/`);
        res.writeHead(303, { Location: '/' }); return res.end();
      }
      const cookie = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
      if (!equal(cookie, secret)) return reply(401, { error: 'Open the management URL printed when the launcher starts.' });
      if (req.method === 'GET' && assets[url.pathname]) {
        const [path, type] = assets[url.pathname]; res.writeHead(200, { 'Content-Type': type }); return res.end(await readFile(new URL(path, ui)));
      }
      if (req.method === 'GET' && url.pathname === '/api/status') return reply(200, { ...supervisor.status(), platform, proxy: await proxy.status() });
      if (req.method !== 'POST' || req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json'))
        return reply(403, { error: 'Management requests must originate from this local control page.' });
      let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 16384) throw new Error('Request too large.'); }
      const data = JSON.parse(body || '{}'); let result;
      const previous = operation; let release; operation = new Promise(resolve => { release = resolve; });
      await previous;
      try {
      switch (url.pathname) {
        case '/api/configure': result = await supervisor.configure(data); await onPreferences?.(supervisor.preferences); break;
        case '/api/start': result = await supervisor.start();
          if ((await proxy.status()).configuration?.mode === 'managed') await proxy.start(); break;
        case '/api/stop':
          if (!data.confirmed) throw new Error('Confirm that running terminal programs will end.');
          result = await supervisor.stop(data.credential); await proxy.stop(); break;
        case '/api/restart':
          if (!data.confirmed) throw new Error('Confirm that running terminal programs will end.');
          await supervisor.stop(data.credential); await proxy.stop(); result = await supervisor.start();
          if ((await proxy.status()).configuration?.mode === 'managed') await proxy.start(); break;
        case '/api/open': {
          const url = proxy.workspaceURL ? await proxy.workspaceURL() : supervisor.openURL();
          if (onOpen) { await onOpen(url, supervisor.preferences.mode); result = { opened: true }; } else result = { url }; break;
        }
        case '/api/proxy/install': result = await proxy.install(); break;
        case '/api/proxy/preview': result = await proxy.preview(data); break;
        case '/api/proxy/apply': result = await proxy.apply(data); break;
        case '/api/proxy/verify': result = await proxy.verify(); break;
        case '/api/proxy/disable':
          if (!data.confirmed) throw new Error('Confirm server restart before restoring local access.');
          result = await proxy.disable(data.credential); break;
        default: return reply(404, { error: 'Unknown operation.' });
      }
      reply(200, result);
      } finally { release(); }
    } catch (error) { reply(400, { error: error.message }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  cookieName = `gtmux_manager_${server.address().port}`;
  return { server, origin, url: `${origin}/?token=${secret}`, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}
