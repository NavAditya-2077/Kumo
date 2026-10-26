# KUMO

An extension-based anime player that runs entirely in your browser. No server, no accounts, no build step.

- **Catalog** (titles, artwork, descriptions, recommendations) comes from the free [AniList](https://anilist.co) API.
- **Video** comes from **extensions** you install, the same idea as Seanime or Aniyomi. An extension knows how to find episodes on one source; KUMO matches the anime to the source, lists the episodes and plays them.
- **Your data** (list, watch history, settings, installed extensions) is stored in your browser. Export a backup any time from Settings.

> **KUMO hosts no video and ships no sources of its own.** The only bundled extension is a demo that plays four openly licensed Blender Foundation films. Extensions are third-party code written by other people; you are responsible for what you install and watch, and for following the laws and terms that apply to you.

## Run it

KUMO is static files, so any web server works. It must be served over `http(s)://` (opening `index.html` as a `file://` page will not work because of ES modules and the extension sandbox).

```bash
npm run dev          # serves http://localhost:8080
# or:  python3 -m http.server 8080
```

## Deploy to GitHub Pages

1. Push this repo to GitHub (`main` branch).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The included workflow (`.github/workflows/pages.yml`) publishes the site on every push. It also downloads [hls.js](https://github.com/video-dev/hls.js) into `vendor/` at deploy time so HLS streams play (the app falls back to a CDN copy if that file is missing).

The site URL will be `https://YOUR_USERNAME.github.io/YOUR_REPO/`. All paths are relative, so project sites work without configuration.

## Install it as an app

KUMO is a Progressive Web App. Once it is served over **https** (GitHub Pages is), your browser can install it so it opens in its own window with its own icon:

- **Chrome / Edge (desktop, Android):** click the install icon in the address bar, or Settings → *Install KUMO*.
- **iPhone / iPad (Safari):** Share → *Add to Home Screen*.

The app shell works offline; the catalog and video still need a connection. (Over plain `http://localhost` the service worker runs but browsers may not offer the install button.)

## Using extensions

1. Open **Extensions → Browse** and install the demo, or **Add & repositories** to paste the URL of an extension manifest or a repository index.
2. KUMO shows what the extension is allowed to do (which websites it can contact) before it installs.
3. Open any anime and press play. KUMO searches the extension, picks the best title match (asking you if it is unsure) and remembers your choice.

If an extension fails with a network error, the website it talks to may block browser requests (CORS). In **Settings** you can set an optional CORS proxy that you run or trust; it is used for the extension's API requests only, never for video.

### Security model

Extension code is untrusted. KUMO runs each one inside a hidden, sandboxed iframe with an opaque origin and a Content-Security-Policy of `default-src 'none'`: it cannot read the KUMO page, your list or history, cookies or storage, and cannot make network requests itself. Its only way out is `ctx.fetch()`, which the app checks against the hosts in the extension's manifest (never private/LAN addresses, even with `*`, and redirects are re-checked). Whatever it returns is validated before use. This limits damage but is not a promise that an extension is *honest*: a malicious source could still show you misleading titles or play unwanted video. Only install extensions from authors you trust.

## Write an extension

See **[docs/EXTENSIONS.md](docs/EXTENSIONS.md)** and the copy-paste starting point in [`docs/extension-template/`](docs/extension-template/). The bundled demo in [`extensions/open-movies/`](extensions/open-movies/) is a complete working example.

## Project layout

```
index.html            app shell (with a Content-Security-Policy)
src/                  ES modules: router, store, AniList client, player, pages
src/extensions/       manager, sandbox runtime, matcher, output validation
extensions/           the official repository (index.json) + demo extension
docs/                 extension API + template
styles/main.css       all styling
```

## Keyboard shortcuts (player)

`Space`/`K` play · `←` `→` ±5 s · `J` `L` ±10 s · `↑` `↓` volume · `M` mute · `F` fullscreen · `T` theater · `C` subtitles · `N` next episode · `0`–`9` jump · `/` focus search

## Known limitations

- DASH (`.mpd`) streams are not supported; HLS (`.m3u8`), MP4 and WebM are.
- HLS playback needs a stream that allows cross-origin requests.
- Data lives in one browser. Use Export/Import in Settings to move it.

## License

MIT, see [LICENSE](LICENSE). hls.js (downloaded at deploy time) is Apache-2.0.
