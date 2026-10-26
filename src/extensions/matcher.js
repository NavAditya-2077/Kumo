// Works out which of an extension's search results is the anime we're looking at.
// The catalog (AniList) and an extension's site never agree on titles exactly,
// so we score similarity and only auto-pick when we're confident.

export const AUTO_THRESHOLD = 0.82;

export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}

function bigrams(s) {
  const m = new Map(), t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); }
  return m;
}

/** Sørensen–Dice on character bigrams, with a floor when one title contains the other. */
export function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  let inter = 0, sa = 0, sb = 0;
  for (const [g, n] of A) { sa += n; if (B.has(g)) inter += Math.min(n, B.get(g)); }
  for (const n of B.values()) sb += n;
  let score = (2 * inter) / (sa + sb);
  if (a.includes(b) || b.includes(a)) score = Math.max(score, 0.78 * Math.min(a.length, b.length) / Math.max(a.length, b.length) + 0.2);
  return Math.min(1, score);
}

const ORDINALS = { second: 2, third: 3, fourth: 4, fifth: 5 };
export function seasonOf(title) {
  const s = norm(title);
  let m = /\b(?:season|s)\s*(\d{1,2})\b/.exec(s) || /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/.exec(s) || /\bpart\s*(\d{1,2})\b/.exec(s);
  if (m) return +m[1];
  for (const [w, n] of Object.entries(ORDINALS)) if (new RegExp(`\\b${w} season\\b`).test(s)) return n;
  m = /\b(ii|iii|iv)\b/.exec(s);
  return m ? { ii: 2, iii: 3, iv: 4 }[m[1]] : null;
}

/** Scores each result 0..1 against every name the catalog knows for this anime. */
export function rank(media, results, { preferDub = false } = {}) {
  const t = media.title || {};
  const names = [t.english, t.romaji, t.native, ...(media.synonyms || [])].filter(Boolean);
  const mSeason = names.map(seasonOf).find(n => n != null) ?? null;
  const mYear = media.year || media.seasonYear || null;
  return results.map(r => {
    let score = Math.max(0, ...names.map(n => similarity(n, r.title)));
    const rSeason = seasonOf(r.title);
    if (mSeason && rSeason && mSeason !== rSeason) score -= 0.3;
    else if ((mSeason || 1) !== (rSeason || 1)) score -= 0.15;
    if (mYear && r.year && Math.abs(mYear - r.year) > 1) score -= 0.1;
    const dub = /dub/i.test(r.variant || '') || /\bdub\b/i.test(r.title);
    score += preferDub ? (dub ? 0.02 : 0) : (dub ? -0.02 : 0);
    return { ...r, score: Math.max(0, Math.min(1, score)) };
  }).sort((a, b) => b.score - a.score);
}
