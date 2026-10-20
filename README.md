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

Required content fields include `id`, `category`, `region`, `title`, `dek`, `verifiedAt`, `sources`, `summary`, `analysis`, and `caveat`. Use a stable, unique lowercase `id`. Each `sources` entry needs a title and an HTTPS URL. Use `date: null` for rolling documentation or undated original proposals. Keep each article’s verification date honest: do not advance it without rechecking sources. The site-level date is the most recent selective verification, not a claim that every earlier article was rechecked that day.

Supported diagram styles are `model`, `chip`, `vision`, `docs`, `mcp`, `workflow`, `browser`, and `terminal`. Illustrations use authored, automatic reading notes; they do not call AI services or take external actions.

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
- Article tags return to a filtered feed. Copy, bookmark, source links, and non-interactive diagram regions never open a card accidentally. Copying a URL does not change the current route.
- Scenes loop at their own pace while visible. IntersectionObserver pauses offscreen scenes and resumes their CSS timelines when they return; hidden route views are also paused. No animation switch is shown. System reduced-motion disables scene animations, and old local pause values do not suppress them. Filtering, bookmarking, and return navigation may create a fresh looping scene. Without IntersectionObserver, displayed scenes keep looping, while hidden views and system reduced-motion still apply.
- The sunset birds have separate curved flight paths, small pitch changes, and independently timed shoulder-pivot wing strokes. In each 12-second loop they enter from beyond the left edge, flap into a glide, exit to the right, and leave an empty sky for more than three seconds. The loop reset stays outside the visible frame.
- Diagram explanations change automatically every six seconds with a short, gentle vertical fade. Grid overlays reserve the tallest explanation’s natural height, including when text wraps. Diagrams have no demo buttons or live announcements: a complete, stable ordered transcript is available to screen readers, and system reduced-motion and print show every point as normal text. Diagram taps do not navigate. Real copy, bookmark, tag, filter, read, and back actions remain interactive.
- Mobile card taps use a pale warm-green pressed surface instead of the browser’s full-card tap overlay. Visible keyboard focus, semantic headings, button states, source links, reduced-motion preference, responsive layout, and a print stylesheet are included.

## Testing notes

`test-site.cjs` uses Node's standard library only. It checks editorial structure, data synchronization, relative assets, filtering, search, bookmark recovery, old/new hash links, separate article navigation, Back/Forward restoration, click boundaries, motion preferences, HTML escaping, allowed link protocols, responsive/accessibility hooks, and application boot/event rendering in a DOM/history stub. The pre-case 88-suite baseline retains the 72 established suites for behavior, build, full-article and optical-layer checks, three automatic-note/touch-feedback contracts, three practical-guide/content-preservation contracts, five daily-update contracts, and eight design-system contracts for tokens, numerical text contrast, breakpoint font floors, explicit target sizes, wrap/fallback rules, focus and selected feedback, article metadata preservation, and reference attribution. Eight additional suites enforce the October coverage counts, bounded correction hashes, independent article depth, chronology and access status, embedded evidence and licensing, preserved design and scene hashes, new scene labels, and all sixteen new article interaction paths. The small CSS contract reader evaluates declared rules only; it is not a browser CSS engine. These are DOM/CSS contracts, not browser layout, animation paint, frame-rate, native clipboard, or assistive-technology testing.

All editorial summaries and diagrams are original. Source material remains with its respective publishers; links are provided for context and verification. The publication is not affiliated with the vendors covered.

## Design and implementation notes

- In the October 15 expansion, all 16 original articles remained identical as parsed JSON objects: IDs, titles, previews, complete body sections, categories, source dates and references are preserved. Nine additional original practical guides brought that edition to 25 articles, including 12 in 用好AI. The guides cover dot meeting preparation, bounded follow-up, changes during work, conflicting research sources, writing from examples, spreadsheet cleaning, image-edit checks, video learning notes and small Codex fixes. Each guide includes a concrete synthetic exercise, a complete copyable prompt, expected results, revision advice and verified public primary references. No actual private conversation or user project data is included. Independent article bodies explain the background, a worked example, a reusable task, and how to judge its output. First-party references are rechecked, broad index links are replaced with precise source pages where appropriate, and additional primary references support corrections. `content.json` and its generated bundle remain the editorial source of truth.
- `visuals.js` maps the current article IDs to original scenes. The nine new guides reuse suitable abstract artwork through explicit ID mappings with article-specific titles, labels and automatic explanations; the original sixteen scene definitions are retained. The new image-edit guide explicitly uses sky and mountains as a region-preservation analogy, not as a cup-editing result. These explain concepts; they do not claim live model calls, tool execution, measured latency, or vendor output.
- `style.css` owns layout, article typography, and the sunset introduction. `visuals.css` owns explanatory-scene styles and keyframes.
- Routing is static-host-friendly: no server rewrites are needed. The page path remains the same and article IDs live in the URL fragment.
- The dependency-free test harness models DOM and History behavior. It does not execute real layout or replace live desktop/mobile visual, screen-reader, and clipboard verification.

## Interaction design

The interface uses clear pressed/selected/focus feedback, generous touch targets, a short article-entry transition, preserved reading position, and native scrolling and browser Back/Forward. Motion helps explain the diagrams; system reduced-motion remains authoritative, with offscreen pauses and scene-specific looping rhythms. These features are not a claim of a complete accessibility audit. Design references: [Material interaction foundations](https://m3.material.io/foundations/), [Material motion](https://m3.material.io/styles/motion/overview/how-it-works), [Apple motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion), and [WebKit reduced-motion guidance](https://webkit.org/blog/7551/responsive-design-for-motion/). This is a publication-specific design, not a replica of an operating system.

## Publication design system

`DESIGN.md` is the project-specific design reference: warm paper and forest ink, device-local Chinese serif titles and sans prose, explicit spacing/type roles, readable article metadata, a bounded 40em reading column, and 44px key controls. It records selected ideas and rejected assumptions from the MIT-licensed VoltAgent/awesome-design-md Claude, WIRED, and Framer analyses. Upstream attribution is retained in `THIRD_PARTY_NOTICES.md`; no brand assets, proprietary fonts, external stylesheets, or new runtime dependencies are included.

The design refinement preserves all article content, navigation and animated timelines. Source rows, task packages and narrow metadata receive clearer layout; small text no longer shrinks the article's important dates, badges or captions below 11px. Headline balance is progressive enhancement with ordinary wrapping as fallback. Static tests are followed by real desktop/narrow-browser inspection for each published visual release.

## Release and cache coherence

`python3 build.py` first generates `content-data.js`, then hashes the final bytes of seven runtime assets: both stylesheets, all four scripts (including the generated bundle), and the favicon. It creates one deterministic `20261017r1-<12 hexadecimal characters>` release key and stamps that same key into every asset URL, the HTML `data-release`, `app-release` metadata, and the small visible footer version.

Run the build after any content or asset change, including automated daily updates. Unchanged builds are byte-for-byte idempotent; changing editorial content, application code, or styles creates a new cache key automatically. No manual version bump is required. Do not edit the generated content bundle by hand. Run `node test-site.cjs` before freezing and publishing the complete release, then verify the deployed footer version, article count, and versioned asset URLs.

A cache-isolated verification link can use the site URL with `?v=<release shown in the footer>` before any article fragment. The site remains usable under a repository subpath and from local files. The asset release hash deliberately excludes the stamped HTML to avoid a circular hash; newly added runtime assets must also be added to `ASSET_FILES` in `build.py`.

Automatic-note interaction references: [MDN tap highlight](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/-webkit-tap-highlight-color) explains the browser overlay distinct from keyboard focus; [MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) informs the full static transcript fallback. All illustration and particle timelines remain local CSS, with no new timer, network dependency, or animation switch.

## October 16 selective update

Two complete original articles were added: a MiniCPM-V 4.7 1B local-image exercise with an explicit Ollama tag and missing-field checks, and an unexecuted emlearn GMM unknown-state experiment with batch-separated data, feature blind spots, finite-value checks and event-level false-alarm accounting. The publication now has 27 articles: 4 AI观察, 13 用好AI and 10 脑洞实验.

All 25 post objects from main commit `98650a27752dc211a951037542b2e75331cf7457` remain unchanged, including their October 15 source-verification dates. Only the two new articles are verified October 16. The masthead says “最近核验” and the editorial note explains per-article dates. Original source dates remain separate. The two new illustrations are original conceptual SVGs with the existing automatic six-second notes and static transcript fallback; no new runtime dependency, animation switch or diagram button is added. The previous stylesheets, existing scenes, bird loops, filtering, bookmarks and navigation are retained.

The MiniCPM-V tutorial uses the author’s 1B visual-model card and Ollama tag table; download package size is not a RAM requirement, and phone demonstrations are not desktop measurements. The GMM article refers to established tools, not a new release, and explicitly leaves accuracy, thresholds, hardware cost and deployment performance unmeasured. Neither model nor candidate package was installed or run for this editorial update.

Validation: `python3 build.py`, `node test-site.cjs`, exact earlier-object checks, and post-deployment desktop/narrow-browser verification. The 72 automated suites do not substitute for browser visual checks or actual model/hardware experiments.

## October 16 breadth expansion

This later October 16 edition adds 11 industry articles and five embedded-engineering guides to the 27-article snapshot from commit `a80c5fd5ed74f3272c47d860f35acfcd902f8038`. The current totals are **43 articles: 15 AI观察, 13 用好AI and 15 脑洞实验**. The additions cover ChatGPT Intelligent UI, Haiku 5.5 task economics, Opus 5.5 Fast access, GPT-Live-1.1/Quip, Gemini 4 Argon availability, Nano Banana 2.1 continuous edits, EmbeddingGemma 2 retrieval, Runway video-model access, GLM-Legal invitation testing, Qwen-Image 2.1 hosted APIs, Mistral Large 4 preview, and five distinct embedded engineering workflows.

Industry event dates refer to actual October announcements or access changes, not the verification date. September model announcements are stated in the body where relevant. Previews, invitation testing, generally available access and planned weight releases are distinguished. Official performance and pricing claims are attributed and bounded; no model, candidate software, API or hardware was run for this update. Sora service discontinuation is covered with its earlier event dates and official source, not presented as October news.

The embedded guides are based on four published AI-assisted implementations: Microchip's MPLAB Agent tutorial, Memfault's MCP crash-investigation workflow, the AssertLLM2 research pipeline, and Firment's release-candidate capture/measurement tools. One explicitly original teaching combination uses AI with cantools and independent golden-byte calculations. Hardware, resource, commercial-tool and licensing requirements are included; a public GitHub repository without a unified license is not presented as freely reusable. The illustrative inputs and tasks are synthetic.

All 27 earlier article IDs and navigation targets remain. Twenty-six earlier post objects are unchanged. The sole approved factual correction is `deepseek-v41-migration`: its historical September 10 event date is preserved, while an October 16 verification note records the official API changelog's clarification that V4 Pro service continues after September 14 with unchanged billing. The changelog does not separately date that clarification, so the correction does not invent a new October release event.

Thirteen new code-native conceptual SVG layouts and three appropriate existing layouts provide sixteen explicitly mapped scenes with article-specific titles, labels and automatic reading notes. All 27 earlier scene renderings are unchanged. The two stylesheets, application routing, core filtering, typography, bird loops, particle motion, reduced-motion handling and offscreen pauses retain the baseline bytes. There are no new diagram controls or runtime dependencies.

Validation for the frozen edition includes `python3 build.py`, 80 automated suites, exact earlier-object and scene hashes, a deterministic rebuild, and a complete SHA-256 file manifest. These checks do not substitute for real desktop/narrow-browser visual inspection before or after publication, nor for independent model or engineering experiments.


## October 17 selective additions

Five source-checked, full-length articles are appended to the 43-article baseline at commit `ad3c0ba8e16744c3a361f730a82427f90dbbcc98`: OpenAI prompt-to-voice, Kling 4.0 long-take checking, decision switching thresholds, short-answer learning with graded hints, and a proposed Zephyr firmware-memory difference audit. Current totals are **48 articles: 17 AI观察, 15 用好AI and 16 脑洞实验**. All 43 earlier post objects and all 43 earlier scene renderings are preserved exactly. Only the five additions receive the October 17 verification date.

Chronology stays explicit: prompt-to-voice API access is October 16; Kling 4.0 launched October 15, with an October 16 announcement and October 17 website publication. Kling's announced API, 4K and extended-duration plans are not described as already available. Google's October 16 Notebook article describes recently launched study features, without a separate launch date for each. The practical methods and firmware workflow are original teaching designs, not product announcements or reproduced experiments. All examples are synthetic; no candidate software, AI model, paid API session, voice, video, hardware or firmware build was executed for this edition.

The firmware article fixes its source-code reference to Zephyr v4.4.2 and separates existing tools from the proposed AI review workflow. It distinguishes XIP initialization storage, ROM/RAM regions, symbol attribution gaps, static reservations, observed stack use, multiple firmware images and OTA capacity. The arithmetic examples are independently checked. Illustrations are five original code-native conceptual scenes, not copied vendor imagery or model outputs. Their automatic six-second notes and bounded information-flow accents reuse the established animation infrastructure. Stylesheets, routing, filters, typography, bird loops, focus feedback and reduced-motion behavior remain unchanged.

The test suite retains all 80 prior suites (updating edition counts/date snapshots), then adds eight checks for exact 43-post/scene preservation, new full-article requirements, release/access chronology, decision arithmetic and two rising cost lines, learning hints and zero-baseline limits, firmware memory arithmetic and source anchors, semantic scenes/offscreen controls, and all five new interaction paths. The generated bundle and all runtime asset URLs share the build-generated release hash. A deterministic rebuild and full file manifest must precede publication; exact remote commit, Pages success, live content, desktop and narrow-browser checks are verified separately. These tests do not claim model or hardware performance, a complete accessibility audit, or physical-phone coverage.


## October 17 company-practice case batch

Three source-checked Chinese case studies extend the verified `8fd8c5f418f8b7f1cb3eea4af0b64656131350f9` snapshot from 48 to **51 articles: 17 AI观察, 17 用好AI and 17 脑洞实验**. All 48 earlier post objects and individual scene renderings remain unchanged. This is a first small sample of company practices, not a comprehensive survey or a claim that company scale proves reliability.

- `spotify-honk-verification-rollout` (用好AI): Spotify's 2025 Honk context/verifier design and September 16, 2026 quality retrospective. The reported dependency-upgrade incident is not attributed to AI-authored code. The synthetic migration exercise separates eligibility, code/behavior checks, human review and controlled rollout.
- `uber-autocover-test-acceptance` (用好AI): the authors' ICSE-SEIP 2026 industrial paper and the April 15 conference program. The language-specific viable-test rates and the 44% viable-IDE-test acceptance rate use different denominators; deployment statistics are from August–September 2025. The PDF does not separately state its revision date. A synthetic function, mutation examples and 10/6/4 ledger teach independent assertions and denominator discipline.
- `scania-spec2code-contract-gap` (脑洞实验): the November 20, 2024 arXiv v1 industrial feasibility study, checked against ACSL/WP documentation. Production-origin modules do not imply the generated versions were deployed. Proof obligations, equivalence not established and hardware/system integration are distinct. The non-safety synthetic state indicator has no device or actuator connection.

Each article contains a concrete problem, implementation context, source-reported evidence, limitations, an original bounded exercise, human review, cost/privacy considerations and conditions for transferring the practice. New items are marked 待学习 and 流程未本站复现; the embedded article additionally says 未本站实物复现. Source publication dates, conference dates, revision-date gaps and the October 17 verification date are kept separate. No candidate model, company tool, verifier or hardware workflow was executed for this editorial batch.

Three original explanatory SVG scenes use the existing automatic notes, reduced-motion transcript and viewport pause behavior. They are not company screenshots or observed execution. Both stylesheets, application/router code, build script, favicon, design reference and third-party notice are byte-identical to the baseline. The only runtime changes are the new content, new scene mappings and regenerated cache-coherent artifacts.

Run `python3 build.py` and `node test-site.cjs`. The 95 suites include the complete 88-suite baseline with updated edition counts and seven added contracts: all 48 old object/scene hashes and design asset hashes, evidence/dates/learning status, one evidence-boundary suite per company, three scene semantics and all new article interaction paths. These are editorial and DOM/CSS contracts; browser layout, actual animation paint and native clipboard permission UI require separate browser QA. They do not constitute execution or independent replication of the case-study methods.

## October 18 selective update

Two source-checked articles extend commit `6b2053501fbb7cb82ac89e88448d5841583fb96a` from 51 to **53 articles: 18 AI观察, 18 用好AI and 17 脑洞实验**. All 51 earlier article objects, dates, IDs and independently rendered scenes are preserved. This is a selective update, not a daily quota or a new verification date for old posts.

- `deepseek-search-fetch-evidence` covers DeepSeek's October 17, 2026 V4.1-Flash-1017 update and opening of Search/Fetch APIs. It separates current model access, vendor-reported scores, MIT-licensed weights, hosted-service billing, successful search/fetch charges, and a narrowly scoped temporary free period. Its evidence-review exercise and budget arithmetic are synthetic and do not call an API.
- `airbnb-incremental-support-notes` examines Airbnb's 2025 incremental support-note research. It distinguishes the older paper's publication history, a deployed company workflow and its quasi-experimental results from the publication's original handoff exercise. Preserving human edits, meaningful updates, unresolved commitments and evidence review are distinct checks; no model, company software or customer data was used.

Two original code-native explanatory scenes retain the shared automatic notes, static accessible transcript, offscreen pause and reduced-motion behavior. No new control, runtime dependency, external font, API call or design change is introduced. Both stylesheets, application/router code, the build script, favicon, design reference and third-party notice are unchanged. The generated content bundle and HTML cache keys are rebuilt together using the established deterministic generator.

The 102-suite validation preserves all 95 prior suites with updated edition snapshots, then adds seven focused append-only, source-boundary, synthetic-exercise, scene and interaction contracts. Run `python3 build.py` and `node test-site.cjs`; the dependency-free harness checks editorial and DOM behavior, not browser paint. Publication is separately checked against the exact remote commit, successful Pages deployment, live release marker and content, and desktop/narrow-browser interactions. No AI candidate package, model, paid API, firmware or real hardware was executed for this update.


## October 19 selective company-practice update

Two original Chinese practice guides extend approved commit `63166bb9d1587dd3fcc6209c4521d19988fed1e4` from 53 to **55 articles: 18 AI观察, 19 用好AI and 18 脑洞实验**. All 53 older post objects and independently rendered scenes remain exact, including source dates and stable IDs. Only the two additions receive October 19 verification dates.

- `meta-forum-state-verification` (用好AI) studies Meta's October 15 Forum engineering retrospective. The original synthetic exercise separates page identity, build identity, return-path evidence, production-build exclusion and unmeasured memory observations. Meta's reported eight-week delivery and approximately halved memory/page-fault outcomes remain company self-report, not independent replication. Android and Playwright references explain general concepts, not Meta's internal implementation.
- `mathworks-ears-mapping-review` (脑洞实验) studies MathWorks' October 13 requirements-to-test-authoring demonstration against its October 14 pinned example repository. It distinguishes reviewed term/signal mappings, model-copy side effects, generated files, compilation, simulation and assertions. The stricter supplied-demo version prerequisite, restricted MathWorks-use license and narrow upstream test scope remain explicit. Its temperature/state/timing exercise is entirely synthetic.

The two code-native diagrams reuse the established evidence scene and motion infrastructure with article-specific labels and four automatic reading notes. Neither diagram represents a successful tool execution. Both stylesheets, router/app code, generator, favicon, design reference and notices remain byte-identical. No runtime dependency, visible animation switch, scenic text overlay or candidate software execution is introduced.

The existing 102 regression suites remain, with current-edition counts, source-verification date and positional snapshots advanced without changing old post/scene hashes. New append-only, article-depth, evidence-boundary, synthetic-answer, route/bookmark and semantic-motion checks extend them. Build `content-data.js` and all HTML asset cache keys together with `python3 build.py`, then run `node test-site.cjs`. These tests are editorial and DOM/CSS contracts; real browser layout, live animation paint, exact deployed commit and Pages success are verified separately. No AI model, candidate repository code, paid API or hardware workflow was run.


## October 20 source-checked update

Eight original Chinese articles extend commit `9593cc55e9cf7087720019cf89183420781a95ee` from 55 to 63 articles (25 AI观察, 20 用好AI, 18 脑洞实验). All 55 previous article objects, stable IDs, source dates and independently rendered diagrams remain exact. This is a substantive selection from a current-month official-source scan, not a daily quota.

- China: MiniMax M3.1 Flash (October 19 online release, with later weight plans and explicit effort/billing boundaries); Kimi Desktop 1.1.0 (October 14 remote-control handoff, not the first-ever Kimi remote control); PixVerse CLI 1.4.9 (October 15 ordered template slots, template-owned output settings and individual result jobs).
- Global: Gemini Notebook pre-render review (October 19 rollout announcement versus still-limited help text); a Gemini API retirement window inventory (October 8 research-agent announcement, October 20 retirement-table verification, earliest video preview dates distinguished from exact shutdown times); OpenAI low-resource-language evaluations (October 19 company-reported scores, different denominators, pinned public MultiLangBench and an original byte-contract exercise).
- Open-weight comparison: Meta Muse Spark Open (October 15) and Reflection Beam (announced October 5, weights available October 16), with distinct modalities, license obligations, model-loading and active-parameter denominators. Original admission arithmetic does not constitute deployment or a legal determination.
- Practice: Cloudflare's August 4 engineering-rule governance retrospective, with a wholly synthetic version/scope/strength/lifecycle review. It is not a new October release, not Cloudflare's internal rules, and not an automated approval action.

Every new detail provides its own context, source limitations, synthetic exercise, expected result and next steps. No private user data, company internals or personal identity is published. No candidate project code, model, paid API, remote-control setup, device workflow or generation service was run. Public availability, company claims and this publication's unexecuted teaching designs remain separate.

Eight article-specific code-native diagrams reuse the existing SVG helpers, automatic notes, static accessible transcript, infinite local CSS motion and viewport pause. Both stylesheets, app/router, build generator, favicon, DESIGN and third-party notices remain byte-identical. No visible animation control, dependency, font, tracker or fake action is added.

The original 108 regression suites retain their assertions and historical hashes; only current-edition snapshots and offsets advance. Additional tests verify append-only integrity, complete details, source/date boundaries, synthetic arithmetic and decisions, route/copy/bookmark/focus behavior and semantic motion. Run `python3 build.py` and `node test-site.cjs`; the generated bundle and HTML asset keys are one deterministic release. These automated contracts do not replace live desktop/narrow layout, motion paint, exact remote commit or successful GitHub Pages deployment checks.
