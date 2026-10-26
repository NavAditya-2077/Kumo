import { $, esc, icon } from '../util.js';
import * as al from '../anilist.js';
import { posterCard, errorBlock, skeletonRow } from '../ui.js';
import { navigate } from '../router.js';
import { setSearchValue } from '../shell.js';

const SORTS = [['', 'Best match'], ['TRENDING_DESC', 'Trending'], ['POPULARITY_DESC', 'Popular'], ['SCORE_DESC', 'Top rated'], ['START_DATE_DESC', 'Newest']];
const FORMATS = [['', 'Any format'], ['TV', 'TV'], ['MOVIE', 'Movie'], ['OVA', 'OVA'], ['ONA', 'ONA'], ['SPECIAL', 'Special']];
const STATUSES = [['', 'Any status'], ['RELEASING', 'Airing'], ['FINISHED', 'Finished'], ['NOT_YET_RELEASED', 'Upcoming']];

const opts = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('');

export async function browsePage(ctx) {
  const page = $('#page');
  const f = {};
  for (const k of ['q', 'genre', 'year', 'season', 'format', 'status', 'sort']) f[k] = ctx.query.get(k) || '';
  setSearchValue(f.q);
  const thisYear = new Date().getFullYear();
  const years = [['', 'Any year'], ...Array.from({ length: thisYear + 2 - 1985 }, (_, i) => [String(thisYear + 1 - i), String(thisYear + 1 - i)])];

  page.innerHTML = `
    <section class="sec" style="padding-top:36px">
      <div class="sec-h"><h2>${f.q ? `Results for “${esc(f.q)}”` : f.genre ? esc(f.genre) : 'Browse'}</h2></div>
      <form class="filters" id="filters">
        <label class="select"><select data-f="genre" aria-label="Genre"><option value="">Any genre</option>${al.GENRES.map(g => `<option ${g === f.genre ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>${icon('chev', 16)}</label>
        <label class="select"><select data-f="year" aria-label="Year">${opts(years, f.year)}</select>${icon('chev', 16)}</label>
        <label class="select"><select data-f="season" aria-label="Season">${opts([['', 'Any season'], ...al.SEASONS.map(s => [s, s[0] + s.slice(1).toLowerCase()])], f.season)}</select>${icon('chev', 16)}</label>
        <label class="select"><select data-f="format" aria-label="Format">${opts(FORMATS, f.format)}</select>${icon('chev', 16)}</label>
        <label class="select"><select data-f="status" aria-label="Status">${opts(STATUSES, f.status)}</select>${icon('chev', 16)}</label>
        <label class="select"><select data-f="sort" aria-label="Sort">${opts(SORTS, f.sort)}</select>${icon('chev', 16)}</label>
      </form>
      <div id="results">${skeletonRow(12)}</div>
      <div class="more-wrap" id="more"></div>
    </section>`;

  $('#filters').addEventListener('change', e => {
    const k = e.target.dataset.f;
    if (!k) return;
    const next = { ...f, [k]: e.target.value };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v)).toString();
    navigate(`#/browse${qs ? '?' + qs : ''}`, { replace: true });
  });

  let pageNo = 1;
  const results = $('#results'), more = $('#more');
  const load = async first => {
    let r;
    try { r = await al.search({ ...f, page: pageNo }); }
    catch (e) { if (ctx.active()) { results.innerHTML = errorBlock(e.message); more.innerHTML = ''; } return; }
    if (!ctx.active()) return;
    const html = r.items.map(m => posterCard(al.toCard(m))).join('');
    if (first) results.innerHTML = html ? `<div class="grid-p" id="grid">${html}</div>` : `<div class="empty small"><p>No anime found. Try fewer filters or different words.</p></div>`;
    else $('#grid').insertAdjacentHTML('beforeend', html);
    more.innerHTML = r.hasNext ? `<button class="btn ghost" id="moreBtn" type="button">Load more</button>` : '';
    const mb = $('#moreBtn');
    if (mb) mb.onclick = async () => { mb.disabled = true; mb.textContent = 'Loading…'; pageNo++; await load(false); };
  };
  await load(true);
}
