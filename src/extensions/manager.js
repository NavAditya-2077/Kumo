// Installing, updating and running extensions.
//
//   repository index (JSON)  ──lists──▶  manifest.json  ──points to──▶  index.js (the code)
//
// Installed extensions (manifest + code) are stored in this browser. Code only ever runs
// inside the sandbox (see sandbox.js).

import * as store from '../store.js';
import { fetchJson, fetchText } from '../net.js';
import { Runtime } from './sandbox.js';
import { safeUrl } from './validate.js';

export const API_VERSION = 1;
export const DEFAULT_REPO = new URL('../../extensions/index.json', import.meta.url).href;
const MAX_CODE = 300_000;

const runtimes = new Map();
const emit = () => window.dispatchEvent(new CustomEvent('kumo:extensions'));

// ---------------------------------------------------------------- queries
export const list = () => store.getExtensions();
export const enabled = () => list().filter(e => e.enabled);
export const get = id => list().find(e => e.id === id) || null;

export function cmpVer(a, b) {
  const pa = String(a).split(/[.-]/).map(n => parseInt(n, 10) || 0);
  const pb = String(b).split(/[.-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

// ---------------------------------------------------------------- runtime
function dropRuntime(id) { runtimes.get(id)?.destroy(); runtimes.delete(id); }

export function runtime(id) {
  const rec = get(id);
  if (!rec) throw new Error('That extension is not installed');
  if (!rec.enabled) throw new Error(`${rec.manifest.name} is turned off`);
  let rt = runtimes.get(id);
  if (rt && (rt.failed || rt.rec.code !== rec.code || rt.rec.manifest.version !== rec.manifest.version)) { dropRuntime(id); rt = null; }
  if (!rt) { rt = new Runtime(rec); runtimes.set(id, rt); }
  return rt;
}
export const call = (id, method, params) => runtime(id).call(method, params);
export const logsFor = id => runtimes.get(id)?.logs || [];
export function reload(id) { dropRuntime(id); }

// ---------------------------------------------------------------- manifests
const HOST_RX = /^(\*|(\*\.)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?)$/;

export function validateManifest(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('The manifest is not a JSON object');
  for (const k of ['id', 'name', 'version', 'entry']) {
    if (typeof m[k] !== 'string' || !m[k].trim()) throw new Error(`The manifest is missing "${k}"`);
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(m.id)) throw new Error('"id" must be 2–64 characters: lowercase letters, digits, dot, dash or underscore');
  if ((m.apiVersion ?? API_VERSION) !== API_VERSION) throw new Error(`This extension needs KUMO API v${m.apiVersion}; this app supports v${API_VERSION}`);
  if ((m.type || 'provider') !== 'provider') throw new Error(`Unsupported extension type "${m.type}"`);
  const net = m.permissions?.network ?? [];
  if (!Array.isArray(net) || net.some(h => typeof h !== 'string' || !HOST_RX.test(h.trim().toLowerCase()))) {
    throw new Error('"permissions.network" must be a list of host names such as "api.example.com" or "*.example.com"');
  }
  const settings = (Array.isArray(m.settings) ? m.settings : [])
    .filter(s => s && typeof s.key === 'string' && /^[\w-]{1,40}$/.test(s.key) && ['text', 'password', 'number', 'toggle', 'select'].includes(s.type))
    .slice(0, 20)
    .map(s => ({
      key: s.key, type: s.type, label: String(s.label || s.key).slice(0, 80), help: s.help ? String(s.help).slice(0, 200) : '',
      default: s.default ?? (s.type === 'toggle' ? false : ''),
      options: s.type === 'select' && Array.isArray(s.options) ? s.options.slice(0, 30).map(o => ({ value: String(o.value), label: String(o.label ?? o.value) })) : undefined
    }));
  return {
    id: m.id, name: m.name.trim().slice(0, 60), version: m.version.trim().slice(0, 20), apiVersion: API_VERSION, type: 'provider',
    author: String(m.author || 'Unknown').slice(0, 60), description: String(m.description || '').slice(0, 400),
    language: String(m.language || 'multi').slice(0, 12), nsfw: !!m.nsfw, entry: m.entry.trim(), icon: typeof m.icon === 'string' ? m.icon : '',
    homepage: safeUrl(m.homepage), permissions: { network: [...new Set(net.map(h => h.trim().toLowerCase()))].slice(0, 30) }, settings
  };
}

const resolveUrl = (rel, base) => { try { return new URL(rel, base).href; } catch { return ''; } };

/** Downloads and validates an extension (manifest + code) without installing it. */
export async function fetchPackage(manifestUrl, repoUrl = '') {
  const manifest = validateManifest(await fetchJson(manifestUrl));
  const codeUrl = resolveUrl(manifest.entry, manifestUrl);
  if (!codeUrl) throw new Error(`Bad "entry" in the manifest: ${manifest.entry}`);
  const code = await fetchText(codeUrl, { maxBytes: MAX_CODE });
  if (!code.trim()) throw new Error('The extension file is empty');
  manifest.iconUrl = manifest.icon ? safeUrl(resolveUrl(manifest.icon, manifestUrl)) : '';
  return { manifest, code, manifestUrl, repoUrl };
}

const defaultsOf = settings => Object.fromEntries((settings || []).map(s => [s.key, s.default]));

export function install(pkg) {
  const all = list();
  const prev = all.find(e => e.id === pkg.manifest.id);
  const rec = {
    id: pkg.manifest.id, manifest: pkg.manifest, code: pkg.code, manifestUrl: pkg.manifestUrl, repoUrl: pkg.repoUrl || '',
    enabled: prev ? prev.enabled : true, installedAt: prev?.installedAt || Date.now(), updatedAt: Date.now(),
    settings: { ...defaultsOf(pkg.manifest.settings), ...(prev?.settings || {}) }
  };
  store.setExtensions(prev ? all.map(e => (e.id === rec.id ? rec : e)) : [...all, rec]);
  dropRuntime(rec.id);
  emit();
  return rec;
}
export function uninstall(id) {
  dropRuntime(id);
  store.setExtensions(list().filter(e => e.id !== id));
  if (store.getSettings().defaultExt === id) store.setSetting('defaultExt', '');
  emit();
}
export function setEnabled(id, on) {
  store.setExtensions(list().map(e => (e.id === id ? { ...e, enabled: !!on } : e)));
  if (!on) dropRuntime(id);
  emit();
}
export function setExtSetting(id, key, value) {
  const rec = get(id);
  if (!rec) return;
  rec.settings = { ...rec.settings, [key]: value };
  store.setExtensions([...list()]);
  runtimes.get(id)?.updateSettings(rec.settings);
}
export function setDefault(id) { store.setSetting('defaultExt', id); emit(); }

/** Re-downloads extensions listed in a backup. Returns how many worked. */
export async function restore(records) {
  let ok = 0;
  await Promise.all(records.map(async r => {
    try {
      const rec = install(await fetchPackage(r.manifestUrl, r.repoUrl || ''));
      if (r.enabled === false) setEnabled(rec.id, false);
      if (r.settings && typeof r.settings === 'object') { for (const [k, v] of Object.entries(r.settings)) setExtSetting(rec.id, k, v); }
      ok++;
    } catch (err) { console.warn('KUMO: could not restore', r.manifestUrl, err); }
  }));
  return ok;
}

// ---------------------------------------------------------------- repositories
export const getRepos = () => store.getRepos();
export function addRepo(url, name = '') {
  const repos = getRepos();
  if (url === DEFAULT_REPO || repos.some(r => r.url === url)) return false;
  store.setRepos([...repos, { url, name }]);
  return true;
}
export function removeRepo(url) { store.setRepos(getRepos().filter(r => r.url !== url)); }

/** Turns a github.com "blob" link into the raw file link; leaves other URLs alone. */
export function normalizeUrl(u) {
  u = String(u).trim();
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(u);
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : u;
}
/** Is this URL an extension manifest or a repository index? */
export async function detect(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!/^https?:\/\//i.test(url)) throw new Error('Enter a full http(s) URL');
  const json = await fetchJson(url);
  if (json && typeof json.entry === 'string') return { kind: 'extension', url };
  if (json && Array.isArray(json.extensions)) return { kind: 'repo', url, name: String(json.name || '') };
  throw new Error('That URL is neither an extension manifest nor a repository index');
}

/** Loads every repository (the built-in one plus the user's) in parallel; failures are reported per repo. */
export async function listAvailable() {
  const repos = [{ url: DEFAULT_REPO, name: 'KUMO Official', builtin: true }, ...getRepos()];
  return Promise.all(repos.map(async r => {
    try {
      const idx = await fetchJson(r.url);
      if (!idx || !Array.isArray(idx.extensions)) throw new Error('Not a repository index');
      const items = idx.extensions.slice(0, 200).filter(e => e && typeof e.id === 'string' && typeof e.manifest === 'string').map(e => ({
        id: e.id, name: String(e.name || e.id).slice(0, 60), version: String(e.version || ''), author: String(e.author || '').slice(0, 60),
        description: String(e.description || '').slice(0, 300), language: String(e.language || '').slice(0, 12), nsfw: !!e.nsfw,
        icon: e.icon ? safeUrl(resolveUrl(e.icon, r.url)) : '', manifestUrl: resolveUrl(e.manifest, r.url), repoUrl: r.url
      })).filter(e => e.manifestUrl);
      return { ...r, name: idx.name || r.name || new URL(r.url).hostname, items };
    } catch (err) {
      return { ...r, name: r.name || r.url, items: [], error: err.message };
    }
  }));
}
