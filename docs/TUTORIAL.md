# Tutorial: build your first KUMO extension

You will make an extension that plays **your own videos** from a `catalog.json` you host. It takes about 15 minutes, needs only a text editor and your GitHub repo, and teaches everything every extension uses. The finished code is in [`docs/tutorial/my-library/`](tutorial/my-library/).

> Only build extensions for content you own or are licensed to stream.

## The idea

KUMO knows *which anime* you want (from AniList) but not *where the video is*. An extension answers three questions:

| KUMO asks | Your function | You return |
|---|---|---|
| "Is this anime on your source?" | `search` | a list of matching shows |
| "What episodes does this show have?" | `episodes` | a list of episodes |
| "Where is the video for episode N?" | `streams` | video URL(s) and optional subtitles |

Your code runs in a sandbox. It cannot touch the page, your data, or the network directly; its only way out is `ctx.fetch`, which works only for hosts you declare in the manifest.

## Step 1: host some videos and a catalogue

Anything that serves files over **https** works. Easiest: your own GitHub Pages repo (keep individual files under ~100 MB), or any storage/server you control. Make sure the video host allows cross-origin requests (GitHub Pages does).

Create `catalog.json` next to your videos (see `tutorial/my-library/catalog.example.json`):

```json
{
  "shows": [
    {
      "id": "big-buck-bunny",
      "title": "Big Buck Bunny",
      "year": 2008,
      "episodes": [
        { "number": 1, "title": "Big Buck Bunny", "video": "https://YOU.github.io/REPO/videos/bbb.mp4", "quality": "720p" }
      ]
    }
  ]
}
```

`title` should be the anime's usual name so KUMO can match it.

## Step 2: the manifest

Create `extensions/my-library/manifest.json` (copy from `tutorial/my-library/manifest.json`):

- `id`: unique, lowercase (`my-library`).
- `entry`: the code file (`index.js`).
- `permissions.network`: **the host of your catalogue**, e.g. `["YOU.github.io"]`. Anything not listed is blocked.
- `settings`: here, one text field for the catalogue URL. Users can change it without editing code.

## Step 3: the code

Copy `tutorial/my-library/index.js`. The key parts:

```js
kumo.register({
  async search({ query }, ctx) { /* return [{ id, title, year? }] */ },
  async episodes({ id }, ctx)  { /* return [{ id, number, title? }] */ },
  async streams({ id }, ctx)   { /* return { sources: [{ url, quality? }], subtitles? } */ }
});
```

Useful helpers: `ctx.fetch(url)` (returns `{ ok, status, json(), text(), html() }`), `ctx.settings.catalog` (the setting value), `ctx.log(...)` (debugging), and `throw new Error('clear message')` for anything the user should be told.

## Step 4: publish and install

1. Commit `extensions/my-library/{manifest.json,index.js}` and push. Wait for Pages to redeploy.
2. In KUMO: **Extensions → Add & repositories**, paste  
   `https://YOU.github.io/REPO/extensions/my-library/manifest.json`.
3. Check the permission prompt, install, then open **Extensions → Settings** on it and make sure the catalogue URL is right.
4. Open an anime whose title is in your catalogue and press play.

## Step 5: debug

- **Extensions → Logs** shows everything you `ctx.log`ged and any errors.
- *"Blocked: this extension may not contact…"* → add the host to `permissions.network`.
- *Picker shows up every time* → your `title` is not close to the anime's title; rename it or use the "Wrong title?" button once (KUMO remembers the choice).
- *Video won't play* → open the video URL in a new tab; it must be `https`, reachable, and in MP4/WebM/HLS.
- *Changed the code but nothing changed* → bump `version` in the manifest and re-add it; the installed copy is stored in your browser.

## Going further

- **Several qualities or servers:** return more entries in `sources`.
- **Subtitles:** add `{ url, lang, label }` entries (`.vtt`, `.srt`, `.ass`).
- **Skip-intro button:** return `intro: { start, end }` in seconds.
- **A real API instead of a catalogue file:** call it with `ctx.fetch` from each function (declare its host), and map its fields to the shapes above. An API key can be a `password` setting.
- **Share with others:** an `index.json` repository, or a one-click `#/extensions?add=<URL>` link. See [EXTENSIONS.md](EXTENSIONS.md).
