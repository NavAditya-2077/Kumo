// Catalog data (titles, artwork, descriptions, recommendations) comes from AniList's free public
// GraphQL API, straight from the browser. AniList only describes anime; it hosts no video.
// KUMO never sends AniList anything but the queries below, and no account is needed.

import { getSettings } from './store.js';

const ENDPOINT = 'https://graphql.anilist.co';
const cache = new Map();

async function gql(query, variables = {}, ttl = 600_000) {
  const key = query + JSON.stringify(variables);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      referrerPolicy: 'no-referrer'
    });
  } catch {
    throw new Error("Can't reach AniList. Check your connection and try again.");
  }
  if (res.status === 429) throw new Error('AniList is rate-limiting requests. Wait a minute and try again.');
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.errors) throw new Error(json?.errors?.[0]?.message || `AniList error (HTTP ${res.status})`);
  cache.set(key, { at: Date.now(), data: json.data });
  return json.data;
}

const FRAG = `fragment C on Media {
  id idMal type format status episodes duration season seasonYear averageScore genres isAdult bannerImage
  title { romaji english native } coverImage { large extraLarge color } nextAiringEpisode { episode airingAt }
}`;
const adultVar = () => (getSettings().showAdult ? undefined : false);

// ---------------------------------------------------------------- constants
export const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];
export const FORMAT_LABEL = { TV: 'TV', TV_SHORT: 'TV Short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
export const STATUS_LABEL = { FINISHED: 'Finished', RELEASING: 'Airing', NOT_YET_RELEASED: 'Upcoming', CANCELLED: 'Cancelled', HIATUS: 'On hiatus' };
export const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

export function currentSeason(d = new Date()) {
  return { season: SEASONS[Math.floor(d.getMonth() / 3)], year: d.getFullYear() };
}

// ---------------------------------------------------------------- queries
export async function getHome() {
  const { season, year } = currentSeason();
  const d = await gql(`query($season:MediaSeason,$year:Int,$adult:Boolean){
    trending: Page(perPage:14){ media(type:ANIME,sort:TRENDING_DESC,isAdult:$adult){ ...C description(asHtml:false) } }
    season: Page(perPage:14){ media(type:ANIME,sort:POPULARITY_DESC,season:$season,seasonYear:$year,isAdult:$adult){ ...C } }
    top: Page(perPage:14){ media(type:ANIME,sort:SCORE_DESC,isAdult:$adult){ ...C } }
  } ${FRAG}`, { season, year, adult: adultVar() });
  return { trending: d.trending.media, season: d.season.media, top: d.top.media, seasonLabel: `${season[0]}${season.slice(1).toLowerCase()} ${year}` };
}

export async function search({ q, genre, year, season, format, status, sort, page = 1, perPage = 24 } = {}) {
  const vars = {
    page, perPage, search: q || undefined, genre: genre || undefined, year: year ? Number(year) : undefined,
    season: season || undefined, format: format || undefined, status: status || undefined,
    sort: [sort || (q ? 'SEARCH_MATCH' : 'POPULARITY_DESC')], adult: adultVar()
  };
  const d = await gql(`query($page:Int,$perPage:Int,$search:String,$genre:String,$year:Int,$season:MediaSeason,$format:MediaFormat,$status:MediaStatus,$sort:[MediaSort],$adult:Boolean){
    Page(page:$page,perPage:$perPage){
      pageInfo{ hasNextPage }
      media(type:ANIME,search:$search,genre:$genre,seasonYear:$year,season:$season,format:$format,status:$status,sort:$sort,isAdult:$adult){ ...C }
    }
  } ${FRAG}`, vars);
  return { items: d.Page.media, hasNext: d.Page.pageInfo.hasNextPage };
}

export async function getMedia(id) {
  const d = await gql(`query($id:Int){ Media(id:$id,type:ANIME){
    ...C description(asHtml:false) synonyms source startDate{ year month day }
    studios(isMain:true){ nodes{ name } } trailer{ id site } streamingEpisodes{ title thumbnail }
    relations{ edges{ relationType(version:2) node{ ...C } } }
    recommendations(perPage:16,sort:RATING_DESC){ nodes{ rating mediaRecommendation{ ...C } } }
  } } ${FRAG}`, { id });
  return d.Media;
}

// ---------------------------------------------------------------- helpers
export function titleOf(m) {
  const t = m?.title || {};
  const first = getSettings().titleLang === 'romaji' ? t.romaji || t.english : t.english || t.romaji;
  return first || t.native || 'Untitled';
}

/** How many episodes exist right now (for ongoing shows, only the ones that have aired). */
export function airedCount(m) {
  if (m.format === 'MOVIE') return m.status === 'NOT_YET_RELEASED' ? 0 : 1;
  if (m.status === 'NOT_YET_RELEASED') return 0;
  if (m.status === 'RELEASING') return m.nextAiringEpisode ? Math.max(0, m.nextAiringEpisode.episode - 1) : (m.episodes || 0);
  return m.episodes || 1;
}

/** Small snapshot saved with watch progress and My List so those pages work offline. */
export const snap = m => ({
  id: m.id, title: titleOf(m), cover: m.coverImage?.large || '', color: m.coverImage?.color || '',
  format: m.format || '', year: m.seasonYear || null, score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '', eps: airedCount(m)
});

/** Shape used by poster cards. */
export function toCard(m) {
  const n = m.episodes;
  return {
    id: m.id, title: titleOf(m), cover: m.coverImage?.large || '', color: m.coverImage?.color || '',
    badge: m.status === 'RELEASING' ? 'AIRING' : (FORMAT_LABEL[m.format] || '').toUpperCase(),
    sub: [FORMAT_LABEL[m.format], m.seasonYear, n && m.format !== 'MOVIE' ? `${n} eps` : ''].filter(Boolean).join(' · '),
    score: m.averageScore ? (m.averageScore / 10).toFixed(1) : ''
  };
}

const REL_ORDER = ['PARENT', 'PREQUEL', 'SEQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE', 'SUMMARY', 'OTHER'];
export function relationsOf(m) {
  return (m.relations?.edges || [])
    .filter(e => e.node && e.node.type === 'ANIME' && REL_ORDER.includes(e.relationType))
    .sort((a, b) => REL_ORDER.indexOf(a.relationType) - REL_ORDER.indexOf(b.relationType))
    .map(e => ({ type: e.relationType.replace(/_/g, ' ').toLowerCase(), media: e.node }));
}
export function recommendationsOf(m) {
  const seen = new Set([m.id]);
  return (m.recommendations?.nodes || [])
    .map(n => n.mediaRecommendation)
    .filter(r => r && r.type === 'ANIME' && !seen.has(r.id) && seen.add(r.id));
}
