// KUMO extension template. Copy this folder, edit manifest.json, and fill in the three functions.
// Full reference: docs/EXTENSIONS.md
//
// Your code runs in a sandbox with NO direct network, storage or DOM access of the page.
// Use `ctx.fetch()` for requests: it only reaches hosts listed in manifest.json → permissions.network.
// "api.example.com" below is a placeholder for whatever API your own source exposes.

kumo.register({
  /**
   * Find the anime on your source.
   * @param {{ query: string, media: object }} input  query = the title to search for;
   *        media = { id, idMal, title: {romaji, english, native}, synonyms, year, season, format, episodes, status }
   * @returns {Array<{ id: string, title: string, cover?: string, year?: number, variant?: string }>}
   *          variant is a short label such as "sub" or "dub".
   */
  async search({ query, media }, ctx) {
    const res = await ctx.fetch('https://api.example.com/search?q=' + encodeURIComponent(query));
    if (!res.ok) throw new Error('Search failed (HTTP ' + res.status + ')');
    const data = await res.json();
    return data.results.map(r => ({ id: r.slug, title: r.name, cover: r.poster, year: r.year }));
  },

  /**
   * List the episodes of one search result.
   * @param {{ id: string }} input  the `id` you returned from search()
   * @returns {Array<{ id: string, number: number, title?: string, thumbnail?: string, filler?: boolean }>}
   */
  async episodes({ id }, ctx) {
    const data = await (await ctx.fetch('https://api.example.com/anime/' + encodeURIComponent(id) + '/episodes')).json();
    return data.episodes.map(e => ({ id: e.id, number: e.number, title: e.title }));
  },

  /**
   * Return playable video for one episode.
   * @param {{ id: string, number: number, seriesId: string }} input
   * @returns {{
   *   sources: Array<{ url: string, type?: 'hls'|'mp4'|'webm', quality?: string, label?: string }>,
   *   subtitles?: Array<{ url: string, lang: string, label: string, default?: boolean }>,
   *   intro?: { start: number, end: number }   // seconds: shows a "Skip intro" button
   * }}
   * Video URLs must be https, and HLS playlists must allow cross-origin (CORS) requests.
   */
  async streams({ id }, ctx) {
    const data = await (await ctx.fetch('https://api.example.com/episode/' + encodeURIComponent(id))).json();
    return {
      sources: data.videos.map(v => ({ url: v.url, quality: v.quality, label: v.server })),
      subtitles: (data.subtitles || []).map(s => ({ url: s.url, lang: s.lang, label: s.label }))
    };
  }
});
