const $ = id => document.getElementById(id);
let status, plan, pendingAction, busy = false, populated = false;
async function request(path, data) {
  const response = await fetch(`/api/${path}`, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`); return result;
}
async function refresh() {
  status = await request('status');
  $('platform').textContent = status.platform;
  for (const id of ['state', 'address', 'config', 'log']) $(id).textContent = ({ state: status.state, address: status.address, config: status.configPath, log: status.logPath })[id] || '—';
  if (status.preferences && !populated) {
    for (const [key, value] of Object.entries(status.preferences)) { const field = $('setup').elements.namedItem(key); if (field) { if (field.type === 'checkbox') field.checked = value; else field.value = value; } }
    populated = true;
  }
  $('setup').elements.port.disabled = status.configured;
  $('setup').elements.workspace.disabled = status.configured;
  $('config-hint').textContent = status.configured ? 'Change the server port or workspace in the workspace Settings → Server, then restart here. Your TOML edits are preserved.' : '';
  $('start').disabled = busy || !status.configured || Boolean(status.pid);
  $('open').disabled = busy || status.state !== 'running';
  $('stop').disabled = busy || !status.pid; $('restart').disabled = busy || !status.pid;
  $('proxy-status').textContent = `${status.proxy.installed ? 'Proxy installed' : 'Proxy not installed'} · ${status.proxy.running ? 'running' : 'stopped'}${status.proxy.configuration ? ' · https://' + status.proxy.configuration.domain : ''}`;
  if (status.error) $('error').textContent = status.error;
}
async function action(run, message) {
  if (busy) return; busy = true; $('error').textContent = ''; $('message').textContent = 'Working…';
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  try { const result = await run(); $('message').textContent = message || 'Done.'; return result; }
  catch (e) { $('error').textContent = e.message; $('message').textContent = ''; }
  finally { busy = false; for (const button of document.querySelectorAll('button')) button.disabled = false; await refresh().catch(e => $('error').textContent = e.message); }
}
document.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => {
  for (const item of document.querySelectorAll('[data-section]')) { if (item === button) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); }
  for (const id of ['server', 'exposure']) $(id).hidden = id !== button.dataset.section;
}));
$('setup').addEventListener('submit', event => { event.preventDefault(); const form = $('setup').elements;
  void action(() => request('configure', { mode: form.mode.value, port: Number(form.port.value), workspace: form.workspace.value, background: form.background.checked }), 'Setup saved.'); });
$('start').onclick = () => action(() => request('start', {}), 'Server started. Open your workspace when ready.');
$('open').onclick = () => action(async () => { const result = await request('open', {}); if (result.url) window.open(result.url, '_blank', 'noopener,noreferrer'); }, 'Workspace opened.');
for (const id of ['stop', 'restart', 'disable']) $(id).onclick = () => {
  pendingAction = id === 'disable' ? 'proxy/disable' : id; $('stop-confirm').hidden = false;
  // Keep confirmation in the visible section, including External access.
  $(id).parentElement.after($('stop-confirm')); $('credential').focus();
};
$('cancel-stop').onclick = () => { $('stop-confirm').hidden = true; $('credential').value = ''; };
$('confirm-stop').onclick = () => action(async () => { const credential = $('credential').value; $('credential').value = ''; await request(pendingAction, { confirmed: true, credential }); $('stop-confirm').hidden = true; }, 'Server operation complete.');
$('proxy-form').onsubmit = event => { event.preventDefault(); const form = $('proxy-form').elements;
  void action(async () => { plan = await request('proxy/preview', { mode: form.mode.value, domain: form.domain.value, httpPort: Number(form.httpPort.value), httpsPort: Number(form.httpsPort.value) });
    for (const id of ['changes', 'prerequisites']) { $(id).replaceChildren(...plan[id].map(text => { const li = document.createElement('li'); li.textContent = text; return li; })); }
    $('dns').textContent = plan.dnsError ? `DNS is not ready: ${plan.dnsError}` : `DNS addresses: ${plan.addresses.join(', ')}`;
    $('plan').hidden = false; $('install').hidden = plan.mode !== 'managed';
  }, 'Review the changes and network prerequisites before applying.');
};
$('install').onclick = () => action(() => request('proxy/install', {}), 'Verified proxy installed in this manager’s data directory.');
$('apply').onclick = () => action(async () => { const credential = $('proxy-credential').value; $('proxy-credential').value = ''; await request('proxy/apply', { planId: plan.id, confirmed: true, credential }); $('plan').hidden = true; }, 'Configuration applied. Verify the public HTTPS connection next.');
$('verify').onclick = () => action(() => request('proxy/verify', {}), 'Public HTTPS endpoint responded successfully.');
await refresh().catch(e => $('error').textContent = e.message);
setInterval(() => { if (!busy) void refresh().catch(() => {}); }, 3000);
