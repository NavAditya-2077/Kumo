// Everything KUMO remembers lives in this browser (localStorage). There is no server.
// Use Settings → Export to back it up or move it to another browser.

const PREFIX = 'kumo.v2.';
const mem = new Map();
const hasLS = (() => { try { localStorage.setItem('__kumo', '1'); localStorage.removeItem('__kumo'); return true; } catch { return false; } })();

function get(key, def) {
  if (mem.has(key)) return mem.get(key);
  let v = def;
  if (hasLS) {
    try { const raw = localStorage.getItem(PREFIX + key); if (raw != null) v = JSON.parse(raw); } catch { /* corrupt value: fall back to default */ }
  }
  mem.set(key, v);
  return v;
}
function set(key, v) {
  mem.set(key, v);
  if (hasLS) { try { localStorage.setItem(PREFIX + key, JSON.stringify(v)); } catch (e) { console.warn('KUMO: could not save', key, e); } }
  return v;
}

// ---------------------------------------------------------------- settings
export const SETTING_DEFAULTS = {
  proxy: '',            // optional CORS proxy template, e.g. https://proxy.example/?url={url}
  autoNext: true,       // play the next episode automatically
  autoPlay: true,       // start playing as soon as the video is ready
  showAdult: false,     // include adult titles from the catalog
  titleLang: 'english', // 'english' | 'romaji'
  preferDub: false,     // prefer dubbed matches when an extension offers both
  defaultExt: ''        // id of the extension to use first
};
export const getSettings = () => ({ ...SETTING_DEFAULTS, ...get('settings', {}) });
export const setSetting = (k, v) => { set('settings', { ...get('settings', {}), [k]: v }); };

// ---------------------------------------------------------------- watch progress
const MAX_PROGRESS = 600;
const pkey = (mid, ep) => `${mid}:${ep}`;
export const isFinished = p => !!p && p.d > 0 && p.t / p.d >= 0.92;

export function getProgress(mid, ep) { return get('progress', {})[pkey(mid, ep)] || null; }
export function getSeriesProgress(mid) {
  const out = {};
  for (const p of Object.values(get('progress', {}))) if (p.mid === mid) out[p.ep] = p;
  return out;
}
/** snap: {id,title,cover,color,eps} – a small snapshot so lists can render without the network. */
export function saveProgress(snap, ep, { t, d, ext }) {
  const all = get('progress', {});
  all[pkey(snap.id, ep)] = { mid: snap.id, ep, t, d, at: Date.now(), ext: ext || '', title: snap.title, cover: snap.cover || '', color: snap.color || '', eps: snap.eps ?? null };
  const keys = Object.keys(all);
  if (keys.length > MAX_PROGRESS) keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - MAX_PROGRESS).forEach(k => delete all[k]);
  set('progress', all);
}
/** Most recent entry per anime, newest first. */
export function getHistory() {
  const seen = new Set();
  return Object.values(get('progress', {})).sort((a, b) => b.at - a.at).filter(p => !seen.has(p.mid) && seen.add(p.mid));
}
/** Unfinished shows, or the next episode of a finished one when we know it exists. */
export function getContinue() {
  const out = [];
  for (const p of getHistory()) {
    if (!isFinished(p)) out.push(p);
    else if (p.eps && p.ep < p.eps) out.push({ ...p, ep: p.ep + 1, t: 0, d: 0, next: true });
  }
  return out.slice(0, 12);
}
export const clearHistory = () => { set('progress', {}); };

// ---------------------------------------------------------------- my list
export const getList = () => Object.values(get('list', {})).sort((a, b) => b.addedAt - a.addedAt);
export const inList = id => !!get('list', {})[id];
export function toggleList(snap) {
  const l = { ...get('list', {}) };
  if (l[snap.id]) delete l[snap.id]; else l[snap.id] = { ...snap, addedAt: Date.now() };
  set('list', l);
  return !!l[snap.id];
}

// ---------------------------------------------------------------- extensions
// record: { id, manifest, code, manifestUrl, repoUrl, enabled, installedAt, updatedAt, settings }
export const getExtensions = () => get('extensions', []);
export const setExtensions = arr => { set('extensions', arr); };
export const getRepos = () => get('repos', []);
export const setRepos = arr => { set('repos', arr); };

// anime ↔ extension title matches the user (or the matcher) settled on
const mkey = (mid, ext) => `${mid}|${ext}`;
export const getMatch = (mid, ext) => get('matches', {})[mkey(mid, ext)] || null;
export function setMatch(mid, ext, match) { set('matches', { ...get('matches', {}), [mkey(mid, ext)]: match }); }
export function clearMatch(mid, ext) { const m = { ...get('matches', {}) }; delete m[mkey(mid, ext)]; set('matches', m); }

// ---------------------------------------------------------------- backup
const KEYS = ['settings', 'progress', 'list', 'repos', 'matches'];
export function exportAll() {
  return {
    app: 'kumo', version: 2, exportedAt: Date.now(),
    data: {
      ...Object.fromEntries(KEYS.map(k => [k, get(k, k === 'repos' ? [] : {})])),
      // Extension code is not exported; it is re-downloaded from its URL on import.
      extensions: getExtensions().map(e => ({ id: e.id, manifestUrl: e.manifestUrl, repoUrl: e.repoUrl, enabled: e.enabled, settings: e.settings }))
    }
  };
}
/** Applies everything except extensions; returns the extension records so the caller can re-download them. */
export function importAll(obj) {
  if (!obj || obj.app !== 'kumo' || typeof obj.data !== 'object') throw new Error("That file isn't a KUMO backup");
  const d = obj.data;
  for (const k of KEYS) {
    if (d[k] == null) continue;
    if (k === 'repos' ? !Array.isArray(d[k]) : (typeof d[k] !== 'object' || Array.isArray(d[k]))) throw new Error(`Backup field "${k}" is malformed`);
    set(k, d[k]);
  }
  return Array.isArray(d.extensions) ? d.extensions.filter(e => e && typeof e.manifestUrl === 'string') : [];
}
export function resetAll() {
  mem.clear();
  if (hasLS) for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
}
