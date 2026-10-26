// Turns "I want episode 5 of this anime" into playable streams by asking an extension.
//   1. search()   find the anime on the extension's site (and remember the match)
//   2. episodes() list its episodes
//   3. streams()  get video URLs + subtitles for one episode

import * as mgr from './manager.js';
import * as store from '../store.js';
import { rank, AUTO_THRESHOLD } from './matcher.js';
import { cleanSearch, cleanEpisodes, cleanStreams } from './validate.js';

/** The small, plain-data description of an anime that extensions receive. */
export const compactMedia = m => ({
  id: m.id, idMal: m.idMal || null,
  title: { romaji: m.title?.romaji || '', english: m.title?.english || '', native: m.title?.native || '' },
  synonyms: (m.synonyms || []).slice(0, 10),
  year: m.seasonYear || m.startDate?.year || null, season: m.season || null,
  format: m.format || null, episodes: m.episodes || null, status: m.status || null
});

/** Search an extension. Pass `query` to override the automatic title queries. Results are ranked best-first. */
export async function searchCandidates(extId, media, query = '') {
  const cm = compactMedia(media);
  const queries = query
    ? [query]
    : [...new Set([cm.title.english, cm.title.romaji, ...cm.synonyms].map(s => (s || '').trim()).filter(Boolean))].slice(0, 3);
  const found = new Map();
  for (const q of queries) {
    for (const r of cleanSearch(await mgr.call(extId, 'search', { query: q, media: cm }))) if (!found.has(r.id)) found.set(r.id, r);
    if (!query && found.size >= 5) break;
  }
  return rank({ ...cm, title: cm.title }, [...found.values()], { preferDub: store.getSettings().preferDub });
}

/** → { match } when we're sure (or the user chose before), otherwise { candidates } for the user to pick from. */
export async function resolve(extId, media, { force = false } = {}) {
  if (!force) {
    const saved = store.getMatch(media.id, extId);
    if (saved) return { match: saved };
  }
  const candidates = await searchCandidates(extId, media);
  const [a, b] = candidates;
  if (a && a.score >= AUTO_THRESHOLD && (!b || a.score - b.score >= 0.05)) {
    const match = { id: a.id, title: a.title, variant: a.variant, cover: a.cover, auto: true };
    store.setMatch(media.id, extId, match);
    return { match };
  }
  return { candidates };
}

export function chooseMatch(mediaId, extId, candidate) {
  const match = { id: candidate.id, title: candidate.title, variant: candidate.variant, cover: candidate.cover, auto: false };
  store.setMatch(mediaId, extId, match);
  return match;
}

// ---------------------------------------------------------------- episodes + streams
const epCache = new Map();
export async function getEpisodes(extId, match) {
  const key = `${extId}|${match.id}`;
  const hit = epCache.get(key);
  if (hit && Date.now() - hit.at < 300_000) return hit.v;
  const v = cleanEpisodes(await mgr.call(extId, 'episodes', { id: match.id }));
  if (!v.length) throw new Error(`${mgr.get(extId)?.manifest.name || 'The extension'} has no episodes for "${match.title}"`);
  epCache.set(key, { at: Date.now(), v });
  return v;
}

export async function getStreams(extId, match, episode) {
  const out = cleanStreams(await mgr.call(extId, 'streams', { id: episode.id, number: episode.number, seriesId: match.id }));
  if (!out.sources.length) throw new Error('The extension returned no playable video for this episode');
  return out;
}
