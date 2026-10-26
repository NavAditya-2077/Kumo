// The video player: custom controls, HLS (via hls.js, loaded on demand), subtitles, quality/server menu,
// skip-intro, auto-play-next countdown, theater mode and keyboard shortcuts.

import { esc, icon, clamp, fmtDur } from './util.js';
import { fetchText } from './net.js';
import { toVtt } from './subtitles.js';

// ---------------------------------------------------------------- hls.js (only loaded when a stream needs it)
const HLS_LOCAL = new URL('../vendor/hls.min.js', import.meta.url).href; // downloaded at deploy time (see the Pages workflow)
const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5/dist/hls.min.js';
let hlsPromise = null;
const addScript = src => new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = src;
  s.onload = () => (window.Hls ? resolve(window.Hls) : reject(new Error('hls.js did not define Hls')));
  s.onerror = () => reject(new Error(`Could not load ${src}`));
  document.head.appendChild(s);
});
export function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  hlsPromise ??= addScript(HLS_LOCAL).catch(() => addScript(HLS_CDN)).catch(e => { hlsPromise = null; throw e; });
  return hlsPromise;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const isTyping = () => /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '') || !!document.querySelector('.modal-back');

export class Player {
  /**
   * @param {HTMLElement} box  an empty element with class "video"
   * @param {object} o  { hasNext, theater, onNext(), onProgress({t,d}), onEnded(), onTheater(on), onMessage(text) }
   */
  constructor(box, o = {}) {
    this.box = box;
    this.o = o;
    this.sources = []; this.subs = []; this.si = 0; this.subIndex = -1;
    this.hls = null; this.levels = []; this.blobs = [];
    this.seekTo = 0; this.lastSave = 0; this.dragging = false; this.dead = false; this.intro = null;
    this.netRetry = 0; this.mediaRetry = 0;
    this.upTimer = null; this.idleT = null;
    box.classList.add('paused');
    box.innerHTML = this.#markup();
    this.v = box.querySelector('video');
    this.#wire();
    this.setTheater(!!o.theater);
  }

  #markup() {
    return `
      <video playsinline preload="metadata"></video>
      <span class="qbadge" hidden></span>
      <div class="bigplay">${icon('play', 34)}</div><div class="spin"></div>
      <button class="skip" type="button" hidden>Skip intro ${icon('next', 16)}</button>
      <div class="verr"><div><h3>Couldn't play this video</h3><p class="vmsg"></p><div class="vbtns"></div></div></div>
      <div class="nextup" hidden>
        <div class="nu-t"><small>Up next</small><b class="nu-l"></b><span class="nu-s"></span></div>
        <div class="nu-b"><button class="btn sm primary nu-go" type="button">Play now</button><button class="btn sm ghost nu-cancel" type="button">Cancel</button></div>
      </div>
      <div class="menu" role="menu"></div>
      <div class="ctr">
        <div class="seek" role="slider" aria-label="Seek"><div class="t"></div><div class="b"></div><div class="p"></div><div class="k"></div><div class="tip">0:00</div></div>
        <div class="crow">
          <div>
            <button class="ib pp" type="button" aria-label="Play">${icon('play', 24)}</button>
            ${this.o.hasNext ? `<button class="ib nx" type="button" aria-label="Next episode">${icon('next', 22)}</button>` : ''}
            <span class="vol"><button class="ib mute" type="button" aria-label="Mute">${icon('vol', 22)}</button><input class="vr" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"></span>
            <span class="time">0:00 / 0:00</span>
          </div>
          <div>
            <button class="ib cc" type="button" aria-label="Subtitles" hidden><span class="cct">CC</span></button>
            <button class="ib gear" type="button" aria-label="Settings">${icon('sliders', 22)}</button>
            ${document.pictureInPictureEnabled ? `<button class="ib pipb" type="button" aria-label="Picture in picture">${icon('pip', 22)}</button>` : ''}
            <button class="ib th" type="button" aria-label="Theater mode">${icon('theater', 22)}</button>
            <button class="ib fs" type="button" aria-label="Fullscreen">${icon('full', 22)}</button>
          </div>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------- wiring
  #wire() {
    const b = this.box, v = this.v, q = s => b.querySelector(s);
    const el = this.el = {
      pp: q('.pp'), time: q('.time'), seek: q('.seek'), played: q('.p'), buf: q('.b'), knob: q('.k'), tip: q('.tip'),
      menu: q('.menu'), badge: q('.qbadge'), cc: q('.cc'), skip: q('.skip'), mute: q('.mute'), vr: q('.vr'), th: q('.th')
    };
    const dur = () => (Number.isFinite(v.duration) ? v.duration : 0);

    const paint = () => {
      const d = dur(), t = v.currentTime, r = d ? t / d : 0;
      el.played.style.width = (r * 100) + '%';
      el.knob.style.left = (r * 100) + '%';
      let end = 0;
      for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= t + 0.5) end = Math.max(end, v.buffered.end(i));
      el.buf.style.width = (d ? end / d * 100 : 0) + '%';
      el.time.textContent = `${fmtDur(t)} / ${fmtDur(d)}`;
      if (this.intro) el.skip.hidden = !(t >= this.intro.start && t < this.intro.end - 1);
    };
    this.paint = paint;

    v.addEventListener('play', () => { b.classList.remove('paused'); el.pp.innerHTML = icon('pause', 24); });
    v.addEventListener('pause', () => { b.classList.add('paused'); el.pp.innerHTML = icon('play', 24); this.#save(true); });
    v.addEventListener('waiting', () => b.classList.add('wait'));
    v.addEventListener('playing', () => b.classList.remove('wait'));
    v.addEventListener('canplay', () => b.classList.remove('wait'));
    v.addEventListener('timeupdate', () => { if (!this.dragging) paint(); this.#save(false); });
    v.addEventListener('progress', paint);
    v.addEventListener('durationchange', paint);
    v.addEventListener('loadedmetadata', () => {
      paint();
      if (this.seekTo > 0 && this.seekTo < dur() - 15) { v.currentTime = this.seekTo; this.o.onMessage?.(`Resumed at ${fmtDur(this.seekTo)}`); }
      this.seekTo = 0;
      if (this.autoplay) v.play().catch(() => {}); // the big play button covers browsers that block autoplay
    });
    v.addEventListener('error', () => {
      if (this.detaching) return;
      this.#fail(v.error?.code === 4 ? "Your browser can't play this video. Try another server." : 'The video failed to load.');
    });
    v.addEventListener('ended', () => { this.#save(true, true); this.o.onEnded?.(); });
    v.addEventListener('volumechange', () => {
      el.mute.innerHTML = icon(v.muted || v.volume === 0 ? 'mute' : 'vol', 22);
      el.vr.value = v.muted ? 0 : v.volume;
      try { localStorage.setItem('kumo.v2.vol', String(v.volume)); } catch { /* private mode */ }
    });
    try { const sv = localStorage.getItem('kumo.v2.vol'); if (sv !== null) v.volume = clamp(Number(sv) || 0, 0, 1); } catch { /* ignore */ }

    // play / pause / fullscreen
    const toggle = () => (v.paused ? v.play().catch(() => {}) : v.pause());
    this.toggle = toggle;
    el.pp.onclick = toggle;
    v.onclick = () => { if (el.menu.classList.contains('open')) el.menu.classList.remove('open'); else toggle(); };
    v.ondblclick = () => this.#fullscreen();
    q('.fs').onclick = () => this.#fullscreen();
    this.fsc = () => b.classList.toggle('fs', document.fullscreenElement === b);
    document.addEventListener('fullscreenchange', this.fsc);
    const nx = q('.nx'); if (nx) nx.onclick = () => this.o.onNext?.();
    const pip = q('.pipb'); if (pip) pip.onclick = () => (document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture()).catch(() => {});
    el.th.onclick = () => this.setTheater(!this.theater, true);

    // volume
    el.mute.onclick = () => { v.muted = !v.muted; };
    el.vr.oninput = () => { v.volume = +el.vr.value; v.muted = v.volume === 0; };

    // seek bar (pointer events cover mouse, touch and pen)
    const frac = x => { const r = el.seek.getBoundingClientRect(); return clamp((x - r.left) / r.width, 0, 1); };
    el.seek.addEventListener('pointerdown', e => {
      this.dragging = true; el.seek.classList.add('drag'); el.seek.setPointerCapture(e.pointerId);
      const f = frac(e.clientX); el.played.style.width = el.knob.style.left = (f * 100) + '%';
    });
    el.seek.addEventListener('pointermove', e => {
      const f = frac(e.clientX);
      el.tip.textContent = fmtDur(f * dur()); el.tip.style.left = (f * 100) + '%';
      if (this.dragging) el.played.style.width = el.knob.style.left = (f * 100) + '%';
    });
    el.seek.addEventListener('pointerup', e => {
      if (!this.dragging) return;
      this.dragging = false; el.seek.classList.remove('drag');
      v.currentTime = frac(e.clientX) * dur(); paint();
    });

    // menu, subtitles, skip intro
    q('.gear').onclick = e => { e.stopPropagation(); el.menu.classList.toggle('open'); };
    el.cc.onclick = () => this.#setSub(this.subIndex >= 0 ? -1 : Math.max(0, this.lastSub ?? 0));
    el.skip.onclick = () => { if (this.intro) v.currentTime = this.intro.end; };
    document.addEventListener('click', this.docClick = e => { if (!b.contains(e.target)) el.menu.classList.remove('open'); });

    // auto-hide controls while playing
    const wake = () => { b.classList.remove('idle'); clearTimeout(this.idleT); this.idleT = setTimeout(() => b.classList.add('idle'), 2800); };
    b.addEventListener('mousemove', wake);
    b.addEventListener('touchstart', wake, { passive: true });
    wake();

    // keyboard
    this.keys = e => {
      if (e.key === 'Escape' && el.menu.classList.contains('open') && !document.querySelector('.modal-back')) { el.menu.classList.remove('open'); return; }
      if (isTyping() || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      let used = true;
      if (k === ' ' || k === 'k') toggle();
      else if (k === 'arrowright') v.currentTime += 5;
      else if (k === 'arrowleft') v.currentTime -= 5;
      else if (k === 'l') v.currentTime += 10;
      else if (k === 'j') v.currentTime -= 10;
      else if (k === 'arrowup') v.volume = Math.min(1, v.volume + 0.05);
      else if (k === 'arrowdown') v.volume = Math.max(0, v.volume - 0.05);
      else if (k === 'f') this.#fullscreen();
      else if (k === 't') this.setTheater(!this.theater, true);
      else if (k === 'm') v.muted = !v.muted;
      else if (k === 'c' && !el.cc.hidden) el.cc.click();
      else if (k === 'n' && this.o.hasNext) this.o.onNext?.();
      else if (/^[0-9]$/.test(k)) v.currentTime = dur() * (+k / 10);
      else used = false;
      if (used) { e.preventDefault(); wake(); }
    };
    document.addEventListener('keydown', this.keys);
    this.hide = () => this.#save(true);
    window.addEventListener('pagehide', this.hide);
  }

  #fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else this.box.requestFullscreen?.();
  }

  setTheater(on, notify = false) {
    this.theater = on;
    this.el.th.classList.toggle('on', on);
    if (notify) this.o.onTheater?.(on);
  }

  // ---------------------------------------------------------------- loading
  /** @param {{sources, subtitles, intro, startAt, autoplay}} p  (sources/subtitles/intro as returned by the extension) */
  load({ sources, subtitles = [], intro = null, startAt = 0, autoplay = true }) {
    this.sources = sources; this.subs = subtitles; this.intro = intro; this.seekTo = startAt; this.autoplay = autoplay;
    this.si = 0; this.levels = [];
    this.el.cc.hidden = !subtitles.length;
    const pick = subtitles.findIndex(s => s.default);
    const en = subtitles.findIndex(s => /^en/i.test(s.lang));
    this.lastSub = pick >= 0 ? pick : en >= 0 ? en : 0;
    this.#renderMenu();
    this.#attach(sources[0]);
    this.#setSub(pick >= 0 ? pick : en);
  }

  selectSource(i) {
    this.seekTo = this.v.currentTime || this.seekTo;
    this.si = i; this.levels = [];
    this.box.classList.remove('err');
    this.#renderMenu();
    this.#attach(this.sources[i]);
  }

  #teardownHls() {
    if (this.hls) { try { this.hls.destroy(); } catch { /* already gone */ } this.hls = null; }
  }

  async #attach(src) {
    const v = this.v, token = (this.attachToken = (this.attachToken || 0) + 1);
    this.detaching = true;
    this.#teardownHls();
    v.removeAttribute('src'); v.load();
    this.detaching = false;
    this.netRetry = 0; this.mediaRetry = 0;
    this.box.classList.remove('err'); this.box.classList.add('wait');
    const badge = this.el.badge;
    badge.hidden = false; badge.textContent = [src.type.toUpperCase(), src.quality || src.label].filter(Boolean).join(' · ');

    if (location.protocol === 'https:' && src.url.startsWith('http:')) {
      return this.#fail('This source uses an insecure (http) link, which your browser blocks on an https page.');
    }
    if (src.type !== 'hls') { v.src = src.url; return; }

    let Hls = null;
    try { Hls = await loadHls(); } catch { /* fall through to native HLS */ }
    if (this.dead || token !== this.attachToken) return;
    if (Hls && Hls.isSupported()) {
      const hls = this.hls = new Hls({ enableWorker: true });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.levels = hls.levels.map((l, i) => ({ i, h: l.height || 0, b: l.bitrate || 0 })).sort((a, b) => b.h - a.h || b.b - a.b);
        this.#renderMenu();
      });
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR && this.netRetry++ < 2) hls.startLoad();
        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && this.mediaRetry++ < 1) hls.recoverMediaError();
        else this.#fail(d.type === Hls.ErrorTypes.NETWORK_ERROR
          ? "Couldn't download the video stream (network error, or the server blocks browser requests)."
          : "Your browser couldn't decode this stream.");
      });
      hls.loadSource(src.url);
      hls.attachMedia(v);
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src.url; // Safari and iOS play HLS natively
    } else {
      this.#fail("This browser can't play HLS streams.");
    }
  }

  #fail(msg) {
    const b = this.box;
    b.classList.remove('wait'); b.classList.add('err');
    b.querySelector('.vmsg').textContent = msg;
    const btns = b.querySelector('.vbtns');
    btns.innerHTML = '';
    const add = (label, primary, fn) => {
      const x = document.createElement('button');
      x.type = 'button'; x.className = `btn sm ${primary ? 'primary' : 'ghost'}`; x.textContent = label; x.onclick = fn;
      btns.append(x);
    };
    if (this.si + 1 < this.sources.length) add('Try next server', true, () => this.selectSource(this.si + 1));
    add('Retry', !(this.si + 1 < this.sources.length), () => this.selectSource(this.si));
  }

  // ---------------------------------------------------------------- menu + subtitles
  #renderMenu() {
    const m = this.el.menu, rows = [];
    if (this.sources.length > 1) {
      rows.push(`<label>Server<select data-k="src">${this.sources.map((s, i) =>
        `<option value="${i}" ${i === this.si ? 'selected' : ''}>${esc([s.label || `Server ${i + 1}`, s.quality].filter(Boolean).join(' · '))}</option>`).join('')}</select></label>`);
    }
    if (this.levels.length > 1) {
      rows.push(`<label>Quality<select data-k="lvl"><option value="-1">Auto</option>${this.levels.map(l =>
        `<option value="${l.i}">${l.h ? l.h + 'p' : Math.round(l.b / 1000) + ' kbps'}</option>`).join('')}</select></label>`);
    }
    if (this.subs.length) {
      rows.push(`<label>Subtitles<select data-k="sub"><option value="-1">Off</option>${this.subs.map((s, i) =>
        `<option value="${i}" ${i === this.subIndex ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>`);
    }
    rows.push(`<label>Speed<select data-k="rate">${RATES.map(r =>
      `<option value="${r}" ${r === this.v.playbackRate ? 'selected' : ''}>${r === 1 ? 'Normal' : r + '×'}</option>`).join('')}</select></label>`);
    m.innerHTML = rows.join('');
    m.querySelectorAll('select').forEach(sel => {
      sel.onchange = () => {
        const val = Number(sel.value), k = sel.dataset.k;
        if (k === 'src') this.selectSource(val);
        else if (k === 'lvl' && this.hls) this.hls.currentLevel = val;
        else if (k === 'sub') this.#setSub(val);
        else if (k === 'rate') this.v.playbackRate = val;
      };
    });
  }

  async #setSub(i) {
    this.subIndex = i;
    this.v.querySelectorAll('track').forEach(t => t.remove());
    this.blobs.splice(0).forEach(u => URL.revokeObjectURL(u));
    this.el.cc.classList.toggle('on', i >= 0);
    const sel = this.el.menu.querySelector('[data-k="sub"]'); if (sel) sel.value = String(i);
    if (i < 0) return;
    this.lastSub = i;
    const s = this.subs[i];
    try {
      const vtt = toVtt(await fetchText(s.url));
      if (this.dead || this.subIndex !== i) return;
      const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
      this.blobs.push(url);
      const tr = document.createElement('track');
      tr.kind = 'subtitles'; tr.label = s.label; tr.src = url; tr.default = true;
      if (s.lang !== 'und') tr.srclang = s.lang;
      this.v.appendChild(tr);
      tr.track.mode = 'showing';
    } catch (err) {
      this.o.onMessage?.(`Couldn't load subtitles: ${err.message}`);
      this.subIndex = -1; this.el.cc.classList.remove('on');
    }
  }

  // ---------------------------------------------------------------- progress + up next
  #save(force, ended = false) {
    if (this.dead) return;
    const now = Date.now();
    if (!force && now - this.lastSave < 5000) return;
    const d = this.v.duration, t = ended ? d : this.v.currentTime;
    if (!Number.isFinite(d) || d <= 0 || t < 3) return;
    this.lastSave = now;
    this.o.onProgress?.({ t, d });
  }

  showUpNext({ label, seconds = 8 }, onGo) {
    const n = this.box.querySelector('.nextup'), s = n.querySelector('.nu-s');
    n.hidden = false;
    n.querySelector('.nu-l').textContent = label;
    let left = seconds;
    s.textContent = `in ${left}s`;
    clearInterval(this.upTimer);
    const go = () => { this.hideUpNext(); onGo(); };
    this.upTimer = setInterval(() => { left -= 1; if (left <= 0) go(); else s.textContent = `in ${left}s`; }, 1000);
    n.querySelector('.nu-go').onclick = go;
    n.querySelector('.nu-cancel').onclick = () => this.hideUpNext();
  }
  hideUpNext() { clearInterval(this.upTimer); this.box.querySelector('.nextup').hidden = true; }

  destroy() {
    if (this.dead) return;
    this.#save(true);
    this.dead = true;
    clearInterval(this.upTimer); clearTimeout(this.idleT);
    document.removeEventListener('keydown', this.keys);
    document.removeEventListener('click', this.docClick);
    document.removeEventListener('fullscreenchange', this.fsc);
    window.removeEventListener('pagehide', this.hide);
    this.#teardownHls();
    this.blobs.splice(0).forEach(u => URL.revokeObjectURL(u));
    this.detaching = true;
    try { this.v.pause(); this.v.removeAttribute('src'); this.v.load(); } catch { /* element already gone */ }
    if (document.fullscreenElement === this.box) document.exitFullscreen().catch(() => {});
  }
}
