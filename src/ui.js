// Reusable UI pieces: artwork, cards, toast, modal, error and loading states.

import { $, esc, icon, artColors } from './util.js';
import { safeUrl } from './extensions/validate.js';

/** Poster/thumbnail with a generated gradient underneath (shown while the image loads, or if it fails). */
export function art({ title = '', cover = '', color = '', seed = '', cls = '', inner = '', shade = true, initial = true, pos = '' } = {}) {
  const [c1, c2] = artColors(seed || title, color);
  const url = safeUrl(cover);
  return `<div class="art ${cls}" style="--c1:${esc(c1)};--c2:${esc(c2)}">${
    url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async" ${pos ? `style="object-position:${esc(pos)}"` : ''}>`
        : initial ? `<span class="initial">${esc((title.trim()[0] || '?').toUpperCase())}</span>` : ''
  }${shade ? '<span class="shade"></span>' : ''}${inner}</div>`;
}

/** card: { id, title, cover, color, badge, sub, score } (see anilist.toCard) */
export const posterCard = c => `<a class="card p" href="#/anime/${esc(c.id)}">${art({
  title: c.title, cover: c.cover, color: c.color,
  inner: `${c.badge ? `<span class="badge">${esc(c.badge)}</span>` : ''}${c.score ? `<span class="rate">★ ${esc(c.score)}</span>` : ''}`
})}<h3>${esc(c.title)}</h3><p>${esc(c.sub || '')}</p></a>`;

/** Watch-progress entry (from store.getContinue / getHistory) as a wide card. */
export function progressCard(p, { ago = '' } = {}) {
  const pct = p.d ? Math.min(100, Math.round(p.t / p.d * 100)) : 0;
  const left = p.d ? Math.max(1, Math.round((p.d - p.t) / 60)) : 0;
  const href = `#/watch/${p.mid}/${p.ep}${p.ext ? `?src=${encodeURIComponent(p.ext)}` : ''}`;
  return `<a class="card e" href="${esc(href)}">${art({
    title: p.title, cover: p.cover, color: p.color, pos: 'center 25%',
    inner: `<span class="badge">EP ${esc(p.ep)}</span><span class="pbtn">${icon('play', 18)}</span>${p.d ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ''}`
  })}<h3>${esc(p.title)}</h3><p>${esc(p.next ? `Up next: Episode ${p.ep}` : `Episode ${p.ep}${left ? ` · ${left} min left` : ''}`)}${ago ? ` · ${esc(ago)}` : ''}</p></a>`;
}

export function errorBlock(message, { retry = true } = {}) {
  return `<div class="empty"><div class="eico">${icon('warning', 30)}</div><h1>Something went wrong</h1><p>${esc(message)}</p>${retry ? `<button class="btn primary" data-retry type="button">${icon('refresh', 18)} Try again</button>` : ''}</div>`;
}
export const skeletonRow = (n = 7) => `<div class="grid-p">${'<div class="skel sk-p"></div>'.repeat(n)}</div>`;

// ---------------------------------------------------------------- toast
let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ---------------------------------------------------------------- modal
/** actions: [{ label, primary, danger, close:false, onClick(close, button) }]. onClick may return false to keep the modal open. */
export function openModal({ title, body = '', actions = [], wide = false, onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2><button class="ib" data-close type="button" aria-label="Close">${icon('x', 20)}</button></header>
    <div class="modal-body"></div><footer></footer></div>`;
  const bodyEl = $('.modal-body', back);
  if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.append(body);
  const foot = $('footer', back);
  const prevFocus = document.activeElement;
  let closed = false;
  const onKey = e => { if (e.key === 'Escape') close(); };
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    back.remove();
    if (!$('.modal-back')) document.body.classList.remove('modal-open');
    prevFocus?.focus?.();
    onClose?.();
  }
  actions.forEach(a => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn sm ${a.primary ? 'primary' : a.danger ? 'danger' : 'ghost'}`;
    b.textContent = a.label;
    b.onclick = async () => {
      if (a.onClick) { const r = await a.onClick(close, b); if (r === false) return; }
      if (a.close !== false) close();
    };
    foot.append(b);
  });
  if (!actions.length) foot.remove();
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  $('[data-close]', back).onclick = close;
  document.addEventListener('keydown', onKey);
  $('#modal-root').append(back);
  document.body.classList.add('modal-open');
  ($('input,select,button.primary,[data-close]', back))?.focus();
  return { close, el: back, body: bodyEl };
}

export function confirmDialog({ title, message, confirm = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    let answered = false;
    openModal({
      title, body: `<p class="muted">${esc(message)}</p>`,
      actions: [
        { label: 'Cancel', onClick: () => { answered = true; resolve(false); } },
        { label: confirm, primary: !danger, danger, onClick: () => { answered = true; resolve(true); } }
      ],
      onClose: () => { if (!answered) resolve(false); }
    });
  });
}
