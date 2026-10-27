// "My Library": a complete, small KUMO extension.
// It reads a catalog.json that YOU host (your own videos) and hands the matching entries to KUMO.

async function loadCatalog(ctx) {
  const url = ctx.settings.catalog;
  if (!url) throw new Error('Set the catalogue URL in this extension\'s settings.');
  const res = await ctx.fetch(url);                       // only hosts in manifest permissions work
  if (!res.ok) throw new Error('Could not load the catalogue (HTTP ' + res.status + ').');
  return res.json();                                       // { shows: [...] }
}

kumo.register({
  // 1. SEARCH: KUMO gives you a title; return the shows in your catalogue that could match.
  async search({ query }, ctx) {
    const { shows } = await loadCatalog(ctx);
    const q = query.toLowerCase();
    const hits = shows.filter(s => s.title.toLowerCase().includes(q) || q.includes(s.title.toLowerCase()));
    ctx.log('search', query, '->', hits.length, 'hit(s)');
    return hits.map(s => ({ id: s.id, title: s.title, year: s.year }));
  },

  // 2. EPISODES: list the episodes of the show you returned from search().
  async episodes({ id }, ctx) {
    const { shows } = await loadCatalog(ctx);
    const show = shows.find(s => s.id === id);
    if (!show) throw new Error('Show not found in the catalogue: ' + id);
    return show.episodes.map(e => ({ id: id + ':' + e.number, number: e.number, title: e.title }));
  },

  // 3. STREAMS: return playable video links (and optional subtitles) for one episode.
  async streams({ id }, ctx) {
    const [showId, number] = id.split(':');
    const { shows } = await loadCatalog(ctx);
    const ep = shows.find(s => s.id === showId)?.episodes.find(e => String(e.number) === number);
    if (!ep) throw new Error('Episode not found: ' + id);
    return {
      sources: [{ url: ep.video, quality: ep.quality || '', label: 'My server' }],
      subtitles: ep.subtitles ? [{ url: ep.subtitles, lang: 'en', label: 'English', default: true }] : []
    };
  }
});
