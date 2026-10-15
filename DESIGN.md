# AI 现场 design system

An independent Chinese reading publication: a brief, social-style feed opens into a calm, complete article. The existing warm paper, green hills and sunset are its own identity. This document describes project-specific choices, not a reproduction of any referenced brand.

## Direction and hierarchy

The page has one memorable visual moment: the landscape above the feed. Everything around it helps readers find, read, verify and save an article. Keep the three existing sections, the short feed previews, the separate details and the original explanatory scenes. Do not turn the publication into a product landing page, dashboard or grid of promotional tiles.

Desktop alignment is left-led and keeps the existing navigation / feed / reading-route rails. Article mode hides the rails and centers one paper surface. At 650px and below, the feed becomes one column with the existing visible category buttons. Details remain a single reading column. Labels can wrap rather than disappear.

## Tokens and roles

CSS source of truth is `style.css :root`; diagram chrome consumes the same tokens in `visuals.css`.

- Canvas `--canvas: #f1eee5`: page and sticky navigation ground.
- Paper `--white: #fcfbf6`: article and feed reading surfaces. `--paper: #f5f2e9` remains a secondary warm paper tone.
- Ink `--ink: #282c25`: titles and primary labels.
- Reading text `--text: #454e41`: article prose and previews.
- Muted `--muted: #62695c`: dates, captions, domains and secondary labels. Never use lower opacity to weaken meaningful text.
- Action green `--green: #405f4a`: selected controls, links, keyboard focus and the task-copy button. `--selected: #e0e7d8` is its pale selected surface.
- Annotation red `--red: #934a36`: saved-item feedback and occasional small editorial accents. It is not a site-wide CTA wash.
- Rule `--rule: #d6d9cb` and quiet rule `--rule-soft: #e5e6dc`: structural boundaries, not essential control outlines. Input outlines use a stronger dedicated tone.

Text contrast, calculated for the explicit solid token pairs: muted/canvas 4.90:1, muted/paper 5.49:1, reading text/paper 8.38:1, green/paper 6.86:1. These checks cover these pairs only, not an accessibility certification of the whole site or animated illustrations.

Spacing uses 4 / 8 / 12 / 16 / 24 / 32 / 40 / 48px. The main feed gap is 24px. Cards have 28px desktop side padding, 20px on phones and 16px at the narrowest breakpoint. Detail padding is 56px on desktop, 22px on phones and 17px at 360px or below. Keep internal component spacing smaller than the gap between complete article sections.

Control radius is 6px; inset reading surfaces are 6px; outer paper is 10px. The existing landscape silhouette and circular category avatars are intentional exceptions. Paper uses only the low-alpha `--shadow-paper`; do not restore stacked inset-like shadows under each post.

## Type and reading rhythm

Use the existing device-local Chinese serif stack for titles and the existing Chinese sans stack for prose and UI. Do not download fonts, introduce a commercial face, or imitate a vendor wordmark.

- Metadata: 11px minimum for article dates, evidence badges, source domains and diagram captions.
- Secondary UI: 12px. Primary UI: 13px. Feed preview: 14px with 1.9 line height.
- Feed title: responsive 24–28px, weight 600, line height 1.5; 23px only at 360px and below.
- Article title: responsive 29–38px, weight 600, line height 1.4; 27px only at 360px and below. Use `text-wrap: balance` as progressive enhancement to reduce a short final line. Keep ordinary wrapping as fallback.
- Article prose: 17px desktop, 16px phone, line height 1.95. Body text uses a maximum width of 40em (680px at the desktop body size), capped by its actual parent. This is around forty full-width Chinese characters, not forty Latin characters.
- Section headings: 22px desktop / 21px phone, weight 600, line height 1.5. A section begins with a heading and has 40px separation on desktop / 32px phone. Paragraphs have a one-em bottom gap.
- Task prompt: 15px desktop / 16px phone, line height 1.85; resize remains available. The mobile search input is also 16px to avoid small-input zoom behavior.

Chinese text keeps natural tracking. Do not import the very tight Latin tracking or short body line heights in the reference documents. Do not justify text or clamp article prose. Font fallback will change exact line breaks; test representative long Chinese and Latin-mixed titles.

## Component rules

### Feed cards and metadata

A card is still a short preview, never the whole article. Reading order is category/date, headline, preview, original diagram, topics, then reading/saving actions. Headlines carry more visual weight than badges. Dates use tabular numerals. The three avatar colors distinguish columns without replacing their text labels.

At 420px and below, the evidence badge moves below the byline rather than being ellipsized or squeezing it. Card actions may wrap; the bookmark and link controls stay separate from the article-opening click target. Keep the article title a real link.

### Article top and prose

Keep the original Back, reading time and utility toolbar. The headline has a deliberate 32px lead-in on desktop and 24px on phone. The deck is a distinct secondary layer above the illustration. Evidence remains visible before the first body section. The body column is narrower than the outer paper; the illustration is allowed to use the wider paper interior.

### Task package

Use a pale green inset with a clearly labeled, dark green copy button. The heading and button can wrap to separate rows. Preserve the full read-only prompt, selection fallback, resize affordance and copy feedback. The expected-result paragraph is readable prose, not fine print. A filled copy button is appropriate here because there is one concrete primary action in this component.

### Sources and limitations

Sources form a quiet reference index: one source per ruled row, an ordinal marker, an underlined title, a separate domain and a small outbound arrow. Numbers denote references, not process steps. Keep source date and verification date distinct. Titles wrap and the outbound arrow does not shrink. References remain real external links with the existing safe target/rel attributes.

Limitations use a subdued warm inset and a left boundary. They must remain readable, without warning-red banners or moralizing slogans. Do not rewrite article facts, dates or language as part of a visual change.

### Interaction and access

Use an explicit 44px minimum target height for key controls; do not infer target size by adding a font size to padding. Icon-only controls also have 44px minimum width. All keyboard-operable controls keep a visible 2px green focus outline with 4px offset; the search wrapper has a corresponding focus-within ring. Saved actions keep both text/pressed state and a pale red fill. Do not rely only on color.

The minimum widths for review are 320, 360, 390, 420, 650, 760, 1024 and 1440 CSS pixels. Below 650px, retain the visible category controls and existing one-column information architecture; do not replace them with a hamburger. Keep the task-copy button and narrow toolbar inside the viewport, including at enlarged browser zoom.

## Motion and assets

Preserve the natural 12-second bird loops, offscreen pauses, reduced-motion behavior and each of the 16 independent SVG scene loops. Keep the bounded optical particle layers, IDs and descriptions. Additional general-use articles may reuse semantically suitable abstract scenes with explicit per-article titles, labels and explanations; do not show embedded-hardware labels on general office tasks or present an explanatory scene as a model result. Explanatory captions advance automatically, without demo buttons, at six-second intervals with more than five seconds of still reading time. A shared grid cell reserves the tallest text height. Screen readers receive one complete static ordered transcript without live announcements; reduced-motion and print show every point. A diagram tap is a reading action and must not open the parent card. Real navigation, copy, bookmark and filter controls remain intact. Do not add a motion switch or convert looping scenes into a one-shot animation. Scenery stays scenery.

No new runtime dependency, network font, stock image, logo, analytics, backend call or API connection is introduced. Preserve native scrolling, bookmarks, keyword search, categories, industry-only region filtering, Back/Forward and reading-position restoration.

## Reference decisions and attribution

Reviewed 2026-10-15 at [VoltAgent/awesome-design-md, commit 3b605329](https://github.com/VoltAgent/awesome-design-md/tree/3b605329240ce735b510037cca322f1831fdd7f8). These documents are independent analyses, not official brand asset grants. See `THIRD_PARTY_NOTICES.md` for the upstream MIT notice.

- [Claude analysis](https://github.com/VoltAgent/awesome-design-md/blob/3b605329240ce735b510037cca322f1831fdd7f8/design-md/claude/DESIGN.md): useful roles include its #faf9f5 warm canvas, distinct serif/sans jobs, 4px spacing rhythm, and color-surface separation with rare shadow. This project retains its own palette, Chinese typography and reading layout. It does not adopt the coral brand color, logo, proprietary faces, dark mockup bands, 96px marketing sections or undersized 36–40px controls.
- [WIRED analysis](https://github.com/VoltAgent/awesome-design-md/blob/3b605329240ce735b510037cca322f1831fdd7f8/design-md/wired/DESIGN.md): useful ideas are strong headline/body/metadata separation, restrained rules and source legibility. This project keeps warmer paper, modest rounded corners and device-local Chinese fonts. It does not adopt black branding, proprietary type or a multi-column newspaper reading body.
- [Framer analysis](https://github.com/VoltAgent/awesome-design-md/blob/3b605329240ce735b510037cca322f1831fdd7f8/design-md/framer/DESIGN.md): useful only as a reminder to concentrate emphasis and show selection clearly. Its dark canvas, giant compressed headings, 1.3 body line height and gradient spotlights do not fit this publication. The document's 98px small-screen breakpoint and claim that a 14px line plus 10px vertical padding produces 44px are not adopted; that sum is 34px. Our 44px targets are explicit.

All implementation choices above are publication-specific. Preserve its original content and identity instead of combining visible brand signatures from the examples.

## Validation boundary

`node test-site.cjs` checks the existing application behavior and numerical/source-level design contracts, including font floors, tokens, contrast pairs, explicit touch sizes and wrap rules. It does not calculate real browser layout or font metrics. Before calling a visual release complete, review the actual deployed version on desktop and a narrow browser, open a long title, inspect a long article, task package and sources, exercise search/bookmarks/Back, and check reduced motion. Do not call an unrendered local revision visually verified.

Mobile card press feedback is a subtle warm-green background and border. Scope the removal of native WebKit tap highlighting to actual link/button/card hit areas; never remove keyboard focus outlines to fix a touch overlay. Diagram notes use the existing caption/small text roles, at least 11px on mobile, and wrap rather than clip.
