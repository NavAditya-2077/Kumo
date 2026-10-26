// Tiny hash router. Hash URLs (#/anime/123) are what let KUMO run on GitHub Pages
// or any static host with no server-side configuration.

const routes = [];
let cleanups = [];
let token = 0;
let onNav = () => {};
let notFound = () => {};

/** route('/watch/:id/:ep', handler, 'navName'): handler(ctx) where ctx = { params, query, active(), onLeave(fn) } */
export function route(pattern, handler, nav = '') {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ rx, keys, handler, nav });
}

export function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const i = raw.indexOf('?');
  return { path: i < 0 ? raw : raw.slice(0, i), query: new URLSearchParams(i < 0 ? '' : raw.slice(i + 1)) };
}

export async function render({ keepScroll = false } = {}) {
  cleanups.splice(0).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  const mine = ++token;
  const { path, query } = parse();
  if (!keepScroll) window.scrollTo(0, 0);
  for (const r of routes) {
    const m = r.rx.exec(path);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    onNav(r.nav);
    const ctx = { params, query, active: () => token === mine, onLeave: fn => cleanups.push(fn) };
    try { await r.handler(ctx); }
    catch (err) { console.error(err); if (ctx.active()) notFound(err.message); }
    return;
  }
  onNav('');
  notFound();
}

/** Change the URL. With replace:true the history entry is swapped (good for filters) and the page re-renders in place. */
export function navigate(hash, { replace = false } = {}) {
  if (replace) { history.replaceState(null, '', hash); render({ keepScroll: true }); }
  else if (location.hash === hash) render();
  else location.hash = hash;
}

export function start({ onNavigate, onNotFound }) {
  onNav = onNavigate || onNav;
  notFound = onNotFound || notFound;
  window.addEventListener('hashchange', () => render());
  render();
}
