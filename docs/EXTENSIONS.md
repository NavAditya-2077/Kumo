# Writing KUMO extensions

An extension is two files, hosted anywhere that serves static files over HTTPS (GitHub raw URLs, GitHub Pages, your own site):

```
manifest.json    describes the extension and what it may do
index.js         the code
```

Start from [`docs/extension-template/`](extension-template/). The bundled [`extensions/open-movies`](../extensions/open-movies/) is a complete example.

## manifest.json

| Field | Required | Notes |
|---|---|---|
| `id` | yes | 2–64 chars: lowercase letters, digits, `.` `-` `_`. Must be unique. |
| `name` | yes | Shown in the UI. |
| `version` | yes | Dotted numbers, e.g. `1.2.0`. KUMO offers an update when a repository lists a higher one. |
| `entry` | yes | Path to the code, relative to the manifest. |
| `apiVersion` | no | Must be `1` (the current API). |
| `type` | no | Only `"provider"` exists. |
| `author`, `description`, `language`, `homepage`, `icon` | no | Display only. `icon` is a path relative to the manifest. |
| `nsfw` | no | Set `true` if the source can contain adult content. |
| `permissions.network` | no | Hosts the extension may contact with `ctx.fetch`: `"api.example.com"`, `"*.example.com"` or `"*"` (any public site; users see a warning). Default: none. Private/LAN addresses are always blocked. |
| `settings` | no | User-editable options. Each: `{ key, label, type, default, help?, options? }` with `type` one of `text`, `password`, `number`, `toggle`, `select` (`options: [{value,label}]`). |

## index.js

Call `kumo.register({...})` once with up to three functions. All may be `async`; throw an `Error` with a helpful message when something fails (it is shown to the user).

### `search({ query, media }, ctx)` → results
`query` is the title to look for. `media` has `{ id, idMal, title:{romaji,english,native}, synonyms, year, season, format, episodes, status }`. Return:

```js
[{ id: 'slug-or-id', title: 'Name on your site', cover?: 'https://…', year?: 2023, variant?: 'dub' }]
```

KUMO ranks results by title similarity (penalising a different season or year), picks one automatically when it is clearly the best, otherwise asks the user. Put `sub`/`dub` in `variant`.

### `episodes({ id }, ctx)` → episodes
`id` is the id you returned from `search`.

```js
[{ id: 'episode-id', number: 1, title?: 'Name', thumbnail?: 'https://…', filler?: false }]
```

### `streams({ id, number, seriesId }, ctx)` → video
`id` is the episode id.

```js
{
  sources: [{ url: 'https://…/master.m3u8', type?: 'hls' | 'mp4' | 'webm', quality?: '1080p', label?: 'Server 1' }],
  subtitles?: [{ url, lang: 'en', label: 'English', default?: true }],   // .vtt, .srt or .ass
  intro?: { start: 85, end: 175 }                                         // seconds, enables "Skip intro"
}
```

Use `https` URLs (browsers block `http` media on HTTPS pages). HLS and subtitle files must send CORS headers. DASH (`.mpd`) is ignored.

## The `ctx` object

| Member | Description |
|---|---|
| `ctx.fetch(url, { method, headers, body })` | Request to a host allowed by `permissions.network`. GET, POST or HEAD. Returns `{ ok, status, url, headers, text(), json(), html() }`. 20 s timeout, 5 MB body limit. URLs with credentials are rejected. |
| `ctx.settings` | Current values of your manifest `settings`. |
| `ctx.log(...)`, `ctx.warn(...)`, `ctx.error(...)` | Shown in **Extensions → Logs**. |
| `ctx.sleep(ms)` | Wait. |

## The sandbox

Your code runs in an iframe with an opaque origin and no network, storage, cookies or access to the KUMO page. Only `ctx.fetch` leaves the sandbox. Return plain data (strings, numbers, arrays, objects): everything is validated and trimmed by the host.

## Publishing

- **Single extension:** host `manifest.json` + `index.js`; users paste the manifest URL into *Extensions → Add*.
- **Repository:** host an `index.json` listing several extensions; users paste that URL once and then browse and install from the app.

```json
{
  "name": "My Repo",
  "extensions": [
    {
      "id": "my-source", "name": "My Source", "version": "1.0.0", "author": "me",
      "description": "…", "language": "en",
      "manifest": "my-source/manifest.json", "icon": "my-source/icon.svg"
    }
  ]
}
```

Relative `manifest`/`icon` paths resolve against the `index.json` URL. GitHub "blob" links are converted to raw links automatically.

## One-click "Add to KUMO" links

Link to `https://YOUR_USERNAME.github.io/YOUR_REPO/#/extensions?add=<URL>` where `<URL>` is a (URL-encoded) manifest or repository index URL. KUMO shows what the extension can access and asks before adding anything. Example:

```
https://YOUR_USERNAME.github.io/Kumo/#/extensions?add=https%3A%2F%2Fexample.com%2Fmy-repo%2Findex.json
```

## Responsibility

KUMO is a player and does not review, host or endorse extensions. Write and use extensions only for content you are entitled to access.
