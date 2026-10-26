import { $, $$, esc, icon, fmtAgo } from '../util.js';
import * as mgr from '../extensions/manager.js';
import * as store from '../store.js';
import { openModal, confirmDialog, toast } from '../ui.js';
import { navigate, render } from '../router.js';
import { setSearchValue } from '../shell.js';
import { safeUrl } from '../extensions/validate.js';

const extIcon = (url, name) => `<span class="eicon">${url && safeUrl(url) ? `<img src="${esc(safeUrl(url))}" alt="">` : ''}<b>${esc((name || '?')[0].toUpperCase())}</b></span>`;

const hostsText = list => !list.length ? 'No network access. It works entirely offline.'
  : list.includes('*') ? 'Can contact ANY website. Only install if you trust the author.'
  : `Can contact: ${list.join(', ')}`;

/** Asks before installing; resolves true if the user agrees. */
function confirmInstall(pkg, { update = false } = {}) {
  const m = pkg.manifest, any = m.permissions.network.includes('*');
  return new Promise(resolve => {
    let done = false;
    openModal({
      title: update ? `Update ${m.name}?` : `Install ${m.name}?`,
      body: `<div class="inst">
        <div class="inst-h">${extIcon(m.iconUrl, m.name)}<div><b>${esc(m.name)}</b> <small>v${esc(m.version)}</small><p class="muted">by ${esc(m.author)}${m.language ? ` · ${esc(m.language)}` : ''}</p></div></div>
        ${m.description ? `<p>${esc(m.description)}</p>` : ''}
        <div class="perm ${any ? 'bad' : ''}">${icon(any ? 'warning' : 'shield', 18)}<div><b>Network access</b><p>${esc(hostsText(m.permissions.network))}</p></div></div>
        ${m.nsfw ? `<div class="perm bad">${icon('warning', 18)}<div><b>Adult content</b><p>This source says it may contain adult material.</p></div></div>` : ''}
        <p class="muted small">Extensions are third-party code from <code>${esc(new URL(pkg.manifestUrl).hostname)}</code>. KUMO runs them in an isolated sandbox with no access to this page or your data, and they can only reach the sites listed above. KUMO does not review or endorse any extension, and you are responsible for what you watch.</p>
      </div>`,
      actions: [
        { label: 'Cancel', onClick: () => { done = true; resolve(false); } },
        { label: update ? 'Update' : 'Install', primary: true, onClick: () => { done = true; resolve(true); } }
      ],
      onClose: () => { if (!done) resolve(false); }
    });
  });
}

async function installFlow(manifestUrl, repoUrl, { update = false } = {}) {
  let pkg;
  try { pkg = await mgr.fetchPackage(manifestUrl, repoUrl); }
  catch (e) { toast(`Couldn't load that extension: ${e.message}`); return false; }
  const prev = mgr.get(pkg.manifest.id);
  if (prev && !update && mgr.cmpVer(pkg.manifest.version, prev.manifest.version) <= 0) { toast(`${pkg.manifest.name} is already installed`); return false; }
  if (!(await confirmInstall(pkg, { update: !!prev }))) return false;
  mgr.install(pkg);
  toast(`${pkg.manifest.name} ${prev ? 'updated' : 'installed'}`);
  return true;
}

function openSettings(rec) {
  const m = rec.manifest, wrap = document.createElement('div');
  wrap.innerHTML = m.settings.length ? m.settings.map(s => {
    const v = rec.settings[s.key] ?? s.default, id = `xs-${s.key}`;
    const field = s.type === 'toggle' ? `<label class="switch"><input id="${id}" type="checkbox" data-k="${esc(s.key)}" ${v ? 'checked' : ''}><i></i></label>`
      : s.type === 'select' ? `<label class="select"><select id="${id}" data-k="${esc(s.key)}">${s.options.map(o => `<option value="${esc(o.value)}" ${String(v) === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>${icon('chev', 16)}</label>`
      : `<input id="${id}" class="inp" data-k="${esc(s.key)}" type="${s.type === 'password' ? 'password' : s.type === 'number' ? 'number' : 'text'}" value="${esc(v)}" autocomplete="off">`;
    return `<div class="frow"><label for="${id}"><b>${esc(s.label)}</b>${s.help ? `<small>${esc(s.help)}</small>` : ''}</label>${field}</div>`;
  }).join('') : '<p class="muted">This extension has no settings.</p>';
  wrap.addEventListener('change', e => {
    const k = e.target.dataset.k; if (!k) return;
    const s = m.settings.find(x => x.key === k);
    mgr.setExtSetting(rec.id, k, s.type === 'toggle' ? e.target.checked : s.type === 'number' ? Number(e.target.value) : e.target.value);
  });
  openModal({ title: `${m.name} settings`, body: wrap, actions: [{ label: 'Done', primary: true }] });
}

function openLogs(rec) {
  const logs = mgr.logsFor(rec.id);
  openModal({
    title: `${rec.manifest.name} log`, wide: true,
    body: logs.length ? `<pre class="log">${logs.map(l => esc(`${new Date(l.at).toLocaleTimeString()} [${l.level}] ${l.text}`)).join('\n')}</pre>` : '<p class="muted">Nothing logged yet. Logs appear here after the extension runs (for example when you search or play something).</p>',
    actions: [{ label: 'Close', primary: true }]
  });
}

// ---------------------------------------------------------------- tabs
function installedTab(el, updates) {
  const list = mgr.list(), def = store.getSettings().defaultExt;
  if (!list.length) {
    el.innerHTML = `<div class="empty small"><div class="eico">${icon('plug', 28)}</div><h2>No extensions yet</h2><p>Extensions are what find and stream episodes. Browse the repository to install one.</p><a class="btn primary sm" href="#/extensions?tab=browse">Browse extensions</a></div>`;
    return;
  }
  el.innerHTML = `<div class="ext-grid">${list.map(r => {
    const m = r.manifest, up = updates.get(r.id);
    return `<article class="ext-card ${r.enabled ? '' : 'off'}" data-id="${esc(r.id)}">
      <div class="ext-h">${extIcon(m.iconUrl, m.name)}<div class="ext-n"><b>${esc(m.name)}</b><small>v${esc(m.version)} · ${esc(m.author)}${def === r.id ? ' · <span class="def">default</span>' : ''}</small></div>
        <label class="switch" title="${r.enabled ? 'Enabled' : 'Disabled'}"><input type="checkbox" data-act="toggle" ${r.enabled ? 'checked' : ''} aria-label="Enable ${esc(m.name)}"><i></i></label></div>
      <p class="ext-d">${esc(m.description || 'No description.')}</p>
      <p class="ext-p">${icon(m.permissions.network.includes('*') ? 'warning' : 'shield', 14)} ${esc(hostsText(m.permissions.network))}</p>
      <div class="ext-b">
        ${up ? `<button class="btn sm primary" data-act="update" type="button">Update to v${esc(up.version)}</button>` : ''}
        ${r.enabled && def !== r.id ? '<button class="btn sm ghost" data-act="default" type="button">Make default</button>' : ''}
        <button class="btn sm ghost" data-act="settings" type="button">Settings</button>
        <button class="btn sm ghost" data-act="logs" type="button">Logs</button>
        <button class="btn sm danger" data-act="remove" type="button">${icon('trash', 15)} Remove</button>
      </div></article>`;
  }).join('')}</div>`;
  el.onclick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const card = b.closest('.ext-card'), rec = mgr.get(card.dataset.id); if (!rec) return;
    const a = b.dataset.act;
    if (a === 'toggle') mgr.setEnabled(rec.id, b.checked);
    else if (a === 'default') mgr.setDefault(rec.id);
    else if (a === 'settings') openSettings(rec);
    else if (a === 'logs') openLogs(rec);
    else if (a === 'update') { b.disabled = true; await installFlow(rec.manifestUrl, rec.repoUrl, { update: true }); }
    else if (a === 'remove' && await confirmDialog({ title: `Remove ${rec.manifest.name}?`, message: 'Its settings are deleted. Your watch history and saved title matches are kept.', confirm: 'Remove', danger: true })) { mgr.uninstall(rec.id); toast('Extension removed'); }
  };
}

async function browseTab(el, ctx) {
  el.innerHTML = '<div class="skel sk-line"></div><div class="skel sk-line"></div>';
  const repos = await mgr.listAvailable();
  if (!ctx.active()) return;
  el.innerHTML = repos.map(r => `<section class="repo"><div class="sec-h"><h2>${esc(r.name)}</h2>${r.builtin ? '<span class="muted">Built in</span>' : ''}</div>
    ${r.error ? `<div class="banner warn"><div class="bi">${icon('warning', 22)}</div><div><b>Couldn't load this repository</b><p>${esc(r.error)}</p></div></div>`
      : !r.items.length ? '<p class="muted">This repository is empty.</p>'
      : `<div class="ext-grid">${r.items.map(i => { const inst = mgr.get(i.id), newer = inst && mgr.cmpVer(i.version, inst.manifest.version) > 0;
        return `<article class="ext-card"><div class="ext-h">${extIcon(i.icon, i.name)}<div class="ext-n"><b>${esc(i.name)}</b><small>v${esc(i.version)} · ${esc(i.author)}${i.nsfw ? ' · 18+' : ''}</small></div></div>
        <p class="ext-d">${esc(i.description)}</p>
        <div class="ext-b">${inst && !newer ? `<span class="muted">${icon('check', 15)} Installed</span>` : `<button class="btn sm primary" data-url="${esc(i.manifestUrl)}" data-repo="${esc(i.repoUrl)}" data-update="${newer ? 1 : ''}" type="button">${newer ? 'Update' : 'Install'}</button>`}</div></article>`; }).join('')}</div>`}
  </section>`).join('');
  el.onclick = async e => {
    const b = e.target.closest('[data-url]'); if (!b) return;
    b.disabled = true;
    const ok = await installFlow(b.dataset.url, b.dataset.repo, { update: !!b.dataset.update });
    if (!ok) b.disabled = false;
  };
}

function addTab(el) {
  const repos = mgr.getRepos();
  el.innerHTML = `
    <div class="card-box"><h2>Add by URL</h2>
      <p class="muted">Paste the link to an extension's <code>manifest.json</code>, or to a repository index (a JSON list of extensions). GitHub “blob” links are converted automatically.</p>
      <form class="add-form" id="addForm"><input class="inp" id="addUrl" type="url" placeholder="https://raw.githubusercontent.com/you/repo/main/index.json" required aria-label="Extension or repository URL"><button class="btn primary" type="submit">Add</button></form>
      <p class="muted small">Only add extensions from authors you trust. They are third-party code, not made or reviewed by KUMO.</p></div>
    <div class="card-box"><h2>Repositories</h2>
      <ul class="repos"><li><span><b>KUMO Official</b><small>Built in</small></span></li>
      ${repos.map(r => `<li><span><b>${esc(r.name || new URL(r.url).hostname)}</b><small>${esc(r.url)}</small></span><button class="btn sm danger" data-rm="${esc(r.url)}" type="button">Remove</button></li>`).join('')}</ul></div>`;
  $('#addForm').onsubmit = async e => {
    e.preventDefault();
    const btn = $('button', e.target), raw = $('#addUrl').value;
    btn.disabled = true; btn.textContent = 'Checking…';
    try {
      const d = await mgr.detect(raw);
      if (d.kind === 'repo') {
        if (await confirmDialog({ title: 'Add this repository?', message: `${d.name || d.url}\nIt will appear under Browse. Nothing is installed until you choose to.`, confirm: 'Add repository' })) {
          mgr.addRepo(d.url, d.name); toast('Repository added'); navigate('#/extensions?tab=browse', { replace: true });
        }
      } else if (await installFlow(d.url, '')) navigate('#/extensions?tab=installed', { replace: true });
    } catch (err) { toast(err.message); }
    btn.disabled = false; btn.textContent = 'Add';
  };
  el.onclick = e => { const b = e.target.closest('[data-rm]'); if (b) { mgr.removeRepo(b.dataset.rm); render({ keepScroll: true }); } };
}

export async function extensionsPage(ctx) {
  setSearchValue('');
  const tab = ['installed', 'browse', 'add'].includes(ctx.query.get('tab')) ? ctx.query.get('tab') : (mgr.list().length ? 'installed' : 'browse');
  const n = mgr.list().length;
  $('#page').innerHTML = `<section class="sec" style="padding-top:36px">
    <div class="sec-h"><h2>Extensions</h2></div>
    <p class="lead">Extensions connect KUMO to video sources. Install one and your episodes will appear on every anime page.</p>
    <div class="tabs" role="tablist">${[['installed', `Installed${n ? ` (${n})` : ''}`], ['browse', 'Browse'], ['add', 'Add & repositories']].map(([k, l]) => `<a role="tab" class="${k === tab ? 'on' : ''}" href="#/extensions?tab=${k}">${l}</a>`).join('')}</div>
    <div id="tabBody"></div></section>`;
  const body = $('#tabBody');
  if (tab === 'installed') {
    installedTab(body, new Map());
    // Check for updates in the background; redraw only if something is newer.
    mgr.listAvailable().then(repos => {
      if (!ctx.active()) return;
      const ups = new Map();
      for (const r of repos) for (const i of r.items) { const inst = mgr.get(i.id); if (inst && mgr.cmpVer(i.version, inst.manifest.version) > 0) ups.set(i.id, i); }
      if (ups.size) installedTab(body, ups);
    }).catch(() => {});
    const h = () => { if (ctx.active() && !$('.modal-back')) render({ keepScroll: true }); };
    window.addEventListener('kumo:extensions', h);
    ctx.onLeave(() => window.removeEventListener('kumo:extensions', h));
  } else if (tab === 'browse') {
    await browseTab(body, ctx);
    const h = () => { if (ctx.active()) render({ keepScroll: true }); };
    window.addEventListener('kumo:extensions', h);
    ctx.onLeave(() => window.removeEventListener('kumo:extensions', h));
  } else addTab(body);
}
