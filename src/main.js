import { $, icon } from './util.js';
import { route, start } from './router.js';
import { buildShell, setNav } from './shell.js';
import { errorBlock } from './ui.js';
import { homePage } from './pages/home.js';
import { browsePage } from './pages/browse.js';
import { myListPage, historyPage } from './pages/lists.js';
import { detailsPage } from './pages/details.js';
import { watchPage } from './pages/watch.js';
import { extensionsPage } from './pages/extensions.js';
import { settingsPage } from './pages/settings.js';
import { render } from './router.js';

buildShell();

route('/', homePage, 'home');
route('/browse', browsePage, 'browse');
route('/mylist', myListPage, 'mylist');
route('/history', historyPage, 'history');
route('/anime/:id', detailsPage, 'browse');
route('/watch/:id/:ep', watchPage, '');
route('/extensions', extensionsPage, 'extensions');
route('/settings', settingsPage, 'settings');

// Images that fail to load are hidden so the generated gradient artwork underneath shows instead.
document.addEventListener('error', e => { if (e.target?.tagName === 'IMG') e.target.classList.add('broken'); }, true);
// "Try again" buttons inside error blocks.
document.addEventListener('click', e => { if (e.target.closest('[data-retry]')) render({ keepScroll: true }); });

start({
  onNavigate: name => { setNav(name); document.title = 'KUMO'; },
  onNotFound: msg => {
    $('#page').innerHTML = msg
      ? errorBlock(msg)
      : `<div class="empty"><div class="eico">${icon('search', 30)}</div><h1>Page not found</h1><p>That page doesn't exist.</p><a class="btn primary" href="#/">Go home</a></div>`;
  }
});

// ---- installable app (PWA)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register(new URL('../sw.js', import.meta.url).href).catch(e => console.warn('KUMO: service worker not registered', e)));
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.kumoInstall = e; window.dispatchEvent(new Event('kumo:installable')); });
window.addEventListener('appinstalled', () => { window.kumoInstall = null; window.dispatchEvent(new Event('kumo:installable')); });
