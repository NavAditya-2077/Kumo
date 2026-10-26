// The watch page: player top-left, title + description below it, episodes / recommendations on the right.

import { $, $$, esc, icon, cleanDescription } from '../util.js';
import * as al from '../anilist.js';
import * as store from '../store.js';
import * as mgr from '../extensions/manager.js';
import * as res from '../extensions/resolver.js';
import { Player } from '../player.js';
import { art, errorBlock, toast } from '../ui.js';
import { navigate } from '../router.js';
import { setSearchValue } from '../shell.js';
import { openMatchPicker } from './match-picker.js';

export async function watchPage(ctx) {
  setSearchValue('');
  const page = $('#page');
  const mid = Number(ctx.params.id), ep = Number(ctx.params.ep);
  if (!Number.isInteger(mid) || mid <= 0 || !Number.isInteger(ep) || ep <= 0) { page.innerHTML = errorBlock('That watch link is not valid.', { retry: false }); return; }

  page.innerHTML = `<div class="watch"><div class="w-player"><div class="video skel-bg"></div></div><div class="w-info"><div class="skel sk-line"></div></div><aside class="w-side"><div class="skel sk-line"></div></aside></div>`;
  let media;
  try { media = await al.getMedia(mid); }
  catch (e) { if (ctx.active()) page.innerHTML = errorBlock(e.message); return; }
  if (!ctx.active()) return;
  if (!media) { page.innerHTML = errorBlock('Anime not found.', { retry: false }); return; }

  const settings = store.getSettings();
  const title = al.titleOf(media), snap = al.snap(media), total = al.airedCount(media);
  const exts = mgr.enabled();
  let extId = ctx.query.get('src') || '';
  if (!exts.some(e => e.id === extId)) extId = exts.some(e => e.id === settings.defaultExt) ? settings.defaultExt : exts[0]?.id || '';
  const srcQ = extId ? `?src=${encodeURIComponent(extId)}` : '';
  const epHref = n => `#/watch/${mid}/${n}${srcQ}`;
  const recs = al.recommendationsOf(media);
  const desc = cleanDescription(media.description);
  const prog = store.getSeriesProgress(mid);
  const isMovie = media.format === 'MOVIE';

  let epList = null;                       // episodes reported by the extension (once known)
  let tab = 'all';
  let player = null;
  ctx.onLeave(() => { player?.destroy(); player = null; });

  // ------------------------------------------------------------ static layout
  page.innerHTML = `
    <div class="watch ${settings.theater ? 'theater' : ''}" id="watch">
      <div class="w-player"><div class="video" id="video"></div></div>
      <div class="w-info">
        <h1 id="wt"></h1>
        <div class="w-line">
          <a class="w-show" href="#/anime/${mid}">${esc(title)}</a>
          <span class="muted" id="wsub"></span>
        </div>
        <div class="w-actions">
          <button class="chip-btn" id="prev" type="button">${icon('prev', 16)} Previous</button>
          <button class="chip-btn" id="next" type="button">Next ${icon('next', 16)}</button>
          <button class="chip-btn" id="list" type="button"></button>
          <label class="select inline" title="Source">${icon('plug', 15)}<select id="src" aria-label="Source">${exts.map(e => `<option value="${esc(e.id)}" ${e.id === extId ? 'selected' : ''}>${esc(e.manifest.name)}</option>`).join('')}${exts.length ? '' : '<option>No sources</option>'}</select>${icon('chev', 14)}</label>
          <button class="chip-btn" id="wrong" type="button" ${extId ? '' : 'disabled'} title="Pick a different title on this source">${icon('refresh', 15)} Wrong title?</button>
        </div>
        <div class="desc" id="desc">
          <div class="desc-meta">${[media.seasonYear, al.FORMAT_LABEL[media.format], media.averageScore ? `★ ${(media.averageScore / 10).toFixed(1)}` : '', media.studios?.nodes?.[0]?.name].filter(Boolean).map(esc).join(' · ')}</div>
          <p class="desc-t">${esc(desc || 'No description available.')}</p>
          <div class="desc-g">${(media.genres || []).map(g => `<a class="chip sm" href="#/browse?genre=${encodeURIComponent(g)}">${esc(g)}</a>`).join('')}</div>
          ${desc.length > 260 ? '<button class="more" id="descMore" type="button">Show more</button>' : ''}
        </div>
      </div>
      <aside class="w-side" aria-label="Episodes and recommendations">
        <div class="chips tabs-s" role="tablist">
          ${isMovie ? '' : '<button class="chip on" data-tab="all" type="button">All</button><button class="chip" data-tab="eps" type="button">Episodes</button>'}
          <button class="chip ${isMovie ? 'on' : ''}" data-tab="rec" type="button">Recommended</button>
        </div>
        <div class="s-list" id="side"></div>
      </aside>
    </div>`;
  if (isMovie) tab = 'rec';

  $('#wt').textContent = isMovie ? title : `Episode ${ep}`;
  $('#wsub').textContent = isMovie ? '' : `${media.format ? al.FORMAT_LABEL[media.format] : ''}`;
  const paintList = () => { const b = $('#list'); b.innerHTML = `${icon(store.inList(mid) ? 'check' : 'plus', 16)} ${store.inList(mid) ? 'In list' : 'My List'}`; };
  paintList();
  $('#list').onclick = () => { toast(store.toggleList(snap) ? 'Added to My List' : 'Removed from My List'); paintList(); };
  const dm = $('#descMore');
  if (dm) dm.onclick = () => { const d = $('#desc').classList.toggle('open'); dm.textContent = d ? 'Show less' : 'Show more'; };
  $('#prev').disabled = ep <= 1 || isMovie;
  $('#next').disabled = (total && ep >= total) || isMovie;
  $('#prev').onclick = () => navigate(epHref(ep - 1));
  $('#next').onclick = () => navigate(epHref(ep + 1));
  $('#src').onchange = e => { if (exts.length) navigate(`#/watch/${mid}/${ep}?src=${encodeURIComponent(e.target.value)}`); };
  $('#wrong').onclick = async () => {
    try {
      const r = await res.resolve(extId, media, { force: true });
      openMatchPicker({
        media, extId, candidates: r.candidates || await res.searchCandidates(extId, media),
        onPick: c => { res.chooseMatch(mid, extId, c); navigate(`#/watch/${mid}/${ep}${srcQ}`); }
      });
    } catch (e) { toast(`Couldn't search this source: ${e.message}`); }
  };

  // ------------------------------------------------------------ sidebar
  const epItem = (n, label, thumb) => {
    const p = prog[n], pct = p?.d ? Math.min(100, Math.round(p.t / p.d * 100)) : 0;
    return `<a class="s-item ${n === ep ? 'now' : ''}" href="${esc(epHref(n))}" ${n === ep ? 'aria-current="true"' : ''}>
      ${art({ title: `Ep ${n}`, cover: thumb || media.bannerImage || media.coverImage?.large, color: media.coverImage?.color, cls: 's-art', pos: 'center 25%', initial: false, shade: false,
        inner: `${pct ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ''}${n === ep ? `<span class="nowp">${icon('play', 14)}</span>` : ''}`})}
      <span class="s-t"><b>${esc(label || `Episode ${n}`)}</b><small>${n === ep ? 'Now playing' : `Episode ${n}${store.isFinished(p) ? ' · Watched' : pct ? ` · ${pct}%` : ''}`}</small></span></a>`;
  };
  const recItem = r => { const c = al.toCard(r); return `<a class="s-item" href="#/anime/${esc(c.id)}">${art({ title: c.title, cover: r.coverImage?.large, color: c.color, cls: 's-art poster', shade: false })}
      <span class="s-t"><b>${esc(c.title)}</b><small>${esc(c.sub)}${c.score ? ` · ★ ${esc(c.score)}` : ''}</small></span></a>`; };
  const paintSide = () => {
    const list = epList || Array.from({ length: total }, (_, i) => ({ number: i + 1 }));
    const nums = list.map(e => e.number);
    const items = n => { const e = list.find(x => x.number === n); return epItem(n, e?.title, e?.thumbnail); };
    let html = '';
    if (tab === 'eps') html = nums.map(items).join('');
    else if (tab === 'rec') html = recs.map(recItem).join('');
    else {
      const upcoming = nums.filter(n => n >= ep).slice(0, 6);
      html = upcoming.map(items).join('') + (upcoming.length && recs.length ? '<div class="s-div">Recommended</div>' : '') + recs.map(recItem).join('');
    }
    $('#side').innerHTML = html || '<p class="muted pad">Nothing to show yet.</p>';
    $$('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'eps') $('#side .now')?.scrollIntoView({ block: 'nearest' });
  };
  $$('[data-tab]').forEach(b => { b.onclick = () => { tab = b.dataset.tab; paintSide(); }; });
  paintSide();

  // ------------------------------------------------------------ player area
  const box = $('#video');
  const say = (headline, text, buttons = '') => {
    box.innerHTML = `<div class="pmsg"><div class="eico">${icon('plug', 28)}</div><h2>${esc(headline)}</h2><p>${esc(text)}</p><div class="vbtns">${buttons}</div></div>`;
  };
  const loading = text => { box.innerHTML = `<div class="pmsg"><div class="spin on"></div><p>${esc(text)}</p></div>`; };

  if (!extId) {
    say('No source installed', 'KUMO finds episodes through extensions. Install one (there is a demo you can try) and this page will play.',
      '<a class="btn primary sm" href="#/extensions?tab=browse">Browse extensions</a>');
    return;
  }
  const extName = mgr.get(extId).manifest.name;
  const retryBtn = '<button class="btn primary sm" data-act="retry" type="button">Try again</button>';
  const wire = () => { const r = box.querySelector('[data-act="retry"]'); if (r) r.onclick = () => navigate(`#/watch/${mid}/${ep}${srcQ}`, { replace: true }); };
  const fail = (headline, e, extra = '') => { if (!ctx.active()) return; say(headline, e.message || String(e), `${retryBtn}${extra}`); wire(); };

  loading(`Looking for this anime on ${extName}…`);
  let match;
  try {
    const r = await res.resolve(extId, media);
    if (!ctx.active()) return;
    if (r.match) match = r.match;
    else if (!r.candidates.length) {
      say('Not found on this source', `${extName} has no result for “${title}”. Search it by hand or try another source.`, '<button class="btn primary sm" data-act="pick" type="button">Search manually</button>');
      box.querySelector('[data-act="pick"]').onclick = () => openMatchPicker({ media, extId, candidates: [], onPick: c => { res.chooseMatch(mid, extId, c); navigate(`#/watch/${mid}/${ep}${srcQ}`, { replace: true }); } });
      return;
    } else {
      say('Pick the right title', `${extName} returned several possible matches for “${title}”.`, '<button class="btn primary sm" data-act="pick" type="button">Choose title</button>');
      const open = () => openMatchPicker({ media, extId, candidates: r.candidates, onPick: c => { res.chooseMatch(mid, extId, c); navigate(`#/watch/${mid}/${ep}${srcQ}`, { replace: true }); } });
      box.querySelector('[data-act="pick"]').onclick = open;
      open();
      return;
    }
  } catch (e) { return fail(`${extName} couldn't search`, e); }

  loading('Loading episodes…');
  let episode;
  try {
    epList = await res.getEpisodes(extId, match);
    if (!ctx.active()) return;
    paintSide();
    episode = epList.find(e => e.number === ep) || (isMovie ? epList[0] : null);
    if (!episode) return say('Episode not available', `${extName} doesn't list episode ${ep} of “${match.title}”.`, '<a class="btn ghost sm" href="#/anime/' + mid + '">Back to episodes</a>');
  } catch (e) { return fail('Couldn\'t load episodes', e); }

  const label = episode.title ? `Episode ${ep} · ${episode.title}` : isMovie ? title : `Episode ${ep}`;
  $('#wt').textContent = episode.title && !isMovie ? `${episode.title}` : isMovie ? title : `Episode ${ep}`;
  $('#wsub').textContent = isMovie ? '' : `Episode ${ep}${episode.filler ? ' · filler' : ''} · via ${extName}`;
  document.title = `${label} – ${title} · KUMO`;
  ctx.onLeave(() => { document.title = 'KUMO'; });

  loading('Getting the video…');
  let streams;
  try { streams = await res.getStreams(extId, match, episode); }
  catch (e) { return fail('Couldn\'t get the video', e); }
  if (!ctx.active()) return;

  const lastEp = Math.max(...epList.map(e => e.number));
  const hasNext = !isMovie && epList.some(e => e.number > ep);
  $('#next').disabled = !hasNext;
  const goNext = () => { const n = epList.map(e => e.number).filter(x => x > ep).sort((a, b) => a - b)[0]; if (n) navigate(epHref(n)); };
  box.innerHTML = '';
  player = new Player(box, {
    hasNext, theater: !!settings.theater, onNext: goNext,
    onTheater: on => { store.setSetting('theater', on); $('#watch').classList.toggle('theater', on); },
    onMessage: toast,
    onProgress: ({ t, d }) => store.saveProgress({ ...snap, eps: Math.max(total, lastEp) }, ep, { t, d, ext: extId }),
    onEnded: () => { if (hasNext && store.getSettings().autoNext) player.showUpNext({ label: `Episode ${ep + 1}`, seconds: 8 }, goNext); }
  });
  const saved = store.getProgress(mid, ep);
  const startAt = saved && !store.isFinished(saved) && saved.t > 3 ? saved.t : 0;
  player.load({ sources: streams.sources, subtitles: streams.subtitles, intro: streams.intro, startAt, autoplay: settings.autoPlay });
}
