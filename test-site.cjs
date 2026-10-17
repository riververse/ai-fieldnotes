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
    assert(p.verifiedAt <= data.site.verifiedAt, p.id + ': article verification cannot exceed the latest site verification'); assert(/^\d{4}-\d{2}-\d{2}$/.test(p.verifiedAt));
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
  assert.match(release, /^20261017r1-[0-9a-f]{12}$/, 'Release must include the deterministic asset digest');
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
  assert(!/fv-control/.test(css + visualCSS), 'Explanatory text has no retired button styling');
  assert(/\.article-toolbar>button[^}]*min-height\s*:\s*44px/.test(css));
  const entry = css.match(/animation\s*:\s*article-arrive\s+([.\d]+)s/); assert(entry); assert(Number(entry[1]) > 0 && Number(entry[1]) <= 0.25);
  assert(/\.motion-paused\s+\.article-view\.is-entering\s+\.article-paper\s*\{[^}]*animation\s*:\s*none/.test(css));
  assert(!/addEventListener\s*\(\s*['"](?:wheel|touchmove|touchstart|touchend)['"]/.test(app), 'Native scroll gestures must not be intercepted');
  const env = boot(); env.click('#feed .post-title a'); assert(env.get('#article-view').classList.contains('is-entering'));
  env.tick(250); assert.equal(env.get('#article-view').classList.contains('is-entering'), false);
  env.back(); assertView(env, 'feed'); assert.equal(env.get('#article-view').classList.contains('is-entering'), false);
});
check('Every article has a real illustration renderer with labels, readable notes, and motion hooks', () => {
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
    assert.equal(node.querySelector('[data-demo],button,[aria-live]'), null);
    assert(node.querySelector('.fv-note-transcript').textContent.trim());
    assert.equal(node.querySelector('.fv-note-window').getAttribute('aria-hidden'), 'true');
    assert(node.querySelector('.fv-caption').textContent.includes('原创')); assert(!node.querySelector('.fv-caption').textContent.includes('交互')); 
    assert.equal(node.querySelectorAll('animate,animateTransform,iframe,script').length, 0);
  }
  assert(types.size >= 5, 'Illustrations should retain distinct visual treatments');
  for (const pattern of [/\.is-visible[^{]*\.fv-animated\s*\{[^}]*animation-play-state\s*:\s*running/, /motion-paused[^{]*\.fv-animated\s*\{[^}]*animation-play-state\s*:\s*paused/, /@media\s*\(prefers-reduced-motion\s*:\s*reduce\)[\s\S]*animation\s*:\s*none\s*!important/, /@media\s+print/, /@keyframes\s+fv-sunset/, /@keyframes\s+fv-birds/]) assert(pattern.test(visualCSS), String(pattern));
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
  for (const p of data.posts) { env.click('#post-' + p.id + ' .post-title a'); assertIDs(); env.click('#article-view .fv-note-window'); assertIDs(); env.back(); assertIDs(); }
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
check('Bookmark, link-copy, and non-interactive illustration areas stay in their current view', async () => {
  const p = data.posts[0];
  for (const article of [false, true]) {
    const env = boot({ url: 'https://example.test/publication/?edition=1' + (article ? C.postHash(p.id) : '') });
    const root = article ? '#article-view' : '#feed', beforeURL = env.location.href, beforeLength = env.history.length;
    env.click(`${root} [data-save="${p.id}"] svg path`); assert.equal(env.get(`${root} [data-save="${p.id}"]`).getAttribute('aria-pressed'), 'true'); assert.deepEqual(JSON.parse(env.storage.get(storageKey)), [p.id]);
    env.click(`${root} [data-copy="${p.id}"] span`); await env.settle(); assert.deepEqual(env.clipboard, ['https://example.test/publication/?edition=1' + C.postHash(p.id)]);
    const beforeNotes = env.get(`${root} #visual-${p.id} .fv-note-transcript`).textContent;
    for (const target of ['.fv-heading', '.fv-art', '.fv-labels', '.fv-note-window', '.fv-caption']) {
      env.click(`${root} #visual-${p.id} ${target}`);
      assert.equal(env.get(`${root} #visual-${p.id} .fv-note-transcript`).textContent, beforeNotes);
      assert.equal(env.location.href, beforeURL); assert.equal(env.history.length, beforeLength);
      assertView(env, article ? 'article' : 'feed');
    }
    assert.equal(env.get(`${root} #visual-${p.id}`).querySelector('button,[tabindex]'), null);
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
check('Rerenders, reading-note taps, routes, and observer fallback retain looping scenes', () => {
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
  env.click('#post-' + p.id + ' .fv-note-window'); verify();
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

/* Added after the established 44 baseline suites. Existing suites remain intact. */
check('Expanded editorial bodies keep previews short and use readable existing section types', () => {
  assert.equal(data.posts.length, 48);
  for (const p of data.posts) {
    assert(p.dek.length < 100, p.id + ': feed preview should remain short');
    assert(p.summary.length >= 1 && p.summary.length <= 3, p.id);
    assert(p.analysis.length >= 5, p.id + ': independent article explanation');
    for (const section of p.analysis) {
      assert.equal(typeof section.heading, 'string');
      assert.equal(typeof section.text, 'string');
      assert(section.text.length > 40 && section.text.length <= 250, p.id + ': readable section');
    }
    assert(p.tryThis && p.tryThis.prompt.length >= 60 && p.tryThis.expected.length >= 40, p.id + ': reusable task and expected result');
    assert(p.steps.length <= 4, p.id + ': concise implementation checklist');
  }
});
check('Editorial aliases stay synchronized and original proposals are not dated as releases', () => {
  for (const p of data.posts) {
    assert.deepEqual(p.paragraphs, p.summary, p.id);
    assert.deepEqual(p.takeaways, p.steps, p.id);
    assert.equal(p.limitations, p.caveat, p.id);
    assert.equal(p.verified_date, p.verifiedAt, p.id);
    if (p.kind === 'experiment') assert.equal(p.date, null, p.id);
    assert.equal(new Set(p.sources.map(s => s.url)).size, p.sources.length, p.id);
    assert(p.sources.every(s => s.url.startsWith('https://')), p.id);
  }
});
check('All 48 direct details render every explanatory section and retain their source evidence', () => {
  for (const p of data.posts) {
    const env = boot({ url: 'https://example.test/publication/' + C.postHash(p.id) });
    assertView(env, 'article');
    const detail = env.get('#article-view');
    for (const section of p.analysis) {
      assert(detail.textContent.includes(section.heading), p.id + ': section heading');
      assert(detail.textContent.includes(section.text), p.id + ': full section text');
    }
    assert.equal(detail.querySelectorAll('.source-list a').length, p.sources.length, p.id);
    assert(detail.textContent.includes(p.caveat), p.id);
    assert.equal(detail.querySelectorAll('[data-copy-prompt]').length, 1, p.id);
  }
});
check('Every copyable task preserves complete multiline text without changing the article route', async () => {
  for (const p of data.posts) {
    const url = 'https://example.test/publication/' + C.postHash(p.id);
    const env = boot({ url });
    assert.equal(env.get('#prompt-' + p.id).value, p.tryThis.prompt, p.id);
    env.click('[data-copy-prompt]'); await env.settle();
    assert.deepEqual(env.clipboard, [p.tryThis.prompt], p.id);
    assert.equal(env.location.href, url); assertView(env, 'article');
  }
});
check('Expanded article text is searchable without exposing it in preview cards', () => {
  const env = boot();
  for (const p of data.posts) {
    const phrase = p.analysis[0].text.slice(0, 12);
    assert(C.filterPosts(data.posts, { ...base(), query: phrase }).some(hit => hit.id === p.id), p.id);
    const card = env.get('#post-' + p.id);
    assert.equal(card.querySelectorAll('.article-section,.try-this,.source-list').length, 0, p.id);
    assert(!card.textContent.includes(p.analysis[0].text), p.id);
  }
});
check('Long article navigation retains latest reading position and a clean feed after return', () => {
  const p = data.posts.find(post => post.id === 'document-style-pipeline');
  const env = boot();
  env.scroll(1200); env.tick(200); env.click('#post-' + p.id + ' .post-title a');
  env.scroll(2800); env.click('#article-view .article-return');
  assertView(env, 'feed'); assert.equal(env.window.scrollY, 1200);
  env.forward(); assertView(env, 'article'); assert.equal(env.window.scrollY, 2800);
  assert.equal(env.get('#prompt-' + p.id).value, p.tryThis.prompt);
});

check('Diagram explanations retain every authored state and reserve stable natural text height', () => {
  const definitionScope = { window: {} };
  vm.runInNewContext(visuals.replace('  window.FieldnoteVisuals = Object.freeze({', '  window.__sceneDefinitions = scenes;\n  window.FieldnoteVisuals = Object.freeze({'), definitionScope);
  const env = boot();
  for (const p of data.posts) {
    const expected = [...new Set([0, 1, 2, 3].map(n => definitionScope.window.__sceneDefinitions[p.id](n).status))];
    const scene = env.get('#visual-' + p.id);
    const transcript = scene.querySelector('.fv-note-transcript');
    const slides = scene.querySelectorAll('.fv-note');
    assert.deepEqual(transcript.querySelectorAll('li').map(li => li.textContent), expected);
    assert.equal(slides.length, expected.length);
    slides.forEach((slide, i) => {
      assert(slide.textContent.includes(expected[i]));
      assert(slide.getAttribute('style').includes(`animation-delay:-${(expected.length - i) * 6}s`));
    });
    assert.equal(scene.querySelector('[aria-live],button,[role="button"]'), null);
  }
  assert(/\.fv-note-window\s*\{[^}]*display:grid/.test(visualCSS));
  assert(/\.fv-note\s*\{[^}]*grid-area:1 \/ 1/.test(visualCSS));
  assert(!/\.fv-note(?:-window)?\s*\{[^}]*(?:^|;)\s*height:/.test(visualCSS), 'No fixed clipping height for differently wrapped notes');
  assert(!/setInterval|setTimeout|requestAnimationFrame/.test(visuals), 'Notes share the existing CSS observer lifecycle');
  assert(!/data-demo|demos\.get|demos\.set/.test(app), 'No retired demo click path');
});
check('Reading notes hold for over five seconds, loop gently, and become complete static text', () => {
  for (const [name, seconds, hold] of [['fv-note-pair', 12, 44], ['fv-note-quartet', 24, 22]]) {
    const steps = keyframeSteps(visualCSS, name);
    assert(steps.some(step => step.percent === hold && /opacity:1/.test(step.style)));
    assert(seconds * hold / 100 >= 5, 'Each explanation needs enough quiet reading time');
    assert(steps.some(step => step.percent === 100 && /opacity:1/.test(step.style)));
  }
  for (const rule of [
    /body\.motion-paused \.fv-note-window\s*\{display:none/, 
    /body\.motion-paused \.fv-note-transcript\s*\{[^}]*position:static[^}]*height:auto[^}]*clip:auto[^}]*white-space:normal/,
    /@media \(prefers-reduced-motion:reduce\), print\s*\{[\s\S]*\.fv-note-window\s*\{display:none/,
    /\.fv-note-transcript\s*\{[^}]*position:absolute[^}]*clip-path:inset\(50%\)/
  ]) assert(rule.test(visualCSS), String(rule));
  for (const width of [320, 360, 390, 650, 1024]) {
    assert(parseFloat(designValue('.fv-note', 'font-size', width)) >= 11, 'Readable note size at ' + width);
  }
});
check('Mobile card touch feedback is scoped and keyboard focus remains visible', () => {
  assert(/button, a, \.post\s*\{[^}]*-webkit-tap-highlight-color:\s*transparent/.test(css));
  assert(/\.post:active\s*\{[^}]*background-color:\s*#f4f5ed/.test(css));
  assert(/button:focus-visible[^}]*outline:\s*2px solid var\(--green\)/.test(css));
  assert(/\.fv-visual\s*\{cursor:default/.test(visualCSS));
  assert(!/user-select:\s*none/.test(visualCSS), 'Diagram text must remain available for reading and selection');
});

/* Optical-layer contracts: static DOM/CSS checks, not browser paint or frame timing. */
check('Repeated diagram renders namespace SVG definitions and preserve non-interactive notes', () => {
  const scope = { window: {} }; vm.runInNewContext(visuals, scope);
  const seen = new Set();
  for (const post of data.posts) for (const state of [0, 1, 2, 3]) {
    const output = scope.window.FieldnoteVisuals.render(post, state);
    assert(!output.includes(`data-demo=`), post.id);
    assert(output.includes(`class="fv-note-list fv-note-transcript"`), post.id);
    assert(output.includes(`id="visual-${post.id}"`), post.id);
    assert(output.includes('aria-hidden="true" focusable="false"'), post.id);
    assert(!output.includes('aria-live='), post.id);
    const svg = output.match(/<svg[\s\S]*<\/svg>/)[0];
    const localIds = [...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    for (const id of localIds) { assert(!seen.has(id), 'SVG definitions must be unique across repeated instances'); seen.add(id); }
    for (const match of svg.matchAll(/url\(#([^)]+)\)/g)) assert(localIds.includes(match[1]), 'SVG references must resolve inside their own instance');
  }
  assert(seen.size > 100, 'Each scene must provide its own scoped definitions');
  assert.equal(scope.window.FieldnoteVisuals.render({ id: 'missing' }), '');
});
check('Diagram particles stay within element and motion budgets without external animation work', () => {
  const scope = { window: {} }; vm.runInNewContext(visuals, scope);
  for (const post of data.posts) for (const state of [0, 1, 2, 3]) {
    const svg = scope.window.FieldnoteVisuals.render(post, state).match(/<svg[\s\S]*<\/svg>/)[0];
    assert(svg.includes('fv-optical-signals') && svg.includes('fv-flow-runner'), post.id);
    assert([...svg.matchAll(/<(?!\/)[a-z][^>]*>/g)].length <= 190, post.id + ': SVG element budget');
    assert([...svg.matchAll(/class="fv-animated fv-flow-runner/g)].length <= 6, post.id + ': particle budget');
    assert(!/<filter|<animate|<image|<foreignObject|<canvas/.test(svg), post.id);
  }
  assert(!/setInterval|requestAnimationFrame|Math\.random|fetch\(/.test(visuals));
  assert(!/filter\s*:|backdrop-filter|will-change|mix-blend-mode/.test(visualCSS));
  assert(!/url\(#/.test(visualCSS), 'Scoped SVG IDs must never be hardcoded in global CSS');
});
check('Optical layers retain detail, mobile, offscreen, print, and reduced-motion fallbacks', () => {
  assert(visualCSS.includes('.article-paper .fv-visual .fv-fx-detail {display:inline;}'));
  assert(visualCSS.includes('.article-paper .fv-visual .fv-fx-detail {display:none;}'));
  assert(visualCSS.includes('@media (max-width:650px)'));
  assert(visualCSS.includes('@supports not (offset-path:'));
  assert(visualCSS.includes('body.motion-paused .fv-visual.motion-scene .fv-animated {animation-play-state:paused!important;}'));
  assert(visualCSS.includes('@media (prefers-reduced-motion:reduce)'));
  assert(visualCSS.includes('.fv-visual .fv-flow-runner,.fv-visual .fv-flow-trail,.fv-visual .fv-pulse-ring,.fv-visual .fv-optical-scan'));
  assert(visualCSS.includes('@media print'));
  const lastAnimation = visualCSS.lastIndexOf('animation:fv-');
  assert(visualCSS.lastIndexOf('.fv-visual.motion-scene .fv-animated {animation-play-state:paused;}') > lastAnimation, 'Observer pause must override later animation shorthands');
});

/* Design-system source contracts. These do not claim computed browser layout. */
function designRules(source, media = []) {
  source = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = []; let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf('{', cursor); if (open < 0) break;
    const selector = source.slice(cursor, open).trim();
    let depth = 1, end = open + 1, quote = null;
    for (; end < source.length && depth; end++) {
      const char = source[end];
      if (quote) { if (char === quote && source[end - 1] !== '\\') quote = null; continue; }
      if (char === '"' || char === "'") quote = char;
      else if (char === '{') depth++;
      else if (char === '}') depth--;
    }
    assert.equal(depth, 0, 'Balanced CSS block: ' + selector);
    const body = source.slice(open + 1, end - 1);
    if (selector.startsWith('@media')) rules.push(...designRules(body, [...media, selector.slice(6).trim()]));
    else if (!selector.startsWith('@')) rules.push({ selector, media, declarations: Object.fromEntries(body.split(';').filter(x => x.includes(':')).map(x => { const colon = x.indexOf(':'); return [x.slice(0, colon).trim(), x.slice(colon + 1).trim()]; })) });
    cursor = end;
  }
  return rules;
}
const designSheet = designRules(css + '\n' + visualCSS);
const designTokens = designSheet.find(rule => rule.selector === ':root').declarations;
function designActive(query, width, coarse = false) {
  return query.split(',').some(alternative => {
    if (/print|prefers-reduced-motion/.test(alternative)) return false;
    const max = alternative.match(/max-width\s*:\s*([\d.]+)px/);
    const min = alternative.match(/min-width\s*:\s*([\d.]+)px/);
    return (!max || width <= Number(max[1])) && (!min || width >= Number(min[1])) && (!/pointer\s*:\s*coarse/.test(alternative) || coarse);
  });
}
function designValue(selector, property, width = 1440, coarse = false) {
  let value;
  for (const rule of designSheet) if (rule.selector.split(',').map(x => x.trim()).includes(selector) && rule.media.every(query => designActive(query, width, coarse)) && property in rule.declarations) value = rule.declarations[property];
  return value && value.replace(/var\((--[\w-]+)\)/g, (_, token) => { assert(token in designTokens, 'Known design token ' + token); return designTokens[token]; });
}
function designContrast(a, b) {
  const luminance = hex => {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + .05) / (low + .05);
}
check('Publication tokens provide one explicit type, space, surface, and control vocabulary', () => {
  for (const token of ['--canvas', '--white', '--ink', '--text', '--muted', '--green', '--red', '--rule', '--type-caption', '--type-small', '--type-ui', '--type-preview', '--type-body', '--measure-reading', '--target-size', '--shadow-paper']) assert(token in designTokens, token);
  assert.deepEqual(['--type-caption', '--type-small', '--type-ui', '--type-preview', '--type-body'].map(x => parseFloat(designTokens[x])), [11, 12, 13, 14, 17]);
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => parseFloat(designTokens['--space-' + (i + 1)])), [4, 8, 12, 16, 24, 32, 40, 48]);
  assert.equal(designTokens['--target-size'], '44px');
  assert.equal(designValue('.visual.fv-visual', 'font-family'), designTokens['--sans']);
  assert(!/@import|@font-face/.test(css + visualCSS), 'No new external font or stylesheet dependency');
});
check('Explicit publication text and action pairs meet contrast thresholds', () => {
  for (const background of [designTokens['--canvas'], designTokens['--white'], '#edf1e6']) for (const text of ['--ink', '--text', '--muted', '--green', '--red']) assert(designContrast(designTokens[text], background) >= 4.5, text + ' on ' + background);
  assert(designContrast(designTokens['--white'], designTokens['--green']) >= 4.5, 'Task button label');
  assert(designContrast(designTokens['--green'], designTokens['--selected']) >= 3, 'Selected/focus indicator');
});
check('Article prose and meaningful metadata retain readable font floors at every breakpoint', () => {
  for (const width of [320, 360, 390, 420, 650, 760, 1024, 1440]) {
    for (const selector of ['.post-byline small', '.post-label', '.detail-evidence', '.source-list small', '.source-facts', '.fv-visual .fv-caption']) assert(parseFloat(designValue(selector, 'font-size', width)) >= 11, selector + ' at ' + width);
    assert(parseFloat(designValue('.post-detail p', 'font-size', width)) >= 16, 'Article body at ' + width);
    assert(parseFloat(designValue('.post-dek', 'font-size', width)) >= 14, 'Feed preview at ' + width);
    assert(parseFloat(designValue('.post-detail p', 'line-height', width)) >= 1.85, 'Article rhythm at ' + width);
    if (width <= 650) assert.equal(designValue('.search-field input', 'font-size', width), '16px');
  }
});
check('Key controls declare real 44px targets rather than relying on padding arithmetic', () => {
  for (const width of [320, 390, 650, 760, 1440]) for (const coarse of [false, true]) {
    for (const selector of ['.nav-link', '.region-filter button', '#show-all', '.read-button', '.icon-button', '.post-tags button', '.article-toolbar>button', '.article-return', '.try-this-heading button', '.source-list a', '.search-field']) assert(parseFloat(designValue(selector, 'min-height', width, coarse)) >= 44, selector + ' at ' + width);
    assert(parseFloat(designValue('.icon-button', 'min-width', width, coarse)) >= 44);
    if (width <= 650) {
      assert(parseFloat(designValue('.mobile-categories button', 'min-height', width, coarse)) >= 44);
      assert(parseFloat(designValue('.mobile-shelf', 'min-width', width, coarse)) >= 44);
    }
  }
});
check('Title wrapping, reading measure, and narrow controls have deliberate fallback rules', () => {
  assert.equal(designValue('.post-title', 'text-wrap'), 'balance');
  assert.equal(designValue('.article-title', 'text-wrap'), 'balance');
  for (const width of [320, 360, 388, 390, 420, 650, 1440]) assert.equal(designValue('.fv-heading strong', 'text-wrap', width), 'balance', 'Diagram heading at ' + width);
  assert.equal(designValue('.post-detail', 'max-width'), '40em');
  assert.equal(designValue('.post-title', 'overflow-wrap'), 'anywhere');
  assert.equal(designValue('.post-title', 'border-top'), undefined, 'Body separator must not leak into titles');
  assert.equal(designValue('.article-title', 'padding-top'), undefined, 'Body padding must not leak into titles');
  for (const selector of ['.post-actions', '.filter-line', '.try-this-heading']) assert.equal(designValue(selector, 'flex-wrap', 320), 'wrap');
  assert.equal(designValue('.post-label', 'grid-column', 390), '2');
  assert.equal(designValue('.post-label', 'max-width', 390), 'none');
  assert.equal(designValue('.post-label', 'white-space', 390), 'normal');
  assert.equal(designValue('.source-list a span:last-child', 'flex-shrink'), '0');
  assert.equal(designValue('.try-this textarea', 'resize', 390), 'vertical');
  assert.equal(designValue('.try-this textarea', 'font-size', 390), '16px');
});
check('Focus, selected feedback, and sources preserve non-color cues', () => {
  assert.equal(designValue('button:focus-visible', 'outline'), '2px solid ' + designTokens['--green']);
  assert.equal(designValue('.search-field:focus-within', 'outline'), '2px solid ' + designTokens['--green']);
  assert.equal(designValue('.icon-button.saved', 'background'), designTokens['--red-light']);
  assert.equal(designValue('.source-list a', 'text-decoration'), 'underline');
  assert.equal(designValue('.source-list li:before', 'content'), 'counter(source, decimal-leading-zero)');
  const env = boot(); const p = data.posts[0]; env.click('#post-' + p.id + ' [data-save]');
  assert.equal(env.get('#post-' + p.id + ' [data-save]').getAttribute('aria-pressed'), 'true');
  assert(env.get('#post-' + p.id + ' [data-save]').textContent.includes('已剪报'));
});
check('All article category frames retain original labels, dates, links, and full source counts', () => {
  for (const p of data.posts) {
    const env = boot({ url: 'https://example.test/publication/' + C.postHash(p.id) });
    const article = env.get('#article-view .article-paper');
    assert.equal(article.dataset.category, C.categoryFor(p));
    assert(article.querySelector('.post-label').textContent.includes(p.evidenceBadge || (p.kind === 'experiment' ? '原创实验方案' : p.label || '选读')));
    assert.equal(article.querySelectorAll('.source-list a').length, p.sources.length);
    assert.equal(article.querySelector('textarea').value, p.tryThis.prompt);
    assert(article.querySelector('.source-facts').textContent.includes(p.verifiedAt || data.site.verifiedAt));
  }
});
check('Project design rules document references, attribution, original choices, and verification limits', () => {
  const design = read('DESIGN.md'); const notices = read('THIRD_PARTY_NOTICES.md');
  for (const name of ['design-md/claude/DESIGN.md', 'design-md/wired/DESIGN.md', 'design-md/framer/DESIGN.md']) assert(design.includes(name));
  assert(design.includes('3b605329240ce735b510037cca322f1831fdd7f8'));
  assert(design.includes('44px') && design.includes('40em') && design.includes('not calculate real browser layout'));
  assert(notices.includes('Copyright (c) 2026 VoltAgent') && notices.includes('Permission is hereby granted, free of charge'));
  assert(!css.includes('Copernicus') && !css.includes('WiredDisplay') && !css.includes('GT Walsheim'));
});

/* Practical guide expansion: original content is immutable; new scope is explicit. */
check('Nine practical guides retain original IDs and the approved DeepSeek source correction', () => {
  const originalHashes = {"sol-quality-cost": "f53d3c7c9d9c8b8b75da105a631a8a74df7ceaf105b77adf03ffad445b882b6a", "deepseek-v41-migration": "05ea75bf12ecfaf87c4ba8bfb4a84fcdf41deeec532bbdab6ba13efc7698b376", "qwen-omni-evidence": "220ef0f3c13e3f04c6b332933a303feb528d06e1458ec410510e4b0924f9c359", "images25-edit-brief": "3baf2ae3963446ddc58573af93650d0815cfdb24ba9287d5022927e03dd73dff", "renode-replay-lab": "bbc451336852b1abd4d491dfab43c79cc5fac6719bcefeece8304947508aa261", "firmware-fuzz-harness": "52204b6f516e75ca58f3ecb7b9154fe9d30bd698d9ff29ab865f12c5ced39058", "debug-probe-mcp": "063fa655a3e4838d61f72683df248a15fe8e0c7185fc909684d4c986a7fece58", "datasheet-register-audit": "7ad32920da96b7456f3c19971fa940a7528e0338609da7bd07886c53fd7ea708", "stm32-edge-ai-budget": "819ad707afc2051fe064ce466d246159ef51d35dec3c2cd3ded40d6666908811", "firmware-agent-contract": "146a2eadf17defae9c0266ea2d82e35dd33eb6b480fc3a8a2ca32f262d4a62a9", "context-task-eval": "8c96cdbc3b373c90733bc5b218854baa24f99c9e6043ad19d2f3b76d34c86095", "espressif-mcp-workflow": "90b01873f620cb39f7e0040e56ea68e6881489c0ccc4d1b214f97ef95573e628", "playwright-mcp-boundary": "cb62e3ed8797602aa5df5717d7abb4cde1d87a57981ce342a881c6643a2dcea5", "skills-license-eval": "de1ddf6ab2990d2887a2a3324d7a2a6b90012a4f13121d7ff4759408523356d8", "embedded-regression-copilot": "3d1ff145b4ddef0c06132990ee8f6c7ac18b2243e34e89cda1b3be8b01f00211", "document-style-pipeline": "6d85313adc53f5a592474f69acdb78ce4164c63492147baa7a117f6ffc7d110a"};
  const digest = value => require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
  for (const [id, expected] of Object.entries(originalHashes)) {
    const post = data.posts.find(p => p.id === id); assert(post, id); assert.equal(digest(post), expected, id + ': original content must remain exact');
  }
  const guideIDs = ["dot-meeting-brief", "dot-bounded-follow-up", "dot-change-request", "research-conflicting-sources", "writing-two-examples", "orders-cleaning-audit", "image-edit-invariants", "video-learning-evidence", "codex-small-fix-loop"];
  assert(data.posts.length >= 25); assert(data.posts.filter(p => p.category === 'practice').length >= 12);
  for (const id of guideIDs) {
    const p = data.posts.find(post => post.id === id); assert(p, id); assert.equal(p.category, 'practice'); assert.equal(p.kind, 'guide'); assert.equal(p.date, null);
    assert(p.analysis.length >= 7, id + ': substantial worked guide'); assert(p.tryThis.prompt.length >= 200 && p.tryThis.expected.length >= 70, id + ': full worked input and expected output');
    assert(p.sources.every(source => new URL(source.url).protocol === 'https:'), id);
  }
});
check('Added guide scenes have specific titles, labels, and complete automatic explanations', () => {
  const variants = {"dot-meeting-brief": {"source": "context-task-eval", "title": "把会前材料，收成三个待决问题", "labels": ["相关更新", "事实与提议分开", "一页会前简报"], "status": ["更新较晚的建议，仍可能没有得到确认。", "人数、日期与负责人，都回到材料逐项核对。"]}, "dot-bounded-follow-up": {"source": "context-task-eval", "title": "先定检查规则，再决定何时提醒", "labels": ["指定来源", "时间与变化条件", "通知后结束"], "status": ["有变化才通知，重复记录不再提醒。", "到期或无法读取时，说明结果与最后核查时间。"]}, "dot-change-request": {"source": "document-style-pipeline", "title": "让同一条变更，落到每一份新稿", "labels": ["原稿与现有版本", "新要求及保留项", "逐稿对照验收"], "status": ["同时查新值是否出现、旧值是否残留。", "文字改完，不代表图片或其他附件也已更新。"]}, "research-conflicting-sources": {"source": "context-task-eval", "title": "每个结论，都留下采用与排除的理由", "labels": ["来源与适用范围", "逐项比较冲突", "结论及待核问题"], "status": ["新页面可能谈的是另一地点或另一类对象。", "保留真正的冲突，不用猜测补齐未知。"]}, "writing-two-examples": {"source": "document-style-pipeline", "title": "借用表达方法，把事实留给新材料", "labels": ["两份同场景样例", "结构与语气共性", "新事实的新稿"], "status": ["样例里的旧日期、旧人物，不随文风迁移。", "先查事实和承诺，再调整句子是否顺口。"]}, "orders-cleaning-audit": {"source": "document-style-pipeline", "title": "每一行有去向，小计才有解释", "labels": ["原始订单及行号", "重复与异常分流", "小计和行数对账"], "status": ["空白表示未知，不能自动改成零。", "280元只是本例已确认小计，不是完整月销售额。"]}, "image-edit-invariants": {"source": "images25-edit-brief", "title": "背景可以改，主体仍要对照原图", "labels": ["天空代表可改背景", "山体代表保留主体"], "status": ["图中以山体和天空示意分区，并非杯子编辑结果。", "对照原图检查轮廓、文字和位置，不能只看整体美观。"]}, "video-learning-evidence": {"source": "qwen-omni-evidence", "title": "让学习卡和自测题，都能回到原片", "labels": ["声音与画面材料", "换算原片时间", "学习卡与待查项"], "status": ["片段时间加上起点偏移，才是原片位置。", "文字摘录只能支持材料整理，不能冒充看过视频。"]}, "codex-small-fix-loop": {"source": "skills-license-eval", "title": "把一个小故障，变成一次可复查的修复", "labels": ["代码与失败输入", "复现 · 修改 · 重测", "差异与运行证据"], "status": ["先让测试抓住原问题，再做必要的修改。", "没有实际执行，就明确写未运行。"]}};
  const scope = { window: {} }; vm.runInNewContext(visuals, scope);
  for (const [id, spec] of Object.entries(variants)) {
    const p = data.posts.find(post => post.id === id); const output = scope.window.FieldnoteVisuals.render(p);
    assert(output.includes(spec.title), id); for (const label of spec.labels) assert(output.includes(label), id + ': current labels');
    for (const note of spec.status) assert(output.includes(note), id + ': complete explanation');
    assert(!output.includes('data-demo=') && !output.includes('<button'), id + ': explanatory diagrams are not controls');
  }
});
check('Practical category retains its twelve earlier articles and short feed previews', () => {
  const env = boot(); env.click('.mobile-categories [data-category="practice"]');
  assert.equal(visiblePosts(env).length, data.posts.filter(p => p.category === 'practice').length); assert.equal(env.get('.region-filter').hidden, true);
  for (const id of ["dot-meeting-brief", "dot-bounded-follow-up", "dot-change-request", "research-conflicting-sources", "writing-two-examples", "orders-cleaning-audit", "image-edit-invariants", "video-learning-evidence", "codex-small-fix-loop"]) {
    const p = data.posts.find(post => post.id === id); const card = env.get('#post-' + id); assert(card, id);
    assert.equal(card.querySelectorAll('.article-section,.try-this,.source-list').length, 0, id);
    env.click('#post-' + id + ' .post-title a'); assertView(env, 'article');
    assert.equal(env.get('#prompt-' + id).value, p.tryThis.prompt, id); assert(env.get('#article-view').textContent.includes(p.tryThis.expected), id);
    env.click('#article-view .article-return'); assertView(env, 'feed'); assert.equal(visiblePosts(env).length, data.posts.filter(p => p.category === 'practice').length);
  }
});

/* Daily edition: selective source verification and two new, untested workflows. */
check('Earlier edition retains its post objects with only the approved DeepSeek source correction', () => {
  const expected = {"sol-quality-cost": "f53d3c7c9d9c8b8b75da105a631a8a74df7ceaf105b77adf03ffad445b882b6a", "deepseek-v41-migration": "05ea75bf12ecfaf87c4ba8bfb4a84fcdf41deeec532bbdab6ba13efc7698b376", "qwen-omni-evidence": "220ef0f3c13e3f04c6b332933a303feb528d06e1458ec410510e4b0924f9c359", "images25-edit-brief": "3baf2ae3963446ddc58573af93650d0815cfdb24ba9287d5022927e03dd73dff", "renode-replay-lab": "bbc451336852b1abd4d491dfab43c79cc5fac6719bcefeece8304947508aa261", "firmware-fuzz-harness": "52204b6f516e75ca58f3ecb7b9154fe9d30bd698d9ff29ab865f12c5ced39058", "debug-probe-mcp": "063fa655a3e4838d61f72683df248a15fe8e0c7185fc909684d4c986a7fece58", "datasheet-register-audit": "7ad32920da96b7456f3c19971fa940a7528e0338609da7bd07886c53fd7ea708", "stm32-edge-ai-budget": "819ad707afc2051fe064ce466d246159ef51d35dec3c2cd3ded40d6666908811", "firmware-agent-contract": "146a2eadf17defae9c0266ea2d82e35dd33eb6b480fc3a8a2ca32f262d4a62a9", "context-task-eval": "8c96cdbc3b373c90733bc5b218854baa24f99c9e6043ad19d2f3b76d34c86095", "espressif-mcp-workflow": "90b01873f620cb39f7e0040e56ea68e6881489c0ccc4d1b214f97ef95573e628", "playwright-mcp-boundary": "cb62e3ed8797602aa5df5717d7abb4cde1d87a57981ce342a881c6643a2dcea5", "skills-license-eval": "de1ddf6ab2990d2887a2a3324d7a2a6b90012a4f13121d7ff4759408523356d8", "embedded-regression-copilot": "3d1ff145b4ddef0c06132990ee8f6c7ac18b2243e34e89cda1b3be8b01f00211", "document-style-pipeline": "6d85313adc53f5a592474f69acdb78ce4164c63492147baa7a117f6ffc7d110a", "dot-meeting-brief": "1e1e08ae0719a820459a68a4a0ef0356e3dd37570b4b2cf224041cf7a5f533b2", "dot-bounded-follow-up": "76111ec1587cae86e39d500343d2945d973f5b958dd0586347950ed163a42478", "dot-change-request": "73bdc58095365cb1c20fb099a3a0a8f2dc84bd45988efbc55cd4fc8735d6fbd1", "research-conflicting-sources": "7f426c4e27e151214b91384b022eaa1e8063019ca554fc1c53e1a2a0fd8c8923", "writing-two-examples": "08492c0f960d7d9c49a7fdabb6eec727741e85032cc143497b317ec43cd0d522", "orders-cleaning-audit": "f043208c83891bb78919dd894df9af97f87ec06b1d528a020134cdaa80631828", "image-edit-invariants": "db530d20a56191678834b869b084f8d5237047b21363e8408f81bedf6d1df94b", "video-learning-evidence": "d0cd75374d542553b4bd74f3bbc76dd7d44bd30435a0b0cff3fe20f2838d0963", "codex-small-fix-loop": "d1182d94cd77032b8a7c49962a91661e5928f09dac1410ba622d20449681c7e8"};
  const digest = value => require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
  for (const [id, hash] of Object.entries(expected)) {
    const p = data.posts.find(post => post.id === id); assert(p, id); assert.equal(digest(p), hash, id);
  }
  assert.equal(data.posts.length, 48);
  assert.deepEqual(['industry', 'practice', 'embedded'].map(category => data.posts.filter(p => C.categoryFor(p) === category).length), [17, 15, 16]);
});
check('Selective updates retain honest per-article source verification dates', () => {
  assert.equal(data.site.verifiedAt, '2026-10-17');
  assert(data.site.editorialNote.includes('各篇保留实际资料核验日'));
  const env = boot(); assert.equal(env.get('#edition-date').textContent, '最近核验 2026.10.17');
  const current = new Set(["minicpm-local-image-check", "sensor-unknown-state-gmm", "deepseek-v41-migration", "opus55-fast-access", "gptlive11-voice-corrections", "gemini4-argon-long-work", "runway-kling-api-workflow", "glm-legal-evidence-chain", "qwen-image21-api-alpha", "gpt6-intelligent-ui", "haiku55-subagent-budget", "nano-banana21-continuity", "embeddinggemma2-local-retrieval", "mistral-large4-preview", "mplab-agent-telemetry-pacing", "memfault-crash-evidence-chain", "assertllm2-rtl-property-review", "firment-waveform-evidence", "cantools-ai-wire-contract"]);
  for (const p of data.posts) {
    assert.equal(p.verifiedAt, october17Ids.includes(p.id) ? '2026-10-17' : current.has(p.id) ? '2026-10-16' : '2026-10-15', p.id);
    assert.equal(p.verified_date, p.verifiedAt, p.id);
    if (['minicpm-local-image-check', 'sensor-unknown-state-gmm'].includes(p.id)) assert.equal(p.date, null);
  }
  assert(env.get('#editorial-note').textContent.includes('各篇保留实际核验日'));
});
check('New complete articles retain model-tag, evidence, resource, and rejection boundaries', () => {
  const mini = data.posts.find(p => p.id === 'minicpm-local-image-check');
  const gmm = data.posts.find(p => p.id === 'sensor-unknown-state-gmm');
  for (const p of [mini, gmm]) {
    assert(p.analysis.length >= 8 && p.analysis.map(x => x.text).join('').length >= 1400, p.id);
    assert(p.tryThis.prompt.length >= 300 && p.tryThis.expected.length >= 120, p.id);
    assert(p.evidence.includes('未') && p.caveat.includes('没有') || p.caveat.includes('未生成'), p.id);
    assert(p.sources.length >= 5 && p.sources.every(x => x.url.startsWith('https://')), p.id);
  }
  const m = JSON.stringify(mini), g = JSON.stringify(gmm);
  for (const value of [':1b', 'Q4_K_M', '1.8GB', '22GB', '模型包大小', 'Apache-2.0', '无法确定', '深色遮挡块']) assert(m.includes(value), value);
  for (const value of ['NaN/Inf', '非有限分数', '正常停机', '负对数似然', '最终测试', 'C99', '1,024 字节', 'BSD 3-Clause', '未上板']) assert(g.includes(value), value);
  assert.equal(3 * 12.50, 37.5);
  const windows = Math.floor((30 * 1024 - 256) / 128) + 1;
  assert.equal(windows, 239); assert.equal(windows * 8, 1912); assert.equal(windows * 4, 956);
});
check('New teaching scenes are original, article-specific, automatic, and non-interactive', () => {
  const env = boot();
  for (const [id, title, key] of [
    ['minicpm-local-image-check', '让图片里的空白，在答案里仍然空着', '未提供'],
    ['sensor-unknown-state-gmm', '给不熟悉的输入，留一个未知出口', '未知 · 待查']
  ]) {
    const scene = env.get('#visual-' + id);
    assert(scene.textContent.includes(title) && scene.textContent.includes(key), id);
    assert.equal(scene.querySelectorAll('button').length, 0);
    assert.equal(scene.querySelectorAll('.fv-note-transcript li').length, 2);
    assert(scene.querySelector('.fv-note-window'));
    env.click(scene); assertView(env, 'feed');
  }
  env.reduce(true); assert(env.document.body.classList.contains('motion-paused'));
});
check('New articles support filtered reading, prompt copy, bookmarks, and return navigation', async () => {
  for (const id of ['minicpm-local-image-check', 'sensor-unknown-state-gmm']) {
    const p = data.posts.find(x => x.id === id), env = boot();
    env.click('.mobile-categories [data-category="' + p.category + '"]');
    env.input(p.title); assert.deepEqual(visiblePosts(env), [id]); assert(env.get('.region-filter').hidden);
    env.click('#post-' + id + ' .post-title a'); assertView(env, 'article');
    assert.equal(env.get('#prompt-' + id).value, p.tryThis.prompt);
    env.click('#article-view [data-copy-prompt]'); await env.settle(); assert.equal(env.clipboard.at(-1), p.tryThis.prompt);
    env.click('#article-view [data-save]'); assert(env.storage.get(storageKey).includes(id));
    env.back(); assertView(env, 'feed'); assert.deepEqual(visiblePosts(env), [id]);
    env.forward(); assertView(env, 'article'); assert(env.get('#article-title').textContent.includes(p.title));
  }
});


/* October breadth release: strict addition, correction, provenance and scene contracts. */
const octoberIndustryIds = ["opus55-fast-access","gptlive11-voice-corrections","gemini4-argon-long-work","runway-kling-api-workflow","glm-legal-evidence-chain","qwen-image21-api-alpha","gpt6-intelligent-ui","haiku55-subagent-budget","nano-banana21-continuity","embeddinggemma2-local-retrieval","mistral-large4-preview"];
const octoberEmbeddedIds = ["mplab-agent-telemetry-pacing","memfault-crash-evidence-chain","assertllm2-rtl-property-review","firment-waveform-evidence","cantools-ai-wire-contract"];
const octoberIds = [...octoberIndustryIds, ...octoberEmbeddedIds];
const sha256 = value => require('node:crypto').createHash('sha256').update(value).digest('hex');
check('October coverage adds exactly eleven industry and five distinct embedded workflows', () => {
  assert.equal(data.posts.length, 48);
  assert.deepEqual(['industry', 'practice', 'embedded'].map(c => data.posts.filter(p => C.categoryFor(p) === c).length), [17,15,16]);
  assert.equal(new Set(octoberIds).size, 16);
  for (const id of octoberIndustryIds) {
    const p=data.posts.find(p=>p.id===id); assert(p,id); assert.equal(p.category,'industry');
    assert(p.date >= '2026-10-01' && p.date <= '2026-10-16',id); assert(p.dateLabel,id);
  }
  for (const id of octoberEmbeddedIds) {
    const p=data.posts.find(p=>p.id===id); assert(p,id); assert.equal(p.category,'embedded');
    assert.equal(p.date,null,id); assert(p.dateLabel,id);
  }
  assert.equal(octoberIndustryIds.filter(id=>data.posts.find(p=>p.id===id).region==='china').length,2);
});
check('All earlier articles have exact approved hashes, with one bounded factual correction', () => {
  const expected={"minicpm-local-image-check":"fd0add86b8ae410daf0349b44d383d17df575eb0d1d69ab111d26fe04a5714b7","sensor-unknown-state-gmm":"3b4eac0dd79fb5970aed643285a55a7bfe0cf27c58567093353906e8bd4e8d3f","sol-quality-cost":"f53d3c7c9d9c8b8b75da105a631a8a74df7ceaf105b77adf03ffad445b882b6a","deepseek-v41-migration":"05ea75bf12ecfaf87c4ba8bfb4a84fcdf41deeec532bbdab6ba13efc7698b376","qwen-omni-evidence":"220ef0f3c13e3f04c6b332933a303feb528d06e1458ec410510e4b0924f9c359","images25-edit-brief":"3baf2ae3963446ddc58573af93650d0815cfdb24ba9287d5022927e03dd73dff","renode-replay-lab":"bbc451336852b1abd4d491dfab43c79cc5fac6719bcefeece8304947508aa261","firmware-fuzz-harness":"52204b6f516e75ca58f3ecb7b9154fe9d30bd698d9ff29ab865f12c5ced39058","debug-probe-mcp":"063fa655a3e4838d61f72683df248a15fe8e0c7185fc909684d4c986a7fece58","datasheet-register-audit":"7ad32920da96b7456f3c19971fa940a7528e0338609da7bd07886c53fd7ea708","stm32-edge-ai-budget":"819ad707afc2051fe064ce466d246159ef51d35dec3c2cd3ded40d6666908811","firmware-agent-contract":"146a2eadf17defae9c0266ea2d82e35dd33eb6b480fc3a8a2ca32f262d4a62a9","context-task-eval":"8c96cdbc3b373c90733bc5b218854baa24f99c9e6043ad19d2f3b76d34c86095","espressif-mcp-workflow":"90b01873f620cb39f7e0040e56ea68e6881489c0ccc4d1b214f97ef95573e628","playwright-mcp-boundary":"cb62e3ed8797602aa5df5717d7abb4cde1d87a57981ce342a881c6643a2dcea5","skills-license-eval":"de1ddf6ab2990d2887a2a3324d7a2a6b90012a4f13121d7ff4759408523356d8","embedded-regression-copilot":"3d1ff145b4ddef0c06132990ee8f6c7ac18b2243e34e89cda1b3be8b01f00211","document-style-pipeline":"6d85313adc53f5a592474f69acdb78ce4164c63492147baa7a117f6ffc7d110a","dot-meeting-brief":"1e1e08ae0719a820459a68a4a0ef0356e3dd37570b4b2cf224041cf7a5f533b2","dot-bounded-follow-up":"76111ec1587cae86e39d500343d2945d973f5b958dd0586347950ed163a42478","dot-change-request":"73bdc58095365cb1c20fb099a3a0a8f2dc84bd45988efbc55cd4fc8735d6fbd1","research-conflicting-sources":"7f426c4e27e151214b91384b022eaa1e8063019ca554fc1c53e1a2a0fd8c8923","writing-two-examples":"08492c0f960d7d9c49a7fdabb6eec727741e85032cc143497b317ec43cd0d522","orders-cleaning-audit":"f043208c83891bb78919dd894df9af97f87ec06b1d528a020134cdaa80631828","image-edit-invariants":"db530d20a56191678834b869b084f8d5237047b21363e8408f81bedf6d1df94b","video-learning-evidence":"d0cd75374d542553b4bd74f3bbc76dd7d44bd30435a0b0cff3fe20f2838d0963","codex-small-fix-loop":"d1182d94cd77032b8a7c49962a91661e5928f09dac1410ba622d20449681c7e8"};
  for(const [id,hash] of Object.entries(expected)) assert.equal(sha256(JSON.stringify(data.posts.find(p=>p.id===id))),hash,id);
  const p=data.posts.find(p=>p.id==='deepseek-v41-migration');
  assert.equal(p.date,'2026-09-10'); assert.equal(p.verifiedAt,'2026-10-16');
  assert(p.summary[1].includes('本刊旧版曾记录') && p.summary[1].includes('继续提供 V4 Pro'));
  assert(p.summary[1].includes('没有单列补注日期'));
  assert(p.sources.some(s=>s.url==='https://api-docs.deepseek.com/updates/'));
  assert(!p.caveat.includes('尚未解决')); assert(!p.maturity.includes('待核实'));
});
check('New articles are full independent guides with usable tasks, caveats and primary sources', () => {
  for(const id of octoberIds) {
    const p=data.posts.find(p=>p.id===id);
    const body=[...p.summary,...p.analysis.map(x=>x.text)].join('');
    assert(body.length>=1100,id+': independent depth'); assert(p.analysis.length>=7,id);
    assert(p.tryThis.prompt.length>=150 && p.tryThis.expected.length>=80,id+': complete task');
    assert(p.sources.length>=3,id+': multiple source roles'); assert(p.evidence.includes('未'),id);
    assert(p.caveat.length>=80,id); assert.equal(p.verifiedAt,'2026-10-16');
    assert(!p.date || p.date<='2026-10-16',id); assert(p.sources.every(x=>/^https:\/\//.test(x.url)),id);
    assert(!JSON.stringify(p).includes('sandbox:/') && !JSON.stringify(p).includes('/workspace/'),id);
  }
});
check('News chronology distinguishes launches, access updates, preview and unshipped weights', () => {
  const text=id=>JSON.stringify(data.posts.find(p=>p.id===id));
  const rules={
    'opus55-fast-access':['9 月 22','10 月 15','Azure','Fast'],
    'gemini4-argon-long-work':['9 月 30','10 月 13'],
    'qwen-image21-api-alpha':['9月20','10月2','10月9','Qwen Research License'],
    'mistral-large4-preview':['10月6','月底','公开预览'],
    'runway-kling-api-workflow':['Sora','2026','Seedance','Kling'],
    'glm-legal-evidence-chain':['邀测','不提供法律意见']
  };
  for(const [id,terms] of Object.entries(rules)) for(const term of terms) assert(text(id).replace(/\s+/g,'').includes(term.replace(/\s+/g,'')),id+': '+term);
  assert(data.posts.find(p=>p.id==='runway-kling-api-workflow').sources.some(s=>s.url.includes('sora-discontinuation')));
});
check('Embedded articles distinguish real AI implementations, research and one original combination', () => {
  const text=id=>JSON.stringify(data.posts.find(p=>p.id===id));
  for(const id of octoberEmbeddedIds) {
    const p=data.posts.find(p=>p.id===id); assert(p.license && p.maturity,id); assert(p.caveat.includes('未') || p.caveat.includes('没有'),id);
  }
  for(const term of ['商业','JasperGold','LICENSE','只读']) assert(text('assertllm2-rtl-property-review').includes(term),term);
  for(const term of ['rc2','MIT','sigrok','置信']) assert(text('firment-waveform-evidence').includes(term),term);
  assert(text('cantools-ai-wire-contract').includes('原创'));
  assert(text('memfault-crash-evidence-chain').includes('只读'));
  assert(text('mplab-agent-telemetry-pacing').includes('官方'));
});
check('Existing renderers, behavior, typography and motion assets remain byte-for-byte unchanged', () => {
  const files={"style.css":"5e159c776246dcd48bf52117e649feb7250bbffb9f49a707bbb2d9b3cf3c5c8b","visuals.css":"7cf30aa521f1fe9e7589608376199737cb797efc3ab2a63799c97d7ac0d4d00d","app.js":"3f11837199a84b29e606682c4b88a17632fea212e8cabad2eab2570564305157","site-core.js":"b4f96a7f0557c322c3c2e42cfcf14d1545585d06420cfc1147c03bc5b7b33589","favicon.svg":"b33e38910db7f167eb595800e4fa779577885204e090115732215704f1be1db5","DESIGN.md":"23cb37aa5f8c5df788d9587f03e8e2b01a2b955f5d26b4862e7f1dc5439e5a96","THIRD_PARTY_NOTICES.md":"e10fafb73c4164f3cc2f5350a0ec70c500ab6417cc935a9140b69e49b74daf60"}; for(const [file,hash] of Object.entries(files)) assert.equal(sha256(read(file)),hash,file);
  const expected={"minicpm-local-image-check":"fa17a45f81ee28c814e29c26d199cc8755d082856373289c73671e071875cb12","sensor-unknown-state-gmm":"2a249413d4e9ab7d75f558b93234c16ebe2e78505a5eeadd992094aa3eed7c3a","sol-quality-cost":"21ac08e4a30889f92d381fa976e7f9eb05a33efa05c444f3afaed743c986649e","deepseek-v41-migration":"c552e257157ccebf462c5d2de48023234cebcf5f38861ca937e78dcdfdf2e790","qwen-omni-evidence":"253ecdbfa2c0dea216716d0be36a7381b1f70652f31638785a4178ed713f3ee0","images25-edit-brief":"ba77c9ee45199dfcaf0bca9cd9f31438ee82d06766a092731add3035bec0b9c2","renode-replay-lab":"02529004caba1c922ab3d690b3aad588fab1ca33eae0daef85b89c3f56511a99","firmware-fuzz-harness":"089f5a9ebdf188ab3e4575eab1f5c756732aadb3177952f01431567c8fd7f4d3","debug-probe-mcp":"ca23b159b62c8fdf7ab35ebec262ffe31fe11b3dd941e631cb2dd1de06ab432f","datasheet-register-audit":"ac50c025ad093bba38ff389df2334f5f29e01fc87ad0ee97aebf1d427ecf5701","stm32-edge-ai-budget":"3463da3b40663b7296560028a5b8af5e3efcd084d6ebe3cc47f397b89327896f","firmware-agent-contract":"cf9dbbe92d84749fb634e26345b8b5e72c7a5ca1dcefb74e320a94dd18b3029f","context-task-eval":"4cf4541762a4b088e7f4011943066ecf25c12ab4115ffb51c12e582f06cf30f9","espressif-mcp-workflow":"63fa25ccd1534820f5899d41ca7a0116fc39e57b7d519f5dde0ba1d07dc68a96","playwright-mcp-boundary":"d13701f012853926a1c127ccd36325b94083ade013acf0ac06971e8b95d6a6ed","skills-license-eval":"de41448284606b587eb01f3f52467148abfe329eb4afb64f7095d6de51652553","embedded-regression-copilot":"0d8d2283b73273ccc9a7d3796502bcc1829e51c11901f43981694c80d21ac2ea","document-style-pipeline":"6e4abe39ece7436424ab728a07da99038cb267dd0f0c08c91806354f13c07b75","dot-meeting-brief":"4a18fe99ee18228ac2ea8dd08c7d06816bbc7dd475642a09df71b664289f3e34","dot-bounded-follow-up":"84e7fc7f83600649ed9d672287d8dfd0cc33ffdecae66cd7a7e5a0340e789eb3","dot-change-request":"2d78da6f25d6ea5d47d3067a5d597d8e304b41602a0321d27c90e9d2daf8cc73","research-conflicting-sources":"f2ddf755914405abf96632ad8b54e6353f492322f3d36384bade89dbabb505e2","writing-two-examples":"fda4d9625c4a38559a612483510673de3a65cb0f28478f943f5f3e8bb8addd10","orders-cleaning-audit":"eac249de66543c18ca22b17f9a961174a336d9db5bed9a69d4498fbf2c61cef6","image-edit-invariants":"8fbc5aaee484a75ba7f90badfee66feefcb16c4eea375ed91be3cb8c9ec69b02","video-learning-evidence":"fe6f5a20880ffcc649a26c4ec6cf8a01bef309ce178247c6757ddb7c44a986d0","codex-small-fix-loop":"97e754ab244ea90773db163c6b8959f96f555cd1ba2234d015455d6cdb27f670"};
  for(const [id,hash] of Object.entries(expected)) {
    const scope={window:{}}; vm.runInNewContext(visuals,scope);
    assert.equal(sha256(scope.window.FieldnoteVisuals.render(data.posts.find(p=>p.id===id))),hash,id);
  }
});
check('Every new scene has its own accurate title, labels and two complete automatic notes', () => {
  const specs={"gpt6-intelligent-ui":{"art":"interface","title":"回答成为小工具，事实仍要能核对","labels":["具体问题与约束","回答中的临时界面","结果回到原始事实"],"status":["临时界面帮助探索，不等于已经执行外部事务。","同一组输入应得到可复核的计算与解释。"]},"haiku55-subagent-budget":{"source":"sol-quality-cost","title":"把子任务的用量，算进整次交付","labels":["子任务验收","上下文与推理配置","费用与返工"],"status":["每 token 单价下降，不等于每件工作同比省钱。","主代理和子代理都要计费，失败重试也入账。"]},"gemini4-argon-long-work":{"source":"context-task-eval","title":"长任务的每个结论，都保留回查路径","labels":["版本与原始材料","逐项核对任务","证据与待补项"],"status":["九月宣布与十月正式开放，是不同的事件。","修复声明不是复测记录；长上下文不能替代证据。"]},"nano-banana21-continuity":{"art":"continuity","title":"逐轮换场景，保留同一个主体","labels":["固定主体参考","每轮只改一件事","身份与细节对照"],"status":["图为连续编辑的教学示意，不是模型生成样张。","一次只改一个要素；发现主体漂移就退回已通过版本。"]},"embeddinggemma2-local-retrieval":{"art":"retrieval","title":"让不同材料，进入同一张检索地图","labels":["文字 · 图像 · 声音","共享表示空间","排序后回查原件"],"status":["向量接近用于寻找候选，不等于答案已经正确。","按需加载编码器；本地索引也要核对资源与数据范围。"]},"runway-kling-api-workflow":{"art":"video","title":"先选镜头，再选入口与生成档位","labels":["镜头和参考资料","草稿与成片分阶段","时长 · 声音 · 费用"],"status":["十月更新是平台入口变化，不能改写成底层模型首发。","草稿增强与音频可能另计费；先核对所选模型的支持项。"]},"glm-legal-evidence-chain":{"source":"context-task-eval","title":"先交事实卡，再讨论专业结论","labels":["有编号的原始材料","事实与推断分开","引用与未知项"],"status":["邀测与正式开放不同；本文只演示信息整理。","计划完成不等于已经完成，缺失附件不能靠模型补出。"]},"qwen-image21-api-alpha":{"art":"alpha","title":"透明风车，要经得起三种底色检查","labels":["自造纸风车","真实 Alpha 通道","三色合成验收"],"status":["棋盘格只是透明预览的惯例，画出棋盘格不算透明。","十月为托管 API 上新；权重发布日和许可另行区分。"]},"mistral-large4-preview":{"art":"preview","title":"API 预览与权重交付，分成两步判断","labels":["十月六日 API 预览","同材料持续验收","权重仍为未来计划"],"status":["公开预览允许行为更新，固定验收样本仍需重跑。","截至十月十六日，不能把月底权重计划写成已可下载。"]},"mplab-agent-telemetry-pacing":{"art":"telemetry","title":"读取与发布分开，数据流才有节奏","labels":["ADC 与 I2C 输入","定时发布与缓冲","遥测协议验收"],"status":["厂商已展示 AI 工作流，本刊未上板验证时序。","读取频率、输出频率与串口容量要分别核算。"]},"memfault-crash-evidence-chain":{"art":"trace","title":"从一次现场崩溃，走到可验证的假设","labels":["指定现场 trace","版本与源码对应","事实 · 假设 · 验证"],"status":["同一设备可产生多条 trace，不能把两种计数混用。","只读权限仍会涉及数据传输，先确认项目与模型授权。"]},"assertllm2-rtl-property-review":{"art":"assertion","title":"一条断言，既要能证明，也要能检错","labels":["规格与候选属性","前提可达性与证明","变异缺陷对照"],"status":["触发条件从未发生，属性也可能真空通过。","完整运行需要商业 JasperGold；只读学习不等于复现。"]},"firment-waveform-evidence":{"art":"waveform","title":"引脚真正输出什么，要看原始捕获","labels":["安全引脚与接线","逻辑分析仪捕获","频率与占空比检查"],"status":["方波是目标机制示意，本刊未生成任何硬件测量。","低置信度不能判为通过，固件日志不能替代电平证据。"]},"cantools-ai-wire-contract":{"art":"canframe","title":"字节由合同确定，AI 负责组织核对","labels":["DBC 字段与单位","独立黄金字节","Python 与 C 对照"],"status":["这是一条原创 AI 教学组合，不是 cantools 自带的 AI 功能。","先做离线编解码；不向车辆或在线总线发送测试帧。"]},"opus55-fast-access":{"art":"latency","title":"更快的输出，仍需单独计算费用","labels":["同一任务与模型","推理速度档","等待与费用分开记"],"status":["Opus 5.5 Fast 正式开放，是服务档位变化，不是新模型首发。","输出速度不等于整项任务速度，工具等待和重试仍需计入。"]},"gptlive11-voice-corrections":{"art":"voice","title":"语音更顺畅，也要听清最后一次更正","labels":["说话与打断","主模型与轻量分层","关键事实回读核对"],"status":["新声音与口音是体验更新，不代表可以自动替人承诺。","数字和否定句回读确认；全双工不是此次首次出现。"]}}; const env=boot();
  for(const id of octoberIds) {
    const node=env.get('#visual-'+id), spec=specs[id]; assert(node,id);
    assert(node.textContent.includes(spec.title),id);
    for(const label of spec.labels) assert(node.querySelector('.fv-labels').textContent.includes(label),id);
    assert.deepEqual(node.querySelectorAll('.fv-note-transcript li').map(x=>x.textContent),spec.status,id);
    assert.equal(node.querySelectorAll('button,[data-demo],[aria-live]').length,0,id);
    env.click(node); assertView(env,'feed');
  }
});
check('All sixteen additions keep category/region search, prompt copy, bookmarks and Back/Forward', async () => {
  for(const id of octoberIds) {
    const p=data.posts.find(p=>p.id===id), env=boot();
    env.click('.mobile-categories [data-category="'+p.category+'"]');
    if(p.category==='industry') env.click('[data-region="'+p.region+'"]');
    env.input(p.title); assert.deepEqual(visiblePosts(env),[id],id);
    assert.equal(env.get('.region-filter').hidden,p.category!=='industry',id);
    env.click('#post-'+id+' .post-title a'); assertView(env,'article');
    env.click('#article-view [data-copy-prompt]'); await env.settle(); assert.equal(env.clipboard.at(-1),p.tryThis.prompt,id);
    env.click('#article-view [data-save]'); assert(env.storage.get(storageKey).includes(id),id);
    env.back(); assertView(env,'feed'); assert.deepEqual(visiblePosts(env),[id],id);
    env.forward(); assertView(env,'article'); assert.equal(env.get('#article-title').textContent,p.title,id);
  }
});


/* October 17: append-only editorial and semantic-scene contracts. */
const october17Ids = ["prompt-to-voice-reusable-brief", "kling4-long-take-control", "decision-switching-threshold", "learning-short-answer-hint-retest", "firmware-memory-delta-audit"];
const october17Baseline = {"posts":{"opus55-fast-access":"5d343d3fb4f55de41b1ad13e273f1eef4f6b4f5a2d8579101d124bce430d8000","gptlive11-voice-corrections":"bc3b9993d381c6ca67bd1e601d7bf4d4a1c95d4cace11f03b4097f67fbbb21db","gemini4-argon-long-work":"121484ce1ee9148c2f7be640371a62f9cfba446c9cdb89ca8cab5446e873ecb0","runway-kling-api-workflow":"52b0018ad273e00a3f6af7862bdaa9f18207c16087737e1a83beb0199645990f","glm-legal-evidence-chain":"9da204d02ab84f8eb48a10f2af265f48759150c5844ef9e34be111d0234d8f4c","qwen-image21-api-alpha":"1e81ecb9ec1498e575ba292c96ade9342fcbc1fd892a0e23d88c62c5e854847d","gpt6-intelligent-ui":"5c9657cf1aaa75195a7c6ca9a419ed9f5c946dae43fd2e929f7cb219def47d11","haiku55-subagent-budget":"40589281778639c45c81447e065e3830efcbe09fe52cd9a3e2604707e5257c35","nano-banana21-continuity":"ab6cb4de6fb4fab6eb5b81028cdd2857bd5971e610074302afc9ee2b27cd618e","embeddinggemma2-local-retrieval":"5cd94802e402edfab230b73e19ee6b0dffeb3eb26d778cd37f907ede67e3c301","mistral-large4-preview":"74d300fc34b328dc749a34aec19c0ac87e0ec4220688eca5a0b702298f05a44f","mplab-agent-telemetry-pacing":"f23ee6f7a452db4833c4f3f58ff69b49aa8811cf8e2f134e288acbe7514631a4","memfault-crash-evidence-chain":"19b9006fd5e592f9efd3fd0332950afcf45a8195884f062d42fdd52c0ff9e69f","assertllm2-rtl-property-review":"b6d87a487535fb842ad4908bcd1bc08b35004d4c2c8a8f199d5da40a1cd59a39","firment-waveform-evidence":"affb6bfa3bdb4778904f9133b4a3a4fab2fb4190b29b0c15bde31b05095800f1","cantools-ai-wire-contract":"e2d91e4db45b36d183823818262761687888da7b3e9b52dd6b34e2aebcf88135","minicpm-local-image-check":"fd0add86b8ae410daf0349b44d383d17df575eb0d1d69ab111d26fe04a5714b7","sensor-unknown-state-gmm":"3b4eac0dd79fb5970aed643285a55a7bfe0cf27c58567093353906e8bd4e8d3f","sol-quality-cost":"f53d3c7c9d9c8b8b75da105a631a8a74df7ceaf105b77adf03ffad445b882b6a","deepseek-v41-migration":"05ea75bf12ecfaf87c4ba8bfb4a84fcdf41deeec532bbdab6ba13efc7698b376","qwen-omni-evidence":"220ef0f3c13e3f04c6b332933a303feb528d06e1458ec410510e4b0924f9c359","images25-edit-brief":"3baf2ae3963446ddc58573af93650d0815cfdb24ba9287d5022927e03dd73dff","renode-replay-lab":"bbc451336852b1abd4d491dfab43c79cc5fac6719bcefeece8304947508aa261","firmware-fuzz-harness":"52204b6f516e75ca58f3ecb7b9154fe9d30bd698d9ff29ab865f12c5ced39058","debug-probe-mcp":"063fa655a3e4838d61f72683df248a15fe8e0c7185fc909684d4c986a7fece58","datasheet-register-audit":"7ad32920da96b7456f3c19971fa940a7528e0338609da7bd07886c53fd7ea708","stm32-edge-ai-budget":"819ad707afc2051fe064ce466d246159ef51d35dec3c2cd3ded40d6666908811","firmware-agent-contract":"146a2eadf17defae9c0266ea2d82e35dd33eb6b480fc3a8a2ca32f262d4a62a9","context-task-eval":"8c96cdbc3b373c90733bc5b218854baa24f99c9e6043ad19d2f3b76d34c86095","espressif-mcp-workflow":"90b01873f620cb39f7e0040e56ea68e6881489c0ccc4d1b214f97ef95573e628","playwright-mcp-boundary":"cb62e3ed8797602aa5df5717d7abb4cde1d87a57981ce342a881c6643a2dcea5","skills-license-eval":"de1ddf6ab2990d2887a2a3324d7a2a6b90012a4f13121d7ff4759408523356d8","embedded-regression-copilot":"3d1ff145b4ddef0c06132990ee8f6c7ac18b2243e34e89cda1b3be8b01f00211","document-style-pipeline":"6d85313adc53f5a592474f69acdb78ce4164c63492147baa7a117f6ffc7d110a","dot-meeting-brief":"1e1e08ae0719a820459a68a4a0ef0356e3dd37570b4b2cf224041cf7a5f533b2","dot-bounded-follow-up":"76111ec1587cae86e39d500343d2945d973f5b958dd0586347950ed163a42478","dot-change-request":"73bdc58095365cb1c20fb099a3a0a8f2dc84bd45988efbc55cd4fc8735d6fbd1","research-conflicting-sources":"7f426c4e27e151214b91384b022eaa1e8063019ca554fc1c53e1a2a0fd8c8923","writing-two-examples":"08492c0f960d7d9c49a7fdabb6eec727741e85032cc143497b317ec43cd0d522","orders-cleaning-audit":"f043208c83891bb78919dd894df9af97f87ec06b1d528a020134cdaa80631828","image-edit-invariants":"db530d20a56191678834b869b084f8d5237047b21363e8408f81bedf6d1df94b","video-learning-evidence":"d0cd75374d542553b4bd74f3bbc76dd7d44bd30435a0b0cff3fe20f2838d0963","codex-small-fix-loop":"d1182d94cd77032b8a7c49962a91661e5928f09dac1410ba622d20449681c7e8"},"scenes":{"opus55-fast-access":"4adf26b679bcc54f022f95b4fe8ce05a12ad5659b40150003386a205242dc3a2","gptlive11-voice-corrections":"90a546fb4fc93f4e703e55a6319ba8742ff3920fa5bbbc36b8dcfd6684577dc6","gemini4-argon-long-work":"3f5357476daa50f9dae14e6dffa4e358b25f492b88db72b88bb4fcbd2ab18bf1","runway-kling-api-workflow":"ec96e7d3ed9c9eb159b9b2756791c6906707497d216110310da7a543b7cc2054","glm-legal-evidence-chain":"0847157a51d87c38680a1883fcded1cb186acd2f5cfdf4b99964dceeab23ef16","qwen-image21-api-alpha":"8ecb0f5e3e13e7ee8d5ae178f53b558f52004cf253f5bbc77e0a6cd994453791","gpt6-intelligent-ui":"b25e050a79bcc2a4a89b2a2980645ae06d74d03b586fdc4e4b0b0f36b89af766","haiku55-subagent-budget":"13cf6a2089f016c3ce1f0114f0ddb57d76077047f1df51fb3a323bec3704efc4","nano-banana21-continuity":"7360b9df5dbc06c7de72f27cdb2bb978ebe64c9f6d5d1cf7c640c081cadb5d93","embeddinggemma2-local-retrieval":"1c15811ae86029d28cf952201672d302e49313d5685b4d1bf3264442b075cb7e","mistral-large4-preview":"eef9211bdf2841306f03d4255f5536529d2712a0b87fdc349f7345a33b249e96","mplab-agent-telemetry-pacing":"98f7942e28b93b416bd5fb1a01189da287770e79f19b19b9ffe7811f7f4aeea9","memfault-crash-evidence-chain":"589792d5a3a877b4dd874d149996ce639c571c340ddcc31e71645e2d42b222c9","assertllm2-rtl-property-review":"e91f5ee4397da1789fa5343cb2adbc92c0daadd38df6cf6edf7a2ac1a7ed0a9d","firment-waveform-evidence":"47e4d63c6cc4715350747ebc0d96ddaeeccd22c10ddef67298d50328b8a3cd41","cantools-ai-wire-contract":"be2a8be95077dfc14460ce8d63348efb55fbe8b1689cc51e6e3252596cfa31fc","minicpm-local-image-check":"fa17a45f81ee28c814e29c26d199cc8755d082856373289c73671e071875cb12","sensor-unknown-state-gmm":"2a249413d4e9ab7d75f558b93234c16ebe2e78505a5eeadd992094aa3eed7c3a","sol-quality-cost":"21ac08e4a30889f92d381fa976e7f9eb05a33efa05c444f3afaed743c986649e","deepseek-v41-migration":"c552e257157ccebf462c5d2de48023234cebcf5f38861ca937e78dcdfdf2e790","qwen-omni-evidence":"253ecdbfa2c0dea216716d0be36a7381b1f70652f31638785a4178ed713f3ee0","images25-edit-brief":"ba77c9ee45199dfcaf0bca9cd9f31438ee82d06766a092731add3035bec0b9c2","renode-replay-lab":"02529004caba1c922ab3d690b3aad588fab1ca33eae0daef85b89c3f56511a99","firmware-fuzz-harness":"089f5a9ebdf188ab3e4575eab1f5c756732aadb3177952f01431567c8fd7f4d3","debug-probe-mcp":"ca23b159b62c8fdf7ab35ebec262ffe31fe11b3dd941e631cb2dd1de06ab432f","datasheet-register-audit":"ac50c025ad093bba38ff389df2334f5f29e01fc87ad0ee97aebf1d427ecf5701","stm32-edge-ai-budget":"3463da3b40663b7296560028a5b8af5e3efcd084d6ebe3cc47f397b89327896f","firmware-agent-contract":"cf9dbbe92d84749fb634e26345b8b5e72c7a5ca1dcefb74e320a94dd18b3029f","context-task-eval":"4cf4541762a4b088e7f4011943066ecf25c12ab4115ffb51c12e582f06cf30f9","espressif-mcp-workflow":"63fa25ccd1534820f5899d41ca7a0116fc39e57b7d519f5dde0ba1d07dc68a96","playwright-mcp-boundary":"d13701f012853926a1c127ccd36325b94083ade013acf0ac06971e8b95d6a6ed","skills-license-eval":"de41448284606b587eb01f3f52467148abfe329eb4afb64f7095d6de51652553","embedded-regression-copilot":"0d8d2283b73273ccc9a7d3796502bcc1829e51c11901f43981694c80d21ac2ea","document-style-pipeline":"6e4abe39ece7436424ab728a07da99038cb267dd0f0c08c91806354f13c07b75","dot-meeting-brief":"4a18fe99ee18228ac2ea8dd08c7d06816bbc7dd475642a09df71b664289f3e34","dot-bounded-follow-up":"84e7fc7f83600649ed9d672287d8dfd0cc33ffdecae66cd7a7e5a0340e789eb3","dot-change-request":"2d78da6f25d6ea5d47d3067a5d597d8e304b41602a0321d27c90e9d2daf8cc73","research-conflicting-sources":"f2ddf755914405abf96632ad8b54e6353f492322f3d36384bade89dbabb505e2","writing-two-examples":"fda4d9625c4a38559a612483510673de3a65cb0f28478f943f5f3e8bb8addd10","orders-cleaning-audit":"eac249de66543c18ca22b17f9a961174a336d9db5bed9a69d4498fbf2c61cef6","image-edit-invariants":"8fbc5aaee484a75ba7f90badfee66feefcb16c4eea375ed91be3cb8c9ec69b02","video-learning-evidence":"fe6f5a20880ffcc649a26c4ec6cf8a01bef309ce178247c6757ddb7c44a986d0","codex-small-fix-loop":"97e754ab244ea90773db163c6b8959f96f555cd1ba2234d015455d6cdb27f670"}};
const october17Scenes = {"prompt-to-voice-reusable-brief":{"art":"voice","title":"声音描述、会话规则与试听记录，各有自己的位置","labels":["听感与规则分开","保存真实声音身份","统一台词逐项试听"],"status":["声音创建返回配置，不会直接返回一段试听音频。","创建免费与会话免费不同；未试听的检查项保持待验证。"]},"kling4-long-take-control":{"art":"video","title":"玩具车穿过门洞，每一段都要保住同一主体","labels":["自制主体参考","遮挡前后连续检查","时间线与镜头验收"],"status":["图中玩具车为原创概念示意，不是模型生成视频。","API、4K与两分钟延长仍属公告中的后续计划。"]},"decision-switching-threshold":{"art":"comparison","title":"先满足硬条件，再看推荐会在哪里翻转","labels":["容量门槛先筛选","24人处费用相同","按人数给出选择"],"status":["合成报价在24人同为660元，跨过交点就要重新比较。","人数范围不是概率分布；AI不能替你默认风险偏好。"]},"learning-short-answer-hint-retest":{"art":"tutor","title":"独立作答、按需提示，再用新题检查","labels":["先暴露真实答案","一次只给一级提示","反转方向与零基数"],"status":["提示后答对是进展，但应与独立完成分开记录。","题型上新不保证教学效果；有争议就回到可靠材料。"]},"firmware-memory-delta-audit":{"art":"memory","title":"新增字节先分账，再追到具体符号","labels":["同目标的两份构建","ROM与RAM独立核算","运行与升级另验证"],"status":["XIP初始化数据占两个区域，不能把ROM和RAM混成一个容量。","静态余量与观测栈余量都不能证明最坏路径已经安全。"]}};

check('October 17 additions preserve all forty-three prior article objects and scene renderings', () => {
  assert.equal(data.posts.length, 48);
  assert.deepEqual(data.posts.slice(5).map(p=>p.id),Object.keys(october17Baseline.posts));
  assert.deepEqual(data.posts.slice(0,5).map(p=>p.id),october17Ids);
  for(const [id,hash] of Object.entries(october17Baseline.posts)) {
    const p=data.posts.find(x=>x.id===id); assert.equal(sha256(JSON.stringify(p)),hash,id);
    const scope={window:{}};vm.runInNewContext(visuals,scope);
    assert.equal(sha256(scope.window.FieldnoteVisuals.render(p)),october17Baseline.scenes[id],id);
  }
});
check('October 17 articles have full teaching bodies, original tasks and honest verification dates', () => {
  assert.deepEqual(['industry','practice','embedded'].map(c=>data.posts.filter(p=>p.category===c).length),[17,15,16]);
  for(const id of october17Ids) {
    const p=data.posts.find(x=>x.id===id);
    assert.equal(p.verifiedAt,'2026-10-17');assert.equal(p.verified_date,p.verifiedAt);
    assert(p.analysis.length>=7,id);assert(p.analysis.map(x=>x.text).join('').length>=1100,id);
    assert(p.tryThis.prompt.length>=150 && p.tryThis.expected.length>=80,id);
    assert(p.sources.length>=2 && new Set(p.sources.map(x=>x.url)).size===p.sources.length,id);
    assert(p.sources.every(s=>s.url.startsWith('https://')),id);assert(p.caveat.includes('未')||p.caveat.includes('没有'),id);
    assert(!JSON.stringify(p).includes('/workspace/')&&!JSON.stringify(p).includes('sandbox:'),id);
    if(p.category!=='industry'){assert.equal(p.date,null);assert.equal(p.region,'global');}
  }
});
check('Voice and Kling chronology distinguishes releases, paid sessions and future functionality', () => {
  const voice=data.posts.find(p=>p.id==='prompt-to-voice-reusable-brief'), video=data.posts.find(p=>p.id==='kling4-long-take-control');
  assert.equal(voice.date,'2026-10-16');assert.equal(video.date,'2026-10-15');assert.equal(video.region,'china');
  for(const term of ['Live','不含试听音频','Zero Data Retention','0.30','100'])assert(JSON.stringify(voice).includes(term),term);
  for(const term of ['10月16','10月17','即将','4K','两分钟','未生成','30秒'])assert(JSON.stringify(video).includes(term),term);
  assert.equal(2*3*60*5/60,30); // integer cents, not binary floating-point dollars
  assert(voice.sources.some(s=>s.url.includes('/custom-voices')));
  assert(video.sources.some(s=>s.url.startsWith('https://ir.kuaishou.com/')));
});
check('Decision method preserves hard constraints, exact switching values and conditional choice', () => {
  const p=data.posts.find(p=>p.id==='decision-switching-threshold'), text=JSON.stringify(p);
  const A=n=>180+20*n,B=n=>420+10*n;
  assert.equal(A(24),660);assert.equal(A(24),B(24));assert(A(23)<B(23));assert(A(25)>B(25));
  assert.deepEqual([20,30,40].map(n=>[A(n),B(n)]),[[580,620],[780,720],[980,820]]);
  assert.equal(A(34),B(34)+100);assert.equal(B(30)+100-A(30),40);
  for(const term of ['容量30','24人','34人','概率','硬条件','条件式'])assert(text.includes(term),term);
  assert(p.sources.some(s=>s.url.includes('the-green-book-2026')));
  assert(visuals.includes('M265 112.4L385 56.4')&&visuals.includes('M265 95.6L385 67.6'),'Both cost lines must rise with participant count');
});
check('Learning guide keeps feedback levels, unseen retests and zero-baseline limitations distinct', () => {
  const p=data.posts.find(p=>p.id==='learning-short-answer-hint-retest'), text=JSON.stringify(p);
  assert.equal((25-20)/20,.25);assert.equal((20-25)/25,-.2);assert.equal(25-20,5);
  for(const term of ['先等我作答','一次只出一道题','不提前展示','零','提示后','独立','没有给出每项功能的单独上线日'])assert(text.includes(term),term);
  assert(p.sources.some(s=>s.url.includes('three-tips-study-gemini-notebook')));
  assert(p.caveat.includes('不能直接证明'));
});
check('Firmware memory example reconciles separate regions without inventing runtime safety', () => {
  const p=data.posts.find(p=>p.id==='firmware-memory-delta-audit'), text=JSON.stringify(p);
  const rom=[202752+4096,217088+5120],ram=[4096+40960,5120+49152];
  assert.deepEqual(rom,[206848,222208]);assert.deepEqual(ram,[45056,54272]);
  assert.equal(rom[1]-rom[0],15360);assert.equal(ram[1]-ram[0],9216);
  assert.equal(229376-rom[1],7168);assert.equal(65536-ram[1],11264);assert.equal(2048-1536,512);
  for(const term of ['DWARF','XIP','fpdiff.py','total_size','Hidden','No paths','Sysbuild','512','尚未','Apache-2.0'])assert(text.includes(term),term);
  assert(p.sources.filter(s=>s.url.includes('/dccb09599635bdff17633fa7e9dab014b91dce90/')).length>=5);
  assert(p.caveat.includes('没有安装工具'));assert.equal(p.kind,'experiment');
});
check('Five new original scenes retain semantic labels, automatic notes and control-free reading', () => {
  const env=boot({observer:true});
  for(const id of october17Ids) {
    const node=env.get('#visual-'+id),spec=october17Scenes[id];assert(node,id);
    assert(node.textContent.includes(spec.title),id);
    assert.deepEqual(node.querySelectorAll('.fv-labels span').map(x=>x.textContent),spec.labels,id);
    assert.deepEqual(node.querySelectorAll('.fv-note-transcript li').map(x=>x.textContent),spec.status,id);
    assert.equal(node.querySelectorAll('button,[aria-live],[data-demo]').length,0,id);
    assert(node.querySelectorAll('.fv-flow-runner').length>=4,id);
    env.observers[0].callback([{target:node,isIntersecting:true}]);assert(node.classList.contains('is-visible'));
    env.observers[0].callback([{target:node,isIntersecting:false}]);assert(!node.classList.contains('is-visible'));
    env.click(node);assertView(env,'feed');
  }
  const reduced=boot({reducedMotion:true});assert(reduced.document.body.classList.contains('motion-paused'));
});
check('Five additions retain category scope, deep links, copies, bookmarks and repeat navigation', async () => {
  for(const id of october17Ids) {
    const p=data.posts.find(p=>p.id===id),env=boot();
    env.click('.mobile-categories [data-category="'+p.category+'"]');
    if(p.category==='industry')env.click('[data-region="'+p.region+'"]');
    env.input(p.title);assert.deepEqual(visiblePosts(env),[id]);assert.equal(env.get('.region-filter').hidden,p.category!=='industry');
    env.click('#post-'+id+' .post-title a');assertView(env,'article');
    assert.equal(env.get('#prompt-'+id).value,p.tryThis.prompt);
    env.click('#article-view [data-copy-prompt]');await env.settle();assert.equal(env.clipboard.at(-1),p.tryThis.prompt);
    env.click('#article-view [data-save]');assert(env.storage.get(storageKey).includes(id));
    env.back();assertView(env,'feed');assert.deepEqual(visiblePosts(env),[id]);
    env.forward();assertView(env,'article');assert.equal(env.get('#article-title').textContent,p.title);
    env.click('#article-view [data-save]');assert(!env.storage.get(storageKey).includes(id));
  }
});

(async () => {
  let passed = 0;
  for (const [name, fn] of suites) {
    try { await fn(); passed++; console.log('PASS ' + name); }
    catch (error) { console.error('FAIL ' + name); console.error(error.stack); process.exitCode = 1; }
  }
  console.log(`\n${passed}/${suites.length} suites passed. Browser layout, animation paint, and native clipboard permission UI still need browser QA.`);
})();
