import { parse } from 'smol-toml';
// Preserve comments and unrelated TOML. Unusual TOML spellings fail with a clear
// instruction instead of silently replacing the entire user's document.
export function replaceStartupPort(text, port) {
  const before = parse(text), old = before.server.port;
  let inServer = false, changed = false;
  const lines = text.split('\n').map(line => {
    const header = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (header) inServer = header[1].trim() === 'server';
    if (inServer && /^\s*port\s*=/.test(line)) {
      if (!/^\s*port\s*=\s*\d[\d_]*\s*(?:#.*)?$/.test(line)) throw new Error('Edit this port expression in the TOML file, then reload it.');
      changed = true; return line.replace(/(=\s*)\d[\d_]*/,`$1${port}`);
    }
    // Generated loopback allowlists may use either TOML quote style.
    if (/^\s*(host_allowlist|cors_origins)\s*=/.test(line)) {
      for (const host of [`127.0.0.1:${old}`,`localhost:${old}`,`http://127.0.0.1:${old}`,`http://localhost:${old}`])
        for (const q of ['"',"'"]) line = line.replaceAll(q+host+q,q+host.replace(`:${old}`,`:${port}`)+q);
    }
    return line;
  });
  const next = lines.join('\n');
  const after = parse(next);
  for (const key of ['host_allowlist', 'cors_origins']) {
    const stale = new Set([`127.0.0.1:${old}`, `localhost:${old}`, `http://127.0.0.1:${old}`, `http://localhost:${old}`]);
    if (port !== old && after.security?.[key]?.some(value => stale.has(value)))
      throw new Error('Edit multiline loopback allowlists and the port together in TOML, then reload. Nothing saved.');
  }
  if (!changed || parse(next).server.port !== port) throw new Error('Use a [server] port entry in TOML, then reload it here.');
  return next;
}
