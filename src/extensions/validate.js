// Extension output is untrusted. Everything an extension returns is normalised here
// before the rest of the app sees it: wrong shapes are dropped, strings are trimmed
// and capped, and only http(s) URLs survive.

const MAX = { search: 100, episodes: 5000, sources: 30, subs: 40 };
const str = (v, n = 300) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, n) : '');

export function safeUrl(v) {
  if (typeof v !== 'string') return '';
  try { const u = new URL(v.trim()); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; }
}

export function cleanSearch(arr) {
  if (!Array.isArray(arr)) throw new Error('search() must return an array');
  const out = [];
  for (const r of arr.slice(0, MAX.search)) {
    if (!r || typeof r !== 'object') continue;
    const id = str(r.id, 500), title = str(r.title, 200);
    if (!id || !title) continue;
    const y = Math.trunc(Number(r.year));
    out.push({ id, title, cover: safeUrl(r.cover), year: y > 1900 && y < 2100 ? y : null, variant: str(r.variant, 20) });
  }
  return out;
}

export function cleanEpisodes(arr) {
  if (!Array.isArray(arr)) throw new Error('episodes() must return an array');
  const byNumber = new Map();
  for (const r of arr.slice(0, MAX.episodes)) {
    if (!r || typeof r !== 'object') continue;
    const number = Number(r.number);
    if (!Number.isFinite(number) || number < 0) continue;
    const id = str(r.id ?? r.number, 500);
    if (!id || byNumber.has(number)) continue;
    byNumber.set(number, { id, number, title: str(r.title, 200), thumbnail: safeUrl(r.thumbnail), filler: !!r.filler });
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

export function cleanStreams(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('streams() must return an object');
  const sources = [];
  for (const r of (Array.isArray(obj.sources) ? obj.sources : []).slice(0, MAX.sources)) {
    const url = safeUrl(r && r.url);
    if (!url || /\.mpd(\?|#|$)/i.test(url)) continue; // DASH isn't supported yet
    let type = str(r.type, 10).toLowerCase();
    if (!['hls', 'mp4', 'webm', 'file'].includes(type)) {
      type = /\.m3u8(\?|#|$)/i.test(url) ? 'hls' : /\.webm(\?|#|$)/i.test(url) ? 'webm' : 'mp4';
    }
    sources.push({ url, type, quality: str(r.quality, 20), label: str(r.label, 40) });
  }
  const subtitles = [];
  for (const r of (Array.isArray(obj.subtitles) ? obj.subtitles : []).slice(0, MAX.subs)) {
    const url = safeUrl(r && r.url);
    if (!url) continue;
    const lang = str(r.lang, 12) || 'und';
    subtitles.push({ url, lang, label: str(r.label, 40) || lang, default: !!r.default });
  }
  const range = v => {
    const a = Number(v && v.start), b = Number(v && v.end);
    return Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b > a ? { start: a, end: b } : null;
  };
  return { sources, subtitles, intro: range(obj.intro), outro: range(obj.outro) };
}
