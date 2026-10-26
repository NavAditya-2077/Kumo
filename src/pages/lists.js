import { $, esc, icon, fmtAgo } from '../util.js';
import * as al from '../anilist.js';
import * as store from '../store.js';
import { posterCard, progressCard, confirmDialog, toast } from '../ui.js';
import { render } from '../router.js';
import { setSearchValue } from '../shell.js';

export function myListPage() {
  setSearchValue('');
  const items = store.getList();
  $('#page').innerHTML = `<section class="sec" style="padding-top:36px">
    <div class="sec-h"><h2>My List</h2><span class="muted">${items.length} title${items.length === 1 ? '' : 's'}</span></div>
    ${items.length ? `<div class="grid-p">${items.map(s => posterCard({
      id: s.id, title: s.title, cover: s.cover, color: s.color, score: s.score,
      badge: (al.FORMAT_LABEL[s.format] || '').toUpperCase(), sub: [al.FORMAT_LABEL[s.format], s.year].filter(Boolean).join(' · ')
    })).join('')}</div>`
      : `<div class="empty small"><div class="eico">${icon('bookmark', 28)}</div><p>Nothing here yet. Press “My List” on any title to save it.</p><a class="btn primary sm" href="#/browse">Browse anime</a></div>`}
  </section>`;
}

export function historyPage() {
  setSearchValue('');
  const items = store.getHistory();
  $('#page').innerHTML = `<section class="sec" style="padding-top:36px">
    <div class="sec-h"><h2>Watch History</h2>${items.length ? `<button class="btn sm ghost" id="clear" type="button">${icon('trash', 16)} Clear history</button>` : ''}</div>
    ${items.length ? `<div class="grid-ep">${items.map(p => progressCard(p, { ago: fmtAgo(p.at) })).join('')}</div>`
      : `<div class="empty small"><div class="eico">${icon('clock', 28)}</div><p>Nothing watched yet. Your progress is saved in this browser as you watch.</p><a class="btn primary sm" href="#/">Find something to watch</a></div>`}
  </section>`;
  const clear = $('#clear');
  if (clear) clear.onclick = async () => {
    if (await confirmDialog({ title: 'Clear watch history?', message: 'This removes your watch progress and “Continue Watching”. My List is kept.', confirm: 'Clear', danger: true })) {
      store.clearHistory(); toast('History cleared'); render({ keepScroll: true });
    }
  };
}
