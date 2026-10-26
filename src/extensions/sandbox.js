// Host side of the extension sandbox: one hidden, sandboxed <iframe> per extension,
// talking to this page only through postMessage.

import { hostFetch } from '../net.js';

const SANDBOX_URL = new URL('./sandbox.html', import.meta.url).href;
const BOOT_TIMEOUT = 10_000;
const CALL_TIMEOUT = 30_000;

export class Runtime {
  #onReady = null;

  constructor(rec) {
    this.rec = rec;
    this.frame = null;
    this.ready = null;
    this.failed = false;
    this.methods = [];
    this.logs = [];
    this.calls = new Map();
    this.seq = 0;
    this.handler = e => this.#onMessage(e);
    window.addEventListener('message', this.handler);
  }

  #log(level, text) {
    this.logs.push({ at: Date.now(), level, text: String(text).slice(0, 2000) });
    if (this.logs.length > 100) this.logs.shift();
  }
  #post(msg) {
    try { this.frame?.contentWindow?.postMessage({ kumo: 1, ...msg }, '*'); } catch { /* frame is gone */ }
  }

  /** Creates the sandbox on first use. Resolves with the list of methods the extension implements. */
  start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts'); // deliberately NOT allow-same-origin
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.title = 'extension sandbox';
      frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;visibility:hidden';
      frame.src = SANDBOX_URL;
      this.frame = frame;
      const timer = setTimeout(() => this.#onReady.reject(new Error('The extension sandbox did not start')), BOOT_TIMEOUT);
      this.#onReady = {
        resolve: v => { clearTimeout(timer); resolve(v); },
        reject: e => { clearTimeout(timer); this.failed = true; reject(e); }
      };
      document.body.appendChild(frame);
    });
    this.ready.catch(() => {}); // callers handle the error; avoid an unhandled-rejection warning
    return this.ready;
  }

  #onMessage(e) {
    if (!this.frame || e.source !== this.frame.contentWindow) return;
    const m = e.data;
    if (!m || m.kumo !== 1 || typeof m.type !== 'string') return;
    switch (m.type) {
      case 'boot':
        this.#post({ type: 'init', code: this.rec.code, settings: this.rec.settings || {} });
        break;
      case 'ready':
        this.methods = Array.isArray(m.methods) ? m.methods.slice(0, 20).map(String) : [];
        this.#onReady?.resolve(this.methods);
        break;
      case 'init-error':
        this.#log('error', m.message);
        this.#onReady?.reject(new Error(String(m.message || 'The extension failed to load')));
        break;
      case 'log':
        this.#log(m.level === 'error' ? 'error' : m.level === 'warn' ? 'warn' : 'log', m.text);
        break;
      case 'result': {
        const c = this.calls.get(m.id);
        if (!c) return;
        this.calls.delete(m.id);
        clearTimeout(c.timer);
        if (m.ok) c.resolve(m.value); else c.reject(new Error(String(m.error || 'Extension error')));
        break;
      }
      case 'rpc':
        this.#handleRpc(m);
        break;
    }
  }

  async #handleRpc(m) {
    try {
      if (m.op !== 'fetch') throw new Error(`Unknown host call: ${m.op}`);
      const a = m.args || {};
      const value = await hostFetch(this.rec.manifest.permissions?.network || [], String(a.url), a.opts || {});
      this.#post({ type: 'rpc-result', id: m.id, ok: true, value });
    } catch (err) {
      this.#log('error', err.message);
      this.#post({ type: 'rpc-result', id: m.id, ok: false, error: err.message });
    }
  }

  async call(method, params) {
    await this.start();
    if (!this.methods.includes(method)) throw new Error(`${this.rec.manifest.name} does not support "${method}"`);
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => {
        this.calls.delete(id);
        reject(new Error(`${this.rec.manifest.name} took too long to respond`));
      }, CALL_TIMEOUT);
      this.calls.set(id, { resolve, reject, timer });
      this.#post({ type: 'call', id, method, params });
    });
  }

  updateSettings(settings) { if (this.frame) this.#post({ type: 'settings', settings }); }

  destroy() {
    window.removeEventListener('message', this.handler);
    for (const c of this.calls.values()) { clearTimeout(c.timer); c.reject(new Error('The extension was stopped')); }
    this.calls.clear();
    this.frame?.remove();
    this.frame = null;
  }
}
