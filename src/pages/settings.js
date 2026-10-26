import { $, esc, icon } from '../util.js';
import * as store from '../store.js';
import * as mgr from '../extensions/manager.js';
import { confirmDialog, toast } from '../ui.js';
import { setSearchValue, updatePill } from '../shell.js';

const sw = (k, on) => `<label class="switch"><input type="checkbox" data-s="${k}" ${on ? 'checked' : ''}><i></i></label>`;
const row = (title, help, ctl, id = '') => `<div class="frow"><label ${id ? `for="${id}"` : ''}><b>${esc(title)}</b>${help ? `<small>${esc(help)}</small>` : ''}</label>${ctl}</div>`;

export function settingsPage() {
  setSearchValue('');
  const s = store.getSettings();
  $('#page').innerHTML = `<section class="sec narrow" style="padding-top:36px">
    <div class="sec-h"><h2>Settings</h2></div>
    <div class="card-box" id="installBox"><h2>Install app</h2>
      <p class="muted" id="installTxt"></p><div class="btns"><button class="btn primary" id="installBtn" type="button" hidden>${icon('download', 17)} Install KUMO</button></div></div>
    <div class="card-box"><h2>Playback</h2>
      ${row('Autoplay', 'Start playing as soon as an episode opens.', sw('autoPlay', s.autoPlay))}
      ${row('Auto-play next episode', 'Show a countdown at the end and continue.', sw('autoNext', s.autoNext))}
    </div>
    <div class="card-box"><h2>Catalog</h2>
      ${row('Title language', 'How anime names are shown.', `<label class="select"><select id="tl" data-s="titleLang"><option value="english" ${s.titleLang === 'english' ? 'selected' : ''}>English</option><option value="romaji" ${s.titleLang === 'romaji' ? 'selected' : ''}>Romaji</option></select>${icon('chev', 16)}</label>`, 'tl')}
      ${row('Show adult titles', 'Include 18+ entries in browse and search.', sw('showAdult', s.showAdult))}
      ${row('Prefer dubbed matches', 'When a source offers both, pick the dub automatically.', sw('preferDub', s.preferDub))}
    </div>
    <div class="card-box"><h2>CORS proxy <small class="muted">(optional)</small></h2>
      <p class="muted">Browsers block some sites from being read by web pages. If an extension fails with a network error, you can route its API requests through a proxy you run or trust. Use <code>{url}</code> where the target address goes, e.g. <code>https://my-proxy.example/?u={url}</code>. Video itself is never proxied.</p>
      <input class="inp" id="proxy" type="url" placeholder="https://my-proxy.example/?u={url}" value="${esc(s.proxy)}" aria-label="CORS proxy template">
      <p class="muted small">The proxy sees every request an extension makes, including anything it sends. Leave this empty unless you need it.</p></div>
    <div class="card-box"><h2>Your data</h2>
      <p class="muted">Everything lives in this browser: list, history, settings and installed extensions. Nothing is uploaded anywhere.</p>
      <div class="btns"><button class="btn ghost" id="exp" type="button">${icon('download', 17)} Export backup</button>
      <label class="btn ghost" for="imp">${icon('upload', 17)} Import backup</label><input id="imp" type="file" accept="application/json,.json" hidden>
      <button class="btn danger" id="reset" type="button">${icon('trash', 17)} Reset everything</button></div></div>
  </section>`;

  const paintInstall = () => {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const can = !!window.kumoInstall;
    $('#installBtn').hidden = !can;
    $('#installTxt').textContent = standalone ? 'KUMO is running as an installed app.'
      : can ? 'Add KUMO to your device so it opens in its own window, like a normal app.'
      : /iphone|ipad/i.test(navigator.userAgent) ? 'On iPhone/iPad: tap Share, then “Add to Home Screen”.'
      : 'Use your browser menu (⋮ or the install icon in the address bar) and choose “Install KUMO” or “Add to Home screen”. The install option only appears on the https:// version of the site.';
  };
  paintInstall();
  window.addEventListener('kumo:installable', paintInstall);
  $('#installBtn').onclick = async () => { const p = window.kumoInstall; if (!p) return; p.prompt(); await p.userChoice; window.kumoInstall = null; paintInstall(); };

  document.querySelector('#page').onchange = e => {
    const k = e.target.dataset.s; if (!k) return;
    store.setSetting(k, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  };
  $('#proxy').onchange = e => {
    const v = e.target.value.trim();
    if (v && (!/^https?:\/\//i.test(v) || !v.includes('{url}'))) { toast('The proxy must start with http(s):// and contain {url}'); e.target.value = store.getSettings().proxy; return; }
    store.setSetting('proxy', v); toast(v ? 'Proxy saved' : 'Proxy cleared');
  };
  $('#exp').onclick = () => {
    const blob = new Blob([JSON.stringify(store.exportAll(), null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `kumo-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('#imp').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      if (f.size > 5e6) throw new Error('That file is too large');
      const recs = store.importAll(JSON.parse(await f.text()));
      const n = await mgr.restore(recs);
      updatePill();
      toast(`Backup restored${recs.length ? ` · ${n}/${recs.length} extensions re-downloaded` : ''}`);
      location.reload();
    } catch (err) { toast(`Import failed: ${err.message}`); }
  };
  $('#reset').onclick = async () => {
    if (await confirmDialog({ title: 'Reset KUMO?', message: 'This deletes your list, history, settings and installed extensions from this browser. Export a backup first if you want to keep them.', confirm: 'Reset everything', danger: true })) {
      store.resetAll(); location.hash = '#/'; location.reload();
    }
  };
}
