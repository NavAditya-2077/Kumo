import { $, $$, esc, icon, cleanDescription, artColors } from '../util.js';
import * as al from '../anilist.js';
import * as store from '../store.js';
import { safeUrl } from '../extensions/validate.js';
import { art, posterCard, errorBlock, toast } from '../ui.js';
import { setSearchValue } from '../shell.js';

const SHOW = 24;

export async function detailsPage(ctx) {
  setSearchValue('');
  const page = $('#page');
  page.innerHTML = `<section class="hero short"><div class="hero-bg skel-bg"></div></section>`;
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id <= 0) { page.innerHTML = errorBlock('That anime link is not valid.', { retry: false }); return; }
  let m;
  try { m = await al.getMedia(id); }
  catch (e) { if (ctx.active()) page.innerHTML = errorBlock(e.message); return; }
  if (!ctx.active()) return;
  if (!m) { page.innerHTML = errorBlock('Anime not found.', { retry: false }); return; }

  const title = al.titleOf(m), snap = al.snap(m);
  const [c1, c2] = artColors(String(m.id), m.coverImage?.color);
  const total = al.airedCount(m);
  const prog = store.getSeriesProgress(m.id);
  const last = Object.values(prog).sort((a, b) => b.at - a.at)[0];
  let resumeEp = 1, resumeExt = '';
  if (last) {
    const fin = store.isFinished(last);
    resumeEp = fin && last.ep < total ? last.ep + 1 : last.ep;
    resumeExt = last.ext || '';
  }
  const watchHref = ep => `#/watch/${m.id}/${ep}${resumeExt ? `?src=${encodeURIComponent(resumeExt)}` : ''}`;
  const banner = safeUrl(m.bannerImage);
  const desc = cleanDescription(m.description);
  const studio = m.studios?.nodes?.[0]?.name;
  const facts = [
    ['Format', al.FORMAT_LABEL[m.format]], ['Status', al.STATUS_LABEL[m.status]],
    ['Episodes', m.format === 'MOVIE' ? '' : m.episodes || (total ? `${total}+` : '')], ['Duration', m.duration ? `${m.duration} min` : ''],
    ['Season', m.season && m.seasonYear ? `${m.season[0]}${m.season.slice(1).toLowerCase()} ${m.seasonYear}` : m.seasonYear || ''], ['Studio', studio]
  ].filter(([, v]) => v);
  const rels = al.relationsOf(m), recs = al.recommendationsOf(m);
  const thumbs = new Map((m.streamingEpisodes || []).map(e => [Number((/(?:episode|ep\.?)\s*(\d+)/i.exec(e.title || '') || [])[1]), e]).filter(([k]) => k));
  const nextAir = m.nextAiringEpisode ? new Date(m.nextAiringEpisode.airingAt * 1000) : null;

  page.innerHTML = `
    <section class="hero short" style="--c1:${esc(c1)};--c2:${esc(c2)}">
      <div class="hero-bg">${banner ? `<img src="${esc(banner)}" alt="">` : ''}<div class="glow"></div></div>
    </section>
    <section class="sec det">
      <div class="det-top">
        ${art({ title, cover: m.coverImage?.extraLarge || m.coverImage?.large, color: m.coverImage?.color, cls: 'det-poster', shade: false })}
        <div class="det-main">
          <h1>${esc(title)}</h1>
          ${m.title?.native ? `<p class="alt">${esc(m.title.native)}</p>` : ''}
          <div class="meta">${[m.seasonYear, al.FORMAT_LABEL[m.format], m.averageScore ? `<span class="score">★ ${(m.averageScore / 10).toFixed(1)}</span>` : ''].filter(Boolean).map(x => `<span>${x}</span>`).join('')}</div>
          <div class="genres">${(m.genres || []).map(g => `<a class="chip sm" href="#/browse?genre=${encodeURIComponent(g)}">${esc(g)}</a>`).join('')}</div>
          <div class="btns">
            ${total ? `<a class="btn primary" href="${esc(watchHref(resumeEp))}">${icon('play', 18)} ${last ? `Resume Episode ${resumeEp}` : m.format === 'MOVIE' ? 'Play' : 'Play Episode 1'}</a>` : `<span class="btn ghost" aria-disabled="true">Not released yet</span>`}
            <button class="btn ghost" id="list" type="button"></button>
            ${m.trailer?.site === 'youtube' && /^[\w-]{6,20}$/.test(m.trailer.id) ? `<a class="btn ghost" target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/watch?v=${esc(m.trailer.id)}">${icon('external', 17)} Trailer</a>` : ''}
          </div>
          ${nextAir ? `<p class="muted">Episode ${m.nextAiringEpisode.episode} airs ${esc(nextAir.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}</p>` : ''}
          ${desc ? `<p class="syn full">${esc(desc)}</p>` : ''}
          <dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        </div>
      </div>
    </section>
    ${total && m.format !== 'MOVIE' ? `<section class="sec"><div class="sec-h"><h2>Episodes</h2><span class="muted">${total} available</span></div><div class="eps" id="eps"></div><div class="more-wrap" id="epmore"></div></section>` : ''}
    ${rels.length ? `<section class="sec"><div class="sec-h"><h2>Related</h2></div><div class="grid-p">${rels.map(r => posterCard({ ...al.toCard(r.media), sub: r.type })).join('')}</div></section>` : ''}
    ${recs.length ? `<section class="sec"><div class="sec-h"><h2>You might also like</h2></div><div class="grid-p">${recs.slice(0, 12).map(r => posterCard(al.toCard(r))).join('')}</div></section>` : ''}`;

  const listBtn = $('#list');
  const paintList = () => { listBtn.innerHTML = `${icon(store.inList(m.id) ? 'check' : 'plus', 18)} ${store.inList(m.id) ? 'In My List' : 'My List'}`; };
  paintList();
  listBtn.onclick = () => { toast(store.toggleList(snap) ? 'Added to My List' : 'Removed from My List'); paintList(); };

  const eps = $('#eps');
  if (eps) {
    let shown = 0;
    const more = $('#epmore');
    const addMore = () => {
      const end = Math.min(total, shown + SHOW);
      let html = '';
      for (let n = shown + 1; n <= end; n++) {
        const p = prog[n], pct = p?.d ? Math.min(100, Math.round(p.t / p.d * 100)) : 0, th = thumbs.get(n);
        html += `<a class="ep" href="${esc(watchHref(n))}">
          ${art({ title: `Ep ${n}`, cover: th?.thumbnail || m.bannerImage || m.coverImage?.large, color: m.coverImage?.color, cls: 'ep-art', pos: 'center 25%', initial: false,
            inner: `<span class="pbtn">${icon('play', 16)}</span>${pct ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ''}` })}
          <span class="ep-t"><b>Episode ${n}</b><small>${esc((th?.title || '').replace(/^episode\s*\d+\s*[-–:]\s*/i, '') || (store.isFinished(p) ? 'Watched' : pct ? `${pct}% watched` : ''))}</small></span>
          ${store.isFinished(p) ? `<span class="done" title="Watched">${icon('check', 16)}</span>` : ''}</a>`;
      }
      eps.insertAdjacentHTML('beforeend', html);
      shown = end;
      more.innerHTML = shown < total ? `<button class="btn ghost" id="epMoreBtn" type="button">Show more (${total - shown} left)</button>` : '';
      const b = $('#epMoreBtn');
      if (b) b.onclick = addMore;
    };
    addMore();
  }
}
