// Browsers only understand WebVTT. Most anime subtitles are .srt or .ass, so convert on the fly.

export function toVtt(input) {
  const text = String(input).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (/^\s*WEBVTT/.test(text)) return text;
  if (/^\s*\[(Script Info|Events|V4\+? Styles)\]/im.test(text)) return assToVtt(text);
  return 'WEBVTT\n\n' + text.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'); // SRT
}

const stamp = sec => {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000), x = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(x).padStart(3, '0')}`;
};
const assTime = t => {
  const m = /^(\d+):(\d{2}):(\d{2})[.:](\d{1,3})$/.exec((t || '').trim());
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + Number('0.' + m[4].padEnd(2, '0')) : null;
};
/** Split on the first n-1 commas; the final field (the text) may itself contain commas. */
const splitN = (s, n) => {
  const out = []; let rest = s;
  for (let i = 0; i < n - 1; i++) {
    const k = rest.indexOf(',');
    if (k < 0) { out.push(rest); rest = ''; } else { out.push(rest.slice(0, k)); rest = rest.slice(k + 1); }
  }
  out.push(rest);
  return out;
};

export function assToVtt(text) {
  let inEvents = false, fmt = null;
  const cues = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^\[.*\]$/.test(line)) { inEvents = /^\[events\]$/i.test(line); continue; }
    if (!inEvents) continue;
    if (/^format:/i.test(line)) { fmt = line.slice(7).split(',').map(s => s.trim().toLowerCase()); continue; }
    if (!/^dialogue:/i.test(line) || !fmt) continue;
    const parts = splitN(line.slice(9).trim(), fmt.length);
    const field = k => parts[fmt.indexOf(k)];
    const start = assTime(field('start')), end = assTime(field('end'));
    const body = (field('text') || '').replace(/\{[^}]*\}/g, '').replace(/\\N/g, '\n').replace(/\\n/g, ' ').replace(/\\h/g, ' ').trim();
    if (!body || start == null || end == null || end <= start) continue;
    cues.push({ start, end, body: body.replace(/&/g, '&amp;').replace(/</g, '&lt;') });
  }
  cues.sort((a, b) => a.start - b.start);
  return 'WEBVTT\n\n' + cues.map(c => `${stamp(c.start)} --> ${stamp(c.end)}\n${c.body}\n`).join('\n');
}
