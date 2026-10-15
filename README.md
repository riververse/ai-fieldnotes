# AI 现场 / AI Fieldnotes

A small, independent Chinese-language AI publication. Editorial newspaper typography meets a vertical reading feed, covering industry changes, product and image capabilities, practical AI methods, and original workflow ideas.

## What this is

- A public, static editorial snapshot. Source verification date is displayed separately from each source's original publication date.
- Ten curated pieces with official primary sources, analysis, practical steps, and explicit limitations.
- Original SVG/CSS explanatory diagrams with small, deterministic interactions. These are not vendor screenshots, generated-image samples, benchmark results, or working AI automations.
- Category and region filters, full-text keyword search, expandable articles, article hash links, and browser-local bookmarks.
- No account, backend, API key, analytics, external font request, package installation, or paid service is required.

## Preview

Open `index.html` in a browser. It works from a `file://` URL because the data is loaded as a local script rather than fetched.

For a conventional local server, from this directory run:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. Only use a server if the execution environment permits it.

## Edit the publication

`content.json` is the single editorial source. Never change `content-data.js` by hand. After editing the JSON, run:

```sh
python3 build.py
node test-site.cjs
```

The site needs these seven files to run:

- `index.html`
- `style.css`
- `app.js`
- `site-core.js`
- `content-data.js`
- `content.json`
- `favicon.svg`

`README.md`, `build.py`, and `test-site.cjs` are optional for serving but useful for maintenance.

Post categories are `industry`, `product`, `practice`, and `embedded`. `embedded` is the broader original-experiment section, not an assertion that every idea concerns embedded hardware. Regions are `china` or `global`; "global" is an editorial scope, not a claim of universal service availability.

Required content fields include `id`, `category`, `region`, `title`, `dek`, `verifiedAt`, `sources`, `summary`, `analysis`, and `caveat`. Use a stable, unique lowercase `id`. Each `sources` entry needs a title and an HTTPS URL. Use `date: null` for rolling documentation or undated original proposals. Keep the verification date honest: do not advance it without rechecking sources.

Supported diagram styles are `model`, `chip`, `vision`, `docs`, `mcp`, `workflow`, `browser`, and `terminal`. Demonstrations use predefined states; they do not call AI services or take external actions.

## GitHub Pages deployment

This site uses relative asset URLs and is compatible with a repository subpath such as `/ai-fieldnotes/`.

1. Commit the static files to the repository root on the `main` branch.
2. In the repository, open Settings → Pages.
3. Choose "Deploy from a branch", `main`, and `/ (root)`.
4. Wait for GitHub Pages to finish deploying, then open the exact URL GitHub reports.
5. Test the page itself and a direct `#post=ARTICLE_ID` URL, including on a narrow/mobile viewport.

There are no build dependencies or custom-domain requirements. Publishing is public: do not add personal data, credentials, private source links, unpublished information, or confidential material to the repository.

## Interaction and accessibility

- Press `/` to focus search; press Escape while in search to clear it.
- Category and region filters combine with search. Clicking a topic tag resets other filters and searches that topic.
- "剪报" saves an article in this browser's local storage; it is not synced across devices. If storage is blocked, bookmarks last only for the current page session, with an explicit notice.
- "链接" copies the article URL. If the clipboard API is unavailable, a selectable-link dialog is shown.
- Article title and "展开阅读" both expand the article. A direct hash link opens and scrolls to that article.
- Visible keyboard focus, semantic headings, button states, source links, reduced-motion preference, responsive layout, and a print stylesheet are included.

## Testing notes

`test-site.cjs` uses Node's standard library only. It checks editorial structure, data synchronization, relative assets, filtering, search, bookmark recovery, hash links, HTML escaping, allowed link protocols, responsive/accessibility hooks, and application boot/event rendering in a DOM stub. It does not replace browser layout, keyboard, actual clipboard, or assistive-technology testing.

All editorial summaries and diagrams are original. Source material remains with its respective publishers; links are provided for context and verification. The publication is not affiliated with the vendors covered.
