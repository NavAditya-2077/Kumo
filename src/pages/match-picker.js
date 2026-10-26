// "Which title on this source is the anime I'm looking at?" dialog.

import { $, esc, icon } from '../util.js';
import { openModal, art } from '../ui.js';
import * as al from '../anilist.js';
import * as mgr from '../extensions/manager.js';
import { searchCandidates } from '../extensions/resolver.js';

/** onPick(candidate) fires with the chosen search result; onDismiss() if the dialog is closed without choosing. */
export function openMatchPicker({ media, extId, candidates, onPick, onDismiss }) {
  const extName = mgr.get(extId)?.manifest.name || 'this source';
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="muted">KUMO isn't sure which title on <b>${esc(extName)}</b> is <b>${esc(al.titleOf(media))}</b>. Choose the right one, or search again with different words.</p>
    <form class="mp-search"><input type="search" value="${esc(al.titleOf(media))}" aria-label="Search ${esc(extName)}"><button class="btn sm ghost" type="submit">${icon('search', 16)} Search</button></form>
    <div class="mp-list" aria-live="polite"></div>`;
  const list = $('.mp-list', wrap);
  let picked = false, modal;

  const draw = (items, empty = 'No results. Try different words above.') => {
    list.innerHTML = items.length ? items.map((c, i) => `
      <button type="button" class="mp-item" data-i="${i}">
        ${art({ title: c.title, cover: c.cover, cls: 'mp-art', shade: false })}
        <span class="mp-t"><b>${esc(c.title)}</b><small>${[c.variant, c.year].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</small></span>
        <span class="mp-s" title="How closely the title matches">${Math.round(c.score * 100)}%</span>
      </button>`).join('') : `<p class="muted">${esc(empty)}</p>`;
    list.querySelectorAll('.mp-item').forEach(b => {
      b.onclick = () => { picked = true; modal.close(); onPick(items[Number(b.dataset.i)]); };
    });
  };
  draw(candidates);

  $('form', wrap).onsubmit = async e => {
    e.preventDefault();
    const q = $('input', wrap).value.trim();
    if (!q) return;
    list.innerHTML = '<p class="muted">Searching…</p>';
    try { draw(await searchCandidates(extId, media, q)); }
    catch (err) { list.innerHTML = `<p class="muted">Search failed: ${esc(err.message)}</p>`; }
  };

  modal = openModal({ title: 'Which title is this?', body: wrap, wide: true, onClose: () => { if (!picked) onDismiss?.(); } });
  return modal;
}
