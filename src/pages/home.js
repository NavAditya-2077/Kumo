import { $, $$, esc, icon, cleanDescription, artColors } from '../util.js';
import * as al from '../anilist.js';
import * as store from '../store.js';
import * as mgr from '../extensions/manager.js';
import { safeUrl } from '../extensions/validate.js';
import { posterCard, progressCard, errorBlock, skeletonRow, toast } from '../ui.js';
import { setSearchValue } from '../shell.js';

const rail = (title, items, { link = '' } = {}) => `
  <section class="sec">
    <div class="sec-h"><h2>${esc(title)}</h2>
      <span class="sec-tools">${link ? `<a href="${esc(link)}">View all →</a>` : ''}
        <button class="ib rail-btn" data-rail="-1" type="button" aria-label="Scroll left">${icon('back', 18)}</button>
        <button class="ib rail-btn" data-rail="1" type="button" aria-label="Scroll right">${icon('chevR', 18)}</button></span></div>
    <div class="rail">${items}</div>
  </section>`;

export async function homePage(ctx) {
  setSearchValue('');
  const page = $('#page');
  page.innerHTML = `<section class="hero"><div class="hero-bg skel-bg"></div></section><section class="sec">${skeletonRow(8)}</section>`;
  let data;
  try { data = await al.getHome(); }
  catch (e) { if (ctx.active()) page.innerHTML = errorBlock(e.message); return; }
  if (!ctx.active()) return;

  const cont = store.getContinue();
  const mine = store.getList();
  let featured = data.trending.filter(m => m.bannerImage).slice(0, 5);
  if (featured.length < 3) featured = data.trending.slice(0, 5);
  const noSources = !mgr.enabled().length;

  page.innerHTML = `
    <section class="hero" id="hero"></section>
    ${noSources ? `<section class="sec"><div class="banner">
      <div class="bi">${icon('plug', 26)}</div>
      <div><b>Add a source to start watching</b><p>KUMO is a catalog and player. Install an extension and it will find the episodes. You can try the built-in demo first.</p></div>
      <a class="btn primary sm" href="#/extensions?tab=browse">Browse extensions</a></div></section>` : ''}
    ${cont.length ? rail('Continue Watching', cont.map(p => progressCard(p)).join(''), { link: '#/history' }).replace('class="rail"', 'class="rail wide"') : ''}
    ${mine.length ? rail('My List', mine.map(s => posterCard({ id: s.id, title: s.title, cover: s.cover, color: s.color, badge: (al.FORMAT_LABEL[s.format] || '').toUpperCase(), score: s.score, sub: [al.FORMAT_LABEL[s.format], s.year].filter(Boolean).join(' · ') })).join(''), { link: '#/mylist' }) : ''}
    <div class="chips" aria-label="Genres">${al.GENRES.slice(0, 12).map(g => `<a class="chip" href="#/browse?genre=${encodeURIComponent(g)}">${esc(g)}</a>`).join('')}</div>
    ${rail('Trending Now', data.trending.map(m => posterCard(al.toCard(m))).join(''), { link: '#/browse?sort=TRENDING_DESC' })}
    ${rail(`Popular This Season · ${data.seasonLabel}`, data.season.map(m => posterCard(al.toCard(m))).join(''), { link: `#/browse?season=${al.currentSeason().season}&year=${al.currentSeason().year}&sort=POPULARITY_DESC` })}
    ${rail('Top Rated', data.top.map(m => posterCard(al.toCard(m))).join(''), { link: '#/browse?sort=SCORE_DESC' })}`;

  $$('[data-rail]', page).forEach(b => {
    b.onclick = () => { const r = b.closest('.sec').querySelector('.rail'); r.scrollBy({ left: Number(b.dataset.rail) * r.clientWidth * 0.8, behavior: 'smooth' }); };
  });

  // ---- hero carousel
  const hero = $('#hero');
  let idx = 0, timer;
  const draw = () => {
    const m = featured[idx];
    const [c1, c2] = artColors(String(m.id), m.coverImage?.color);
    const title = al.titleOf(m);
    const resume = cont.find(c => c.mid === m.id);
    const target = resume ? `#/watch/${m.id}/${resume.ep}${resume.ext ? `?src=${encodeURIComponent(resume.ext)}` : ''}` : `#/watch/${m.id}/1`;
    const banner = safeUrl(m.bannerImage);
    const desc = cleanDescription(m.description);
    const meta = [m.seasonYear, al.FORMAT_LABEL[m.format], m.format !== 'MOVIE' && m.episodes ? `${m.episodes} episodes` : '',
      m.averageScore ? `<span class="score">★ ${(m.averageScore / 10).toFixed(1)}</span>` : '', (m.genres || []).slice(0, 3).map(esc).join(' · ')]
      .filter(Boolean).map(x => `<span>${typeof x === 'number' ? x : x}</span>`).join('');
    hero.style.setProperty('--c1', c1); hero.style.setProperty('--c2', c2);
    hero.innerHTML = `
      <div class="hero-bg">${banner ? `<img src="${esc(banner)}" alt="">` : ''}<div class="glow"></div></div>
      <div class="hero-c">
        <span class="tag">${resume ? 'Continue watching' : `Trending #${idx + 1}`}</span>
        <h1>${esc(title)}</h1>
        <div class="meta">${meta}</div>
        ${desc ? `<p class="syn">${esc(desc)}</p>` : ''}
        <div class="btns">
          <a class="btn primary" href="${esc(target)}">${icon('play', 18)} ${resume ? `Resume Episode ${resume.ep}` : m.format === 'MOVIE' ? 'Play' : 'Play Episode 1'}</a>
          <button class="btn ghost" data-list type="button">${icon(store.inList(m.id) ? 'check' : 'plus', 18)} My List</button>
          <a class="btn ghost round" href="#/anime/${m.id}" aria-label="Details">${icon('info', 20)}</a>
        </div>
      </div>
      ${featured.length > 1 ? `<div class="dots">${featured.map((_, i) => `<i class="${i === idx ? 'on' : ''}" data-dot="${i}"></i>`).join('')}</div>` : ''}`;
    $$('[data-dot]', hero).forEach(d => { d.onclick = () => { idx = Number(d.dataset.dot); draw(); restart(); }; });
    $('[data-list]', hero).onclick = () => { toast(store.toggleList(al.snap(m)) ? 'Added to My List' : 'Removed from My List'); draw(); };
  };
  const restart = () => { clearInterval(timer); if (featured.length > 1) timer = setInterval(() => { idx = (idx + 1) % featured.length; draw(); }, 9000); };
  draw(); restart();
  ctx.onLeave(() => clearInterval(timer));
}
