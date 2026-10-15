# AI 现场 / AI Fieldnotes

A small, independent Chinese-language AI publication. Warm editorial typography meets a clearly spaced, social-style reading feed, covering industry changes, product and image capabilities, practical AI methods, and original workflow ideas.

## What this is

- A public, static editorial snapshot. Source verification date is displayed separately from each source's original publication date.
- Curated pieces with official primary sources, analysis, practical steps, and explicit limitations.
- Distinct original animated SVG/CSS explanatory scenes, plus a sunset-and-birds feed introduction. These are not vendor screenshots, generated-image samples, benchmark results, or working AI automations.
- Category and region filters, full-text keyword search, separate article reading views, article hash links, and browser-local bookmarks.
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

The site needs these nine files to run:

- `index.html`
- `style.css`
- `app.js`
- `site-core.js`
- `visuals.js`
- `visuals.css`
- `content-data.js`
- `content.json`
- `favicon.svg`

`README.md`, `DESIGN.md`, `THIRD_PARTY_NOTICES.md`, `build.py`, and `test-site.cjs` are optional for serving but useful for maintenance and attribution.

The three visible sections are `industry` (AI观察: industry, models, and product changes), `practice` (用好AI: general AI-use methods across industries), and `embedded` (脑洞实验: embedded engineering tools, methods, and ideas). The feed initially shows all sections; the small 全部 control resets filters and is not a fourth section. Legacy `product` data maps to `industry`. Evidence badges distinguish existing tools, references, and exploratory proposals; none imply the publication independently reproduced a workflow. Regions are `china` or `global`; "global" is an editorial scope, not a claim of universal service availability.

Required content fields include `id`, `category`, `region`, `title`, `dek`, `verifiedAt`, `sources`, `summary`, `analysis`, and `caveat`. Use a stable, unique lowercase `id`. Each `sources` entry needs a title and an HTTPS URL. Use `date: null` for rolling documentation or undated original proposals. Keep the verification date honest: do not advance it without rechecking sources.

Supported diagram styles are `model`, `chip`, `vision`, `docs`, `mcp`, `workflow`, `browser`, and `terminal`. Demonstrations use predefined states; they do not call AI services or take external actions.

## GitHub Pages deployment

This site uses relative asset URLs and is compatible with a repository subpath such as `/ai-fieldnotes/`.

1. Commit the static files to the repository root on the `main` branch.
2. In the repository, open Settings → Pages.
3. Choose "Deploy from a branch", `main`, and `/ (root)`.
4. Wait for GitHub Pages to finish deploying, then open the exact URL GitHub reports.
5. Test the page itself and a direct `#post/ARTICLE_ID` URL, including on a narrow/mobile viewport. Legacy `#post=ARTICLE_ID`, `#article=ARTICLE_ID`, `#article/ARTICLE_ID`, and `#article-ARTICLE_ID` links remain supported.

There are no build dependencies or custom-domain requirements. Publishing is public: do not add personal data, credentials, private source links, unpublished information, or confidential material to the repository.

## Interaction and accessibility

- Press `/` to focus search; press Escape while in search to clear it.
- Category filters combine with search. China/global filters and geography bylines apply only to AI观察; 用好AI, 脑洞实验, and the combined feed ignore retained region selections. Clicking a topic tag resets other filters and searches that topic across all sections. The search placeholder makes the current scope clear.
- "剪报" saves an article in this browser's local storage; it is not synced across devices. If storage is blocked, bookmarks last only for the current page session, with an explicit notice.
- "链接" copies the article URL. If the clipboard API is unavailable, a selectable-link dialog is shown.
- Article title, "阅读全文", and non-interactive card space open a separate article view. The feed and sidebars leave the reading area. Title links support keyboard access, new tabs, and direct deep links.
- "返回信息流" and browser Back return to the previous category, region, search, saved-only state, and scroll position. Browser Forward reopens the article; refreshing a history entry retains its state where the browser supports the History API.
- Article tags return to a filtered feed. Copy, bookmark, source links, and diagram controls never open a card accidentally. Copying a URL does not change the current route.
- Scenes loop at their own pace while visible. IntersectionObserver pauses offscreen scenes and resumes their CSS timelines when they return; hidden route views are also paused. No animation switch is shown. System reduced-motion disables scene animations, and old local pause values do not suppress them. Filtering, return navigation, and diagram controls may create a fresh looping scene. Without IntersectionObserver, displayed scenes keep looping, while hidden views and system reduced-motion still apply.
- The sunset birds have separate curved flight paths, small pitch changes, and independently timed shoulder-pivot wing strokes. In each 12-second loop they enter from beyond the left edge, flap into a glide, exit to the right, and leave an empty sky for more than three seconds. The loop reset stays outside the visible frame.
- Visible keyboard focus, semantic headings, button states, source links, reduced-motion preference, responsive layout, and a print stylesheet are included.

## Testing notes

`test-site.cjs` uses Node's standard library only. It checks editorial structure, data synchronization, relative assets, filtering, search, bookmark recovery, old/new hash links, separate article navigation, Back/Forward restoration, click boundaries, motion preferences, HTML escaping, allowed link protocols, responsive/accessibility hooks, and application boot/event rendering in a DOM/history stub. The 61 suites retain the existing 53 behavior, build, full-article and optical-layer checks, then add eight design-system contracts for tokens, numerical text contrast, breakpoint font floors, explicit target sizes, wrap/fallback rules, focus and selected feedback, article metadata preservation, and reference attribution. The small CSS contract reader evaluates declared rules only; it is not a browser CSS engine. These are DOM/CSS contracts, not browser layout, animation paint, frame-rate, native clipboard, or assistive-technology testing.

All editorial summaries and diagrams are original. Source material remains with its respective publishers; links are provided for context and verification. The publication is not affiliated with the vendors covered.

## Design and implementation notes

- All 16 stable article IDs, feed titles and previews, category assignments, and source dates are preserved. Independent article bodies explain the background, a worked example, a reusable task, and how to judge its output. First-party references are rechecked, broad index links are replaced with precise source pages where appropriate, and additional primary references support corrections. `content.json` and its generated bundle remain the editorial source of truth.
- `visuals.js` maps the current article IDs to original scenes. These explain concepts; they do not claim live model calls, tool execution, measured latency, or vendor output.
- `style.css` owns layout, article typography, and the sunset introduction. `visuals.css` owns explanatory-scene styles and keyframes.
- Routing is static-host-friendly: no server rewrites are needed. The page path remains the same and article IDs live in the URL fragment.
- The dependency-free test harness models DOM and History behavior. It does not execute real layout or replace live desktop/mobile visual, screen-reader, and clipboard verification.

## Interaction design

The interface uses clear pressed/selected/focus feedback, generous touch targets, a short article-entry transition, preserved reading position, and native scrolling and browser Back/Forward. Motion helps explain the diagrams; system reduced-motion remains authoritative, with offscreen pauses and scene-specific looping rhythms. These features are not a claim of a complete accessibility audit. Design references: [Material interaction foundations](https://m3.material.io/foundations/), [Material motion](https://m3.material.io/styles/motion/overview/how-it-works), [Apple motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion), and [WebKit reduced-motion guidance](https://webkit.org/blog/7551/responsive-design-for-motion/). This is a publication-specific design, not a replica of an operating system.

## Publication design system

`DESIGN.md` is the project-specific design reference: warm paper and forest ink, device-local Chinese serif titles and sans prose, explicit spacing/type roles, readable article metadata, a bounded 40em reading column, and 44px key controls. It records selected ideas and rejected assumptions from the MIT-licensed VoltAgent/awesome-design-md Claude, WIRED, and Framer analyses. Upstream attribution is retained in `THIRD_PARTY_NOTICES.md`; no brand assets, proprietary fonts, external stylesheets, or new runtime dependencies are included.

The design refinement preserves all article content, navigation and animated timelines. Source rows, task packages and narrow metadata receive clearer layout; small text no longer shrinks the article's important dates, badges or captions below 11px. Headline balance is progressive enhancement with ordinary wrapping as fallback. Static tests are followed by real desktop/narrow-browser inspection for each published visual release.

## Release and cache coherence

`python3 build.py` first generates `content-data.js`, then hashes the final bytes of seven runtime assets: both stylesheets, all four scripts (including the generated bundle), and the favicon. It creates one deterministic `20261015r3-<12 hexadecimal characters>` release key and stamps that same key into every asset URL, the HTML `data-release`, `app-release` metadata, and the small visible footer version.

Run the build after any content or asset change, including automated daily updates. Unchanged builds are byte-for-byte idempotent; changing editorial content, application code, or styles creates a new cache key automatically. No manual version bump is required. Do not edit the generated content bundle by hand. Run `node test-site.cjs` before freezing and publishing the complete release, then verify the deployed footer version, article count, and versioned asset URLs.

A cache-isolated verification link can use the site URL with `?v=<release shown in the footer>` before any article fragment. The site remains usable under a repository subpath and from local files. The asset release hash deliberately excludes the stamped HTML to avoid a circular hash; newly added runtime assets must also be added to `ASSET_FILES` in `build.py`.
