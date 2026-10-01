const $ = id => document.getElementById(id);
let status, plan, pendingAction, busy = false, populated = false, proxyPopulated = false, portRevision = null, agentPlan = null;
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
  $('proxy-status').textContent = `${status.proxy.installed ? 'Proxy installed' : 'Proxy not installed'} · ${status.proxy.running ? 'running' : 'stopped'}${status.proxy.configuration ? ' · ' + (status.proxy.configuration.origin || 'https://' + status.proxy.configuration.domain) : ''}`;
  $('https-enabled').checked = Boolean(status.proxy.configuration);
  $('https-enabled').disabled = busy || !status.configured;
  $('disable').disabled = busy || !status.proxy.configuration;
  if (!proxyPopulated) {
    const saved = status.proxy.configuration || status.proxy.lastSettings;
    if (saved) for (const key of ['domain', 'mode', 'httpPort', 'httpsPort', 'certificate', 'externalPort']) $('proxy-form').elements[key].value = saved[key] ?? (key === 'certificate' ? 'public' : key === 'externalPort' ? 443 : '');
    proxyPopulated = true;
  }
  const cert = status.proxy.verification?.certificate;
  $('certificate-status').textContent = cert ? `Issuer: ${cert.issuer} · Expires: ${cert.expiresAt} (${cert.daysRemaining} days) · Checked: ${status.proxy.verification.checkedAt}` : 'Certificate has not been verified. Caddy renews managed certificates while running.';
  $('root-certificate').hidden = status.proxy.configuration?.certificate !== 'local' || status.proxy.configuration?.mode !== 'managed';
  $('local-ca-help').hidden = status.proxy.configuration?.certificate !== 'local';
  const update = status.updates ?? { supported: false, phase: 'unavailable' };
  $('automatic-updates').checked = update.automatic === true;
  $('automatic-updates').disabled = busy || !update.supported;
  $('update-status').textContent = `${update.phase}${update.version ? ' · ' + update.version : ''}${update.phase === 'downloading' ? ' · ' + Math.round(update.progress) + '%' : ''}`;
  $('update-error').textContent = update.error || '';
  $('update-check').disabled = busy || !update.supported || ['checking','downloading','installing','ready'].includes(update.phase);
  $('update-download').disabled = busy || !update.supported || update.phase !== 'available';
  $('update-install').disabled = busy || update.phase !== 'ready';
  $('port-load').disabled = busy || !status.configured;
  $('port-save').disabled = busy || Boolean(status.pid) || !portRevision;
  $('agent-copy').disabled = busy || !$('agent-configuration').textContent;
  applyTheme();
  if (status.error) $('error').textContent = status.error;
}
async function action(run, message) {
  if (busy) return; busy = true; $('error').textContent = ''; $('message').textContent = 'Working…';
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  $('https-enabled').disabled = true;
  try { const result = await run(); $('message').textContent = message || 'Done.'; return result; }
  catch (e) { $('error').textContent = e.message; $('message').textContent = ''; }
  finally { busy = false; for (const button of document.querySelectorAll('button')) button.disabled = false; await refresh().catch(e => $('error').textContent = e.message); }
}
document.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => {
  $('message').textContent = '';
  for (const item of document.querySelectorAll('[data-section]')) { if (item === button) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); }
  for (const id of ['server', 'exposure', 'agents', 'updates']) $(id).hidden = id !== button.dataset.section;
}));
$('setup').addEventListener('submit', event => { event.preventDefault(); const form = $('setup').elements;
  void action(() => request('configure', { mode: form.mode.value, port: Number(form.port.value), workspace: form.workspace.value, background: form.background.checked, theme: form.theme.value }), 'Setup saved.'); });
$('start').onclick = () => action(() => request('start', {}), 'Server started. Open your workspace when ready.');
$('open').onclick = () => action(async () => { const result = await request('open', {}); if (result.url) window.open(result.url, '_blank', 'noopener,noreferrer'); }, 'Workspace opened.');
for (const id of ['stop', 'restart', 'disable', 'update-install']) $(id).onclick = () => {
  pendingAction = id === 'disable' ? 'proxy/disable' : id === 'update-install' ? 'updates/install' : id; $('stop-confirm').hidden = false;
  // Keep confirmation in the visible section, including External access.
  $(id).parentElement.after($('stop-confirm')); $('credential').focus();
};
$('cancel-stop').onclick = () => { $('stop-confirm').hidden = true; $('credential').value = ''; };
$('confirm-stop').onclick = () => action(async () => { const credential = $('credential').value; $('credential').value = ''; await request(pendingAction, { confirmed: true, credential }); $('stop-confirm').hidden = true; }, 'Server operation complete.');
$('https-enabled').onchange = () => {
  const enabled = Boolean(status.proxy.configuration);
  $('https-enabled').checked = enabled;
  if (enabled) $('disable').click();
  else {
    $('message').textContent = 'Review the domain and ports, then apply to turn HTTPS on.';
    $('proxy-form').elements.domain.focus();
    $('proxy-form').requestSubmit();
  }
};
$('proxy-form').onsubmit = event => { event.preventDefault(); const form = $('proxy-form').elements;
  void action(async () => { plan = await request('proxy/preview', { mode: form.mode.value, domain: form.domain.value, httpPort: Number(form.httpPort.value), httpsPort: Number(form.httpsPort.value), certificate: form.certificate.value, externalPort: Number(form.externalPort.value) });
    for (const id of ['changes', 'prerequisites']) { $(id).replaceChildren(...plan[id].map(text => { const li = document.createElement('li'); li.textContent = text; return li; })); }
    $('dns').textContent = plan.dnsError ? `DNS is not ready: ${plan.dnsError}` : `DNS addresses: ${plan.addresses.join(', ')}`;
    $('plan').hidden = false; $('install').hidden = plan.mode !== 'managed';
  }, 'Review the changes and network prerequisites before applying.');
};
$('install').onclick = () => action(() => request('proxy/install', {}), 'Verified proxy installed in this manager’s data directory.');
$('apply').onclick = () => action(async () => { const credential = $('proxy-credential').value; $('proxy-credential').value = ''; await request('proxy/apply', { planId: plan.id, confirmed: true, credential }); $('plan').hidden = true; }, 'Configuration applied. Verify the public HTTPS connection next.');
$('port-load').onclick = () => action(async () => { const saved = await request('config/port', {}); portRevision = saved.revision; $('saved-port').value = saved.port; }, 'Saved port reloaded from disk.');
$('port-save').onclick = () => action(async () => { const saved = await request('config/port', { port: Number($('saved-port').value), revision: portRevision }); portRevision = saved.revision; $('setup').elements.port.value = saved.port; }, 'Startup port saved. Start the server to apply it.');
function applyTheme() { document.documentElement.classList.toggle('dark', $('theme').value === 'dark' || ($('theme').value === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)); }
$('theme').onchange = applyTheme;
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
$('automatic-updates').onchange = () => action(() => request('updates/preferences', { automatic: $('automatic-updates').checked }), 'Update preference saved.');
$('update-check').onclick = () => action(() => request('updates/check', {}), 'Update check complete.');
$('update-download').onclick = () => action(() => request('updates/check', { download: true }), 'Update downloaded and verified. Install when you are ready.');
const agentInstructions = {
  claude: 'Merge the hooks object into ~/.claude/settings.json (Windows: your user profile/.claude/settings.json).',
  codex: 'Merge into ~/.codex/hooks.json (Windows: your user profile/.codex/hooks.json). Review the hooks in Codex /hooks before using them.',
  gemini: 'Merge the hooks object into ~/.gemini/settings.json.',
  copilot: 'Save or merge as .github/hooks/gtmux-activity.json in your project. Requires a Copilot CLI version supporting exec/args hooks.',
  cursor: 'Merge into ~/.cursor/hooks.json. Verify event support in your Cursor CLI version; desktop events may differ.',
  aider: 'Merge these keys into your Aider YAML configuration, or pass --notifications --notifications-command with the generated command.',
  opencode: 'Save this JavaScript as .opencode/plugins/gtmux-activity.js in your project. Do not overwrite another plugin.'
};
for (const id of ['agent-install-review','agent-remove-review']) $(id).onclick = () => action(async () => {
  agentPlan = await request('agent/preview', { agent: $('agent').value, remove: id === 'agent-remove-review' });
  $('agent-plan-detail').textContent = `${agentPlan.target}: ${agentPlan.description}`; $('agent-plan').hidden = false;
}, 'Review the target file before applying.');
$('agent').onchange = () => { agentPlan = null; $('agent-plan').hidden = true; $('agent-configuration').textContent = ''; $('agent-copy').disabled = true; $('agent-instructions').textContent = agentInstructions[$('agent').value]; };
$('agent-cancel').onclick = () => { agentPlan = null; $('agent-plan').hidden = true; };
$('agent-apply').onclick = () => action(async () => { await request('agent/apply', {planId:agentPlan?.id,confirmed:true}); agentPlan=null; $('agent-plan').hidden=true; }, 'Integration updated. Restart the agent and review its hook trust prompt if required.');
$('agent-generate').onclick = () => action(async () => {
  const agent = $('agent').value; const result = await request('agent/hooks', { agent });
  $('agent-configuration').textContent = result.configuration; $('agent-instructions').textContent = agentInstructions[agent]; $('agent-copy').disabled = false;
}, 'Integration generated. Existing agent settings have not been changed.');
$('agent-copy').onclick = () => action(() => navigator.clipboard.writeText($('agent-configuration').textContent), 'Configuration copied.');
$('root-certificate').onclick = () => action(async () => {
  const result = await request('proxy/root-certificate', {});
  const url = URL.createObjectURL(new Blob([result.pem], { type: 'application/x-pem-file' }));
  const link = document.createElement('a'); link.href = url; link.download = result.filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}, 'CA certificate downloaded. Choose which client devices should trust it.');
$('verify').onclick = () => action(() => request('proxy/verify', {}), 'Public HTTPS endpoint responded successfully.');
await refresh().catch(e => $('error').textContent = e.message);
setInterval(() => { if (!busy) void refresh().catch(() => {}); }, 3000);
