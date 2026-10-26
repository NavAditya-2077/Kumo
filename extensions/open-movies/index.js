// KUMO demo extension: "Open Movies".
//
// Streams four open-licensed films by the Blender Foundation (https://www.blender.org/about/projects/),
// released under Creative Commons Attribution licences: Big Buck Bunny, Sintel, Tears of Steel and
// Elephants Dream. It never touches the network itself (see "permissions": { "network": [] } in the
// manifest): it only hands back URLs for the player to load.
//
// It's also the smallest complete example of the extension API. See docs/EXTENSIONS.md.

const SAMPLES = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/';

const FILMS = [
  { title: 'Big Buck Bunny', mp4: SAMPLES + 'BigBuckBunny.mp4', hls: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
  { title: 'Sintel', mp4: SAMPLES + 'Sintel.mp4', hls: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8' },
  { title: 'Tears of Steel', mp4: SAMPLES + 'TearsOfSteel.mp4' },
  { title: 'Elephants Dream', mp4: SAMPLES + 'ElephantsDream.mp4' }
];

kumo.register({
  // 1. Find the show. KUMO passes the title it is looking for in `query`
  //    (and the full catalog entry in `media`). A real extension would search its site here.
  //    This demo has no site: it answers every search with one result named after the query, so
  //    any anime on KUMO opens the same four demo films. That makes it easy to try the player.
  async search({ query, media }, ctx) {
    return [{ id: 'collection', title: query, variant: 'Demo clips' }];
  },

  // 2. List its episodes.
  async episodes({ id }, ctx) {
    if (id === 'bbb') return [{ id: 'bbb:1', number: 1, title: FILMS[0].title }];
    return FILMS.map((f, i) => ({ id: `collection:${i + 1}`, number: i + 1, title: f.title }));
  },

  // 3. Give KUMO something to play.
  async streams({ id }, ctx) {
    const index = id.startsWith('bbb') ? 0 : Number(id.split(':')[1]) - 1;
    const film = FILMS[index];
    if (!film) throw new Error('Unknown episode: ' + id);

    const direct = { url: film.mp4, type: 'mp4', quality: '720p', label: 'Direct (MP4)' };
    const adaptive = film.hls ? { url: film.hls, type: 'hls', quality: 'Auto', label: 'Adaptive (HLS)' } : null;
    const sources = adaptive && ctx.settings.prefer === 'hls' ? [adaptive, direct] : adaptive ? [direct, adaptive] : [direct];

    return { sources, subtitles: [] };
  }
});
