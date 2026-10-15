/* Dependency-free content, real-renderer, navigation, persistence, and accessibility tests.
 * Run: node test-site.cjs
 * This DOM/history harness tests application behavior, not browser layout or paint. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const C = require('./site-core.js');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const data = JSON.parse(read('content.json'));
const index = read('index.html');
const css = read('style.css');
const app = read('app.js');
const visuals = read('visuals.js');
const visualCSS = read('visuals.css');
const storageKey = 'ai-fieldnotes-bookmarks-v1';
const motionKey = 'ai-fieldnotes-motion-v1';
const base = () => ({ category: 'all', region: 'all', query: '', savedOnly: false, saved: new Set() });
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const decode = value => String(value).replace(/&(?:#(x[\da-f]+|\d+)|amp|lt|gt|quot|apos|#39);/gi, entity => {
  const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" };
  if (named[entity]) return named[entity];
  const number = entity.slice(2, -1);
  return String.fromCodePoint(number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number));
});
const voidTags = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));

/* A small tree, rather than canned closest() answers: innerHTML creates descendants,
 * selector matching respects ancestors, events bubble, and removed nodes disconnect. */
class Node {
  constructor(tag = '', attrs = {}, owner = null) {
    this.tagName = tag.toUpperCase(); this.attributes = { ...attrs }; this.ownerDocument = owner;
    this.children = []; this.parentNode = null; this.listeners = new Map(); this.style = {};
    this._value = null; this.selected = false; this.scrollIntoViewCalls = [];
    this.classList = {
      contains: token => this.className.split(/\s+/).includes(token),
      add: (...tokens) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...tokens])].join(' '); },
      remove: (...tokens) => { this.className = this.className.split(/\s+/).filter(x => x && !tokens.includes(x)).join(' '); },
      toggle: (token, force) => { const on = force === undefined ? !this.classList.contains(token) : !!force; this.classList[on ? 'add' : 'remove'](token); return on; }
    };
  }
  get id() { return this.getAttribute('id') || ''; }
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', value); }
  get dataset() { return Object.fromEntries(Object.entries(this.attributes).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value])); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(value) { value ? this.setAttribute('hidden', '') : this.removeAttribute('hidden'); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(value) { value ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }
  get open() { return this.hasAttribute('open'); }
  set open(value) { value ? this.setAttribute('open', '') : this.removeAttribute('open'); }
  get href() { return this.getAttribute('href') || ''; }
  set href(value) { this.setAttribute('href', value); }
  get value() { return this._value == null ? (this.tagName === 'TEXTAREA' ? this.textContent : this.getAttribute('value') || '') : this._value; }
  set value(value) { this._value = String(value); }
  get firstElementChild() { return this.children.find(child => child.tagName) || null; }
  get textContent() { return this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.children.forEach(child => { child.parentNode = null; }); this.children = [textNode(String(value), this)]; }
  get innerHTML() { return this.children.map(serialize).join(''); }
  set innerHTML(value) { this.children.forEach(child => { child.parentNode = null; }); this.children = []; parseHTML(String(value), this); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  removeAttribute(name) { delete this.attributes[name]; }
  append(child) { child.parentNode = this; this.children.push(child); }
  contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
  matches(selector) { return selector.split(',').some(part => matchesSelector(this, part.trim())); }
  closest(selector) { for (let node = this; node && node.tagName; node = node.parentNode) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) { const result = []; const visit = node => { for (const child of node.children || []) { if (!child.tagName) continue; if (child.matches(selector)) result.push(child); visit(child); } }; visit(this); return result; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  dispatchEvent(event) { event.target ||= this; for (let node = this; node; node = event.bubbles === false ? null : node.parentNode) { event.currentTarget = node; for (const fn of node.listeners.get(event.type) || []) fn(event); } return !event.defaultPrevented; }
  focus(options) { this.ownerDocument.activeElement = this; this.focusOptions = options; }
  select() { this.selected = true; }
  showModal() { this.open = true; }
  scrollIntoView(options) { this.scrollIntoViewCalls.push(options); }
  replaceWith(node) { assert(this.parentNode, 'Cannot replace a disconnected node'); const parent = this.parentNode; const position = parent.children.indexOf(this); if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1); node.parentNode = parent; parent.children[position] = node; this.parentNode = null; }
}
function textNode(text, parent) { return { textContent: text, parentNode: parent, tagName: '' }; }
function serialize(node) {
  if (!node.tagName) return C.escapeHTML(node.textContent);
  const tag = node.tagName.toLowerCase();
  const attrs = Object.entries(node.attributes).map(([key, value]) => ` ${key}="${C.escapeHTML(value)}"`).join('');
  return `<${tag}${attrs}>${voidTags.has(tag) ? '' : node.innerHTML + `</${tag}>`}`;
}
function parseHTML(html, root) {
  const stack = [root];
  const tokens = html.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+|</g) || [];
  for (const token of tokens) {
    if (/^<!/.test(token)) continue;
    if (/^<\//.test(token)) { const tag = token.match(/^<\/([^\s>]+)/)[1].toUpperCase(); let n = stack.length - 1; while (n > 0 && stack[n].tagName !== tag) n--; if (n) stack.length = n; continue; }
    if (/^<[a-zA-Z]/.test(token)) {
      const tag = token.match(/^<([^\s/>]+)/)[1]; const attrs = {};
      const body = token.slice(tag.length + 1, token.endsWith('/>') ? -2 : -1);
      for (const match of body.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[match[1]] = decode(match[2] ?? match[3] ?? match[4] ?? '');
      const parent = stack[stack.length - 1], node = new Node(tag, attrs, root.ownerDocument || root);
      parent.append(node); if (!voidTags.has(tag.toLowerCase()) && !token.endsWith('/>')) stack.push(node);
    } else stack[stack.length - 1].append(textNode(decode(token), null));
  }
}
function matchesSimple(node, selector) {
  if (!node.tagName) return false;
  const attrs = [...selector.matchAll(/\[([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g)];
  selector = selector.replace(/\[[^\]]+\]/g, '');
  if (attrs.some(m => !node.hasAttribute(m[1]) || (m[2] !== undefined || m[3] !== undefined || m[4] !== undefined) && node.getAttribute(m[1]) !== (m[2] ?? m[3] ?? m[4]))) return false;
  const tag = selector.match(/^[\w-]+/); if (tag && node.tagName !== tag[0].toUpperCase()) return false;
  for (const match of selector.matchAll(/([.#])([\w-]+)/g)) if (match[1] === '#' ? node.id !== match[2] : !node.classList.contains(match[2])) return false;
  return true;
}
function matchesSelector(node, selector) {
  const parts = selector.split(/\s+(?=(?:[^"']|"[^"]*"|'[^']*')*$)/);
  if (!matchesSimple(node, parts.pop())) return false;
  for (let i = parts.length - 1; i >= 0; i--) { node = node.parentNode; while (node && !matchesSimple(node, parts[i])) node = node.parentNode; if (!node) return false; }
  return true;
}
function event(type, extra = {}) { return { type, bubbles: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; }

function boot(options = {}) {
  const document = new Node(); document.ownerDocument = document; parseHTML(index, document);
  document.getElementById = id => document.querySelector('#' + id);
  document.createElement = tag => new Node(tag, {}, document);
  document.documentElement = document.querySelector('html'); document.documentElement.scrollHeight = 6000;
  document.body = document.querySelector('body'); document.activeElement = document.body;
  const queue = [], windowListeners = new Map(), mediaListeners = [], clipboard = [];
  const timers = new Map(); let now = 0, timerID = 0;
  const storage = new Map(Object.entries(options.storage || {}));
  let url = new URL(options.url || 'https://example.test/publication/');
  const location = { get href() { return url.href; }, get hash() { return url.hash; } };
  const entries = (options.previousURLs || []).map(href => ({ url: href, state: null }));
  entries.push({ url: url.href, state: clone(options.historyState || null) });
  let cursor = entries.length - 1, historyBackCalls = 0, selection = '';
  const dispatchWindow = (type, extra = {}) => { for (const fn of windowListeners.get(type) || []) fn(event(type, extra)); };
  const media = { matches: !!options.reducedMotion, addEventListener(type, fn) { if (type === 'change') mediaListeners.push(fn); }, addListener(fn) { mediaListeners.push(fn); } };
  const window = {
    SiteCore: C, AI_FIELDNOTES: options.data || data, innerHeight: 800, scrollY: 0, isSecureContext: options.secure !== false,
    addEventListener(type, fn) { if (!windowListeners.has(type)) windowListeners.set(type, []); windowListeners.get(type).push(fn); },
    matchMedia: () => media, getSelection: () => selection,
    scrollTo(first, second) { const top = typeof first === 'object' ? first.top : second; if (this.scrollY === top) return; this.scrollY = top; queue.push(() => dispatchWindow('scroll')); }
  };
  function go(delta) { const next = cursor + delta; if (next < 0 || next >= entries.length) return; const oldURL = url.href, oldHash = url.hash; cursor = next; url = new URL(entries[cursor].url); queue.push(() => { dispatchWindow('popstate', { state: clone(history.state) }); if (oldHash !== url.hash) dispatchWindow('hashchange', { oldURL, newURL: url.href }); }); }
  const history = {
    get state() { return clone(entries[cursor].state); }, get length() { return entries.length; }, scrollRestoration: 'auto',
    pushState(state, unused, next) { if (next !== undefined) url = new URL(next, url); entries.splice(cursor + 1); entries.push({ url: url.href, state: clone(state) }); cursor++; },
    replaceState(state, unused, next) { if (next !== undefined) url = new URL(next, url); entries[cursor] = { url: url.href, state: clone(state) }; },
    back() { historyBackCalls++; go(-1); }, forward() { go(1); }
  };
  const observers = [];
  class IntersectionObserver {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    disconnect() { this.targets.clear(); }
    observe(target) { this.targets.add(target); }
  }
  const context = { window, document, location, history, URL, console, CSS: { escape: value => value },
    requestAnimationFrame: fn => { queue.push(fn); return queue.length; },
    setTimeout: (fn, delay = 0) => { const id = ++timerID; timers.set(id, { fn, at: now + delay }); return id; }, clearTimeout: id => timers.delete(id),
    localStorage: { getItem: key => { if (options.storageReadError) throw new Error('storage unavailable'); return storage.get(key) ?? null; }, setItem: (key, value) => { if (options.storageWriteError) throw new Error('storage unavailable'); storage.set(key, String(value)); } },
    navigator: options.clipboard === false ? {} : { clipboard: { async writeText(value) { if (options.clipboardReject) throw new Error('permission denied'); clipboard.push(value); } } }
  };
  if (options.observer) context.IntersectionObserver = IntersectionObserver;
  window.location = location; window.history = history; window.document = document;
  vm.createContext(context); vm.runInContext(visuals, context, { filename: 'visuals.js' }); vm.runInContext(app, context, { filename: 'app.js' });
  function flush() { let count = 0; while (queue.length) { assert(++count < 1000, 'Application event loop did not settle'); queue.shift()(); } }
  function tick(milliseconds) {
    const end = now + milliseconds;
    for (;;) { const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; timers.delete(next[0]); now = next[1].at; next[1].fn(); flush(); }
    now = end;
  }
  function get(selector) { const node = document.querySelector(selector); assert(node, `Missing DOM node: ${selector}`); return node; }
  function setHash(hash) { const oldURL = url.href; url.hash = hash; entries.splice(cursor + 1); entries.push({ url: url.href, state: null }); cursor++; queue.push(() => dispatchWindow('hashchange', { oldURL, newURL: url.href })); flush(); }
  function click(selector, modifiers = {}) {
    const target = typeof selector === 'string' ? get(selector) : selector;
    if (target.closest('button')?.disabled) return null;
    const ev = event('click', { button: 0, ...modifiers }); target.dispatchEvent(ev);
    const anchor = target.closest('a');
    if (anchor && !ev.defaultPrevented && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey && !ev.button && anchor.href.startsWith('#')) setHash(anchor.href);
    flush(); return ev;
  }
  flush();
  return { document, window, history, location, storage, clipboard, observers, get, click, flush, tick, setHash,
    get backCalls() { return historyBackCalls; },
    input(value) { const input = get('#search'); input.value = value; input.dispatchEvent(event('input')); flush(); },
    key(key, extra = {}) { document.dispatchEvent(event('keydown', { key, ...extra })); flush(); },
    scroll(y) { window.scrollTo({ top: y }); flush(); },
    back() { history.back(); flush(); }, forward() { history.forward(); flush(); },
    selectText(value) { selection = value; },
    reduce(value) { media.matches = value; mediaListeners.forEach(fn => fn({ matches: value })); flush(); },
    storageEvent(key, newValue) { dispatchWindow('storage', { key, newValue }); flush(); },
    async settle() { for (let i = 0; i < 3; i++) { await Promise.resolve(); flush(); } }
  };
}
function visiblePosts(env) { return env.get('#feed').querySelectorAll('.post').map(post => post.dataset.post); }
function assertView(env, view) { assert.equal(env.get('#feed-view').hidden, view === 'article'); assert.equal(env.get('#article-view').hidden, view === 'feed'); assert.equal(env.document.body.classList.contains('article-open'), view === 'article'); }
function assertFeedSnapshot(env, expected) {
  for (const field of ['query', 'category', 'region', 'savedOnly', 'scroll']) assert.equal(env.history.state.feed[field], expected[field], 'Restored feed ' + field);
  assert.equal(env.get('#search').value, expected.query);
  if (expected.category === 'all') assert(env.document.querySelectorAll('.section-nav button[data-category]').every(button => button.getAttribute('aria-pressed') === 'false'));
  else assert.equal(env.get(`button[data-category="${expected.category}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(env.get('.region-filter').hidden, expected.category !== 'industry');
  assert.equal(env.get(`[data-region="${expected.region}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(env.get('#shelf-button').getAttribute('aria-pressed'), String(expected.savedOnly));
  assert.equal(env.window.scrollY, expected.scroll);
}

const suites = [];
function check(name, fn) { suites.push([name, fn]); }
check('Content: unique safe IDs, real article bodies, dates, caveats, and HTTPS sources', () => {
  assert.equal(new Set(data.posts.map(p => p.id)).size, data.posts.length); assert(data.posts.length >= 8);
  for (const p of data.posts) {
    assert(/^[a-z0-9-]+$/.test(p.id)); assert(C.categories[C.categoryFor(p)]); assert(['china', 'global'].includes(p.region));
    assert(p.title && p.dek && p.summary.length && p.analysis.length && p.caveat); assert(p.sources.length > 0);
    assert.equal(p.verifiedAt, data.site.verifiedAt); assert(/^\d{4}-\d{2}-\d{2}$/.test(p.verifiedAt));
    if (p.date) assert(/^\d{4}-\d{2}-\d{2}$/.test(p.date));
    for (const source of p.sources) assert(C.safeURL(source.url).startsWith('https://'));
    if (p.tryThis) assert(p.tryThis.prompt && p.tryThis.expected);
  }
});
check('Requested embedded expansion and final category assignments remain present', () => {
  const newIDs = ['renode-replay-lab', 'firmware-fuzz-harness', 'debug-probe-mcp', 'datasheet-register-audit', 'stm32-edge-ai-budget', 'firmware-agent-contract'];
  for (const id of [...newIDs, 'espressif-mcp-workflow', 'document-style-pipeline']) {
    const post = data.posts.find(p => p.id === id); assert(post, 'Missing requested article: ' + id);
    assert.equal(C.categoryFor(post), 'embedded', id + ' must stay in the experiment category');
    assert(post.steps.length >= 3, id + ' should retain a concrete workflow');
  }
  assert.equal(data.posts.filter(p => C.categoryFor(p) === 'practice').length >= 3, true);
});
check('Content bundle remains exactly synchronized', () => { const box = { window: {} }; vm.runInNewContext(read('content-data.js'), box); assert.equal(JSON.stringify(box.window.AI_FIELDNOTES), JSON.stringify(data)); });
check('Relative assets and renderer load order work under a publication subpath', () => {
  const publicationURL = new URL('https://example.test/publication/');
  for (const match of index.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g)) {
    const assetURL = new URL(decode(match[1]), publicationURL);
    assert.equal(assetURL.origin, publicationURL.origin, match[1]);
    assert(assetURL.pathname.startsWith(publicationURL.pathname), match[1]);
    const filename = decodeURIComponent(assetURL.pathname.slice(publicationURL.pathname.length));
    assert(fs.existsSync(path.join(__dirname, filename)), match[1]);
  }
  assert(!/(?:src|href)="\/(?!\/)/.test(index));
  for (const before of ['content-data.js', 'site-core.js', 'visuals.js']) assert(index.indexOf('./' + before) < index.indexOf('./app.js'));
});
function assertReleaseCoherence(markup) {
  const document = new Node(); parseHTML(markup, document);
  const publicationURL = new URL('https://example.test/publication/');
  const release = document.querySelector('html').getAttribute('data-release');
  assert(release && release.trim() === release, 'HTML must declare a nonempty release version');
  assert.match(release, /^20261015r3-[0-9a-f]{12}$/, 'Release must include the deterministic asset digest');
  const metadata = document.querySelectorAll('meta[name="app-release"]');
  assert.equal(metadata.length, 1, 'Exactly one app-release meta tag is required');
  assert.equal(metadata[0].getAttribute('content'), release, 'Release metadata must match HTML');
  const footers = document.querySelectorAll('#release-version');
  assert.equal(footers.length, 1, 'Exactly one visible release footer is required');
  const footer = footers[0];
  assert.equal(footer.tagName, 'SMALL');
  assert(footer.closest('footer'), 'Release version belongs in the footer');
  assert.equal(footer.getAttribute('data-release'), release, 'Footer release must match HTML');
  assert.equal(footer.textContent.trim(), '版本 ' + release, 'Visible version must match the asset release');
  assert(!footer.closest('[hidden], [aria-hidden="true"]'), 'Release version must remain visible');

  const localAssets = [];
  for (const node of document.querySelectorAll('[src], [href]')) {
    for (const attribute of ['src', 'href']) {
      const reference = node.getAttribute(attribute); if (!reference) continue;
      const assetURL = new URL(reference, publicationURL);
      const rel = (node.getAttribute('rel') || '').split(/\s+/);
      const stylesheet = node.tagName === 'LINK' && rel.includes('stylesheet');
      const icon = node.tagName === 'LINK' && rel.includes('icon');
      const script = node.tagName === 'SCRIPT' && attribute === 'src';
      if (assetURL.origin !== publicationURL.origin || !(stylesheet || icon || script || /\.(?:css|js)$/i.test(assetURL.pathname))) continue;
      localAssets.push(assetURL);
      assert.deepEqual(assetURL.searchParams.getAll('v'), [release], reference + ' must have exactly one matching, nonempty release version');
    }
  }
  assert(localAssets.some(url => url.pathname.endsWith('.css')), 'Local stylesheet assets must be checked');
  assert(localAssets.some(url => url.pathname.endsWith('.js')), 'Local script assets must be checked');
  assert(localAssets.some(url => url.pathname.endsWith('/favicon.svg')), 'Local favicon must be checked');
  const scripts = document.querySelectorAll('script[src]').map(node => new URL(node.getAttribute('src'), publicationURL)).filter(url => url.origin === publicationURL.origin);
  assert.deepEqual(scripts.map(url => url.pathname), ['content-data.js', 'site-core.js', 'visuals.js', 'app.js'].map(filename => publicationURL.pathname + filename), 'Renderer script order must remain unchanged');
  return release;
}
check('Local CSS, JavaScript, and favicon share one release version with HTML, metadata, and visible footer', () => {
  assertReleaseCoherence(index);
});
check('Isolated builds are deterministic and refresh the unified release after editorial or asset changes', () => {
  const files = ['build.py', 'content.json', 'index.html', 'style.css', 'visuals.css', 'content-data.js', 'site-core.js', 'visuals.js', 'app.js', 'favicon.svg'];
  const originals = new Map(files.map(filename => [filename, fs.readFileSync(path.join(__dirname, filename))]));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-fieldnotes-build-'));
  const readCopy = filename => fs.readFileSync(path.join(directory, filename), 'utf8');
  const writeCopy = (filename, content) => fs.writeFileSync(path.join(directory, filename), content);
  const buildCopy = () => {
    execFileSync('python3', ['build.py'], { cwd: directory, encoding: 'utf8', timeout: 30000 });
    const html = readCopy('index.html');
    return { html, bundle: readCopy('content-data.js'), release: assertReleaseCoherence(html) };
  };
  try {
    for (const [filename, content] of originals) writeCopy(filename, content);
    const baseline = buildCopy();
    assert.equal(baseline.html, index, 'Working HTML must carry the version generated from its current assets');
    assert.equal(baseline.bundle, read('content-data.js'), 'Working content bundle must be freshly generated');
    assert.deepEqual(buildCopy(), baseline, 'Unchanged rebuild must be byte-for-byte idempotent');
    for (const [filename, content] of originals) assert.deepEqual(fs.readFileSync(path.join(directory, filename)), content, filename + ' must stay unchanged on an idempotent build');

    const editorial = JSON.parse(readCopy('content.json'));
    editorial.posts[0].title += '（构建回归测试）';
    writeCopy('content.json', JSON.stringify(editorial, null, 2) + '\n');
    const edited = buildCopy();
    assert.notEqual(edited.bundle, baseline.bundle, 'Editorial change must refresh the browser content bundle');
    assert.notEqual(edited.release, baseline.release, 'Editorial change must invalidate cached assets');
    const box = { window: {} }; vm.runInNewContext(edited.bundle, box);
    assert.equal(box.window.AI_FIELDNOTES.posts[0].title, editorial.posts[0].title, 'Updated editorial content must reach the generated bundle');
    assert.deepEqual(buildCopy(), edited, 'Rebuilding changed editorial content must remain idempotent');
    writeCopy('content.json', originals.get('content.json'));
    assert.deepEqual(buildCopy(), baseline, 'Restoring editorial content must restore the deterministic release');

    for (const filename of ['style.css', 'visuals.css', 'site-core.js', 'visuals.js', 'app.js', 'favicon.svg']) {
      const comment = filename.endsWith('.svg') ? '\n<!-- release cache regression -->\n' : '\n/* release cache regression */\n';
      writeCopy(filename, originals.get(filename).toString('utf8') + comment);
      const changed = buildCopy();
      assert.notEqual(changed.release, baseline.release, filename + ' changes must invalidate the unified asset version');
      assert.equal(changed.bundle, baseline.bundle, filename + ' changes must not alter editorial content');
      assert.deepEqual(buildCopy(), changed, filename + ' rebuild must be idempotent');
      writeCopy(filename, originals.get(filename));
      assert.deepEqual(buildCopy(), baseline, 'Restoring ' + filename + ' must restore the deterministic release');
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  for (const [filename, content] of originals) assert.deepEqual(fs.readFileSync(path.join(__dirname, filename)), content, 'Build tests must never mutate working ' + filename);
});
check('Exactly three desktop/mobile tabs share merged categories, while initial feed spans all', () => {
  assert.deepEqual(C.categories, { industry: 'AI观察', practice: '用好AI', embedded: '脑洞实验' });
  assert.equal(C.categoryFor({ id: 'legacy-image-post', category: 'product' }), 'industry');
  const env = boot();
  for (const selector of ['.section-nav', '.mobile-categories']) {
    const buttons = env.get(selector).querySelectorAll('button[data-category]');
    assert.deepEqual(buttons.map(button => button.dataset.category), ['industry', 'practice', 'embedded']);
    assert(buttons.every(button => button.getAttribute('aria-pressed') === 'false'));
    for (const button of buttons) assert(button.textContent.includes(C.categories[button.dataset.category]));
  }
  assert.equal(env.history.state.feed.category, 'all'); assert.equal(visiblePosts(env).length, data.posts.length);
  for (const category of Object.keys(C.categories)) {
    env.click(`.mobile-categories button[data-category="${category}"]`);
    assert.deepEqual(visiblePosts(env), data.posts.filter(p => C.categoryFor(p) === category).map(p => p.id));
    assert.equal(env.get(`.section-nav button[data-category="${category}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(env.get(`.mobile-categories button[data-category="${category}"]`).getAttribute('aria-pressed'), 'true');
  }
});
check('Search scopes to the chosen tab; mobile bookmarks span tabs and All resets every filter', () => {
  const industry = data.posts.find(p => C.categoryFor(p) === 'industry');
  const practice = data.posts.find(p => C.categoryFor(p) === 'practice');
  const env = boot({ storage: { [storageKey]: JSON.stringify([industry.id, practice.id]) } });
  assert.equal(env.get('#search').placeholder, '搜索所有栏目');
  env.click('.mobile-categories [data-category="practice"]'); assert.equal(env.get('#search').placeholder, '搜索用好AI');
  env.input(industry.title); assert.equal(visiblePosts(env).length, 0);
  env.click('#mobile-shelf'); assert.deepEqual(visiblePosts(env), data.posts.filter(p => [industry.id, practice.id].includes(p.id)).map(p => p.id));
  assert.equal(env.history.state.feed.category, 'all'); assert.equal(env.history.state.feed.savedOnly, true);
  env.input(practice.title); assert.equal(env.get('.region-filter').hidden, true); assert.deepEqual(visiblePosts(env), [practice.id]);
  env.click('#show-all'); assert.equal(visiblePosts(env).length, data.posts.length);
  assert.equal(env.get('#search').value, ''); assert.equal(env.get('#search').placeholder, '搜索所有栏目');
  assert.equal(env.history.state.feed.category, 'all'); assert.equal(env.history.state.feed.region, 'all'); assert.equal(env.history.state.feed.savedOnly, false);
  assert.equal(env.get('#shelf-button').getAttribute('aria-pressed'), 'false');
});
check('Pure filters cover category, region, search, saved-only, and corrupt storage', () => {
  assert.equal(C.filterPosts(data.posts, base()).length, data.posts.length);
  for (const category of Object.keys(C.categories).filter(key => key !== 'all')) assert(C.filterPosts(data.posts, { ...base(), category }).every(p => C.categoryFor(p) === category));
  const china = C.filterPosts(data.posts, { ...base(), category: 'industry', region: 'china' }); assert(china.length); assert(china.every(p => C.categoryFor(p) === 'industry' && p.region === 'china'));
  assert(C.filterPosts(data.posts, { ...base(), query: '  mCp  ' }).length);
  const p = data.posts[0]; assert(C.filterPosts(data.posts, { ...base(), query: p.tags.slice(0, 2).join(' ') }).some(x => x.id === p.id));
  assert(C.filterPosts(data.posts, { ...base(), query: p.summary[0] }).some(x => x.id === p.id));
  assert.equal(C.filterPosts(data.posts, { ...base(), query: 'not-a-real-topic-789' }).length, 0);
  assert.deepEqual(C.filterPosts(data.posts, { ...base(), savedOnly: true, saved: new Set([p.id]) }).map(x => x.id), [p.id]);
  for (const raw of ['broken', '{}', 'null', '42']) assert.equal(C.parseSaved(raw, new Set([p.id])).size, 0);
  assert.deepEqual([...C.parseSaved(JSON.stringify([p.id, 'missing', 2, p.id]), new Set([p.id]))], [p.id]);
});
check('Regional filtering applies only to industry, including the legacy product category', () => {
  const fixture = ['industry', 'product', 'practice', 'embedded'].flatMap(category => ['china', 'global'].map(region => ({
    ...data.posts[0], id: category + '-' + region, category, region, title: 'Regional test article'
  })));
  for (const category of ['all', ...Object.keys(C.categories)]) {
    for (const region of ['all', 'china', 'global']) {
      const expected = fixture.filter(p => (category === 'all' || C.categoryFor(p) === category) && (category !== 'industry' || region === 'all' || p.region === region));
      assert.deepEqual(C.filterPosts(fixture, { ...base(), category, region }).map(p => p.id), expected.map(p => p.id), category + '/' + region);
      const saved = new Set(fixture.filter((p, i) => i % 2 === 0).map(p => p.id));
      assert.deepEqual(C.filterPosts(fixture, { ...base(), category, region, query: 'regional test', savedOnly: true, saved }).map(p => p.id), expected.filter(p => saved.has(p.id)).map(p => p.id), category + '/' + region + ': other filters still apply');
    }
  }
  for (const category of ['industry', 'product', 'practice', 'embedded']) {
    for (const region of ['china', 'global']) {
      const metadataOnly = { id: 'metadata-only', category, region, title: 'Neutral title', dek: 'Neutral summary', tags: [], summary: [], analysis: [], steps: [] };
      assert.equal(C.filterPosts([metadataOnly], { ...base(), query: region }).length, C.categoryFor(metadataOnly) === 'industry' ? 1 : 0, category + ': hidden region metadata must not produce search matches');
    }
  }
});
check('China/global controls only appear in industry and retain their choice across category switches', () => {
  const env = boot(); assert.equal(env.get('.region-filter').hidden, true);
  for (const region of ['china', 'global']) {
    env.click('.section-nav [data-category="industry"]'); assert.equal(env.get('.region-filter').hidden, false);
    env.click(`[data-region="${region}"]`);
    const expected = data.posts.filter(p => C.categoryFor(p) === 'industry' && p.region === region).map(p => p.id);
    assert(expected.length); assert.deepEqual(visiblePosts(env), expected);
    assert.equal(env.get(`[data-region="${region}"]`).getAttribute('aria-pressed'), 'true');
    for (const category of ['practice', 'embedded']) {
      env.click(`.mobile-categories [data-category="${category}"]`);
      assert.equal(env.get('.region-filter').hidden, true);
      assert.equal(env.history.state.feed.region, region);
      assert.deepEqual(visiblePosts(env), data.posts.filter(p => C.categoryFor(p) === category).map(p => p.id));
    }
    env.click('.section-nav [data-category="industry"]'); assert.equal(env.get('.region-filter').hidden, false);
    assert.deepEqual(visiblePosts(env), expected); assert.equal(env.get(`[data-region="${region}"]`).getAttribute('aria-pressed'), 'true');
  }
  env.click('#show-all'); assert.equal(env.get('.region-filter').hidden, true); assert.deepEqual(visiblePosts(env), data.posts.map(p => p.id));
});
check('Combined feed ignores a restored regional choice while retaining search and bookmark filters', () => {
  for (const region of ['china', 'global']) {
    const snapshot = { category: 'all', region, query: '', savedOnly: false, scroll: 0 };
    const env = boot({ historyState: { view: 'feed', feed: snapshot } });
    assertFeedSnapshot(env, snapshot); assert.deepEqual(visiblePosts(env), data.posts.map(p => p.id));
    const opposite = data.posts.find(p => C.categoryFor(p) === 'industry' && p.region !== region);
    assert(opposite); env.input(opposite.title); assert.deepEqual(visiblePosts(env), [opposite.id]);
    const saved = boot({ storage: { [storageKey]: JSON.stringify([opposite.id]) }, historyState: { view: 'feed', feed: { ...snapshot, savedOnly: true } } });
    assert.equal(saved.get('.region-filter').hidden, true); assert.deepEqual(visiblePosts(saved), [opposite.id]);
  }
});
check('Feed and article bylines show geography only for industry and retain every date or date label', () => {
  const env = boot();
  for (const p of data.posts) {
    const date = p.date ? p.date.replace(/-/g, '.') : p.dateLabel || '持续更新资料';
    const prefix = C.categoryFor(p) === 'industry' ? (p.region === 'china' ? '中国视野' : '全球视野') + ' · ' : '';
    assert.equal(env.get('#post-' + p.id + ' .post-byline small').textContent, prefix + date, p.id + ': feed byline');
    env.click('#post-' + p.id + ' .post-title a');
    assert.equal(env.get('#article-view .post-byline small').textContent, prefix + date, p.id + ': article byline');
    env.back(); assertView(env, 'feed');
  }
});
check('Canonical #post/id and every supported legacy article alias round-trip safely', () => {
  for (const p of data.posts) {
    assert.equal(C.postHash(p.id), '#post/' + p.id);
    for (const prefix of ['#post/', '#post=', '#article/', '#article=', '#article-']) assert.equal(C.idFromHash(prefix + p.id), p.id);
  }
  for (const hash of ['#top', '#feed', '#post=', '#post/', '#post=%ZZ', '#article/%E0%A4%A']) assert.equal(C.idFromHash(hash), null);
  assert.equal(C.idFromHash(C.postHash('a b/中文')), 'a b/中文');
});
check('HTML escaping and unsafe source protocols are rejected', () => {
  assert.equal(C.escapeHTML('<script>"&\''), '&lt;script&gt;&quot;&amp;&#39;');
  for (const url of ['javascript:alert(1)', 'data:text/html,foo', 'file:///etc/passwd', 'not a url']) assert.equal(C.safeURL(url), '');
});
check('Responsive, hidden-view, keyboard focus, print, and reduced-motion hooks exist', () => {
  for (const pattern of [/max-width\s*:\s*650px/, /max-width\s*:\s*360px/, /prefers-reduced-motion\s*:\s*reduce/, /@media\s+print/, /:focus-visible/, /\[hidden\]/]) assert(pattern.test(css), String(pattern));
  for (const value of ['lang="zh-CN"', 'class="skip-link"', 'type="search"', 'aria-live="polite"', '<main', '<dialog', 'id="article-view"']) assert(index.includes(value));
});
check('Touch targets, short article entry, reduced-motion overrides, and native scrolling have hooks', () => {
  assert(/@media\s*\(pointer\s*:\s*coarse\)/.test(css));
  assert(/\.visual\.fv-visual\s+\.fv-control\s*\{[^}]*min-height\s*:\s*44px/.test(css));
  assert(/\.article-toolbar>button[^}]*min-height\s*:\s*44px/.test(css));
  const entry = css.match(/animation\s*:\s*article-arrive\s+([.\d]+)s/); assert(entry); assert(Number(entry[1]) > 0 && Number(entry[1]) <= 0.25);
  assert(/\.motion-paused\s+\.article-view\.is-entering\s+\.article-paper\s*\{[^}]*animation\s*:\s*none/.test(css));
  assert(!/addEventListener\s*\(\s*['"](?:wheel|touchmove|touchstart|touchend)['"]/.test(app), 'Native scroll gestures must not be intercepted');
  const env = boot(); env.click('#feed .post-title a'); assert(env.get('#article-view').classList.contains('is-entering'));
  env.tick(250); assert.equal(env.get('#article-view').classList.contains('is-entering'), false);
  env.back(); assertView(env, 'feed'); assert.equal(env.get('#article-view').classList.contains('is-entering'), false);
});
check('Every article has a real illustration renderer with labels, local demos, and motion hooks', () => {
  const env = boot();
  const animationRules = [...visualCSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selector: match[1].trim(), value: (match[2].match(/(?:^|;)\s*animation(?:-name)?\s*:\s*([^;]+)/) || [])[1] })).filter(rule => rule.value && !rule.value.startsWith('none'));
  const keyframes = new Set([...visualCSS.matchAll(/@keyframes\s+([\w-]+)/g)].map(match => match[1]));
  for (const rule of animationRules) for (const name of rule.value.match(/\bfv-[\w-]+/g) || []) assert(keyframes.has(name), 'Missing keyframes: ' + name);
  assert.equal(env.get('#feed').querySelectorAll('.fv-visual').length, visiblePosts(env).length);
  const types = new Set();
  for (const p of data.posts) {
    const node = env.get('#visual-' + p.id); types.add(node.className.match(/\bfv-(?!visual\b)([\w-]+)/)[1]);
    assert(node.classList.contains('motion-scene')); assert(node.classList.contains('is-visible'));
    assert(node.querySelector('svg').getAttribute('aria-hidden') === 'true');
    assert(node.querySelector('svg').getAttribute('focusable') === 'false');
    assert(node.querySelector('.fv-animated')); assert(node.querySelector('.fv-labels').textContent.trim());
    for (const animated of node.querySelectorAll('.fv-animated')) {
      const movingParts = [animated, ...animated.querySelectorAll('.fv-animated')];
      assert(movingParts.some(part => animationRules.some(rule => part.matches(rule.selector))), p.id + ': missing animation CSS for ' + animated.className);
    }
    assert.equal(node.querySelector('.demo-status').getAttribute('aria-live'), 'polite');
    assert(node.querySelector('[data-demo]').getAttribute('aria-label').includes(p.title));
    assert(node.querySelector('.fv-caption').textContent.includes('原创')); assert(node.querySelector('.fv-caption').textContent.includes('交互仅切换说明'));
    assert.equal(node.querySelectorAll('animate,animateTransform,iframe,script').length, 0);
  }
  assert(types.size >= 5, 'Illustrations should retain distinct visual treatments');
  for (const pattern of [/\.is-visible[^{]*\.fv-animated\s*\{[^}]*animation-play-state\s*:\s*running/, /motion-paused[^{]*\.fv-animated\s*\{[^}]*animation-play-state\s*:\s*paused/, /@media\s*\(prefers-reduced-motion\s*:\s*reduce\)[\s\S]*animation\s*:\s*none\s*!important/, /@media\s+print/, /:focus-visible/, /@keyframes\s+fv-sunset/, /@keyframes\s+fv-birds/]) assert(pattern.test(visualCSS), String(pattern));
});
check('Initial feed contains preview cards only, canonical title links, and no article details', () => {
  const env = boot(); assertView(env, 'feed'); assert.equal(env.history.scrollRestoration, 'manual');
  assert.equal(visiblePosts(env).length, data.posts.length); assert.equal(env.get('#result-count').textContent, data.posts.length + ' 篇');
  assert.equal(env.get('#feed').querySelectorAll('.post-detail,.source-list,.try-this,textarea').length, 0);
  assert.equal(env.get('#article-view').innerHTML, '');
  for (const p of data.posts) { const card = env.get('#post-' + p.id); assert.equal(card.querySelector('.post-title a').href, C.postHash(p.id)); assert.equal(card.querySelector('.read-button').href, C.postHash(p.id)); assert(!card.textContent.includes(p.caveat)); }
});
check('Title and card body open an exclusive article, focus its title, and push one history entry', () => {
  for (const selector of ['.post-title a', '.post-dek', '.read-button']) {
    const env = boot(), p = data.posts[0]; env.scroll(920); env.click('#post-' + p.id + ' ' + selector);
    assertView(env, 'article'); assert.equal(env.location.hash, C.postHash(p.id)); assert.equal(env.history.length, 2);
    assert.equal(env.history.state.fromFeed, true); assert.equal(env.window.scrollY, 0);
    assert.equal(env.get('#article-view').querySelectorAll('.article-paper').length, 1);
    assert.equal(env.document.activeElement.id, 'article-title'); assert.equal(env.document.title, p.title + ' · AI 现场');
    assert.equal(env.get('.skip-link').href, '#article-title');
    assert(env.get('#article-view').textContent.includes(p.caveat)); assert(env.get('#article-view').textContent.includes(p.summary[0]));
    assert.equal(env.get('#feed').innerHTML, '', 'Inactive feed must be removed to prevent duplicate visual IDs');
  }
});
check('Every direct link and legacy alias opens article content without rendering a feed', () => {
  for (const p of data.posts) {
    for (const prefix of ['#post/', '#post=', '#article/', '#article=', '#article-']) {
      const env = boot({ url: 'https://example.test/publication/' + prefix + p.id });
      assertView(env, 'article'); assert.equal(env.get('#feed').innerHTML, ''); assert.equal(env.get('#article-title').textContent, p.title);
      assert.equal(env.get('#article-view').querySelectorAll('.source-list a').length, p.sources.length);
      for (const link of env.get('#article-view').querySelectorAll('.source-list a')) { assert(link.href.startsWith('https://')); assert.equal(link.getAttribute('target'), '_blank'); assert.equal(link.getAttribute('rel'), 'noopener noreferrer'); }
      if (p.tryThis) { assert.equal(env.get('#prompt-' + p.id).value, p.tryThis.prompt); assert(env.get('#article-view').textContent.includes(p.tryThis.expected)); }
    }
  }
});
check('Back and Forward restore all feed filters, saved-only state, and each view scroll', () => {
  const p = data.posts.find(p => p.id === 'espressif-mcp-workflow');
  const snapshot = { category: p.category, region: p.region, query: 'MCP', savedOnly: true, scroll: 1234 };
  const env = boot({ storage: { [storageKey]: JSON.stringify([p.id]) }, historyState: { view: 'feed', feed: snapshot } });
  assertFeedSnapshot(env, snapshot); assert.deepEqual(visiblePosts(env), [p.id]);
  env.click('#post-' + p.id + ' .post-title a'); env.scroll(567); env.tick(200);
  env.back(); assertView(env, 'feed'); assertFeedSnapshot(env, snapshot); assert.deepEqual(visiblePosts(env), [p.id]); assert.equal(env.history.length, 2);
  env.forward(); assertView(env, 'article'); assert.equal(env.get('#article-title').textContent, p.title); assert.equal(env.window.scrollY, 567);
  env.click('#article-view [data-back]'); assertView(env, 'feed'); assertFeedSnapshot(env, snapshot); assert.equal(env.document.activeElement.id, 'main-content');
});
check('Filter interactions update snapshots and empty-state; switching category exits saved-only', () => {
  const target = data.posts.find(p => p.id === 'espressif-mcp-workflow');
  const env = boot(); env.click('button[data-category="industry"]'); env.click(`[data-region="${target.region}"]`); env.click(`button[data-category="${C.categoryFor(target)}"]`); env.input('MCP');
  assert.deepEqual(visiblePosts(env), C.filterPosts(data.posts, { ...base(), category: C.categoryFor(target), region: target.region, query: 'MCP' }).map(p => p.id));
  assert(visiblePosts(env).includes('espressif-mcp-workflow'));
  env.scroll(730); env.tick(200); const snapshot = clone(env.history.state.feed);
  env.click('#feed .post-dek'); env.back(); assertFeedSnapshot(env, snapshot);
  env.input('not-a-real-topic-789'); assert.equal(visiblePosts(env).length, 0); assert.equal(env.get('#empty-state').hidden, false); assert.equal(env.get('#endnote').hidden, true);
  env.click('#reset-filters'); assert.equal(visiblePosts(env).length, data.posts.length); assert.equal(env.get('#empty-state').hidden, true);
  env.click('#shelf-button'); assert.equal(env.history.state.feed.savedOnly, true); assert.equal(visiblePosts(env).length, 0);
  env.click('button[data-category="industry"]'); assert.equal(env.history.state.feed.savedOnly, false); assert(visiblePosts(env).every(id => C.categoryFor(data.posts.find(p => p.id === id)) === 'industry'));
});
check('Opening an article immediately after a scroll captures the latest feed position', () => {
  const env = boot(); env.scroll(981); env.click('#feed .post-title a'); env.back();
  assertView(env, 'feed'); assert.equal(env.window.scrollY, 981); assert.equal(env.history.state.feed.scroll, 981);
});
check('An immediate in-app return saves article scroll before Back and Forward', () => {
  const env = boot(); env.click('#feed .post-title a'); env.scroll(682); env.click('#article-view [data-back]');
  assertView(env, 'feed'); env.forward(); assertView(env, 'article'); assert.equal(env.window.scrollY, 682);
});
check('Skip links focus the active view without replacing the article route or history', () => {
  const env = boot(); env.click('.skip-link'); assert.equal(env.document.activeElement.id, 'feed'); assert.equal(env.history.length, 1);
  env.click('#feed .post-title a'); const hash = env.location.hash; const length = env.history.length;
  const ev = env.click('.skip-link'); assert.equal(ev.defaultPrevented, true); assertView(env, 'article'); assert.equal(env.get('#article-title').textContent, data.posts[0].title);
  assert.equal(env.document.activeElement.id, 'article-title'); assert.equal(env.location.hash, hash); assert.equal(env.history.length, length);
});
check('Feed and article renders never duplicate DOM or SVG definition IDs', () => {
  const env = boot();
  const assertIDs = () => { const ids = env.document.querySelectorAll('[id]').map(node => node.id); assert.equal(ids.length, new Set(ids).size); };
  assertIDs();
  for (const p of data.posts) { env.click('#post-' + p.id + ' .post-title a'); assertIDs(); env.click('#article-view [data-demo]'); assertIDs(); env.back(); assertIDs(); }
});
check('Direct-link return stays on site and replaces its entry instead of leaving for a prior site', () => {
  const p = data.posts[0];
  for (const selector of ['#article-view [data-back]', 'a[data-home]']) {
    const env = boot({ url: 'https://example.test/publication/' + C.postHash(p.id), previousURLs: ['https://outside.test/'] });
    env.scroll(800); env.click(selector); assertView(env, 'feed'); assert.equal(env.backCalls, 0); assert.equal(env.history.length, 2);
    assert.equal(env.location.href, 'https://example.test/publication/#feed'); assert.equal(env.window.scrollY, 0); assert.equal(visiblePosts(env).length, data.posts.length);
  }
});
check('Unknown and malformed links fail safely, and an unknown article has a usable return', () => {
  const env = boot({ url: 'https://example.test/publication/#post/does-not-exist' }); assertView(env, 'article'); assert(env.get('#article-title').textContent.includes('没有找到')); assert.equal(env.get('#article-view').querySelectorAll('.source-list').length, 0);
  env.click('#article-view [data-back]'); assertView(env, 'feed');
  assertView(boot({ url: 'https://example.test/publication/#post/%ZZ' }), 'feed');
});
check('Modified title clicks and selected preview text do not trigger application routing', () => {
  for (const modifiers of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const env = boot(); const ev = env.click('#feed .post-title a', modifiers); assert.equal(ev.defaultPrevented, false); assertView(env, 'feed'); assert.equal(env.history.length, 1);
  }
  const env = boot(); env.selectText('selected words'); env.click('#feed .post-dek'); assertView(env, 'feed'); env.selectText(''); env.click('#feed .post-dek'); assertView(env, 'article');
});
check('Bookmark, link-copy, and illustration buttons stay in their current view', async () => {
  const p = data.posts[0];
  for (const article of [false, true]) {
    const env = boot({ url: 'https://example.test/publication/?edition=1' + (article ? C.postHash(p.id) : '') });
    const root = article ? '#article-view' : '#feed', beforeURL = env.location.href, beforeLength = env.history.length;
    env.click(`${root} [data-save="${p.id}"] svg path`); assert.equal(env.get(`${root} [data-save="${p.id}"]`).getAttribute('aria-pressed'), 'true'); assert.deepEqual(JSON.parse(env.storage.get(storageKey)), [p.id]);
    env.click(`${root} [data-copy="${p.id}"] span`); await env.settle(); assert.deepEqual(env.clipboard, ['https://example.test/publication/?edition=1' + C.postHash(p.id)]);
    const beforeStatus = env.get(`${root} #visual-${p.id} .demo-status`).textContent;
    env.click(`${root} [data-demo="${p.id}"] span`); assert.notEqual(env.get(`${root} #visual-${p.id} .demo-status`).textContent, beforeStatus);
    assert.equal(env.get(`${root} #visual-${p.id}`).getAttribute('data-mode'), '1');
    assert.equal(env.document.activeElement.dataset.demo, p.id); assert.equal(env.location.href, beforeURL); assert.equal(env.history.length, beforeLength); assertView(env, article ? 'article' : 'feed');
  }
});
check('Task prompts copy exact source text; clipboard failure selects a manual fallback', async () => {
  const p = data.posts.find(p => p.tryThis), url = 'https://example.test/publication/' + C.postHash(p.id);
  const env = boot({ url }); env.click('[data-copy-prompt]'); await env.settle(); assert.deepEqual(env.clipboard, [p.tryThis.prompt]); assertView(env, 'article'); assert.equal(env.location.href, url);
  for (const options of [{ clipboard: false }, { clipboardReject: true }, { secure: false }]) {
    const fallback = boot({ url, ...options }); fallback.click('[data-copy-prompt]'); await fallback.settle(); assert.equal(fallback.get('#prompt-' + p.id).selected, true);
    fallback.click('#article-view [data-copy]'); await fallback.settle(); assert.equal(fallback.get('#link-dialog').open, true); assert.equal(fallback.get('#link-input').value, url); assert.equal(fallback.get('#link-input').selected, true); assertView(fallback, 'article');
  }
});
check('Bookmark persistence, storage failures, and cross-tab updates remain safe', () => {
  const p = data.posts[0], env = boot({ storage: { [storageKey]: JSON.stringify([p.id, 'missing']) } });
  env.click('#shelf-button'); assert.deepEqual(visiblePosts(env), [p.id]); env.click(`[data-save="${p.id}"]`); assert.deepEqual(visiblePosts(env), []); assert.equal(env.get('#empty-state').hidden, false);
  env.storageEvent(storageKey, JSON.stringify([data.posts[1].id])); assert.deepEqual(visiblePosts(env), [data.posts[1].id]);
  env.storageEvent(storageKey, 'corrupt'); assert.deepEqual(visiblePosts(env), []);
  const blocked = boot({ storageReadError: true, storageWriteError: true }); blocked.click('#feed [data-save]'); assert.equal(blocked.get('#bookmark-count').textContent, '1'); assert(blocked.get('#toast').textContent.includes('仅保留到本次页面关闭'));
});
check('Keyboard search shortcut, Escape clearing, and tag search use the feed safely', () => {
  const env = boot(); env.key('/'); assert.equal(env.document.activeElement.id, 'search'); env.input('MCP'); env.key('Escape'); assert.equal(env.get('#search').value, ''); assert.equal(visiblePosts(env).length, data.posts.length);
  const p = data.posts[0]; env.click('#post-' + p.id + ' .post-title a'); env.key('/'); assert.equal(env.document.activeElement.id, 'article-title');
  env.click('#article-view [data-tag]'); assertView(env, 'feed'); assert.equal(env.get('#search').value, p.tags[0]); assert(visiblePosts(env).includes(p.id)); assert.equal(env.document.activeElement.id, 'search');
});
check('Animation controls are absent and retired storage cannot disable scenes', () => {
  const env = boot({ storage: { [motionKey]: 'paused' } });
  assert.equal(env.document.querySelector('#motion-toggle, #motion-label, .motion-indicator'), null);
  assert.equal(env.document.body.classList.contains('motion-paused'), false);
  env.storageEvent(motionKey, 'paused');
  assert.equal(env.document.body.classList.contains('motion-paused'), false);
  assert.equal(env.storage.get(motionKey), 'paused', 'Retired preference is ignored without rewriting unrelated storage');
  assert.equal(boot({ storageReadError: true }).document.body.classList.contains('motion-paused'), false);
});
check('System reduced-motion stays authoritative without a visible switch', () => {
  const env = boot({ reducedMotion: true, storage: { [motionKey]: 'paused' } });
  assert(env.document.body.classList.contains('motion-paused'));
  env.reduce(false); assert.equal(env.document.body.classList.contains('motion-paused'), false);
  env.reduce(true); assert(env.document.body.classList.contains('motion-paused'));
  env.storageEvent(motionKey, 'playing'); assert(env.document.body.classList.contains('motion-paused'));
  env.reduce(false); assert.equal(env.document.body.classList.contains('motion-paused'), false);
});
check('Visible scenes keep looping beyond multiple cycles; viewport exits pause without settling', () => {
  const env = boot({ observer: true }), observer = env.observers[0];
  const scenes = [env.get('.sunset-scene'), env.get('#feed .motion-scene')];
  for (const scene of scenes) {
    assert(!scene.classList.contains('is-visible'));
    env.tick(6000); assert(!scene.classList.contains('motion-settled'));
    observer.callback([{ target: scene, isIntersecting: true }]);
    env.tick(36000);
    assert(scene.classList.contains('is-visible'));
    assert(!scene.classList.contains('motion-settled'), 'Visible scene must not expire after one pass');
    observer.callback([{ target: scene, isIntersecting: false }]);
    assert(!scene.classList.contains('is-visible'));
    env.tick(36000);
    observer.callback([{ target: scene, isIntersecting: true }]);
    env.tick(36000);
    assert(scene.classList.contains('is-visible'));
    assert(!scene.classList.contains('motion-settled'), 'Resumed scene must remain eligible to loop');
  }
  assert(!/playedScenes|startedNodes|motion-settled/.test(app), 'No per-node or per-visit one-shot lock');
  assert(/\.motion-scene:not\(\.is-visible\)[^{]*\{[^}]*animation-play-state:\s*paused\s*!important/.test(css));
  assert(/\[hidden\]\s+\.motion-scene\s+\*[^{]*\{[^}]*animation-play-state:\s*paused\s*!important/.test(css));
});
check('Rerenders, demonstration changes, routes, and observer fallback retain looping scenes', () => {
  const env = boot(), p = data.posts[0], selector = '#visual-' + p.id;
  const verify = () => {
    const scene = env.get(selector);
    assert(scene.classList.contains('is-visible'), 'No-observer fallback enables scene motion');
    env.tick(36000);
    assert(!scene.classList.contains('motion-settled'));
    assert(!env.document.body.classList.contains('motion-paused'));
  };
  verify();
  env.click('#post-' + p.id + ' [data-save]'); verify();
  env.click('#post-' + p.id + ' [data-demo]'); verify();
  env.click('#post-' + p.id + ' .post-title a'); verify();
  env.back(); verify();
  env.forward(); verify();
  env.reduce(true); assert(env.document.body.classList.contains('motion-paused'));
  env.tick(36000);
  env.reduce(false); verify();
});
check('Every decorative scene keeps infinite iterations and its own duration and phase', () => {
  const clocks = new Set(); let count = 0;
  for (const match of (css + '\n' + visualCSS).matchAll(/(?:^|[;{])\s*animation\s*:\s*([^;}]+)/g)) {
    const value = match[1].trim();
    if (value.startsWith('none') || value.startsWith('article-arrive ')) continue;
    assert(/\binfinite\b/.test(value), 'Decorative animation must loop: ' + value);
    const duration = value.match(/\s([.\d]+)s\b/); assert(duration, value);
    clocks.add(duration[1]); count++;
  }
  assert(count >= 60, 'Cover the hero and all article illustrations');
  assert(clocks.size >= 10, 'Do not flatten individual scene rhythms to a shared duration');
  assert(!/animation-(?:duration|delay|iteration-count)\s*:[^;}]*!important/.test(css), 'No global one-shot or phase override');
  assert(/\.fv-packet-b\s*\{[^}]*animation-delay:-4s/.test(visualCSS));
  assert(/\.fv-check-step-1\s*\{[^}]*animation-delay:-6s/.test(visualCSS));
});
check('Editorial chrome is concise while source, demonstration, and local-storage notices survive', () => {
  for (const removed of ['慢一点看，想清楚再动手', '读到这里，也可以开始动手', '从一个小问题、一条可信来源', '好用，比热闹重要', '带着你的问题读', '读原始资料，做自己的判断', '独立整理 · 保留判断 · 鼓励实践']) assert(!index.includes(removed), removed);
  const env = boot(); assert.equal(env.document.querySelector('.sunset-label'), null);
  assert.equal(env.get('.sunset-scene').textContent.trim(), '', 'Scenery must have no overlaid slogan');
  const note = env.get('#editorial-note').textContent;
  for (const retained of ['原始资料', '核验日期', '官方事实', '原创实验', '非官方界面或模型输出', '不调用模型或执行真实任务', '当前浏览器', '追踪统计']) assert(note.includes(retained), retained);
  assert(env.get('#endnote').textContent.includes('如果换个问法呢？'));
  env.click('#try-practice'); assert.equal(env.history.state.feed.category, 'practice');
  for (const p of data.posts) {
    const article = boot({ url: 'https://example.test/publication/' + C.postHash(p.id) });
    if (p.caveat) assert(article.get('.caveat').textContent.includes(p.caveat));
    if (p.license) assert(article.get('.source-list').textContent.includes(p.license));
    assert(article.get('.source-list').textContent.includes('核验'));
  }
});
function keyframeSteps(source, name) {
  const marker = '@keyframes ' + name;
  const start = source.indexOf(marker); assert(start >= 0, 'Missing keyframes: ' + name);
  const open = source.indexOf('{', start); let depth = 1, end = open + 1;
  while (depth && end < source.length) { if (source[end] === '{') depth++; else if (source[end] === '}') depth--; end++; }
  assert.equal(depth, 0, 'Unclosed keyframes: ' + name);
  return [...source.slice(open + 1, end - 1).matchAll(/([^{}]+)\{([^{}]+)\}/g)].flatMap(match =>
    match[1].split(',').map(percent => ({ percent: parseFloat(percent), style: match[2].trim() }))
  ).sort((a, b) => a.percent - b.percent);
}
check('Header birds retain independent shoulder pivots, wing phases, pitch, and shallow arcs', () => {
  const env = boot(), flock = env.get('.hero-flock');
  for (const part of ['bird-flight', 'bird-pose', 'bird-body', 'bird-wing-left', 'bird-wing-right']) assert.equal(flock.querySelectorAll('.' + part).length, 3);
  const strokes = [], arcs = [];
  for (const depth of ['near', 'middle', 'far']) {
    assert(flock.querySelector('.bird-flight--' + depth));
    for (const name of ['bird-pass-' + depth, 'bird-pitch-' + depth, 'bird-stroke-left-' + depth, 'bird-stroke-right-' + depth]) {
      const frames = keyframeSteps(css, name);
      assert(frames.length >= 4, name + ' needs distinct poses');
      const rule = new RegExp('animation:\\s*' + name + '\\s+12s\\s+[^;]*infinite\\s+both');
      assert(rule.test(css), name + ' must share the full offscreen-reset cycle');
    }
    const left = keyframeSteps(css, 'bird-stroke-left-' + depth), right = keyframeSteps(css, 'bird-stroke-right-' + depth);
    const angle = frame => Number(frame.style.match(/rotate\(([-.\d]+)deg\)/)[1]);
    assert(left.some(frame => angle(frame) > 10) && left.some(frame => angle(frame) < -10));
    assert(right.some(frame => angle(frame) > 8) && right.some(frame => angle(frame) < -8));
    assert.equal(angle(left.at(-1)), 0); assert.equal(angle(right.at(-1)), 0);
    assert.notEqual(JSON.stringify(left), JSON.stringify(right), 'Wings have slight phase and amplitude differences');
    strokes.push(JSON.stringify(left)); arcs.push(JSON.stringify(keyframeSteps(css, 'bird-pass-' + depth)));
  }
  assert.equal(new Set(strokes).size, 3); assert.equal(new Set(arcs).size, 3);
  assert(!css.includes('@keyframes bird-wing '), 'No old scaleY flap');
  assert(!css.includes('@keyframes birds-cross '), 'No whole-flock linear translation');
  assert(!/\.bird[^{}]*\{[^}]*scaleY/.test(css));
  assert(css.includes('transform-origin: 0 0'));
  assert(/\.hero-flock\s*\{\s*animation:\s*none;\s*transform:\s*none/.test(css));
});
check('Bird paths enter and reset outside the frame with a shared empty-sky interval every cycle', () => {
  const origins = { near: 70, middle: 110, far: 151 };
  const radius = 16, width = 360, duration = 12;
  for (const [depth, origin] of Object.entries(origins)) {
    const frames = keyframeSteps(css, 'bird-pass-' + depth).map(frame => {
      const xy = frame.style.match(/translate\(([-.\d]+)px,\s*([-.\d]+)px\)/); assert(xy, depth);
      return { percent: frame.percent, x: Number(xy[1]), y: Number(xy[2]) };
    });
    assert.equal(frames[0].percent, 0); assert.equal(frames.at(-1).percent, 100);
    assert(origin + frames[0].x + radius < 0, depth + ' must begin wholly left of the SVG');
    assert(origin + frames.at(-1).x - radius > width, depth + ' must finish wholly right of the SVG');
    for (let i = 1; i < frames.length; i++) assert(frames[i].x >= frames[i - 1].x, 'No backward flight or in-frame teleport');
    const ys = frames.map(frame => frame.y); assert(Math.max(...ys) - Math.min(...ys) >= 5, 'Retain a shallow curved path');
    const hold = frames.find(frame => frame.x === frames.at(-1).x);
    assert(hold.percent <= 74, 'All birds leave at least 26% of each cycle empty');
    assert(frames.filter(frame => frame.percent >= 74).every(frame => frame.x === frames.at(-1).x));
    const sample = time => {
      const percent = (time % duration) / duration * 100;
      const next = frames.findIndex(frame => frame.percent >= percent);
      if (next <= 0) return origin + frames[0].x;
      const a = frames[next - 1], b = frames[next];
      return origin + a.x + (b.x - a.x) * (percent - a.percent) / (b.percent - a.percent);
    };
    for (const cycle of [0, 1, 2]) {
      const offset = cycle * duration;
      assert(sample(offset) + radius < 0, 'Each restart remains offscreen');
      assert(sample(offset + 4) > radius && sample(offset + 4) < width - radius, 'Bird crosses the sky again');
      for (const emptyTime of [9, 10, 11, 11.999]) assert(sample(offset + emptyTime) - radius > width, 'Empty-sky interval must survive repeated loops');
    }
  }
});
check('Intersection observer controls active scenes and reconnects after routing', () => {
  const env = boot({ observer: true }), observer = env.observers[0]; assert.equal(observer.targets.size, visiblePosts(env).length + 1);
  const scene = env.get('#feed .motion-scene'); assert.equal(scene.classList.contains('is-visible'), false);
  observer.callback([{ target: scene, isIntersecting: true }]); assert(scene.classList.contains('is-visible'));
  observer.callback([{ target: scene, isIntersecting: false }]); assert.equal(scene.classList.contains('is-visible'), false);
  env.click('#feed .post-title a'); assert(observer.targets.has(env.get('#article-view .motion-scene')));
});
check('Article rendering escapes untrusted content and omits dangerous source URLs', () => {
  const fixture = clone(data), p = fixture.posts[0]; p.title = '<img src=x onerror="alert(1)">'; p.summary = ['<script>alert(1)</script>']; p.caveat = '<iframe src="https://evil.test"></iframe>'; p.sources.push({ title: 'unsafe', url: 'javascript:alert(1)' });
  const env = boot({ data: fixture, url: 'https://example.test/publication/' + C.postHash(p.id) });
  assert.equal(env.get('#article-title').textContent, p.title); assert.equal(env.get('#article-view').querySelectorAll('script,img,iframe').length, 0);
  assert(env.get('#article-view').innerHTML.includes('&lt;script&gt;')); assert(env.get('#article-view').querySelectorAll('.source-list a').every(link => link.href.startsWith('https://')));
});

(async () => {
  let passed = 0;
  for (const [name, fn] of suites) {
    try { await fn(); passed++; console.log('PASS ' + name); }
    catch (error) { console.error('FAIL ' + name); console.error(error.stack); process.exitCode = 1; }
  }
  console.log(`\n${passed}/${suites.length} suites passed. Browser layout, animation paint, and native clipboard permission UI still need browser QA.`);
})();
