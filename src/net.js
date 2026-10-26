// Network access for extensions. Extensions never touch the network themselves:
// their sandbox has no network at all, so every request comes through hostFetch(),
// which enforces the hosts listed in the extension's manifest.

import { getSettings } from './store.js';

const MAX_BODY = 5_000_000;

/** Fill a proxy template: "https://p.example/?url={url}" (or append the encoded URL if there's no {url}). */
export function proxify(tpl, url) {
  return tpl.includes('{url}') ? tpl.replace('{url}', encodeURIComponent(url)) : tpl + encodeURIComponent(url);
}
function proxyTemplate() {
  const p = (getSettings().proxy || '').trim();
  return /^https?:\/\//i.test(p) ? p : '';
}

/** fetch(), falling back to the user's CORS proxy (if they set one) when the direct request fails. */
async function doFetch(url, init) {
  try {
    return { res: await fetch(url, init), proxied: false };
  } catch (err) {
    const p = proxyTemplate();
    if (!p) throw err;
    return { res: await fetch(proxify(p, url), init), proxied: true };
  }
}

// ---------------------------------------------------------------- permissions
/** Hosts that must be named explicitly in a manifest, never reached through a wildcard. */
export function isPrivateHost(h) {
  h = String(h).toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h.includes(':')) return true; // any IPv6 literal
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = +m[1], b = +m[2];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return false;
}
/** patterns: ["api.example.com", "*.cdn.example.com", "*"]. "*.x.com" matches x.com and every subdomain. */
export function hostAllowed(patterns, host) {
  host = String(host).toLowerCase();
  for (const raw of patterns || []) {
    const p = String(raw).toLowerCase().trim();
    if (!p) continue;
    if (p === host) return true;
    if (isPrivateHost(host)) continue;
    if (p === '*') return true;
    if (p.startsWith('*.') && (host === p.slice(2) || host.endsWith(p.slice(1)))) return true;
  }
  return false;
}

// ---------------------------------------------------------------- fetch on behalf of an extension
export async function hostFetch(patterns, rawUrl, opts = {}) {
  let u;
  try { u = new URL(rawUrl); } catch { throw new Error(`Invalid URL: ${String(rawUrl).slice(0, 100)}`); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http(s) URLs are allowed');
  if (u.username || u.password) throw new Error('URLs containing credentials are not allowed');
  if (!hostAllowed(patterns, u.hostname)) {
    throw new Error(`Blocked: this extension may not contact "${u.hostname}". Add it to permissions.network in its manifest.`);
  }
  const method = String(opts.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'HEAD'].includes(method)) throw new Error(`Unsupported method ${method}`);
  const headers = {};
  for (const [k, v] of Object.entries(opts.headers || {})) {
    if (/^[A-Za-z0-9-]{1,40}$/.test(k) && typeof v === 'string' && v.length < 2000) headers[k] = v;
  }
  const init = { method, headers, credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(20000) };
  if (method === 'POST' && typeof opts.body === 'string') init.body = opts.body.slice(0, 200_000);

  let out;
  try { out = await doFetch(u.href, init); }
  catch {
    throw new Error(`Couldn't reach ${u.hostname} (network error, or the site blocks browser requests).${proxyTemplate() ? '' : ' You can set a CORS proxy in Settings.'}`);
  }
  const { res, proxied } = out;
  if (!proxied && res.url) {
    // A redirect must not smuggle the extension onto a host it wasn't granted.
    const finalHost = new URL(res.url).hostname;
    if (!hostAllowed(patterns, finalHost)) throw new Error(`Blocked: "${u.hostname}" redirected to "${finalHost}", which this extension may not contact.`);
  }
  const body = await res.text();
  if (body.length > MAX_BODY) throw new Error('Response too large');
  return { ok: res.ok, status: res.status, url: res.url || u.href, headers: Object.fromEntries([...res.headers].slice(0, 40)), body };
}

// ---------------------------------------------------------------- fetch for KUMO itself (repos, manifests, subtitles)
export async function fetchText(url, { maxBytes = 2_000_000 } = {}) {
  let out;
  try { out = await doFetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache', signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error(`Couldn't load ${url} (offline, or the server doesn't allow browser access)`); }
  if (!out.res.ok) throw new Error(`HTTP ${out.res.status} for ${url}`);
  const text = await out.res.text();
  if (text.length > maxBytes) throw new Error('File is too large');
  return text;
}
export async function fetchJson(url) {
  const text = await fetchText(url);
  try { return JSON.parse(text); } catch { throw new Error(`${url} is not valid JSON`); }
}
