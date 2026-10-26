// The persistent frame around every page: top bar (with search + sources pill), page container, footer.

import { $, $$, icon, debounce } from './util.js';
import * as mgr from './extensions/manager.js';
import { navigate, parse } from './router.js';

const LINKS = [
  ['home', '#/', 'Home', 'home'], ['browse', '#/browse', 'Browse', 'grid'], ['mylist', '#/mylist', 'My List', 'bookmark'],
  ['history', '#/history', 'History', 'clock'], ['extensions', '#/extensions', 'Extensions', 'plug']
];

export function buildShell() {
  $('#app').innerHTML = `
    <header class="nav">
      <div class="nav-l">
        <a class="brand" href="#/"><span class="logo">K</span>KUMO</a>
        <nav class="links" aria-label="Main">${LINKS.map(([k, href, label, ic]) => `<a href="${href}" data-nav="${k}">${icon(ic, 22)}<span>${label}</span></a>`).join('')}</nav>
      </div>
      <div class="nav-r">
        <label class="search">${icon('search', 18)}<span class="sr">Search anime</span>
          <input id="q" type="search" placeholder="Search anime…" autocomplete="off" enterkeyhint="search"></label>
        <a class="status" id="pill" href="#/extensions" title="Installed sources"></a>
        <a class="ib gear-link" data-nav="settings" href="#/settings" aria-label="Settings" title="Settings">${icon('sliders', 22)}</a>
      </div>
    </header>
    <main id="page"></main>
    <footer class="foot">
      <span>KUMO is a client-side catalog and player. It hosts no video: episodes come from extensions you choose to install. Catalog data by <a href="https://anilist.co" target="_blank" rel="noopener noreferrer">AniList</a>.</span>
      <span><a href="#/extensions">Extensions</a> · <a href="#/settings">Settings</a></span>
    </footer>`;

  const q = $('#q');
  const go = () => {
    const v = q.value.trim();
    const onBrowse = parse().path === '/browse';
    if (v) navigate(`#/browse?q=${encodeURIComponent(v)}`, { replace: onBrowse });
    else if (onBrowse) navigate('#/browse', { replace: true });
  };
  q.addEventListener('input', debounce(go, 450));
  q.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '') && !$('.modal-back')) { e.preventDefault(); q.focus(); }
  });

  updatePill();
  window.addEventListener('kumo:extensions', updatePill);
}

export function setNav(name) {
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === name));
}
export function setSearchValue(v) {
  const q = $('#q');
  if (q && document.activeElement !== q) q.value = v || '';
}
export function updatePill() {
  const n = mgr.enabled().length, pill = $('#pill');
  if (!pill) return;
  pill.className = `status ${n ? 'ok' : 'warn'}`;
  pill.innerHTML = `${icon('plug', 15)}<span>${n ? `${n} source${n > 1 ? 's' : ''} active` : 'No sources'}</span>`;
}
