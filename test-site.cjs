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


const october25VeoPatch = {"id":"gemini-october-api-retirement-window","changes":{"dek":{"before":"旧Deep Research公告10月23日停用；Veo与Omni部分预览型号列入最早10月22日的停用表。先核对完整标识，再验任务与输出。","after":"10月25日更新：Gemini API三项Veo预览已于10月22日停用。保留10月20日研究代理与视频迁移核验记录，按完整型号分别检查。"},"summary":{"before":["Gemini API在10月下旬有两组值得分开检查的服务期限：旧Deep Research代理在10月8日公告将于10月23日停用；当前停用表还将三个Veo 3.1预览型号与Gemini Omni Flash预览型号列在10月22日。表格说明这些是最早可能停用日期，不能据此声称整条Veo产品线或Gemini应用已经关闭。","本文于2026年10月20日核验。研究代理的原始公告日明确为10月8日；Veo三项期限的首次公告日未在本次核验中确认，10月20日仅是当前停用页的更新与本文核实日期。下面分别列完整标识，并解释研究任务的状态管理与视频输出的接入检查；没有调用API，也没有实际切换任何服务。"],"after":["2026年10月25日更新：Google官方Veo指南现明确确认，Gemini API中的veo-3.1-generate-preview、veo-3.1-fast-generate-preview和veo-3.1-lite-generate-preview已于2026年10月22日停用，建议迁移到gemini-omni-1.1-flash或Gemini Enterprise Agent Platform中的GA型号。本次仅复核这三项Veo预览，不将其扩大为整个Veo品牌、其他入口或研究代理的状态结论。下文保留10月20日的核验记录与当时表述；未实际调用API验证迁移。","Gemini API在10月下旬有两组值得分开检查的服务期限：旧Deep Research代理在10月8日公告将于10月23日停用；当前停用表还将三个Veo 3.1预览型号与Gemini Omni Flash预览型号列在10月22日。表格说明这些是最早可能停用日期，不能据此声称整条Veo产品线或Gemini应用已经关闭。","本文于2026年10月20日核验。研究代理的原始公告日明确为10月8日；Veo三项期限的首次公告日未在本次核验中确认，10月20日仅是当前停用页的更新与本文核实日期。下面分别列完整标识，并解释研究任务的状态管理与视频输出的接入检查；没有调用API，也没有实际切换任何服务。"]},"paragraphs":{"before":["Gemini API在10月下旬有两组值得分开检查的服务期限：旧Deep Research代理在10月8日公告将于10月23日停用；当前停用表还将三个Veo 3.1预览型号与Gemini Omni Flash预览型号列在10月22日。表格说明这些是最早可能停用日期，不能据此声称整条Veo产品线或Gemini应用已经关闭。","本文于2026年10月20日核验。研究代理的原始公告日明确为10月8日；Veo三项期限的首次公告日未在本次核验中确认，10月20日仅是当前停用页的更新与本文核实日期。下面分别列完整标识，并解释研究任务的状态管理与视频输出的接入检查；没有调用API，也没有实际切换任何服务。"],"after":["2026年10月25日更新：Google官方Veo指南现明确确认，Gemini API中的veo-3.1-generate-preview、veo-3.1-fast-generate-preview和veo-3.1-lite-generate-preview已于2026年10月22日停用，建议迁移到gemini-omni-1.1-flash或Gemini Enterprise Agent Platform中的GA型号。本次仅复核这三项Veo预览，不将其扩大为整个Veo品牌、其他入口或研究代理的状态结论。下文保留10月20日的核验记录与当时表述；未实际调用API验证迁移。","Gemini API在10月下旬有两组值得分开检查的服务期限：旧Deep Research代理在10月8日公告将于10月23日停用；当前停用表还将三个Veo 3.1预览型号与Gemini Omni Flash预览型号列在10月22日。表格说明这些是最早可能停用日期，不能据此声称整条Veo产品线或Gemini应用已经关闭。","本文于2026年10月20日核验。研究代理的原始公告日明确为10月8日；Veo三项期限的首次公告日未在本次核验中确认，10月20日仅是当前停用页的更新与本文核实日期。下面分别列完整标识，并解释研究任务的状态管理与视频输出的接入检查；没有调用API，也没有实际切换任何服务。"]},"maintenance":{"before":"2026-10-20核验。Deep Research原始公告为10月8日；Veo三项具体期限首次公告日未确认。停用表更新日不是首次发布日。部署前重查账号通知、完整型号、SDK/API版本与当前契约。","after":"2026-10-20核验。Deep Research原始公告为10月8日；Veo三项具体期限首次公告日未确认。停用表更新日不是首次发布日。部署前重查账号通知、完整型号、SDK/API版本与当前契约。 2026-10-25追加维护：仅重核三项Veo 3.1预览，官方指南已由预告变为明确已停用；已在摘要前置说明并追加来源，原始date/dateLabel和历史正文保留，其他状态未重核。"},"sources":{"before":[{"title":"Gemini API日志：2026-10-08停用公告与agent参数迁移说明","label":"Gemini API日志：2026-10-08停用公告与agent参数迁移说明","url":"https://ai.google.dev/gemini-api/docs/changelog"},{"title":"Gemini停用表：Managed agents、日期语义与替代项（2026-10-20更新）","label":"Gemini停用表：Managed agents、日期语义与替代项（2026-10-20更新）","url":"https://ai.google.dev/gemini-api/docs/deprecations"},{"title":"Gemini Deep Research：Interactions接口、后台执行与限制（2026-10-20核验）","label":"Gemini Deep Research：Interactions接口、后台执行与限制（2026-10-20核验）","url":"https://ai.google.dev/gemini-api/docs/deep-research"},{"title":"Gemini后台执行：任务状态、查询与流式恢复（2026-10-20核验）","label":"Gemini后台执行：任务状态、查询与流式恢复（2026-10-20核验）","url":"https://ai.google.dev/gemini-api/docs/background-execution"},{"title":"Deep Research预览：速度与效率定位及agent标识","label":"Deep Research预览：速度与效率定位及agent标识","url":"https://ai.google.dev/gemini-api/docs/models/deep-research-preview-04-2026"},{"title":"Deep Research Max预览：全面研究定位及agent标识","label":"Deep Research Max预览：全面研究定位及agent标识","url":"https://ai.google.dev/gemini-api/docs/models/deep-research-max-preview-04-2026"},{"title":"Gemini Omni Flash型号页：稳定标识与预览期限（2026-10-19更新）","label":"Gemini Omni Flash型号页：稳定标识与预览期限（2026-10-19更新）","url":"https://ai.google.dev/gemini-api/docs/models/gemini-omni-flash"},{"title":"Gemini Omni视频指南：Interactions调用及SDK/REST输出区别（2026-10-20核验）","label":"Gemini Omni视频指南：Interactions调用及SDK/REST输出区别（2026-10-20核验）","url":"https://ai.google.dev/gemini-api/docs/omni"}],"after":[{"title":"Gemini API日志：2026-10-08停用公告与agent参数迁移说明","label":"Gemini API日志：2026-10-08停用公告与agent参数迁移说明","url":"https://ai.google.dev/gemini-api/docs/changelog"},{"title":"Gemini停用表：Managed agents、日期语义与替代项（2026-10-20更新）","label":"Gemini停用表：Managed agents、日期语义与替代项（2026-10-20更新）","url":"https://ai.google.dev/gemini-api/docs/deprecations"},{"title":"Gemini Deep Research：Interactions接口、后台执行与限制（2026-10-20核验）","label":"Gemini Deep Research：Interactions接口、后台执行与限制（2026-10-20核验）","url":"https://ai.google.dev/gemini-api/docs/deep-research"},{"title":"Gemini后台执行：任务状态、查询与流式恢复（2026-10-20核验）","label":"Gemini后台执行：任务状态、查询与流式恢复（2026-10-20核验）","url":"https://ai.google.dev/gemini-api/docs/background-execution"},{"title":"Deep Research预览：速度与效率定位及agent标识","label":"Deep Research预览：速度与效率定位及agent标识","url":"https://ai.google.dev/gemini-api/docs/models/deep-research-preview-04-2026"},{"title":"Deep Research Max预览：全面研究定位及agent标识","label":"Deep Research Max预览：全面研究定位及agent标识","url":"https://ai.google.dev/gemini-api/docs/models/deep-research-max-preview-04-2026"},{"title":"Gemini Omni Flash型号页：稳定标识与预览期限（2026-10-19更新）","label":"Gemini Omni Flash型号页：稳定标识与预览期限（2026-10-19更新）","url":"https://ai.google.dev/gemini-api/docs/models/gemini-omni-flash"},{"title":"Gemini Omni视频指南：Interactions调用及SDK/REST输出区别（2026-10-20核验）","label":"Gemini Omni视频指南：Interactions调用及SDK/REST输出区别（2026-10-20核验）","url":"https://ai.google.dev/gemini-api/docs/omni"},{"title":"Google官方Veo指南：三项Gemini API预览已于2026-10-22停用（2026-10-25核验）","label":"Google官方Veo指南：三项Gemini API预览已于2026-10-22停用（2026-10-25核验）","url":"https://ai.google.dev/gemini-api/docs/veo?hl=en"}]},"verifiedAt":{"before":"2026-10-20","after":"2026-10-25"},"verified_date":{"before":"2026-10-20","after":"2026-10-25"}},"evidence":{"checkedAt":"2026-10-25","sourceUrl":"https://ai.google.dev/gemini-api/docs/veo?hl=en","section":"正文标题Generate videos with Veo 3.1 in Gemini API下首段","finding":"该首段逐项列出三个Veo3.1预览ID，并明确称其在Gemini API于2026-10-22已停用；替代项为gemini-omni-1.1-flash或Enterprise Agent Platform中的GA型号。","limits":"未实际调用API；页面其余位置仍有旧示例，采用顶部明确停用提示，不扩展为所有Veo服务。"},"allowedFields":["dek","summary","paragraphs","maintenance","sources","verifiedAt","verified_date"],"basePostSha256":"8fca478ad8208399e5963eade20ed9f69fcc3c7572e6cab8cb4c221fe08dd4b8","resultPostSha256":"b2c6ebe83663132d38812a8547a48fa4f952c51404df5dd12c92a2b6821c3959","validation":{"requireEveryOldValueMatch":true,"requireExactWhitelist":true,"requireUnchangedOtherFields":true,"inverseProcedure":"逐个验证newValue，再以oldValue逆应用全部7项操作；逆应用后计算与basePostSha256一致。所有其他旧文章须与输入完全一致。"}};
function beforeOctober25(p) {
 if (p.id !== october25VeoPatch.id) return p;
 const previous = clone(p);
 for (const [field, change] of Object.entries(october25VeoPatch.changes)) {
  assert.deepEqual(previous[field], change.after, 'Exact approved Veo maintenance patch: ' + field);
  previous[field] = change.before;
 }
 return previous;
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
  assert.equal(data.posts.length, 104);
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
check('All 81 direct details render every explanatory section and retain their source evidence', () => {
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
  assert.equal(data.posts.length, 104);
  assert.deepEqual(['industry', 'practice', 'embedded'].map(category => data.posts.filter(p => C.categoryFor(p) === category).length), [51, 26, 27]);
});
check('Selective updates retain honest per-article source verification dates', () => {
  assert.equal(data.site.verifiedAt, '2026-10-25');
  assert(data.site.editorialNote.includes('各篇保留实际资料核验日'));
  const env = boot(); assert.equal(env.get('#edition-date').textContent, '最近核验 2026.10.25');
  const current = new Set(["minicpm-local-image-check", "sensor-unknown-state-gmm", "deepseek-v41-migration", "opus55-fast-access", "gptlive11-voice-corrections", "gemini4-argon-long-work", "runway-kling-api-workflow", "glm-legal-evidence-chain", "qwen-image21-api-alpha", "gpt6-intelligent-ui", "haiku55-subagent-budget", "nano-banana21-continuity", "embeddinggemma2-local-retrieval", "mistral-large4-preview", "mplab-agent-telemetry-pacing", "memfault-crash-evidence-chain", "assertllm2-rtl-property-review", "firment-waveform-evidence", "cantools-ai-wire-contract"]);
  for (const p of data.posts) {
    assert.equal(p.verifiedAt, (october25Ids.includes(p.id) || p.id===october25VeoPatch.id) ? '2026-10-25' : october24Ids.includes(p.id) ? '2026-10-24' : october23Ids.includes(p.id) ? '2026-10-23' : october22Ids.includes(p.id) ? '2026-10-22' : october21Ids.includes(p.id) ? '2026-10-21' : october20Ids.includes(p.id) ? '2026-10-20' : october19Ids.includes(p.id) ? '2026-10-19' : october18Ids.includes(p.id) ? '2026-10-18' : (october17Ids.includes(p.id) || companyCaseIds.includes(p.id)) ? '2026-10-17' : current.has(p.id) ? '2026-10-16' : '2026-10-15', p.id);
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
  assert.equal(data.posts.length, 104);
  assert.deepEqual(['industry', 'practice', 'embedded'].map(c => data.posts.filter(p => C.categoryFor(p) === c).length), [51, 26, 27]);
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
  assert.equal(data.posts.length, 104);
  assert.deepEqual(data.posts.slice(61).map(p=>p.id),Object.keys(october17Baseline.posts));
  assert.deepEqual(data.posts.slice(56, 61).map(p=>p.id),october17Ids);
  for(const [id,hash] of Object.entries(october17Baseline.posts)) {
    const p=data.posts.find(x=>x.id===id); assert.equal(sha256(JSON.stringify(beforeOctober25(p))),hash,id);
    const scope={window:{}};vm.runInNewContext(visuals,scope);
    assert.equal(sha256(scope.window.FieldnoteVisuals.render(p)),october17Baseline.scenes[id],id);
  }
});
check('October 17 articles have full teaching bodies, original tasks and honest verification dates', () => {
  assert.deepEqual(['industry','practice','embedded'].map(c=>data.posts.filter(p=>p.category===c).length),[51, 26, 27]);
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


/* Company practices: retain the entire previous edition, then add bounded evidence cases. */
const companyCaseIds = ['spotify-honk-verification-rollout','uber-autocover-test-acceptance','scania-spec2code-contract-gap'];
const companyBaseline = {"posts":{"prompt-to-voice-reusable-brief":"8ce23fe19a2edd011766d1e38ced13999c267f6a6c1e0ae1dd5653dedf3fff1f","kling4-long-take-control":"420dfc75a0dbb710ffc1a546f55e5528d49d802ee1bfdd5b400d82289397cd66","decision-switching-threshold":"6a4ed9103895bec78038e3addd3affb50d33184316e16c6aaa4ccf5730b20ae4","learning-short-answer-hint-retest":"501579a24f0049aa7633b3a0c22fa7dc338a58acf82e5e597a55215d1bb44670","firmware-memory-delta-audit":"583d85b92957ebe0492869f532049fb595cd5eedbe784a5768e6d78d48deb922","opus55-fast-access":"5d343d3fb4f55de41b1ad13e273f1eef4f6b4f5a2d8579101d124bce430d8000","gptlive11-voice-corrections":"bc3b9993d381c6ca67bd1e601d7bf4d4a1c95d4cace11f03b4097f67fbbb21db","gemini4-argon-long-work":"121484ce1ee9148c2f7be640371a62f9cfba446c9cdb89ca8cab5446e873ecb0","runway-kling-api-workflow":"52b0018ad273e00a3f6af7862bdaa9f18207c16087737e1a83beb0199645990f","glm-legal-evidence-chain":"9da204d02ab84f8eb48a10f2af265f48759150c5844ef9e34be111d0234d8f4c","qwen-image21-api-alpha":"1e81ecb9ec1498e575ba292c96ade9342fcbc1fd892a0e23d88c62c5e854847d","gpt6-intelligent-ui":"5c9657cf1aaa75195a7c6ca9a419ed9f5c946dae43fd2e929f7cb219def47d11","haiku55-subagent-budget":"40589281778639c45c81447e065e3830efcbe09fe52cd9a3e2604707e5257c35","nano-banana21-continuity":"ab6cb4de6fb4fab6eb5b81028cdd2857bd5971e610074302afc9ee2b27cd618e","embeddinggemma2-local-retrieval":"5cd94802e402edfab230b73e19ee6b0dffeb3eb26d778cd37f907ede67e3c301","mistral-large4-preview":"74d300fc34b328dc749a34aec19c0ac87e0ec4220688eca5a0b702298f05a44f","mplab-agent-telemetry-pacing":"f23ee6f7a452db4833c4f3f58ff69b49aa8811cf8e2f134e288acbe7514631a4","memfault-crash-evidence-chain":"19b9006fd5e592f9efd3fd0332950afcf45a8195884f062d42fdd52c0ff9e69f","assertllm2-rtl-property-review":"b6d87a487535fb842ad4908bcd1bc08b35004d4c2c8a8f199d5da40a1cd59a39","firment-waveform-evidence":"affb6bfa3bdb4778904f9133b4a3a4fab2fb4190b29b0c15bde31b05095800f1","cantools-ai-wire-contract":"e2d91e4db45b36d183823818262761687888da7b3e9b52dd6b34e2aebcf88135","minicpm-local-image-check":"fd0add86b8ae410daf0349b44d383d17df575eb0d1d69ab111d26fe04a5714b7","sensor-unknown-state-gmm":"3b4eac0dd79fb5970aed643285a55a7bfe0cf27c58567093353906e8bd4e8d3f","sol-quality-cost":"f53d3c7c9d9c8b8b75da105a631a8a74df7ceaf105b77adf03ffad445b882b6a","deepseek-v41-migration":"05ea75bf12ecfaf87c4ba8bfb4a84fcdf41deeec532bbdab6ba13efc7698b376","qwen-omni-evidence":"220ef0f3c13e3f04c6b332933a303feb528d06e1458ec410510e4b0924f9c359","images25-edit-brief":"3baf2ae3963446ddc58573af93650d0815cfdb24ba9287d5022927e03dd73dff","renode-replay-lab":"bbc451336852b1abd4d491dfab43c79cc5fac6719bcefeece8304947508aa261","firmware-fuzz-harness":"52204b6f516e75ca58f3ecb7b9154fe9d30bd698d9ff29ab865f12c5ced39058","debug-probe-mcp":"063fa655a3e4838d61f72683df248a15fe8e0c7185fc909684d4c986a7fece58","datasheet-register-audit":"7ad32920da96b7456f3c19971fa940a7528e0338609da7bd07886c53fd7ea708","stm32-edge-ai-budget":"819ad707afc2051fe064ce466d246159ef51d35dec3c2cd3ded40d6666908811","firmware-agent-contract":"146a2eadf17defae9c0266ea2d82e35dd33eb6b480fc3a8a2ca32f262d4a62a9","context-task-eval":"8c96cdbc3b373c90733bc5b218854baa24f99c9e6043ad19d2f3b76d34c86095","espressif-mcp-workflow":"90b01873f620cb39f7e0040e56ea68e6881489c0ccc4d1b214f97ef95573e628","playwright-mcp-boundary":"cb62e3ed8797602aa5df5717d7abb4cde1d87a57981ce342a881c6643a2dcea5","skills-license-eval":"de1ddf6ab2990d2887a2a3324d7a2a6b90012a4f13121d7ff4759408523356d8","embedded-regression-copilot":"3d1ff145b4ddef0c06132990ee8f6c7ac18b2243e34e89cda1b3be8b01f00211","document-style-pipeline":"6d85313adc53f5a592474f69acdb78ce4164c63492147baa7a117f6ffc7d110a","dot-meeting-brief":"1e1e08ae0719a820459a68a4a0ef0356e3dd37570b4b2cf224041cf7a5f533b2","dot-bounded-follow-up":"76111ec1587cae86e39d500343d2945d973f5b958dd0586347950ed163a42478","dot-change-request":"73bdc58095365cb1c20fb099a3a0a8f2dc84bd45988efbc55cd4fc8735d6fbd1","research-conflicting-sources":"7f426c4e27e151214b91384b022eaa1e8063019ca554fc1c53e1a2a0fd8c8923","writing-two-examples":"08492c0f960d7d9c49a7fdabb6eec727741e85032cc143497b317ec43cd0d522","orders-cleaning-audit":"f043208c83891bb78919dd894df9af97f87ec06b1d528a020134cdaa80631828","image-edit-invariants":"db530d20a56191678834b869b084f8d5237047b21363e8408f81bedf6d1df94b","video-learning-evidence":"d0cd75374d542553b4bd74f3bbc76dd7d44bd30435a0b0cff3fe20f2838d0963","codex-small-fix-loop":"d1182d94cd77032b8a7c49962a91661e5928f09dac1410ba622d20449681c7e8"},"scenes":{"prompt-to-voice-reusable-brief":"084110d9ee279bbf11af4b441f802b9b3a8a725c7d20eaf6d9284dfa39f61cd1","kling4-long-take-control":"62799f892ec6b3cf79330c3751fe5bc81c2a84ad54e7ddd95e311b832f17ee0a","decision-switching-threshold":"7903838acfab4640dc450e4475012fbc8d3575f13376079c4c37f1500883da0a","learning-short-answer-hint-retest":"83adb4a7bcb3a63d10449657d7f34aae6071091c84382fc8e075d1cc5cd92323","firmware-memory-delta-audit":"e2757f410a9fdc59f1fa8b3f1a64e3ba29ff96500794fb9c9441979acd8be345","opus55-fast-access":"4adf26b679bcc54f022f95b4fe8ce05a12ad5659b40150003386a205242dc3a2","gptlive11-voice-corrections":"90a546fb4fc93f4e703e55a6319ba8742ff3920fa5bbbc36b8dcfd6684577dc6","gemini4-argon-long-work":"3f5357476daa50f9dae14e6dffa4e358b25f492b88db72b88bb4fcbd2ab18bf1","runway-kling-api-workflow":"ec96e7d3ed9c9eb159b9b2756791c6906707497d216110310da7a543b7cc2054","glm-legal-evidence-chain":"0847157a51d87c38680a1883fcded1cb186acd2f5cfdf4b99964dceeab23ef16","qwen-image21-api-alpha":"8ecb0f5e3e13e7ee8d5ae178f53b558f52004cf253f5bbc77e0a6cd994453791","gpt6-intelligent-ui":"b25e050a79bcc2a4a89b2a2980645ae06d74d03b586fdc4e4b0b0f36b89af766","haiku55-subagent-budget":"13cf6a2089f016c3ce1f0114f0ddb57d76077047f1df51fb3a323bec3704efc4","nano-banana21-continuity":"7360b9df5dbc06c7de72f27cdb2bb978ebe64c9f6d5d1cf7c640c081cadb5d93","embeddinggemma2-local-retrieval":"1c15811ae86029d28cf952201672d302e49313d5685b4d1bf3264442b075cb7e","mistral-large4-preview":"eef9211bdf2841306f03d4255f5536529d2712a0b87fdc349f7345a33b249e96","mplab-agent-telemetry-pacing":"98f7942e28b93b416bd5fb1a01189da287770e79f19b19b9ffe7811f7f4aeea9","memfault-crash-evidence-chain":"589792d5a3a877b4dd874d149996ce639c571c340ddcc31e71645e2d42b222c9","assertllm2-rtl-property-review":"e91f5ee4397da1789fa5343cb2adbc92c0daadd38df6cf6edf7a2ac1a7ed0a9d","firment-waveform-evidence":"47e4d63c6cc4715350747ebc0d96ddaeeccd22c10ddef67298d50328b8a3cd41","cantools-ai-wire-contract":"be2a8be95077dfc14460ce8d63348efb55fbe8b1689cc51e6e3252596cfa31fc","minicpm-local-image-check":"fa17a45f81ee28c814e29c26d199cc8755d082856373289c73671e071875cb12","sensor-unknown-state-gmm":"2a249413d4e9ab7d75f558b93234c16ebe2e78505a5eeadd992094aa3eed7c3a","sol-quality-cost":"21ac08e4a30889f92d381fa976e7f9eb05a33efa05c444f3afaed743c986649e","deepseek-v41-migration":"c552e257157ccebf462c5d2de48023234cebcf5f38861ca937e78dcdfdf2e790","qwen-omni-evidence":"253ecdbfa2c0dea216716d0be36a7381b1f70652f31638785a4178ed713f3ee0","images25-edit-brief":"ba77c9ee45199dfcaf0bca9cd9f31438ee82d06766a092731add3035bec0b9c2","renode-replay-lab":"02529004caba1c922ab3d690b3aad588fab1ca33eae0daef85b89c3f56511a99","firmware-fuzz-harness":"089f5a9ebdf188ab3e4575eab1f5c756732aadb3177952f01431567c8fd7f4d3","debug-probe-mcp":"ca23b159b62c8fdf7ab35ebec262ffe31fe11b3dd941e631cb2dd1de06ab432f","datasheet-register-audit":"ac50c025ad093bba38ff389df2334f5f29e01fc87ad0ee97aebf1d427ecf5701","stm32-edge-ai-budget":"3463da3b40663b7296560028a5b8af5e3efcd084d6ebe3cc47f397b89327896f","firmware-agent-contract":"cf9dbbe92d84749fb634e26345b8b5e72c7a5ca1dcefb74e320a94dd18b3029f","context-task-eval":"4cf4541762a4b088e7f4011943066ecf25c12ab4115ffb51c12e582f06cf30f9","espressif-mcp-workflow":"63fa25ccd1534820f5899d41ca7a0116fc39e57b7d519f5dde0ba1d07dc68a96","playwright-mcp-boundary":"d13701f012853926a1c127ccd36325b94083ade013acf0ac06971e8b95d6a6ed","skills-license-eval":"de41448284606b587eb01f3f52467148abfe329eb4afb64f7095d6de51652553","embedded-regression-copilot":"0d8d2283b73273ccc9a7d3796502bcc1829e51c11901f43981694c80d21ac2ea","document-style-pipeline":"6e4abe39ece7436424ab728a07da99038cb267dd0f0c08c91806354f13c07b75","dot-meeting-brief":"4a18fe99ee18228ac2ea8dd08c7d06816bbc7dd475642a09df71b664289f3e34","dot-bounded-follow-up":"84e7fc7f83600649ed9d672287d8dfd0cc33ffdecae66cd7a7e5a0340e789eb3","dot-change-request":"2d78da6f25d6ea5d47d3067a5d597d8e304b41602a0321d27c90e9d2daf8cc73","research-conflicting-sources":"f2ddf755914405abf96632ad8b54e6353f492322f3d36384bade89dbabb505e2","writing-two-examples":"fda4d9625c4a38559a612483510673de3a65cb0f28478f943f5f3e8bb8addd10","orders-cleaning-audit":"eac249de66543c18ca22b17f9a961174a336d9db5bed9a69d4498fbf2c61cef6","image-edit-invariants":"8fbc5aaee484a75ba7f90badfee66feefcb16c4eea375ed91be3cb8c9ec69b02","video-learning-evidence":"fe6f5a20880ffcc649a26c4ec6cf8a01bef309ce178247c6757ddb7c44a986d0","codex-small-fix-loop":"97e754ab244ea90773db163c6b8959f96f555cd1ba2234d015455d6cdb27f670"},"files":{"app.js":"3f11837199a84b29e606682c4b88a17632fea212e8cabad2eab2570564305157","site-core.js":"b4f96a7f0557c322c3c2e42cfcf14d1545585d06420cfc1147c03bc5b7b33589","style.css":"5e159c776246dcd48bf52117e649feb7250bbffb9f49a707bbb2d9b3cf3c5c8b","visuals.css":"7cf30aa521f1fe9e7589608376199737cb797efc3ab2a63799c97d7ac0d4d00d","build.py":"25deb0b707c7e7ae97e1306b94afcab5d0156c8a7ff8495a980140e4ebb2f524","favicon.svg":"b33e38910db7f167eb595800e4fa779577885204e090115732215704f1be1db5","DESIGN.md":"23cb37aa5f8c5df788d9587f03e8e2b01a2b955f5d26b4862e7f1dc5439e5a96","THIRD_PARTY_NOTICES.md":"e10fafb73c4164f3cc2f5350a0ec70c500ab6417cc935a9140b69e49b74daf60"}};
check('Company cases preserve all forty-eight prior post objects, scenes and design assets', () => {
  assert.equal(data.posts.length,104);
  assert.deepEqual(data.posts.slice(53, 56).map(p=>p.id),companyCaseIds);
  assert.deepEqual(data.posts.slice(56).map(p=>p.id),Object.keys(companyBaseline.posts));
  for(const [id,hash] of Object.entries(companyBaseline.posts)) {
    const p=data.posts.find(p=>p.id===id);assert.equal(sha256(JSON.stringify(beforeOctober25(p))),hash,id);
    const scope={window:{}};vm.runInNewContext(visuals,scope);
    assert.equal(sha256(scope.window.FieldnoteVisuals.render(p)),companyBaseline.scenes[id],id);
  }
  for(const [file,hash] of Object.entries(companyBaseline.files))assert.equal(sha256(read(file)),hash,file);
});
check('Company cases distinguish evidence, original exercises, learning status and source dates', () => {
  assert.deepEqual(['industry','practice','embedded'].map(c=>data.posts.filter(p=>p.category===c).length),[51, 26, 27]);
  assert(data.site.selectionNote.includes('公司工程博客')&&data.site.selectionNote.includes('工业论文'));
  assert(data.site.editorialNote.includes('全部旧文保留')&&data.site.editorialNote.includes('待学习'));
  for(const id of companyCaseIds) {
    const p=data.posts.find(p=>p.id===id), text=JSON.stringify(p);
    assert.equal(p.verifiedAt,'2026-10-17');assert(p.tags.includes('待学习'));
    assert(p.evidence.includes('流程未本站复现'));assert(p.analysis.length>=10);
    assert(p.analysis.map(x=>x.text).join('').length>=1400);assert(p.tryThis.prompt.length>=350);
    assert(p.tryThis.expected.length>=100);assert(p.caveat.includes('未'));
    assert(p.sources.length>=2&&p.sources.every(s=>s.url.startsWith('https://')));
    for(const prohibited of ['/workspace/','sandbox:','私有项目','已经掌握'])assert(!text.includes(prohibited),id+prohibited);
  }
  assert.equal(data.posts.find(p=>p.id===companyCaseIds[0]).date,'2026-09-16');
  assert.equal(data.posts.find(p=>p.id===companyCaseIds[1]).date,null);
  assert.equal(data.posts.find(p=>p.id===companyCaseIds[2]).date,'2024-11-20');
});
check('Spotify case keeps incident attribution, historical environment and bounded exits explicit', () => {
  const p=data.posts.find(p=>p.id===companyCaseIds[0]), t=JSON.stringify(p);
  for(const term of ['Linux x86','2025年12月9日','2026年9月16日','未把该次事故归因于 AI','B应跳过','C应停止','回滚','人工','成本','凭证'])assert(t.includes(term),term);
  assert(p.sources.every(x=>x.url.startsWith('https://engineering.atspotify.com/')));
  assert(p.tryThis.prompt.includes('不推送或发布'));
});
check('Uber case keeps stage denominators and synthetic mutation examples separate from measurements', () => {
  const p=data.posts.find(p=>p.id===companyCaseIds[1]),t=JSON.stringify(p);
  for(const term of ['华盛顿大学的 René Just','该工作在 Uber 完成','20%','40%','80%','44%','2025年8—9月','2026年4月15日','不能把40%乘44%','6/10','4/10','4/6','行为等价','修订日','Bazel','脱敏','9个 Go','人工质量评审只比较 AutoCover 与 Cursor 0.46.8'])assert(t.includes(term),term);
  assert(p.tryThis.expected.includes('D在整数契约下可行为等价'));
  assert(p.sources.some(s=>s.url.includes('auto_cover_icse_2026.pdf')));
  assert(p.sources.some(s=>s.url.includes('conf.researchr.org/details/icse-2026/')));
});
check('Scania case separates proof obligations, equivalence and hardware integration', () => {
  const p=data.posts.find(p=>p.id===companyCaseIds[2]),t=JSON.stringify(p);
  for(const term of ['可行性研究','单一翻译单元','10 ms','Frama-C 27.1','33/33','Not Eq','ghost','无迭代反馈或微调','未上板','待学习','未本站实物复现','1、2、0、1、2、3'])assert(t.includes(term),term);
  assert(p.caveat.includes('不能直接当成所有结果均功能错误'));
  assert(p.sources.some(s=>s.url==='https://arxiv.org/html/2411.13269v1'));
  assert(p.tryThis.prompt.includes('不得弱化上述规则'));
});
check('Three company scenes keep semantic teaching labels, automatic notes and motion boundaries', () => {
  const env=boot({observer:true});
  const labels=[['A继续 · B跳过 · C停止','独立验证与人工审查','发布观察与回滚'],['10个候选测试','6个检查通过','4个人工接受'],['人工固定规格','编译与证明义务','等价与系统仍待查']];
  companyCaseIds.forEach((id,i)=>{
    const n=env.get('#visual-'+id);assert(n);
    assert.deepEqual(n.querySelectorAll('.fv-labels span').map(x=>x.textContent),labels[i]);
    assert.equal(n.querySelectorAll('.fv-note-transcript li').length,2);
    assert(n.querySelectorAll('.fv-flow-runner').length>=4);
    assert.equal(n.querySelectorAll('button,[aria-live],[data-demo],animate,animateTransform').length,0);
    env.observers[0].callback([{target:n,isIntersecting:true}]);assert(n.classList.contains('is-visible'));
    env.observers[0].callback([{target:n,isIntersecting:false}]);assert(!n.classList.contains('is-visible'));
    env.click(n);assertView(env,'feed');
  });
});
check('Company articles retain deep links, category search, source links, copies and repeated navigation', async () => {
  for(const id of companyCaseIds) {
    const p=data.posts.find(p=>p.id===id),env=boot();
    env.click('.mobile-categories [data-category="'+p.category+'"]');env.input(p.title);
    assert.deepEqual(visiblePosts(env),[id]);assert.equal(env.get('.region-filter').hidden,true);
    env.click('#post-'+id+' .post-title a');assertView(env,'article');
    assert.equal(env.location.hash,'#post/'+id);assert.equal(env.get('#article-title').textContent,p.title);
    assert.equal(env.get('#article-view').querySelectorAll('.source-list a').length,p.sources.length);
    env.click('#article-view [data-copy-prompt]');await env.settle();assert.equal(env.clipboard.at(-1),p.tryThis.prompt);
    env.click('#article-view [data-save]');assert(env.storage.get(storageKey).includes(id));
    env.back();assertView(env,'feed');assert.deepEqual(visiblePosts(env),[id]);
    env.forward();assertView(env,'article');assert.equal(env.get('#article-title').textContent,p.title);
    const deep=boot({url:'https://example.test/publication/#post/'+id});assertView(deep,'article');assert.equal(deep.get('#article-title').textContent,p.title);
  }
});


/* October 18: strict prepend over approved main6b2053501fbb7cb82ac89e88448d5841583fb96a.
 * Hashes come from its 51 post objects and its unmodified native renderer. A new VM
 * per post resets SVG namespaces; no normalization masks historical scene changes. */
const october18Ids = ['deepseek-search-fetch-evidence', 'airbnb-incremental-support-notes'];
const october18Baseline = {"posts":{"spotify-honk-verification-rollout":"42630f3308bb29ff8683b001e5fd89c0aa68202c15e8ba56d69e0087c10c4584","uber-autocover-test-acceptance":"ab12b8b0bd882a088c67e8e0f6fc5306e6fcd6cf1b4eb2d19202186fdd60019e","scania-spec2code-contract-gap":"9e54ac029dc40dc9e5e90e28d932ea6561118b23af4d360f364ab00c4cda8368","prompt-to-voice-reusable-brief":"8ce23fe19a2edd011766d1e38ced13999c267f6a6c1e0ae1dd5653dedf3fff1f","kling4-long-take-control":"420dfc75a0dbb710ffc1a546f55e5528d49d802ee1bfdd5b400d82289397cd66","decision-switching-threshold":"6a4ed9103895bec78038e3addd3affb50d33184316e16c6aaa4ccf5730b20ae4","learning-short-answer-hint-retest":"501579a24f0049aa7633b3a0c22fa7dc338a58acf82e5e597a55215d1bb44670","firmware-memory-delta-audit":"583d85b92957ebe0492869f532049fb595cd5eedbe784a5768e6d78d48deb922","opus55-fast-access":"5d343d3fb4f55de41b1ad13e273f1eef4f6b4f5a2d8579101d124bce430d8000","gptlive11-voice-corrections":"bc3b9993d381c6ca67bd1e601d7bf4d4a1c95d4cace11f03b4097f67fbbb21db","gemini4-argon-long-work":"121484ce1ee9148c2f7be640371a62f9cfba446c9cdb89ca8cab5446e873ecb0","runway-kling-api-workflow":"52b0018ad273e00a3f6af7862bdaa9f18207c16087737e1a83beb0199645990f","glm-legal-evidence-chain":"9da204d02ab84f8eb48a10f2af265f48759150c5844ef9e34be111d0234d8f4c","qwen-image21-api-alpha":"1e81ecb9ec1498e575ba292c96ade9342fcbc1fd892a0e23d88c62c5e854847d","gpt6-intelligent-ui":"5c9657cf1aaa75195a7c6ca9a419ed9f5c946dae43fd2e929f7cb219def47d11","haiku55-subagent-budget":"40589281778639c45c81447e065e3830efcbe09fe52cd9a3e2604707e5257c35","nano-banana21-continuity":"ab6cb4de6fb4fab6eb5b81028cdd2857bd5971e610074302afc9ee2b27cd618e","embeddinggemma2-local-retrieval":"5cd94802e402edfab230b73e19ee6b0dffeb3eb26d778cd37f907ede67e3c301","mistral-large4-preview":"74d300fc34b328dc749a34aec19c0ac87e0ec4220688eca5a0b702298f05a44f","mplab-agent-telemetry-pacing":"f23ee6f7a452db4833c4f3f58ff69b49aa8811cf8e2f134e288acbe7514631a4","memfault-crash-evidence-chain":"19b9006fd5e592f9efd3fd0332950afcf45a8195884f062d42fdd52c0ff9e69f","assertllm2-rtl-property-review":"b6d87a487535fb842ad4908bcd1bc08b35004d4c2c8a8f199d5da40a1cd59a39","firment-waveform-evidence":"affb6bfa3bdb4778904f9133b4a3a4fab2fb4190b29b0c15bde31b05095800f1","cantools-ai-wire-contract":"e2d91e4db45b36d183823818262761687888da7b3e9b52dd6b34e2aebcf88135","minicpm-local-image-check":"fd0add86b8ae410daf0349b44d383d17df575eb0d1d69ab111d26fe04a5714b7","sensor-unknown-state-gmm":"3b4eac0dd79fb5970aed643285a55a7bfe0cf27c58567093353906e8bd4e8d3f","sol-quality-cost":"f53d3c7c9d9c8b8b75da105a631a8a74df7ceaf105b77adf03ffad445b882b6a","deepseek-v41-migration":"05ea75bf12ecfaf87c4ba8bfb4a84fcdf41deeec532bbdab6ba13efc7698b376","qwen-omni-evidence":"220ef0f3c13e3f04c6b332933a303feb528d06e1458ec410510e4b0924f9c359","images25-edit-brief":"3baf2ae3963446ddc58573af93650d0815cfdb24ba9287d5022927e03dd73dff","renode-replay-lab":"bbc451336852b1abd4d491dfab43c79cc5fac6719bcefeece8304947508aa261","firmware-fuzz-harness":"52204b6f516e75ca58f3ecb7b9154fe9d30bd698d9ff29ab865f12c5ced39058","debug-probe-mcp":"063fa655a3e4838d61f72683df248a15fe8e0c7185fc909684d4c986a7fece58","datasheet-register-audit":"7ad32920da96b7456f3c19971fa940a7528e0338609da7bd07886c53fd7ea708","stm32-edge-ai-budget":"819ad707afc2051fe064ce466d246159ef51d35dec3c2cd3ded40d6666908811","firmware-agent-contract":"146a2eadf17defae9c0266ea2d82e35dd33eb6b480fc3a8a2ca32f262d4a62a9","context-task-eval":"8c96cdbc3b373c90733bc5b218854baa24f99c9e6043ad19d2f3b76d34c86095","espressif-mcp-workflow":"90b01873f620cb39f7e0040e56ea68e6881489c0ccc4d1b214f97ef95573e628","playwright-mcp-boundary":"cb62e3ed8797602aa5df5717d7abb4cde1d87a57981ce342a881c6643a2dcea5","skills-license-eval":"de1ddf6ab2990d2887a2a3324d7a2a6b90012a4f13121d7ff4759408523356d8","embedded-regression-copilot":"3d1ff145b4ddef0c06132990ee8f6c7ac18b2243e34e89cda1b3be8b01f00211","document-style-pipeline":"6d85313adc53f5a592474f69acdb78ce4164c63492147baa7a117f6ffc7d110a","dot-meeting-brief":"1e1e08ae0719a820459a68a4a0ef0356e3dd37570b4b2cf224041cf7a5f533b2","dot-bounded-follow-up":"76111ec1587cae86e39d500343d2945d973f5b958dd0586347950ed163a42478","dot-change-request":"73bdc58095365cb1c20fb099a3a0a8f2dc84bd45988efbc55cd4fc8735d6fbd1","research-conflicting-sources":"7f426c4e27e151214b91384b022eaa1e8063019ca554fc1c53e1a2a0fd8c8923","writing-two-examples":"08492c0f960d7d9c49a7fdabb6eec727741e85032cc143497b317ec43cd0d522","orders-cleaning-audit":"f043208c83891bb78919dd894df9af97f87ec06b1d528a020134cdaa80631828","image-edit-invariants":"db530d20a56191678834b869b084f8d5237047b21363e8408f81bedf6d1df94b","video-learning-evidence":"d0cd75374d542553b4bd74f3bbc76dd7d44bd30435a0b0cff3fe20f2838d0963","codex-small-fix-loop":"d1182d94cd77032b8a7c49962a91661e5928f09dac1410ba622d20449681c7e8"},"scenes":{"spotify-honk-verification-rollout":"2ab648ae586ac7ce173dcc69e8e99362591f4565b7509eaf3a0af9e3498a29f2","uber-autocover-test-acceptance":"93cb45b55189d9e5539e191019eea33ee79bddf9dd7f4fc559a0a366d87c64bc","scania-spec2code-contract-gap":"42d1910826736a2d1e2359f77ee61e98d8bae4ab3f95cc1aa2760653e20a9833","prompt-to-voice-reusable-brief":"084110d9ee279bbf11af4b441f802b9b3a8a725c7d20eaf6d9284dfa39f61cd1","kling4-long-take-control":"62799f892ec6b3cf79330c3751fe5bc81c2a84ad54e7ddd95e311b832f17ee0a","decision-switching-threshold":"7903838acfab4640dc450e4475012fbc8d3575f13376079c4c37f1500883da0a","learning-short-answer-hint-retest":"83adb4a7bcb3a63d10449657d7f34aae6071091c84382fc8e075d1cc5cd92323","firmware-memory-delta-audit":"e2757f410a9fdc59f1fa8b3f1a64e3ba29ff96500794fb9c9441979acd8be345","opus55-fast-access":"4adf26b679bcc54f022f95b4fe8ce05a12ad5659b40150003386a205242dc3a2","gptlive11-voice-corrections":"90a546fb4fc93f4e703e55a6319ba8742ff3920fa5bbbc36b8dcfd6684577dc6","gemini4-argon-long-work":"3f5357476daa50f9dae14e6dffa4e358b25f492b88db72b88bb4fcbd2ab18bf1","runway-kling-api-workflow":"ec96e7d3ed9c9eb159b9b2756791c6906707497d216110310da7a543b7cc2054","glm-legal-evidence-chain":"0847157a51d87c38680a1883fcded1cb186acd2f5cfdf4b99964dceeab23ef16","qwen-image21-api-alpha":"8ecb0f5e3e13e7ee8d5ae178f53b558f52004cf253f5bbc77e0a6cd994453791","gpt6-intelligent-ui":"b25e050a79bcc2a4a89b2a2980645ae06d74d03b586fdc4e4b0b0f36b89af766","haiku55-subagent-budget":"13cf6a2089f016c3ce1f0114f0ddb57d76077047f1df51fb3a323bec3704efc4","nano-banana21-continuity":"7360b9df5dbc06c7de72f27cdb2bb978ebe64c9f6d5d1cf7c640c081cadb5d93","embeddinggemma2-local-retrieval":"1c15811ae86029d28cf952201672d302e49313d5685b4d1bf3264442b075cb7e","mistral-large4-preview":"eef9211bdf2841306f03d4255f5536529d2712a0b87fdc349f7345a33b249e96","mplab-agent-telemetry-pacing":"98f7942e28b93b416bd5fb1a01189da287770e79f19b19b9ffe7811f7f4aeea9","memfault-crash-evidence-chain":"589792d5a3a877b4dd874d149996ce639c571c340ddcc31e71645e2d42b222c9","assertllm2-rtl-property-review":"e91f5ee4397da1789fa5343cb2adbc92c0daadd38df6cf6edf7a2ac1a7ed0a9d","firment-waveform-evidence":"47e4d63c6cc4715350747ebc0d96ddaeeccd22c10ddef67298d50328b8a3cd41","cantools-ai-wire-contract":"be2a8be95077dfc14460ce8d63348efb55fbe8b1689cc51e6e3252596cfa31fc","minicpm-local-image-check":"fa17a45f81ee28c814e29c26d199cc8755d082856373289c73671e071875cb12","sensor-unknown-state-gmm":"2a249413d4e9ab7d75f558b93234c16ebe2e78505a5eeadd992094aa3eed7c3a","sol-quality-cost":"21ac08e4a30889f92d381fa976e7f9eb05a33efa05c444f3afaed743c986649e","deepseek-v41-migration":"c552e257157ccebf462c5d2de48023234cebcf5f38861ca937e78dcdfdf2e790","qwen-omni-evidence":"253ecdbfa2c0dea216716d0be36a7381b1f70652f31638785a4178ed713f3ee0","images25-edit-brief":"ba77c9ee45199dfcaf0bca9cd9f31438ee82d06766a092731add3035bec0b9c2","renode-replay-lab":"02529004caba1c922ab3d690b3aad588fab1ca33eae0daef85b89c3f56511a99","firmware-fuzz-harness":"089f5a9ebdf188ab3e4575eab1f5c756732aadb3177952f01431567c8fd7f4d3","debug-probe-mcp":"ca23b159b62c8fdf7ab35ebec262ffe31fe11b3dd941e631cb2dd1de06ab432f","datasheet-register-audit":"ac50c025ad093bba38ff389df2334f5f29e01fc87ad0ee97aebf1d427ecf5701","stm32-edge-ai-budget":"3463da3b40663b7296560028a5b8af5e3efcd084d6ebe3cc47f397b89327896f","firmware-agent-contract":"cf9dbbe92d84749fb634e26345b8b5e72c7a5ca1dcefb74e320a94dd18b3029f","context-task-eval":"4cf4541762a4b088e7f4011943066ecf25c12ab4115ffb51c12e582f06cf30f9","espressif-mcp-workflow":"63fa25ccd1534820f5899d41ca7a0116fc39e57b7d519f5dde0ba1d07dc68a96","playwright-mcp-boundary":"d13701f012853926a1c127ccd36325b94083ade013acf0ac06971e8b95d6a6ed","skills-license-eval":"de41448284606b587eb01f3f52467148abfe329eb4afb64f7095d6de51652553","embedded-regression-copilot":"0d8d2283b73273ccc9a7d3796502bcc1829e51c11901f43981694c80d21ac2ea","document-style-pipeline":"6e4abe39ece7436424ab728a07da99038cb267dd0f0c08c91806354f13c07b75","dot-meeting-brief":"4a18fe99ee18228ac2ea8dd08c7d06816bbc7dd475642a09df71b664289f3e34","dot-bounded-follow-up":"84e7fc7f83600649ed9d672287d8dfd0cc33ffdecae66cd7a7e5a0340e789eb3","dot-change-request":"2d78da6f25d6ea5d47d3067a5d597d8e304b41602a0321d27c90e9d2daf8cc73","research-conflicting-sources":"f2ddf755914405abf96632ad8b54e6353f492322f3d36384bade89dbabb505e2","writing-two-examples":"fda4d9625c4a38559a612483510673de3a65cb0f28478f943f5f3e8bb8addd10","orders-cleaning-audit":"eac249de66543c18ca22b17f9a961174a336d9db5bed9a69d4498fbf2c61cef6","image-edit-invariants":"8fbc5aaee484a75ba7f90badfee66feefcb16c4eea375ed91be3cb8c9ec69b02","video-learning-evidence":"fe6f5a20880ffcc649a26c4ec6cf8a01bef309ce178247c6757ddb7c44a986d0","codex-small-fix-loop":"97e754ab244ea90773db163c6b8959f96f555cd1ba2234d015455d6cdb27f670"},"files":{"app.js":"3f11837199a84b29e606682c4b88a17632fea212e8cabad2eab2570564305157","site-core.js":"b4f96a7f0557c322c3c2e42cfcf14d1545585d06420cfc1147c03bc5b7b33589","style.css":"5e159c776246dcd48bf52117e649feb7250bbffb9f49a707bbb2d9b3cf3c5c8b","visuals.css":"7cf30aa521f1fe9e7589608376199737cb797efc3ab2a63799c97d7ac0d4d00d","build.py":"25deb0b707c7e7ae97e1306b94afcab5d0156c8a7ff8495a980140e4ebb2f524","favicon.svg":"b33e38910db7f167eb595800e4fa779577885204e090115732215704f1be1db5","DESIGN.md":"23cb37aa5f8c5df788d9587f03e8e2b01a2b955f5d26b4862e7f1dc5439e5a96","THIRD_PARTY_NOTICES.md":"e10fafb73c4164f3cc2f5350a0ec70c500ab6417cc935a9140b69e49b74daf60"}};
check('October 18 preserves all fifty-one approved article objects, native scenes and fixed assets', () => {
  assert.equal(Object.keys(october18Baseline.posts).length, 51);
  assert.deepEqual(Object.keys(october18Baseline.scenes), Object.keys(october18Baseline.posts));
  assert.equal(data.posts.length, 104);
  assert.deepEqual(data.posts.slice(51, 53).map(p => p.id), october18Ids);
  assert.deepEqual(data.posts.slice(53).map(p => p.id), Object.keys(october18Baseline.posts));
  for (const [id, hash] of Object.entries(october18Baseline.posts)) {
    const post = data.posts.find(p => p.id === id); assert(post, id);
    assert.equal(sha256(JSON.stringify(beforeOctober25(post))), hash, id + ': approved object must be unchanged');
    const scope = { window: {} }; vm.runInNewContext(visuals, scope);
    const output = scope.window.FieldnoteVisuals.render(post);
    assert(output.includes('fv-render-1-'), id + ': scene namespace must reset independently');
    assert.equal(sha256(output), october18Baseline.scenes[id], id + ': approved native scene must be unchanged');
  }
  for (const [file, hash] of Object.entries(october18Baseline.files)) assert.equal(sha256(read(file)), hash, file);
  assert.deepEqual(['industry', 'practice', 'embedded'].map(category => data.posts.filter(p => C.categoryFor(p) === category).length), [51, 26, 27]);
  assert.equal(data.site.verifiedAt, '2026-10-25');
  assert.notEqual(assertReleaseCoherence(index), '20261017r1-028c98fa9643', 'New content and scenes must invalidate the approved baseline asset release');
  const shell = new Node(); parseHTML(index, shell);
  assert.equal(shell.querySelector('#edition-date').textContent, '最近核验 2026.10.25', 'No-JavaScript fallback must show the same edition date');
  const env = boot();
  assert.equal(env.get('#edition-date').textContent, '最近核验 2026.10.25');
  assert.equal(env.get('#result-count').textContent, '104 篇');
  for (const [category, count] of [['industry', 51], ['practice', 26], ['embedded', 27]]) {
    const counters = env.document.querySelectorAll('[data-count="' + category + '"]');
    assert(counters.length, category + ': visible counter must exist');
    counters.forEach(node => assert.equal(node.textContent, String(count), category));
  }
});


check('October 18 articles retain scoped search, exact sources, copies, bookmarks and reading-position history', async () => {
  for (const id of october18Ids) {
    const post = data.posts.find(p => p.id === id); assert(post, id);
    const env = boot();
    env.click('.mobile-categories [data-category="industry"]');
    env.click('[data-region="china"]');
    env.click('.mobile-categories [data-category="' + post.category + '"]');
    env.input(post.title);
    assert.deepEqual(visiblePosts(env), [id], id + ': title search in its category');
    assert.equal(env.get('.region-filter').hidden, post.category !== 'industry', id);
    if (post.category === 'industry') {
      env.click('[data-region="global"]'); assert.deepEqual(visiblePosts(env), [], id + ': wrong region must exclude article');
      env.click('[data-region="china"]'); assert.deepEqual(visiblePosts(env), [id]);
    } else {
      assert.equal(env.history.state.feed.region, 'china', id + ': hidden region cannot exclude practice');
    }
    const phrase = post.analysis[0].text.slice(0, 18);
    env.input(phrase); assert.deepEqual(visiblePosts(env), [id], id + ': body-only search');
    const card = env.get('#post-' + id);
    assert.equal(card.querySelector('.post-dek').textContent, post.dek, id);
    assert.equal(card.querySelectorAll('.article-section,.try-this,.source-list').length, 0, id + ': feed stays a preview');
    assert(!card.textContent.includes(post.analysis[0].text), id);
    env.scroll(460); env.tick(200);
    const snapshot = { category: post.category, region: 'china', query: phrase, savedOnly: false, scroll: 460 };
    env.click('#post-' + id + ' .post-title a'); assertView(env, 'article');
    assert.equal(env.location.hash, C.postHash(id));
    assert.equal(env.get('#article-title').textContent, post.title);
    assert.equal(env.get('#prompt-' + id).value, post.tryThis.prompt);
    assert.deepEqual(env.get('#article-view').querySelectorAll('.source-list a').map(a => a.href), post.sources.map(s => C.safeURL(s.url)), id);
    for (const source of env.get('#article-view').querySelectorAll('.source-list a')) {
      assert.equal(source.getAttribute('target'), '_blank');
      assert.equal(source.getAttribute('rel'), 'noopener noreferrer');
    }
    const route = env.location.href, historyLength = env.history.length;
    env.click('#article-view [data-copy-prompt]'); await env.settle();
    assert.equal(env.clipboard.at(-1), post.tryThis.prompt, id + ': complete prompt copy');
    env.click('#article-view [data-copy]'); await env.settle();
    assert.equal(env.clipboard.at(-1), route, id + ': canonical link copy');
    assert.equal(env.location.href, route); assert.equal(env.history.length, historyLength);
    env.click('#article-view [data-save]');
    assert.deepEqual(JSON.parse(env.storage.get(storageKey)), [id]);
    assert.equal(env.get('#article-view [data-save]').getAttribute('aria-pressed'), 'true');
    const reload = boot({ url: route, storage: { [storageKey]: env.storage.get(storageKey) } });
    assertView(reload, 'article'); assert.equal(reload.get('#article-view [data-save]').getAttribute('aria-pressed'), 'true');
    env.scroll(1370); env.tick(200);
    for (let repeat = 0; repeat < 2; repeat++) {
      env.back(); assertView(env, 'feed'); assertFeedSnapshot(env, snapshot); assert.deepEqual(visiblePosts(env), [id]);
      env.forward(); assertView(env, 'article'); assert.equal(env.location.href, route); assert.equal(env.window.scrollY, 1370);
      assert.equal(env.get('#article-title').textContent, post.title);
    }
    env.click('#article-view [data-save]'); assert.deepEqual(JSON.parse(env.storage.get(storageKey)), []);
    env.click('#article-view .article-return'); assertView(env, 'feed'); assertFeedSnapshot(env, snapshot);
  }
});
check('October 18 deep links and clipboard-denial fallbacks preserve complete article content', async () => {
  for (const id of october18Ids) {
    const post = data.posts.find(p => p.id === id); assert(post, id);
    for (const prefix of ['#post/', '#post=', '#article/', '#article=', '#article-']) {
      const env = boot({ url: 'https://example.test/publication/' + prefix + id });
      assertView(env, 'article'); assert.equal(env.get('#article-title').textContent, post.title, prefix + id);
      assert.equal(env.get('#prompt-' + id).value, post.tryThis.prompt, prefix + id);
      assert(env.get('#article-view').textContent.includes(post.caveat), prefix + id);
    }
    const route = 'https://example.test/publication/' + C.postHash(id);
    const denied = boot({ url: route, clipboardReject: true });
    denied.click('#article-view [data-copy-prompt]'); await denied.settle();
    assert.equal(denied.document.activeElement.id, 'prompt-' + id);
    assert.equal(denied.get('#prompt-' + id).selected, true);
    assert.equal(denied.get('#prompt-' + id).value, post.tryThis.prompt);
    denied.click('#article-view [data-copy]'); await denied.settle();
    assert.equal(denied.get('#link-dialog').open, true);
    assert.equal(denied.get('#link-input').value, route);
    assert.equal(denied.location.href, route); assert.deepEqual(denied.clipboard, []);
  }
});


check('October 18 additions separate dated sources, fresh verification and unexecuted learning exercises', () => {
  const sourceURLs = {
    'deepseek-search-fetch-evidence': [
      'https://api-docs.deepseek.com/updates/',
      'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017',
      'https://api-docs.deepseek.com/api/search/',
      'https://api-docs.deepseek.com/guides/search/',
      'https://api-docs.deepseek.com/quick_start/pricing/'
    ],
    'airbnb-incremental-support-notes': [
      'https://aclanthology.org/2025.emnlp-industry.140/',
      'https://aclanthology.org/2025.emnlp-industry.140.pdf',
      'https://arxiv.org/abs/2510.06677',
      'https://aclanthology.org/2025.emnlp-industry.135.pdf',
      'https://airbnb.tech/ai-ml/eval-driven-development-lessons-from-evaluating-genai-at-scale/'
    ]
  };
  for (const id of october18Ids) {
    const post = data.posts.find(p => p.id === id); assert(post, id);
    assert.equal(post.verifiedAt, '2026-10-18'); assert.equal(post.verified_date, post.verifiedAt);
    assert(post.date < post.verifiedAt, id + ': verification must not become publication date');
    assert(post.tags.includes('待学习')); assert(post.evidence.includes('未')); assert(post.maturity.includes('待学习'));
    assert(post.analysis.length >= 10, id + ': full teaching body');
    assert(post.analysis.map(s => s.text).join('').length >= 1400, id);
    assert(post.tryThis.prompt.length >= 600 && post.tryThis.expected.length >= 100, id + ': complete reusable exercise');
    assert.deepEqual(post.sources.map(s => s.url), sourceURLs[id]);
    assert.equal(new Set(post.sources.map(s => s.url)).size, post.sources.length);
    assert(post.caveat.includes('未')); assert(post.caveat.includes('合成练习'));
    assert(post.tryThis.prompt.includes('不编造') || post.tryThis.prompt.includes('不把本练习数字写成实测结果'), id);
    assert.deepEqual(post.paragraphs, post.summary); assert.deepEqual(post.takeaways, post.steps); assert.equal(post.limitations, post.caveat);
    const serialized = JSON.stringify(post);
    for (const prohibited of ['/workspace/', 'sandbox:', '私有项目', '已经掌握', '本站实测成功']) assert(!serialized.includes(prohibited), id + ': ' + prohibited);
  }
  const deepseek = data.posts.find(p => p.id === october18Ids[0]);
  const airbnb = data.posts.find(p => p.id === october18Ids[1]);
  assert.deepEqual([deepseek.category, deepseek.region, deepseek.kind, deepseek.date], ['industry', 'china', 'news', '2026-10-17']);
  assert.equal(deepseek.dateLabel, '官方更新日志日期');
  assert.deepEqual([airbnb.category, airbnb.region, airbnb.kind, airbnb.date], ['practice', 'global', 'guide', '2025-10-08']);
  assert.equal(airbnb.dateLabel, '主要论文预印本首次发布日期');
  assert(airbnb.summary.join('').includes('不是新品发布'));
  assert(airbnb.sources.some(s => s.title.includes('2025-10-09')));
  assert(airbnb.sources.some(s => s.title.includes('2025年11月')));
  assert(airbnb.sources.some(s => s.title.includes('未显式列出发布日期')));
});
check('DeepSeek addition keeps search evidence, successful-request billing and future pricing scope distinct', () => {
  const post = data.posts.find(p => p.id === 'deepseek-search-fetch-evidence');
  const body = post.analysis.map(s => s.text).join('\n');
  for (const term of ['V4.1-Flash-1017', 'deepseek-flash', '调用方式和模型价格不变', 'DeepSeek 自报',
    'MIT', '不能从权重许可推导搜索索引也已公开', 'need_content 默认是 false', '日期字段允许未知',
    '403', '404也可能表示正文无法提取', '访问限制', '每千次成功请求0.75美元',
    '2026年11月1日北京时间00:00', '未来安排', '只适用于页中注明的 DeepSeek 调用范围',
    'HTTP 200', '结果数组非空', 'Fetch 返回正文', '失败、空搜索结果和超时不计费']) assert(body.includes(term), term);
  assert(post.caveat.includes('未发起真实模型、Search 或 Fetch 请求'));
  assert(post.caveat.includes('不表示所有 Claude Code 或 Codex 搜索都采用该服务'));
  assert(post.caveat.includes('不能外推到搜索服务、搜索索引或网页内容'));
  assert(post.caveat.includes('不是实际产品结论、调用记录或账单'));
  const requests = [
    { id: 'S1', status: 200, results: ['A', 'B'] },
    { id: 'S2', status: 200, results: [] },
    { id: 'F1', status: 200, content: '给定正文' },
    { id: 'F2', status: 404, content: '' },
    { id: 'S3', status: 200, results: ['C'] }
  ];
  const billed = requests.filter(r => r.status === 200 && (r.results ? r.results.length > 0 : !!r.content));
  assert.deepEqual(billed.map(r => r.id), ['S1', 'F1', 'S3']);
  assert.equal((billed.length * 75 / 100000).toFixed(5), '0.00225');
  assert(post.tryThis.expected.includes('S1、F1、S3，共3次'));
  assert(post.tryThis.expected.includes('0.00225美元，未包含模型等成本'));
  assert(post.tryThis.expected.includes('S2为空、F2失败均不计费'));
  for (const term of ['不联网', '不调用API', '不安装软件', '不上传日志', '不连接设备', '日期未知',
    '不适用其他入口的免费期', '不把404改写成文章不存在', '不要为C补日期']) assert(post.tryThis.prompt.includes(term), term);
  assert(post.tryThis.expected.includes('Linux x86_64预览版'));
  assert(post.tryThis.expected.includes('明确不支持烧写'));
  assert(post.tryThis.expected.includes('不能证明正式支持Windows'));
  assert(body.includes('网页提供的操作要求，不是读者已经授权的动作'));
  assert(body.includes('本文仅提出验收方案，所有执行结果保持待验证'));
});
check('Airbnb addition preserves human corrections, quasi-experimental attribution and unresolved handoff states', () => {
  const post = data.posts.find(p => p.id === 'airbnb-incremental-support-notes');
  const body = post.analysis.map(s => s.text).join('\n');
  for (const term of ['全量交互历史及已接受笔记', 'Mixtral-8×7B', 'DeBERTa', '无新信息可返回空', '不意味着只发送最新一句',
    '即时保存并带入后续提示', '只让明确改善的样本参与训练', '人的改写未必更好',
    '处理时间下降3%', '双重差分准实验', '对照组仍在会话结束时生成摘要',
    '上线前三个月与后一个月', '不是随机A/B', '过滤让笔记更短，却降低了完整性',
    '不是上面笔记系统的同一次实验', '40名服务美国用户', '异步消息', '超过5,000个案例',
    '本文没有运行两种方案', '不把公司3%的结果当成本地目标']) assert(body.includes(term), term);
  for (const term of ['准实验而非随机A/B', '另一项试点', '不能与笔记系统合并成一个部署证据',
    '未运行模型、训练系统或接触真实客服数据', '合成练习', '待学习']) assert(post.caveat.includes(term), term);
  for (const id of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'N1', 'N2']) assert(post.tryThis.prompt.includes(id), id);
  for (const term of ['不连接账号', '不发送消息', '不操作真实工单', '四轮', '北京时间',
    '保留稳定编号、来源ID、当前状态', '没有有价值的新信息时允许无更新', '未提供任何已收到截图的记录',
    '没有作者和日期', '不要把所有编辑都当成训练真值', '不声称Airbnb采用同一数据结构']) assert(post.tryThis.prompt.includes(term), term);
  for (const term of ['按钮已恢复', '09:00之后记录缺失仍待调查', '16:00前只承诺调查进展',
    'N2人工修正保留', '感谢不生成多余条目', '截图仍待用户提供',
    '17:00只能标记冲突待核实，不能覆盖承诺', '不编造已解决、已收到、已测试或效率收益']) assert(post.tryThis.expected.includes(term), term);
  assert(body.includes('事实冲突、来源缺失或重要承诺不清时，先停在待确认'));
  assert(body.includes('不要把真实客户记录直接用作练习'));
});


const october18Scenes = {
  "deepseek-search-fetch-evidence": {
    "kind": "searchfetch",
    "title": "候选链接先打开，证据和费用再分开记",
    "labels": [
      "Search 找候选",
      "Fetch 读正文",
      "出处与日期逐项核对"
    ],
    "status": [
      "Search 返回候选链接与摘要；结论还要回到 Fetch 取回的正文。",
      "核对原始发布日期、适用范围与原文；证据不足就保留待核。",
      "成功且有结果的请求才进入计费口径；免费期按入口核对，模型 tokens 另记。",
      "图中是合成练习的查证路径，本刊未调用接口或验证模型效果。"
    ],
    "notes": 4,
    "runners": 4,
    "svgElements": 77,
    "sha256": "a85c43e589807cbf631ffd3c58bfad24e6f841b85e79ad5ddfba33bef58bc6cf"
  },
  "airbnb-incremental-support-notes": {
    "kind": "supportnotes",
    "title": "保留人工修订，只把新事实追加到笔记",
    "labels": [
      "旧笔记 + 历史和新消息",
      "候选增量先过滤",
      "检查修改后再离线复用"
    ],
    "status": [
      "新消息触发候选增量；提示含全量历史与人工修订笔记，再过滤无关或重复条目。",
      "新增事实追加到原记录，重复消息不追加，未解决事项继续保留。",
      "人工修改先经过检查，再决定能否离线复用；修改不自动成为标准答案。",
      "这是对公司 2025 年实践的原创示意，不是其客服界面或本站复现。"
    ],
    "notes": 4,
    "runners": 4,
    "svgElements": 65,
    "sha256": "2a6612e4c229e677618be3fa1dee15f80018aee4666cb0a0f2c94b1baf7f14dd"
  }
};
check('October 18 native scenes retain exact labels, four readable notes and offscreen/reduced-motion boundaries', () => {
  const env = boot({ observer: true });
  for (const id of october18Ids) {
    const spec = october18Scenes[id], post = data.posts.find(p => p.id === id), node = env.get('#visual-' + id);
    assert(node.classList.contains('motion-scene')); assert(node.classList.contains('fv-' + spec.kind));
    assert.equal(node.querySelector('.fv-heading strong').textContent, spec.title);
    assert.deepEqual(node.querySelectorAll('.fv-labels span').map(x => x.textContent), spec.labels);
    assert.deepEqual(node.querySelectorAll('.fv-note-transcript li').map(x => x.textContent), spec.status);
    assert.equal(node.querySelector('.fv-note-transcript').getAttribute('aria-label'), '图解要点');
    assert.equal(node.querySelector('.fv-note-transcript').getAttribute('aria-hidden'), null);
    assert.equal(node.querySelector('.fv-note-window').getAttribute('aria-hidden'), 'true');
    assert.equal(node.querySelector('.fv-note-window').getAttribute('data-note-count'), '4');
    const notes = node.querySelectorAll('.fv-note'); assert.equal(notes.length, 4);
    notes.forEach((note, i) => {
      assert(note.textContent.includes(spec.status[i]));
      assert(note.getAttribute('style').includes('animation-delay:-' + ((4 - i) * 6) + 's'));
    });
    assert.equal(node.querySelectorAll('.fv-flow-runner').length, 4);
    assert.equal(node.querySelectorAll('button,[role="button"],[tabindex],[aria-live],[data-demo],animate,animateTransform').length, 0);
    assert.equal(node.querySelector('.fv-caption').textContent, '原创流程示意，非官方演示或实测结果');
    const svg = node.querySelector('svg');
    assert.equal(svg.getAttribute('aria-hidden'), 'true'); assert.equal(svg.getAttribute('focusable'), 'false');
    const scope = { window: {} }; vm.runInNewContext(visuals, scope);
    const output = scope.window.FieldnoteVisuals.render(post);
    assert.equal(sha256(output), spec.sha256, id + ': reviewed original scene');
    assert.equal([...output.match(/<svg[\s\S]*<\/svg>/)[0].matchAll(/<(?!\/)[a-z][^>]*>/g)].length, spec.svgElements);
    assert.equal(node.classList.contains('is-visible'), false);
    assert(env.observers[0].targets.has(node));
    env.observers[0].callback([{ target: node, isIntersecting: true }]); assert(node.classList.contains('is-visible'));
    env.observers[0].callback([{ target: node, isIntersecting: false }]); assert(!node.classList.contains('is-visible'));
    env.click(node); assertView(env, 'feed'); assert.equal(env.history.length, 1);
    const reduced = boot({ reducedMotion: true, observer: true, url: 'https://example.test/publication/' + C.postHash(id) });
    assertView(reduced, 'article'); assert(reduced.document.body.classList.contains('motion-paused'));
    const staticScene = reduced.get('#article-view #visual-' + id);
    assert.deepEqual(staticScene.querySelectorAll('.fv-note-transcript li').map(x => x.textContent), spec.status);
    assert.equal(staticScene.querySelectorAll('button,[aria-live],[data-demo]').length, 0);
    reduced.reduce(false); assert(!reduced.document.body.classList.contains('motion-paused'));
    reduced.reduce(true); assert(reduced.document.body.classList.contains('motion-paused'));
    assert.deepEqual(staticScene.querySelectorAll('.fv-note-transcript li').map(x => x.textContent), spec.status);
  }
  assert(visualCSS.includes('.fv-note-window[data-note-count="4"] .fv-note {animation:fv-note-quartet 24s ease-in-out infinite;}'));
  assert(visualCSS.includes('@media (prefers-reduced-motion:reduce), print'));
  assert(visualCSS.includes('body.motion-paused .fv-note-window {display:none;}'));
  assert(visualCSS.includes('.fv-visual.motion-scene .fv-animated {animation-play-state:paused;}'));
});

/* October 19 selective maintenance: 53 previously published records stay exact. */
const october19Ids = ['meta-forum-state-verification', 'mathworks-ears-mapping-review'];
const october19Baseline = {"posts":{"deepseek-search-fetch-evidence":"2291b77e9a0707f2fce5e3223b645ea074a0f5f90c12c76231e94bde6d0445cf","airbnb-incremental-support-notes":"a63251a541273660582a8309b3155b77b76d8506e3718136753d07a6d4965d83","spotify-honk-verification-rollout":"42630f3308bb29ff8683b001e5fd89c0aa68202c15e8ba56d69e0087c10c4584","uber-autocover-test-acceptance":"ab12b8b0bd882a088c67e8e0f6fc5306e6fcd6cf1b4eb2d19202186fdd60019e","scania-spec2code-contract-gap":"9e54ac029dc40dc9e5e90e28d932ea6561118b23af4d360f364ab00c4cda8368","prompt-to-voice-reusable-brief":"8ce23fe19a2edd011766d1e38ced13999c267f6a6c1e0ae1dd5653dedf3fff1f","kling4-long-take-control":"420dfc75a0dbb710ffc1a546f55e5528d49d802ee1bfdd5b400d82289397cd66","decision-switching-threshold":"6a4ed9103895bec78038e3addd3affb50d33184316e16c6aaa4ccf5730b20ae4","learning-short-answer-hint-retest":"501579a24f0049aa7633b3a0c22fa7dc338a58acf82e5e597a55215d1bb44670","firmware-memory-delta-audit":"583d85b92957ebe0492869f532049fb595cd5eedbe784a5768e6d78d48deb922","opus55-fast-access":"5d343d3fb4f55de41b1ad13e273f1eef4f6b4f5a2d8579101d124bce430d8000","gptlive11-voice-corrections":"bc3b9993d381c6ca67bd1e601d7bf4d4a1c95d4cace11f03b4097f67fbbb21db","gemini4-argon-long-work":"121484ce1ee9148c2f7be640371a62f9cfba446c9cdb89ca8cab5446e873ecb0","runway-kling-api-workflow":"52b0018ad273e00a3f6af7862bdaa9f18207c16087737e1a83beb0199645990f","glm-legal-evidence-chain":"9da204d02ab84f8eb48a10f2af265f48759150c5844ef9e34be111d0234d8f4c","qwen-image21-api-alpha":"1e81ecb9ec1498e575ba292c96ade9342fcbc1fd892a0e23d88c62c5e854847d","gpt6-intelligent-ui":"5c9657cf1aaa75195a7c6ca9a419ed9f5c946dae43fd2e929f7cb219def47d11","haiku55-subagent-budget":"40589281778639c45c81447e065e3830efcbe09fe52cd9a3e2604707e5257c35","nano-banana21-continuity":"ab6cb4de6fb4fab6eb5b81028cdd2857bd5971e610074302afc9ee2b27cd618e","embeddinggemma2-local-retrieval":"5cd94802e402edfab230b73e19ee6b0dffeb3eb26d778cd37f907ede67e3c301","mistral-large4-preview":"74d300fc34b328dc749a34aec19c0ac87e0ec4220688eca5a0b702298f05a44f","mplab-agent-telemetry-pacing":"f23ee6f7a452db4833c4f3f58ff69b49aa8811cf8e2f134e288acbe7514631a4","memfault-crash-evidence-chain":"19b9006fd5e592f9efd3fd0332950afcf45a8195884f062d42fdd52c0ff9e69f","assertllm2-rtl-property-review":"b6d87a487535fb842ad4908bcd1bc08b35004d4c2c8a8f199d5da40a1cd59a39","firment-waveform-evidence":"affb6bfa3bdb4778904f9133b4a3a4fab2fb4190b29b0c15bde31b05095800f1","cantools-ai-wire-contract":"e2d91e4db45b36d183823818262761687888da7b3e9b52dd6b34e2aebcf88135","minicpm-local-image-check":"fd0add86b8ae410daf0349b44d383d17df575eb0d1d69ab111d26fe04a5714b7","sensor-unknown-state-gmm":"3b4eac0dd79fb5970aed643285a55a7bfe0cf27c58567093353906e8bd4e8d3f","sol-quality-cost":"f53d3c7c9d9c8b8b75da105a631a8a74df7ceaf105b77adf03ffad445b882b6a","deepseek-v41-migration":"05ea75bf12ecfaf87c4ba8bfb4a84fcdf41deeec532bbdab6ba13efc7698b376","qwen-omni-evidence":"220ef0f3c13e3f04c6b332933a303feb528d06e1458ec410510e4b0924f9c359","images25-edit-brief":"3baf2ae3963446ddc58573af93650d0815cfdb24ba9287d5022927e03dd73dff","renode-replay-lab":"bbc451336852b1abd4d491dfab43c79cc5fac6719bcefeece8304947508aa261","firmware-fuzz-harness":"52204b6f516e75ca58f3ecb7b9154fe9d30bd698d9ff29ab865f12c5ced39058","debug-probe-mcp":"063fa655a3e4838d61f72683df248a15fe8e0c7185fc909684d4c986a7fece58","datasheet-register-audit":"7ad32920da96b7456f3c19971fa940a7528e0338609da7bd07886c53fd7ea708","stm32-edge-ai-budget":"819ad707afc2051fe064ce466d246159ef51d35dec3c2cd3ded40d6666908811","firmware-agent-contract":"146a2eadf17defae9c0266ea2d82e35dd33eb6b480fc3a8a2ca32f262d4a62a9","context-task-eval":"8c96cdbc3b373c90733bc5b218854baa24f99c9e6043ad19d2f3b76d34c86095","espressif-mcp-workflow":"90b01873f620cb39f7e0040e56ea68e6881489c0ccc4d1b214f97ef95573e628","playwright-mcp-boundary":"cb62e3ed8797602aa5df5717d7abb4cde1d87a57981ce342a881c6643a2dcea5","skills-license-eval":"de1ddf6ab2990d2887a2a3324d7a2a6b90012a4f13121d7ff4759408523356d8","embedded-regression-copilot":"3d1ff145b4ddef0c06132990ee8f6c7ac18b2243e34e89cda1b3be8b01f00211","document-style-pipeline":"6d85313adc53f5a592474f69acdb78ce4164c63492147baa7a117f6ffc7d110a","dot-meeting-brief":"1e1e08ae0719a820459a68a4a0ef0356e3dd37570b4b2cf224041cf7a5f533b2","dot-bounded-follow-up":"76111ec1587cae86e39d500343d2945d973f5b958dd0586347950ed163a42478","dot-change-request":"73bdc58095365cb1c20fb099a3a0a8f2dc84bd45988efbc55cd4fc8735d6fbd1","research-conflicting-sources":"7f426c4e27e151214b91384b022eaa1e8063019ca554fc1c53e1a2a0fd8c8923","writing-two-examples":"08492c0f960d7d9c49a7fdabb6eec727741e85032cc143497b317ec43cd0d522","orders-cleaning-audit":"f043208c83891bb78919dd894df9af97f87ec06b1d528a020134cdaa80631828","image-edit-invariants":"db530d20a56191678834b869b084f8d5237047b21363e8408f81bedf6d1df94b","video-learning-evidence":"d0cd75374d542553b4bd74f3bbc76dd7d44bd30435a0b0cff3fe20f2838d0963","codex-small-fix-loop":"d1182d94cd77032b8a7c49962a91661e5928f09dac1410ba622d20449681c7e8"},"scenes":{"deepseek-search-fetch-evidence":"a85c43e589807cbf631ffd3c58bfad24e6f841b85e79ad5ddfba33bef58bc6cf","airbnb-incremental-support-notes":"2a6612e4c229e677618be3fa1dee15f80018aee4666cb0a0f2c94b1baf7f14dd","spotify-honk-verification-rollout":"2ab648ae586ac7ce173dcc69e8e99362591f4565b7509eaf3a0af9e3498a29f2","uber-autocover-test-acceptance":"93cb45b55189d9e5539e191019eea33ee79bddf9dd7f4fc559a0a366d87c64bc","scania-spec2code-contract-gap":"42d1910826736a2d1e2359f77ee61e98d8bae4ab3f95cc1aa2760653e20a9833","prompt-to-voice-reusable-brief":"084110d9ee279bbf11af4b441f802b9b3a8a725c7d20eaf6d9284dfa39f61cd1","kling4-long-take-control":"62799f892ec6b3cf79330c3751fe5bc81c2a84ad54e7ddd95e311b832f17ee0a","decision-switching-threshold":"7903838acfab4640dc450e4475012fbc8d3575f13376079c4c37f1500883da0a","learning-short-answer-hint-retest":"83adb4a7bcb3a63d10449657d7f34aae6071091c84382fc8e075d1cc5cd92323","firmware-memory-delta-audit":"e2757f410a9fdc59f1fa8b3f1a64e3ba29ff96500794fb9c9441979acd8be345","opus55-fast-access":"4adf26b679bcc54f022f95b4fe8ce05a12ad5659b40150003386a205242dc3a2","gptlive11-voice-corrections":"90a546fb4fc93f4e703e55a6319ba8742ff3920fa5bbbc36b8dcfd6684577dc6","gemini4-argon-long-work":"3f5357476daa50f9dae14e6dffa4e358b25f492b88db72b88bb4fcbd2ab18bf1","runway-kling-api-workflow":"ec96e7d3ed9c9eb159b9b2756791c6906707497d216110310da7a543b7cc2054","glm-legal-evidence-chain":"0847157a51d87c38680a1883fcded1cb186acd2f5cfdf4b99964dceeab23ef16","qwen-image21-api-alpha":"8ecb0f5e3e13e7ee8d5ae178f53b558f52004cf253f5bbc77e0a6cd994453791","gpt6-intelligent-ui":"b25e050a79bcc2a4a89b2a2980645ae06d74d03b586fdc4e4b0b0f36b89af766","haiku55-subagent-budget":"13cf6a2089f016c3ce1f0114f0ddb57d76077047f1df51fb3a323bec3704efc4","nano-banana21-continuity":"7360b9df5dbc06c7de72f27cdb2bb978ebe64c9f6d5d1cf7c640c081cadb5d93","embeddinggemma2-local-retrieval":"1c15811ae86029d28cf952201672d302e49313d5685b4d1bf3264442b075cb7e","mistral-large4-preview":"eef9211bdf2841306f03d4255f5536529d2712a0b87fdc349f7345a33b249e96","mplab-agent-telemetry-pacing":"98f7942e28b93b416bd5fb1a01189da287770e79f19b19b9ffe7811f7f4aeea9","memfault-crash-evidence-chain":"589792d5a3a877b4dd874d149996ce639c571c340ddcc31e71645e2d42b222c9","assertllm2-rtl-property-review":"e91f5ee4397da1789fa5343cb2adbc92c0daadd38df6cf6edf7a2ac1a7ed0a9d","firment-waveform-evidence":"47e4d63c6cc4715350747ebc0d96ddaeeccd22c10ddef67298d50328b8a3cd41","cantools-ai-wire-contract":"be2a8be95077dfc14460ce8d63348efb55fbe8b1689cc51e6e3252596cfa31fc","minicpm-local-image-check":"fa17a45f81ee28c814e29c26d199cc8755d082856373289c73671e071875cb12","sensor-unknown-state-gmm":"2a249413d4e9ab7d75f558b93234c16ebe2e78505a5eeadd992094aa3eed7c3a","sol-quality-cost":"21ac08e4a30889f92d381fa976e7f9eb05a33efa05c444f3afaed743c986649e","deepseek-v41-migration":"c552e257157ccebf462c5d2de48023234cebcf5f38861ca937e78dcdfdf2e790","qwen-omni-evidence":"253ecdbfa2c0dea216716d0be36a7381b1f70652f31638785a4178ed713f3ee0","images25-edit-brief":"ba77c9ee45199dfcaf0bca9cd9f31438ee82d06766a092731add3035bec0b9c2","renode-replay-lab":"02529004caba1c922ab3d690b3aad588fab1ca33eae0daef85b89c3f56511a99","firmware-fuzz-harness":"089f5a9ebdf188ab3e4575eab1f5c756732aadb3177952f01431567c8fd7f4d3","debug-probe-mcp":"ca23b159b62c8fdf7ab35ebec262ffe31fe11b3dd941e631cb2dd1de06ab432f","datasheet-register-audit":"ac50c025ad093bba38ff389df2334f5f29e01fc87ad0ee97aebf1d427ecf5701","stm32-edge-ai-budget":"3463da3b40663b7296560028a5b8af5e3efcd084d6ebe3cc47f397b89327896f","firmware-agent-contract":"cf9dbbe92d84749fb634e26345b8b5e72c7a5ca1dcefb74e320a94dd18b3029f","context-task-eval":"4cf4541762a4b088e7f4011943066ecf25c12ab4115ffb51c12e582f06cf30f9","espressif-mcp-workflow":"63fa25ccd1534820f5899d41ca7a0116fc39e57b7d519f5dde0ba1d07dc68a96","playwright-mcp-boundary":"d13701f012853926a1c127ccd36325b94083ade013acf0ac06971e8b95d6a6ed","skills-license-eval":"de41448284606b587eb01f3f52467148abfe329eb4afb64f7095d6de51652553","embedded-regression-copilot":"0d8d2283b73273ccc9a7d3796502bcc1829e51c11901f43981694c80d21ac2ea","document-style-pipeline":"6e4abe39ece7436424ab728a07da99038cb267dd0f0c08c91806354f13c07b75","dot-meeting-brief":"4a18fe99ee18228ac2ea8dd08c7d06816bbc7dd475642a09df71b664289f3e34","dot-bounded-follow-up":"84e7fc7f83600649ed9d672287d8dfd0cc33ffdecae66cd7a7e5a0340e789eb3","dot-change-request":"2d78da6f25d6ea5d47d3067a5d597d8e304b41602a0321d27c90e9d2daf8cc73","research-conflicting-sources":"f2ddf755914405abf96632ad8b54e6353f492322f3d36384bade89dbabb505e2","writing-two-examples":"fda4d9625c4a38559a612483510673de3a65cb0f28478f943f5f3e8bb8addd10","orders-cleaning-audit":"eac249de66543c18ca22b17f9a961174a336d9db5bed9a69d4498fbf2c61cef6","image-edit-invariants":"8fbc5aaee484a75ba7f90badfee66feefcb16c4eea375ed91be3cb8c9ec69b02","video-learning-evidence":"fe6f5a20880ffcc649a26c4ec6cf8a01bef309ce178247c6757ddb7c44a986d0","codex-small-fix-loop":"97e754ab244ea90773db163c6b8959f96f555cd1ba2234d015455d6cdb27f670"},"files":{"app.js":"3f11837199a84b29e606682c4b88a17632fea212e8cabad2eab2570564305157","site-core.js":"b4f96a7f0557c322c3c2e42cfcf14d1545585d06420cfc1147c03bc5b7b33589","style.css":"5e159c776246dcd48bf52117e649feb7250bbffb9f49a707bbb2d9b3cf3c5c8b","visuals.css":"7cf30aa521f1fe9e7589608376199737cb797efc3ab2a63799c97d7ac0d4d00d","build.py":"25deb0b707c7e7ae97e1306b94afcab5d0156c8a7ff8495a980140e4ebb2f524","favicon.svg":"b33e38910db7f167eb595800e4fa779577885204e090115732215704f1be1db5","DESIGN.md":"23cb37aa5f8c5df788d9587f03e8e2b01a2b955f5d26b4862e7f1dc5439e5a96","THIRD_PARTY_NOTICES.md":"e10fafb73c4164f3cc2f5350a0ec70c500ab6417cc935a9140b69e49b74daf60"}};
check('October 19 preserves every approved post, source date, native scene and design asset', () => {
  assert.equal(data.posts.length, 104);
  assert.deepEqual(data.posts.slice(49, 51).map(p=>p.id), october19Ids);
  assert.deepEqual(data.posts.slice(51).map(p=>p.id), Object.keys(october19Baseline.posts));
  assert.equal(Object.keys(october19Baseline.posts).length, 53);
  for (const [id,hash] of Object.entries(october19Baseline.posts)) {
    const p=data.posts.find(p=>p.id===id); assert(p,id);
    assert.equal(sha256(JSON.stringify(beforeOctober25(p))),hash,id+': published editorial object');
    const scope={window:{}}; vm.runInNewContext(visuals,scope);
    assert.equal(sha256(scope.window.FieldnoteVisuals.render(p)),october19Baseline.scenes[id],id+': published scene');
  }
  for(const [file,hash] of Object.entries(october19Baseline.files)) assert.equal(sha256(read(file)),hash,file);
  assert.deepEqual(['industry','practice','embedded'].map(c=>data.posts.filter(p=>p.category===c).length),[51, 26, 27]);
  assert.equal(data.site.verifiedAt,'2026-10-25');
  assert.notEqual(assertReleaseCoherence(index),'20261017r1-6ea504d2e738');
});
check('October 19 articles maintain full original exercises and bounded source evidence', () => {
  for(const id of october19Ids){
    const p=data.posts.find(p=>p.id===id); const text=JSON.stringify(p);
    assert.equal(p.verifiedAt,'2026-10-19');assert.equal(p.verified_date,p.verifiedAt);
    assert.equal(p.kind,'guide');assert(p.tags.includes('待学习'));assert(p.evidence.includes('本站'));
    assert(p.analysis.length>=8);assert(p.sources.length>=3);assert.equal(p.steps.length,4);
    assert(p.tryThis.prompt.length>500);assert(p.tryThis.expected.length>130);
    assert(p.caveat.includes('合成'));assert(p.caveat.includes('未'));
    for(const value of ['/workspace/','sandbox:','私有项目','内部用户','已经掌握','本站实测成功'])assert(!text.includes(value),id+': '+value);
    assert.deepEqual(p.paragraphs,p.summary);assert.deepEqual(p.takeaways,p.steps);assert.equal(p.limitations,p.caveat);
  }
  assert.equal(data.posts.find(p=>p.id===october19Ids[0]).date,'2026-10-15');assert.equal(data.posts.find(p=>p.id===october19Ids[1]).date,'2026-10-13');
  assert.equal(data.posts.find(p=>p.id===october19Ids[0]).category,'practice');assert.equal(data.posts.find(p=>p.id===october19Ids[1]).category,'embedded');
});
check('Meta exercise separates screen/version evidence, production isolation and unmeasured memory claims', () => {
  const p=data.posts.find(p=>p.id===october19Ids[0]);const body=p.analysis.map(s=>s.text).join('\n');
  for(const term of ['Meta 自报','八周','大致减半','推进目标','未取得内部代码','GroupHome','HomeFeed','C17','C16','PrototypeSearch','不能判定泄漏'])assert(body.includes(term),term);
  assert(p.tryThis.prompt.includes('prototypeEntry=false'));
  for(const term of ['U1版本不符','U2页面不符','U3缺返回检查','U4','1/4（25%）','不是修复成功率','不能宣布已发布'])assert(p.tryThis.expected.includes(term),term);
  assert.equal([{v:'C16',page:'group',returned:true},{v:'C17',page:'home',returned:true},{v:'C17',page:'group',returned:false},{v:'C17',page:'group',returned:true}].filter(x=>x.v==='C17'&&x.page==='group'&&x.returned).length,1);
  assert(p.caveat.includes('不证明Meta使用相同工具'));
});
check('October 19 details preserve routes, prompts, sources, bookmarks and history', async () => {
  for(const id of october19Ids){
    const p=data.posts.find(p=>p.id===id);const env=boot({observer:true});
    env.click('[data-category="'+p.category+'"]');
    assert(env.get('.region-filter').hidden);
    const before=env.location.href;
    env.click('#title-'+id+' a'); assertView(env,'article');
    assert.equal(env.get('#article-title').textContent,p.title);
    const detail=env.get('#article-view');
    assert.deepEqual(detail.querySelectorAll('.source-list a').map(a=>a.href),p.sources.map(s=>s.url));
    assert(detail.textContent.includes(p.caveat));
    assert.equal(env.get('#prompt-'+id).value,p.tryThis.prompt);
    env.click('#article-view [data-copy-prompt]'); await env.settle(); assert.equal(env.clipboard.at(-1),p.tryThis.prompt);
    env.click('#article-view [data-copy]'); await env.settle(); assert.equal(env.clipboard.at(-1),env.location.href);
    env.click('#article-view [data-save="'+id+'"]');
    assert.equal(env.get('#article-view [data-save="'+id+'"]').getAttribute('aria-pressed'),'true');
    env.click('#article-view [data-back]');assertView(env,'feed');assert.equal(env.location.href,before);
    env.forward(); assertView(env,'article'); assert.equal(env.get('#article-title').textContent,p.title);
    for(const hash of [C.postHash(id),'#post='+id,'#article='+id,'#article/'+id,'#article-'+id]){
      const direct=boot({url:'https://example.test/publication/'+hash});assertView(direct,'article');assert.equal(direct.get('#article-title').textContent,p.title);
    }
  }
});
check('October 19 scenes reuse semantic evidence motion with readable transcripts and no new controls', () => {
  const env=boot({observer:true});
  for(const id of october19Ids){
    const node=env.get('#visual-'+id);assert(node.classList.contains('fv-evidence'));
    assert.equal(node.querySelectorAll('.fv-note-transcript li').length,4);
    assert.equal(node.querySelector('.fv-note-window').getAttribute('data-note-count'),'4');
    assert.equal(node.querySelector('.fv-note-window').getAttribute('aria-hidden'),'true');
    assert(node.querySelectorAll('.fv-flow-runner').length>0);
    assert.equal(node.querySelectorAll('button,[role="button"],[tabindex],[aria-live],animate,animateTransform').length,0);
    assert(!node.classList.contains('is-visible'));env.observers[0].callback([{target:node,isIntersecting:true}]);assert(node.classList.contains('is-visible'));
    env.observers[0].callback([{target:node,isIntersecting:false}]);assert(!node.classList.contains('is-visible'));
    env.click(node);assertView(env,'feed');assert.equal(env.history.length,1);
    const reduced=boot({reducedMotion:true,observer:true,url:'https://example.test/publication/'+C.postHash(id)});
    assert(reduced.document.body.classList.contains('motion-paused'));
    assert.equal(reduced.get('#article-view #visual-'+id).querySelectorAll('.fv-note-transcript li').length,4);
    reduced.reduce(false);assert(!reduced.document.body.classList.contains('motion-paused'));
  }
});

check('MathWorks evidence keeps mapping approval, custom license, version scope and compile boundaries distinct', () => {
  const p=data.posts.find(p=>p.id==='mathworks-ears-mapping-review');const body=p.analysis.map(s=>s.text).join('\n');
  for(const term of ['R2023a','R2026a','R2026b','五项测试','19个','未执行仿真断言','关联元数据','实验性','不能称为 MIT','每条需求一个场景','需求追踪链接','不是实机测量'])assert(body.includes(term),term);
  assert(body.includes('仅限结合 MathWorks 产品和服务使用'));
  assert(body.includes('遇到单项异常时发出警告后继续'));
  assert(body.includes('末尾仍会输出整体完成信息'));
  assert(p.license.includes('不是MIT许可'));
  assert(p.caveat.includes('仓库作者自报'));
  for(const term of ['数据流','访问权限','日志留存范围'])assert(body.includes(term),term);
  assert.equal(p.sources.length,8);
  assert(p.sources[0].url.includes('/2026/10/13/'));
  for(const source of p.sources.slice(1))assert(source.url.includes('/blob/f93265a6477ea05028927530f02cd1e847c73d7e/'),source.url);
  for(const term of ['不下载','不安装','不运行MATLAB或任何代码','不连接设备','初始模式未知','采样周期10ms','R2此前有编译失败警告'])assert(p.tryThis.prompt.includes(term),term);
  for(const term of ['>700','700对应70.0°C','701对应70.1°C','actual_mode==2','不能证明持续时间及待机前提','M2需额外需求依据','E3明确无仿真及断言结果','E4不能覆盖R2失败','映射状态应待审'])assert(p.tryThis.expected.includes(term),term);
  assert.equal(700/10,70);assert.equal(701/10,70.1);assert.equal(700>700,false);assert.equal(701>700,true);
  const evidence={generated:true,compiled:true,simulated:false,assertions:null};assert(evidence.generated&&evidence.compiled);assert.equal(evidence.simulated,false);assert.equal(evidence.assertions,null);
});

const october20Ids = ["minimax-m31-flash-effort-cost", "gemini-notebook-prerender-review", "pixverse-template-slots-jobs", "gemini-october-api-retirement-window", "kimi-desktop-remote-review", "openai-low-resource-behavior-parity", "muse-beam-open-weight-deployment", "cloudflare-rule-lifecycle-review"];
const october20Baseline = {
  "posts": {
    "meta-forum-state-verification": "b626576ba51a1a0d90671b8f8638452e15d61bcc1551df500cda9d1891786779",
    "mathworks-ears-mapping-review": "9f0c7a35d005a02f769859a42bb904f08903619ed33d3e27a8eed5ed3875ef06",
    "deepseek-search-fetch-evidence": "2291b77e9a0707f2fce5e3223b645ea074a0f5f90c12c76231e94bde6d0445cf",
    "airbnb-incremental-support-notes": "a63251a541273660582a8309b3155b77b76d8506e3718136753d07a6d4965d83",
    "spotify-honk-verification-rollout": "42630f3308bb29ff8683b001e5fd89c0aa68202c15e8ba56d69e0087c10c4584",
    "uber-autocover-test-acceptance": "ab12b8b0bd882a088c67e8e0f6fc5306e6fcd6cf1b4eb2d19202186fdd60019e",
    "scania-spec2code-contract-gap": "9e54ac029dc40dc9e5e90e28d932ea6561118b23af4d360f364ab00c4cda8368",
    "prompt-to-voice-reusable-brief": "8ce23fe19a2edd011766d1e38ced13999c267f6a6c1e0ae1dd5653dedf3fff1f",
    "kling4-long-take-control": "420dfc75a0dbb710ffc1a546f55e5528d49d802ee1bfdd5b400d82289397cd66",
    "decision-switching-threshold": "6a4ed9103895bec78038e3addd3affb50d33184316e16c6aaa4ccf5730b20ae4",
    "learning-short-answer-hint-retest": "501579a24f0049aa7633b3a0c22fa7dc338a58acf82e5e597a55215d1bb44670",
    "firmware-memory-delta-audit": "583d85b92957ebe0492869f532049fb595cd5eedbe784a5768e6d78d48deb922",
    "opus55-fast-access": "5d343d3fb4f55de41b1ad13e273f1eef4f6b4f5a2d8579101d124bce430d8000",
    "gptlive11-voice-corrections": "bc3b9993d381c6ca67bd1e601d7bf4d4a1c95d4cace11f03b4097f67fbbb21db",
    "gemini4-argon-long-work": "121484ce1ee9148c2f7be640371a62f9cfba446c9cdb89ca8cab5446e873ecb0",
    "runway-kling-api-workflow": "52b0018ad273e00a3f6af7862bdaa9f18207c16087737e1a83beb0199645990f",
    "glm-legal-evidence-chain": "9da204d02ab84f8eb48a10f2af265f48759150c5844ef9e34be111d0234d8f4c",
    "qwen-image21-api-alpha": "1e81ecb9ec1498e575ba292c96ade9342fcbc1fd892a0e23d88c62c5e854847d",
    "gpt6-intelligent-ui": "5c9657cf1aaa75195a7c6ca9a419ed9f5c946dae43fd2e929f7cb219def47d11",
    "haiku55-subagent-budget": "40589281778639c45c81447e065e3830efcbe09fe52cd9a3e2604707e5257c35",
    "nano-banana21-continuity": "ab6cb4de6fb4fab6eb5b81028cdd2857bd5971e610074302afc9ee2b27cd618e",
    "embeddinggemma2-local-retrieval": "5cd94802e402edfab230b73e19ee6b0dffeb3eb26d778cd37f907ede67e3c301",
    "mistral-large4-preview": "74d300fc34b328dc749a34aec19c0ac87e0ec4220688eca5a0b702298f05a44f",
    "mplab-agent-telemetry-pacing": "f23ee6f7a452db4833c4f3f58ff69b49aa8811cf8e2f134e288acbe7514631a4",
    "memfault-crash-evidence-chain": "19b9006fd5e592f9efd3fd0332950afcf45a8195884f062d42fdd52c0ff9e69f",
    "assertllm2-rtl-property-review": "b6d87a487535fb842ad4908bcd1bc08b35004d4c2c8a8f199d5da40a1cd59a39",
    "firment-waveform-evidence": "affb6bfa3bdb4778904f9133b4a3a4fab2fb4190b29b0c15bde31b05095800f1",
    "cantools-ai-wire-contract": "e2d91e4db45b36d183823818262761687888da7b3e9b52dd6b34e2aebcf88135",
    "minicpm-local-image-check": "fd0add86b8ae410daf0349b44d383d17df575eb0d1d69ab111d26fe04a5714b7",
    "sensor-unknown-state-gmm": "3b4eac0dd79fb5970aed643285a55a7bfe0cf27c58567093353906e8bd4e8d3f",
    "sol-quality-cost": "f53d3c7c9d9c8b8b75da105a631a8a74df7ceaf105b77adf03ffad445b882b6a",
    "deepseek-v41-migration": "05ea75bf12ecfaf87c4ba8bfb4a84fcdf41deeec532bbdab6ba13efc7698b376",
    "qwen-omni-evidence": "220ef0f3c13e3f04c6b332933a303feb528d06e1458ec410510e4b0924f9c359",
    "images25-edit-brief": "3baf2ae3963446ddc58573af93650d0815cfdb24ba9287d5022927e03dd73dff",
    "renode-replay-lab": "bbc451336852b1abd4d491dfab43c79cc5fac6719bcefeece8304947508aa261",
    "firmware-fuzz-harness": "52204b6f516e75ca58f3ecb7b9154fe9d30bd698d9ff29ab865f12c5ced39058",
    "debug-probe-mcp": "063fa655a3e4838d61f72683df248a15fe8e0c7185fc909684d4c986a7fece58",
    "datasheet-register-audit": "7ad32920da96b7456f3c19971fa940a7528e0338609da7bd07886c53fd7ea708",
    "stm32-edge-ai-budget": "819ad707afc2051fe064ce466d246159ef51d35dec3c2cd3ded40d6666908811",
    "firmware-agent-contract": "146a2eadf17defae9c0266ea2d82e35dd33eb6b480fc3a8a2ca32f262d4a62a9",
    "context-task-eval": "8c96cdbc3b373c90733bc5b218854baa24f99c9e6043ad19d2f3b76d34c86095",
    "espressif-mcp-workflow": "90b01873f620cb39f7e0040e56ea68e6881489c0ccc4d1b214f97ef95573e628",
    "playwright-mcp-boundary": "cb62e3ed8797602aa5df5717d7abb4cde1d87a57981ce342a881c6643a2dcea5",
    "skills-license-eval": "de1ddf6ab2990d2887a2a3324d7a2a6b90012a4f13121d7ff4759408523356d8",
    "embedded-regression-copilot": "3d1ff145b4ddef0c06132990ee8f6c7ac18b2243e34e89cda1b3be8b01f00211",
    "document-style-pipeline": "6d85313adc53f5a592474f69acdb78ce4164c63492147baa7a117f6ffc7d110a",
    "dot-meeting-brief": "1e1e08ae0719a820459a68a4a0ef0356e3dd37570b4b2cf224041cf7a5f533b2",
    "dot-bounded-follow-up": "76111ec1587cae86e39d500343d2945d973f5b958dd0586347950ed163a42478",
    "dot-change-request": "73bdc58095365cb1c20fb099a3a0a8f2dc84bd45988efbc55cd4fc8735d6fbd1",
    "research-conflicting-sources": "7f426c4e27e151214b91384b022eaa1e8063019ca554fc1c53e1a2a0fd8c8923",
    "writing-two-examples": "08492c0f960d7d9c49a7fdabb6eec727741e85032cc143497b317ec43cd0d522",
    "orders-cleaning-audit": "f043208c83891bb78919dd894df9af97f87ec06b1d528a020134cdaa80631828",
    "image-edit-invariants": "db530d20a56191678834b869b084f8d5237047b21363e8408f81bedf6d1df94b",
    "video-learning-evidence": "d0cd75374d542553b4bd74f3bbc76dd7d44bd30435a0b0cff3fe20f2838d0963",
    "codex-small-fix-loop": "d1182d94cd77032b8a7c49962a91661e5928f09dac1410ba622d20449681c7e8"
  },
  "scenes": {
    "meta-forum-state-verification": "4baf27b21b49c2c0fc74fbb46435ef8544851d9d4adb62858a1b14d713422c96",
    "mathworks-ears-mapping-review": "adb75184b30156125e23d3a19723bc884cb9e230934760cb6cbce704af041820",
    "deepseek-search-fetch-evidence": "a85c43e589807cbf631ffd3c58bfad24e6f841b85e79ad5ddfba33bef58bc6cf",
    "airbnb-incremental-support-notes": "2a6612e4c229e677618be3fa1dee15f80018aee4666cb0a0f2c94b1baf7f14dd",
    "spotify-honk-verification-rollout": "2ab648ae586ac7ce173dcc69e8e99362591f4565b7509eaf3a0af9e3498a29f2",
    "uber-autocover-test-acceptance": "93cb45b55189d9e5539e191019eea33ee79bddf9dd7f4fc559a0a366d87c64bc",
    "scania-spec2code-contract-gap": "42d1910826736a2d1e2359f77ee61e98d8bae4ab3f95cc1aa2760653e20a9833",
    "prompt-to-voice-reusable-brief": "084110d9ee279bbf11af4b441f802b9b3a8a725c7d20eaf6d9284dfa39f61cd1",
    "kling4-long-take-control": "62799f892ec6b3cf79330c3751fe5bc81c2a84ad54e7ddd95e311b832f17ee0a",
    "decision-switching-threshold": "7903838acfab4640dc450e4475012fbc8d3575f13376079c4c37f1500883da0a",
    "learning-short-answer-hint-retest": "83adb4a7bcb3a63d10449657d7f34aae6071091c84382fc8e075d1cc5cd92323",
    "firmware-memory-delta-audit": "e2757f410a9fdc59f1fa8b3f1a64e3ba29ff96500794fb9c9441979acd8be345",
    "opus55-fast-access": "4adf26b679bcc54f022f95b4fe8ce05a12ad5659b40150003386a205242dc3a2",
    "gptlive11-voice-corrections": "90a546fb4fc93f4e703e55a6319ba8742ff3920fa5bbbc36b8dcfd6684577dc6",
    "gemini4-argon-long-work": "3f5357476daa50f9dae14e6dffa4e358b25f492b88db72b88bb4fcbd2ab18bf1",
    "runway-kling-api-workflow": "ec96e7d3ed9c9eb159b9b2756791c6906707497d216110310da7a543b7cc2054",
    "glm-legal-evidence-chain": "0847157a51d87c38680a1883fcded1cb186acd2f5cfdf4b99964dceeab23ef16",
    "qwen-image21-api-alpha": "8ecb0f5e3e13e7ee8d5ae178f53b558f52004cf253f5bbc77e0a6cd994453791",
    "gpt6-intelligent-ui": "b25e050a79bcc2a4a89b2a2980645ae06d74d03b586fdc4e4b0b0f36b89af766",
    "haiku55-subagent-budget": "13cf6a2089f016c3ce1f0114f0ddb57d76077047f1df51fb3a323bec3704efc4",
    "nano-banana21-continuity": "7360b9df5dbc06c7de72f27cdb2bb978ebe64c9f6d5d1cf7c640c081cadb5d93",
    "embeddinggemma2-local-retrieval": "1c15811ae86029d28cf952201672d302e49313d5685b4d1bf3264442b075cb7e",
    "mistral-large4-preview": "eef9211bdf2841306f03d4255f5536529d2712a0b87fdc349f7345a33b249e96",
    "mplab-agent-telemetry-pacing": "98f7942e28b93b416bd5fb1a01189da287770e79f19b19b9ffe7811f7f4aeea9",
    "memfault-crash-evidence-chain": "589792d5a3a877b4dd874d149996ce639c571c340ddcc31e71645e2d42b222c9",
    "assertllm2-rtl-property-review": "e91f5ee4397da1789fa5343cb2adbc92c0daadd38df6cf6edf7a2ac1a7ed0a9d",
    "firment-waveform-evidence": "47e4d63c6cc4715350747ebc0d96ddaeeccd22c10ddef67298d50328b8a3cd41",
    "cantools-ai-wire-contract": "be2a8be95077dfc14460ce8d63348efb55fbe8b1689cc51e6e3252596cfa31fc",
    "minicpm-local-image-check": "fa17a45f81ee28c814e29c26d199cc8755d082856373289c73671e071875cb12",
    "sensor-unknown-state-gmm": "2a249413d4e9ab7d75f558b93234c16ebe2e78505a5eeadd992094aa3eed7c3a",
    "sol-quality-cost": "21ac08e4a30889f92d381fa976e7f9eb05a33efa05c444f3afaed743c986649e",
    "deepseek-v41-migration": "c552e257157ccebf462c5d2de48023234cebcf5f38861ca937e78dcdfdf2e790",
    "qwen-omni-evidence": "253ecdbfa2c0dea216716d0be36a7381b1f70652f31638785a4178ed713f3ee0",
    "images25-edit-brief": "ba77c9ee45199dfcaf0bca9cd9f31438ee82d06766a092731add3035bec0b9c2",
    "renode-replay-lab": "02529004caba1c922ab3d690b3aad588fab1ca33eae0daef85b89c3f56511a99",
    "firmware-fuzz-harness": "089f5a9ebdf188ab3e4575eab1f5c756732aadb3177952f01431567c8fd7f4d3",
    "debug-probe-mcp": "ca23b159b62c8fdf7ab35ebec262ffe31fe11b3dd941e631cb2dd1de06ab432f",
    "datasheet-register-audit": "ac50c025ad093bba38ff389df2334f5f29e01fc87ad0ee97aebf1d427ecf5701",
    "stm32-edge-ai-budget": "3463da3b40663b7296560028a5b8af5e3efcd084d6ebe3cc47f397b89327896f",
    "firmware-agent-contract": "cf9dbbe92d84749fb634e26345b8b5e72c7a5ca1dcefb74e320a94dd18b3029f",
    "context-task-eval": "4cf4541762a4b088e7f4011943066ecf25c12ab4115ffb51c12e582f06cf30f9",
    "espressif-mcp-workflow": "63fa25ccd1534820f5899d41ca7a0116fc39e57b7d519f5dde0ba1d07dc68a96",
    "playwright-mcp-boundary": "d13701f012853926a1c127ccd36325b94083ade013acf0ac06971e8b95d6a6ed",
    "skills-license-eval": "de41448284606b587eb01f3f52467148abfe329eb4afb64f7095d6de51652553",
    "embedded-regression-copilot": "0d8d2283b73273ccc9a7d3796502bcc1829e51c11901f43981694c80d21ac2ea",
    "document-style-pipeline": "6e4abe39ece7436424ab728a07da99038cb267dd0f0c08c91806354f13c07b75",
    "dot-meeting-brief": "4a18fe99ee18228ac2ea8dd08c7d06816bbc7dd475642a09df71b664289f3e34",
    "dot-bounded-follow-up": "84e7fc7f83600649ed9d672287d8dfd0cc33ffdecae66cd7a7e5a0340e789eb3",
    "dot-change-request": "2d78da6f25d6ea5d47d3067a5d597d8e304b41602a0321d27c90e9d2daf8cc73",
    "research-conflicting-sources": "f2ddf755914405abf96632ad8b54e6353f492322f3d36384bade89dbabb505e2",
    "writing-two-examples": "fda4d9625c4a38559a612483510673de3a65cb0f28478f943f5f3e8bb8addd10",
    "orders-cleaning-audit": "eac249de66543c18ca22b17f9a961174a336d9db5bed9a69d4498fbf2c61cef6",
    "image-edit-invariants": "8fbc5aaee484a75ba7f90badfee66feefcb16c4eea375ed91be3cb8c9ec69b02",
    "video-learning-evidence": "fe6f5a20880ffcc649a26c4ec6cf8a01bef309ce178247c6757ddb7c44a986d0",
    "codex-small-fix-loop": "97e754ab244ea90773db163c6b8959f96f555cd1ba2234d015455d6cdb27f670"
  },
  "files": {
    "app.js": "3f11837199a84b29e606682c4b88a17632fea212e8cabad2eab2570564305157",
    "site-core.js": "b4f96a7f0557c322c3c2e42cfcf14d1545585d06420cfc1147c03bc5b7b33589",
    "style.css": "5e159c776246dcd48bf52117e649feb7250bbffb9f49a707bbb2d9b3cf3c5c8b",
    "visuals.css": "7cf30aa521f1fe9e7589608376199737cb797efc3ab2a63799c97d7ac0d4d00d",
    "build.py": "25deb0b707c7e7ae97e1306b94afcab5d0156c8a7ff8495a980140e4ebb2f524",
    "favicon.svg": "b33e38910db7f167eb595800e4fa779577885204e090115732215704f1be1db5",
    "DESIGN.md": "23cb37aa5f8c5df788d9587f03e8e2b01a2b955f5d26b4862e7f1dc5439e5a96",
    "THIRD_PARTY_NOTICES.md": "e10fafb73c4164f3cc2f5350a0ec70c500ab6417cc935a9140b69e49b74daf60"
  }
};
const october20Scenes = {"minimax-m31-flash-effort-cost": {"kind": "balance", "reuse": "sol-quality-cost", "title": "先锁定思考深度，再比较整项任务", "labels": ["固定任务与深度", "分类结果与重试", "模型 + 缓存 + 工具"], "status": ["正式在线服务已经开放；权重发布仍是后续安排。", "省略effort默认max，输出预算也包含思考消耗。", "0.0171美元模型用量加两次搜索，合成为0.0371美元。", "图与费用均为合成说明，不能当成实测速度或真实账单。"]}, "gemini-notebook-prerender-review": {"kind": "evidence", "title": "先审每页要说什么，再生成画面", "labels": ["来源与听众", "提纲 / 制作说明", "成品仍需检查"], "panels": [["A · B · C", "10条练习记录", "8条字段完整", "不是效率提升"], ["Review", "四页各有目的", "旁白对应画面", "未证实不补写"], ["生成后", "数字与字幕", "图像与读音", "再检查一次"]], "status": ["先核来源、听众与每页目的，再审提纲或视频制作说明。", "8/10只说明字段完整比例，不能改写成效率提升80%。", "公告为一周滚动开放，帮助页仍列Ultra；账号入口需核对。", "这是一份合成计划，未生成成品；审阅提纲不替代成品检查。"]}, "pixverse-template-slots-jobs": {"kind": "evidence", "title": "输入槽位有顺序，生成任务逐个追踪", "labels": ["模板与槽位", "输入顺序 / 锁定参数", "每个返回任务"], "panels": [["先读模板", "图片 / 视频 / 文本", "槽位顺序", "模板自己的约束"], ["匹配输入", "每项对应位置", "输出参数可锁定", "缺项先检查"], ["逐项状态", "任务ID分别存", "完成或失败", "成片另验收"]], "status": ["先查模板要求的槽位类型和顺序，不能只数上传了几个文件。", "模板可锁定时长、画幅或分辨率，通用默认值不应强行覆盖。", "多媒体返回不等于一个成品；按每个任务ID分别追踪状态。", "这是原创流程示意，未安装CLI、上传素材或消耗生成积分。"]}, "gemini-october-api-retirement-window": {"kind": "evidence", "title": "研究代理与视频型号，分别检查退役窗口", "labels": ["完整标识与期限", "接口 / 状态 / 返回", "替代项逐条验收"], "panels": [["先列标识", "Veo预览型号", "旧研究agent", "日期语义分开"], ["分别迁移", "agent / model", "后台任务状态", "SDK / REST结果"], ["交付检查", "引用支持范围", "视频规格与内容", "失败保留退路"]], "status": ["Veo相关预览最早10月22日退役；旧Deep Research公告计划10月23日停用。", "具体API标识的生命周期，不能外推为整个消费端产品或品牌关闭。", "保留原任务ID与状态，断线不等于失败；不把创建成功当成完成。", "替代项仍需验证接口和输出，本文没有调用服务或执行迁移。"]}, "kimi-desktop-remote-review": {"kind": "evidence", "title": "换一块屏幕，仍接着同一件工作", "labels": ["电脑上的原任务", "远端同账号会话", "新要求与停点"], "panels": [["原任务", "练习目录", "三份源文件", "只读核对"], ["远端检查", "设备与会话", "事实差异仍保留", "日期变更单列"], ["明确停点", "不改文件", "必要操作再判断", "停任务需核对"]], "status": ["远控是控制界面；项目文件与本地工具仍在原电脑执行。", "先核对设备、会话和源文件，再补充新要求，避免接错上下文。", "新日期更新报告，不应伪称旧文件已经修改。", "关闭远端页面不会自动停止电脑上的任务，停止后仍需核对状态。"]}, "openai-low-resource-behavior-parity": {"kind": "evidence", "title": "编译通过之后，再核对可观察行为", "labels": ["明确输出契约", "数值 / 缺失 / 行尾", "逐项差异与未测项"], "panels": [["旧行为", "12.349 → 12.34", "缺失不是零", "行尾只有LF"], ["逐项比较", "舍入差异", "多一个CR", "来源与输出对应"], ["审查记录", "四例仅一例符合", "分母不能混用", "真实迁移未验证"]], "status": ["低资源语言指可学习资料相对较少，并非小内存设备语言。", "数据库功能通过率与整个COBOL迁移成功判定，是两种评测口径。", "合成四例中只有T4满足契约；成功退出不能证明输出一致。", "原始输出差异先保留，不为让测试全绿临时增加trim或容差。"]}, "muse-beam-open-weight-deployment": {"kind": "evidence", "title": "开放权重的两个入口，部署证据逐项比较", "labels": ["Muse Spark Open", "许可 / 内存 / 任务", "Reflection Beam"], "panels": [["多模态输入", "816B总参数", "42B激活", "输出为文本"], ["分别核对", "完整权重常驻", "量化和缓存", "同任务再比较"], ["文本输入输出", "501B总参数", "23B激活", "Apache-2.0"]], "status": ["Muse与Beam分别于10月15日和16日开放权重，初次宣布和权重可用分开记。", "激活参数影响每步计算，不等于只需存放同样数量的权重。", "自定义Muse许可与Apache-2.0不同；卡片不能替代完整条款审查。", "图示与预算练习均为原创合成材料，本站未下载或部署模型。"]}, "cloudflare-rule-lifecycle-review": {"kind": "evidence", "title": "先确定适用规则，再决定意见级别", "labels": ["当前规则与版本", "适用范围 / 强度 / 状态", "分级意见待复核"], "panels": [["规则来源", "稳定编号 + 版本", "原文条件保留", "负责人已确认"], ["分别判断", "适用或待澄清", "MUST / SHOULD", "approved / enforced"], ["处置区分", "阻断候选 / 发现", "建议 / 不适用", "人工复核"]], "status": ["这是2026年8月公司实践的回看，不是当天新增能力。", "条款编号、当前版本、适用条件与执行状态分别核对。", "approved的MUST不自动阻断；SHOULD不能升级成MUST。", "R3范围未知先问清，R5不适用；合成意见不执行真实审批。"]}};

check('October 20 preserves all 55 published articles, dates, scene renderings and fixed assets', () => {
  assert.equal(october20Ids.length, 8);
  assert.equal(data.posts.length,104);
  assert.deepEqual(data.posts.slice(41, 49).map(p=>p.id),october20Ids);
  assert.deepEqual(data.posts.slice(49).map(p=>p.id),Object.keys(october20Baseline.posts));
  assert.equal(Object.keys(october20Baseline.posts).length,55);
  for(const [id,hash] of Object.entries(october20Baseline.posts)){
    const post=data.posts.find(p=>p.id===id);assert(post,id);
    assert.equal(sha256(JSON.stringify(beforeOctober25(post))),hash,id+': all published editorial fields');
    const scope={window:{}};vm.runInNewContext(visuals,scope);
    assert.equal(sha256(scope.window.FieldnoteVisuals.render(post)),october20Baseline.scenes[id],id+': existing scene');
  }
  for(const [file,hash] of Object.entries(october20Baseline.files))assert.equal(sha256(read(file)),hash,file+': unchanged runtime and design');
  assert.deepEqual(['industry','practice','embedded'].map(c=>data.posts.filter(p=>C.categoryFor(p)===c).length),[51, 26, 27]);
  assert.equal(data.site.verifiedAt,'2026-10-25');
  assert.notEqual(assertReleaseCoherence(index),'20261017r1-b06206059638');
});
check('October 20 details have complete original context, sources, exercises and per-article verification',()=>{
  for(const id of october20Ids){
    const p=data.posts.find(p=>p.id===id), text=JSON.stringify(p);
    assert(['guide','news'].includes(p.kind),id+': editorial kind');assert.equal(p.verifiedAt,p.id===october25VeoPatch.id?'2026-10-25':'2026-10-20');assert.equal(p.verified_date,p.verifiedAt);
    assert(p.analysis.length>=7,id);assert(p.sources.length>=3,id);assert(p.steps.length>=4,id);
    assert(p.summary.length>=2,id);assert(p.tryThis.prompt.length>=230,id);assert(p.tryThis.expected.length>=100,id);
    assert(p.evidence.includes('未')||p.evidence.includes('本站'),id);assert(/未|没有/.test(p.caveat),id+': explicit non-execution boundary');
    assert(p.license&&p.maturity&&p.maintenance,id);
    assert.deepEqual(p.paragraphs,p.summary);assert.deepEqual(p.takeaways,p.steps);assert.equal(p.limitations,p.caveat);
    for(const s of p.sources){assert.equal(new URL(s.url).protocol,'https:');assert(s.title);}
    for(const value of ['/workspace/','sandbox:','私有项目','内部用户','已经掌握','本站实测成功'])assert(!text.includes(value),id+': '+value);
  }
  assert.equal(new Set(data.posts.map(p=>p.id)).size,104);
  assert.equal(data.posts.find(p=>p.id==='cloudflare-rule-lifecycle-review').date,'2026-08-04');
  assert.equal(data.posts.find(p=>p.id==='gemini-october-api-retirement-window').date,'2026-10-08');
});
check('MiniMax addition separates launch and weight plans, effort defaults and full synthetic billing',()=>{
  const p=data.posts.find(p=>p.id==='minimax-m31-flash-effort-cost'),text=JSON.stringify(p);
  assert.equal(p.date,'2026-10-19');assert.equal(p.region,'china');
  for(const term of ['MiniMax-M3.1-Flash','output_config.effort','max_tokens','max','disabled','none','0.0171','0.0371','70%','权重'])assert(text.includes(term),term);
  for(const term of ['stop_sequences','mcp_servers','context_management','container','service_tier'])assert(text.includes(term),term);
  const models=80000/1e6*.15+20000/1e6*.015+8000/1e6*.60;
  assert.equal(models.toFixed(4),'0.0171');assert.equal((models+2*.01).toFixed(4),'0.0371');
  const rows=[{id:'A',t:10,f:0},{id:'B',t:0,f:0},{id:'C',t:null,f:0},{id:'D',t:10,f:1},{id:'E',t:8,f:0}];
  const answers=rows.map(x=>x.t===null?'待补证':x.t>=10&&x.f===0?'通过':'不通过');
  assert.deepEqual(answers,['通过','不通过','待补证','不通过','不通过']);
  assert(p.tryThis.expected.includes('通过 1、不通过 3、待补证 1'));
});
check('Notebook addition keeps rollout conflict, pre-render decisions and synthetic denominator honest',()=>{
  const p=data.posts.find(p=>p.id==='gemini-notebook-prerender-review'),text=JSON.stringify(p);
  assert.equal(p.date,'2026-10-19');
  for(const term of ['Ultra','Review','Proceed','Generate later','一周','8/10','不能算效率提升','未生成','未验收'])assert(text.includes(term),term);
  assert(p.sources.some(s=>s.url.includes('co-create-slides-videos')));
  assert(p.sources.filter(s=>s.url.includes('support.google.com')).length>=2);
  assert.equal(8/10*100,80);
  assert(p.caveat.includes('公告与帮助页'));
});
check('Gemini retirement inventory distinguishes exact IDs, earliest dates, agent/model and unfinished jobs',()=>{
  const p=data.posts.find(p=>p.id==='gemini-october-api-retirement-window'),text=JSON.stringify(p);
  for(const term of ['deep-research-pro-preview-12-2025','deep-research-preview-04-2026','deep-research-max-preview-04-2026','veo-3.1-lite-generate-preview','veo-3.1-generate-preview','veo-3.1-fast-generate-preview','gemini-omni-flash-preview','gemini-omni-1.1-flash'])assert(text.includes(term),term);
  for(const term of ['最早可能','10月22日','10月23日','首次公告日','background=true','store=true','last_event_id','output_video','steps','requires_action','in_progress'])assert(text.includes(term),term);
  assert(p.caveat.includes('不等同于Veo品牌'));assert(p.tryThis.expected.includes('R17仍进行中'));assert(p.tryThis.expected.includes('R19待客户端动作'));
  assert(p.tryThis.expected.includes('迁移未验证'));assert(p.tryThis.expected.includes('REST的steps'));
});
check('Kimi and PixVerse additions distinguish release-specific changes from execution and service rights',()=>{
  const k=data.posts.find(p=>p.id==='kimi-desktop-remote-review'),kt=JSON.stringify(k);
  assert.equal(k.date,'2026-10-14');assert.equal(k.region,'china');
  for(const term of ['1.1.0','2.2.0','x86_64','同一个','保持在线','关闭远端浏览器页面不会停止','10 月 24 日','不能误写'])assert(kt.includes(term),term);
  assert(k.tryThis.prompt.includes('不修改任何文件'));assert(k.tryThis.expected.includes('不伪称文件已修改'));
  const p=data.posts.find(p=>p.id==='pixverse-template-slots-jobs'),t=JSON.stringify(p);
  assert.equal(p.date,'2026-10-15');assert.equal(p.region,'china');
  for(const term of ['v1.4.9','MIT','顺序','模板','任务','积分'])assert(t.includes(term),term);
  assert(p.sources.some(s=>s.url.includes('releases/tag/v1.4.9')));
  assert(p.caveat.includes('未'));assert(p.license.includes('MIT'));
});
check('OpenAI research distinguishes benchmark denominators, pinned license and raw byte differences',()=>{
  const p=data.posts.find(p=>p.id==='openai-low-resource-behavior-parity'),text=JSON.stringify(p);
  assert.equal(p.date,'2026-10-19');
  for(const term of ['87.4%','86.6%','97.9%','272','3.40.1','995755bffdba3da60ca367448a1606ba0e50573a','Apache-2.0','不是设备内存小','并非要求数据库文件的全部字节相同','不能当成COBOL隐藏迁移测试也已公开'])assert(text.includes(term),term);
  const expected=['X7|12.34\n','N2|-2.99\n','Q4|MISSING\n','Z0|0.00\n'];
  const candidate=['X7|12.35\n','N2|-2.99\r\n','Q4|0.00\n','Z0|0.00\n'];
  assert.equal(expected.filter((x,i)=>Buffer.from(x).equals(Buffer.from(candidate[i]))).length,1);
  assert.equal(Buffer.from(candidate[1]).length-Buffer.from(expected[1]).length,1);
  assert(p.tryThis.expected.includes('1/4'));assert(p.tryThis.expected.includes('多一个CR'));
  assert(p.caveat.includes('公司自报'));assert(p.caveat.includes('未获本站独立复现'));
});
check('Cloudflare exercise preserves lifecycle, scope uncertainty and source-version correction',()=>{
  const p=data.posts.find(p=>p.id==='cloudflare-rule-lifecycle-review'),text=JSON.stringify(p);
  for(const term of ['approved','enforced','MUST','SHOULD','v3','P1/R1','C1','C2','阻断候选','范围未知','不适用','不是当天新发布'])assert(text.includes(term),term);
  for(const term of ['F1的v2引用错误','F2错误升级','F3不能成立','R5只管页面'])assert(p.tryThis.expected.includes(term),term);
  assert(p.caveat.includes('不能直接外推为其技术方案审查会自动否决文档'));
  assert(p.sources.some(s=>s.url.includes('rfc2119')));assert(p.sources.some(s=>s.url.includes('rfc8174')));
  const classify=x=>x.scope===false?'不适用':x.scope===null?'待澄清':x.level==='SHOULD'?'建议':x.state==='approved'?'非阻断发现':'阻断候选';
  assert.deepEqual([{scope:true,level:'MUST',state:'enforced'},{scope:true,level:'MUST',state:'approved'},{scope:null,level:'MUST',state:'enforced'},{scope:true,level:'SHOULD',state:'enforced'},{scope:false,level:'MUST',state:'enforced'}].map(classify),['阻断候选','非阻断发现','待澄清','建议','不适用']);
});
check('All eight new articles preserve category, copy payload, bookmarks, direct routes, history and focus',async()=>{
  for(const id of october20Ids){
    const p=data.posts.find(p=>p.id===id),env=boot({observer:true});
    env.click('[data-category="'+p.category+'"]');assert.equal(env.get('.region-filter').hidden,p.category!=='industry');
    if(p.category==='industry')env.click('[data-region="'+p.region+'"]');
    env.click('#title-'+id+' a');assertView(env,'article');assert.equal(env.get('#article-title').textContent,p.title);
    assert.equal(env.document.activeElement.id,'article-title');
    assert.equal(env.get('#prompt-'+id).value,p.tryThis.prompt);
    env.click('#article-view [data-copy-prompt]');await env.settle();assert.equal(env.clipboard.at(-1),p.tryThis.prompt);
    env.click('#article-view [data-copy]');await env.settle();assert.equal(env.clipboard.at(-1),env.location.href);
    assert.deepEqual(env.get('#article-view').querySelectorAll('.source-list a').map(a=>a.href),p.sources.map(s=>s.url));
    env.click('#article-view [data-save="'+id+'"]');assert.equal(env.get('#article-view [data-save="'+id+'"]').getAttribute('aria-pressed'),'true');
    env.click('#article-view [data-back]');assertView(env,'feed');assert(env.get('#title-'+id+' a'));assert.equal(env.document.activeElement.id,'main-content');
    env.forward();assertView(env,'article');assert.equal(env.get('#article-title').textContent,p.title);
    for(const hash of [C.postHash(id),'#post='+id,'#article='+id,'#article/'+id,'#article-'+id]){
      const direct=boot({url:'https://example.test/publication/'+hash});assertView(direct,'article');assert.equal(direct.get('#article-title').textContent,p.title);
    }
  }
});
check('Eight original diagrams retain readable notes, independent scopes and automatic accessible motion',()=>{
  const env=boot({observer:true});
  for(const id of october20Ids){
    const spec=october20Scenes[id],node=env.get('#visual-'+id);assert(node,id);
    assert(node.classList.contains('fv-'+spec.kind));assert.equal(node.querySelector('.fv-heading strong').textContent,spec.title);
    assert.deepEqual(node.querySelectorAll('.fv-labels span').map(x=>x.textContent),spec.labels);
    assert.deepEqual(node.querySelectorAll('.fv-note-transcript li').map(x=>x.textContent),spec.status);
    assert.equal(node.querySelector('.fv-note-window').getAttribute('data-note-count'),'4');
    assert.equal(node.querySelector('.fv-note-window').getAttribute('aria-hidden'),'true');
    assert(node.querySelectorAll('.fv-flow-runner').length>0);
    assert.equal(node.querySelectorAll('button,[role="button"],[tabindex],[aria-live],[data-demo],animate,animateTransform').length,0);
    assert(!node.classList.contains('is-visible'));env.observers[0].callback([{target:node,isIntersecting:true}]);assert(node.classList.contains('is-visible'));
    env.observers[0].callback([{target:node,isIntersecting:false}]);assert(!node.classList.contains('is-visible'));
    env.click(node);assertView(env,'feed');assert.equal(env.history.length,1);
    const reduced=boot({reducedMotion:true,observer:true,url:'https://example.test/publication/'+C.postHash(id)});
    assert(reduced.document.body.classList.contains('motion-paused'));
    assert.deepEqual(reduced.get('#article-view #visual-'+id).querySelectorAll('.fv-note-transcript li').map(x=>x.textContent),spec.status);
    reduced.reduce(false);assert(!reduced.document.body.classList.contains('motion-paused'));
    const svg=node.querySelector('svg');assert.equal(svg.getAttribute('focusable'),'false');assert.equal(svg.getAttribute('aria-hidden'),'true');
  }
  assert(!/setInterval|setTimeout|requestAnimationFrame/.test(visuals));
  assert(visualCSS.includes('body.motion-paused .fv-note-window {display:none;}'));
  assert(visualCSS.includes('.fv-visual.motion-scene .fv-animated {animation-play-state:paused;}'));
});
check('Muse and Beam comparison preserves separate release events, modalities and full license conditions',()=>{
  const p=data.posts.find(p=>p.id==='muse-beam-open-weight-deployment'),t=JSON.stringify(p);
  assert.equal(p.date,null);assert.equal(p.kind,'guide');assert.equal(p.category,'industry');assert.equal(p.region,'global');
  for(const term of ['2026-10-15','2026-10-16','10-05','Muse-Spark-Open-816B-A42B','Beam-1.0-501B-A23B','Licensee','关联方','aggregate gross revenue','任意连续12个月','2000万美元','不消除第1、2条义务','Apache License 2.0','Built with Muse Spark Open'])assert(t.includes(term),term);
  assert(p.analysis.some(x=>x.text.includes('文字、图像、视频和音频输入，文本输出')));
  assert(p.analysis.some(x=>x.text.includes('文本输入输出')));
  assert(p.sources.some(s=>s.url.includes('06641076793dad51b8907f7eb2a14f4e08fd3ec8')));
  assert(p.sources.some(s=>s.url.endsWith('/LICENSE.md')));assert(p.sources.some(s=>s.url.endsWith('/LICENSE')));
  assert(p.caveat.includes('不提供法律适用结论'));assert(p.maintenance.includes('未核对固定版本快照'));
  assert(p.analysis.some(x=>x.text.includes('MaaS业务收入')));assert(p.analysis.some(x=>x.text.includes('不是月收入')));
});
check('Open-weight synthetic evaluation distinguishes qualified-result cost, memory denominator and missing evidence',()=>{
  const p=data.posts.find(p=>p.id==='muse-beam-open-weight-deployment'),t=JSON.stringify(p);
  assert.equal(180/90,2);assert.equal(120/60,2);assert.equal(23*2,46);assert.equal(501*2,1002);
  for(const term of ['NVFP4至少700GB','BF16约2TB','NVFP4约280GB','完整权重','缓存','P95','95百分位','合格数、费用口径与版本待核','调用费口径','尚非包含人工等费用的全成本'])assert(t.includes(term),term);
  assert(p.tryThis.expected.includes('23B激活不能推导完整501B模型可放入48GB显存'));
  assert(p.tryThis.expected.includes('不是整套运行显存保证'));
  assert(p.tryThis.prompt.includes('不下载权重'));assert(p.tryThis.prompt.includes('不替我作法律判断'));
  assert(p.analysis.some(x=>x.text.includes('OCR费用、错误和耗时也应计入')));
  assert(p.analysis.some(x=>x.text.includes('A/B均为练习设定，不对应Muse或Beam成绩')));
});

const october21Ids = ["openai-monitorability-pair-retry-metrics", "runway-claude-marketplace-procurement", "gemini-gdc-airgap-managed-rag-preview", "metr-anthropic-risk-review-scope-evidence", "deepseek-harness-preview-upgrade-acceptance", "seedance25-reference-timeline-repair", "seedream5pro-layered-diagram-review", "spotify-eval-funnel-calibration", "aws-migration-playbook-evidence", "meta-ach-mutant-test-contract"];
const october21Baseline = {"posts":{"minimax-m31-flash-effort-cost":"205937bece0596d0c2d47b0e536ea51f1a9cca4c613b5028755554074f7e73ca","gemini-notebook-prerender-review":"d2220608e9badca5b9790637aacd43748b1d40072f7f8d9c76d3e766936a19af","pixverse-template-slots-jobs":"f5e61db82ec5f9bdbc190526eccf1b5b1e5dd627d7e6f9298fc53cfe40261e21","gemini-october-api-retirement-window":"a90833e61978936e64a0595ec046e52519fd7ebe123e8914371bec1fbd955dc9","kimi-desktop-remote-review":"ab365fe747962759b25a4a207921bb668b5b5a2d6958939820a878f108d76577","openai-low-resource-behavior-parity":"24581b477de88aa83f6d3533a42f9e2791cfe65ea27f2e0eab116728c77f4888","muse-beam-open-weight-deployment":"efcf0e05ba47d5f109d9775d32245ff0a842a3089bb09a92f05d1a120087aabc","cloudflare-rule-lifecycle-review":"a07df039281887b4c267032d6b1cb669b3599bb24a6ad1c1eb3f4c3318a5f304","meta-forum-state-verification":"b626576ba51a1a0d90671b8f8638452e15d61bcc1551df500cda9d1891786779","mathworks-ears-mapping-review":"9f0c7a35d005a02f769859a42bb904f08903619ed33d3e27a8eed5ed3875ef06","deepseek-search-fetch-evidence":"2291b77e9a0707f2fce5e3223b645ea074a0f5f90c12c76231e94bde6d0445cf","airbnb-incremental-support-notes":"a63251a541273660582a8309b3155b77b76d8506e3718136753d07a6d4965d83","spotify-honk-verification-rollout":"42630f3308bb29ff8683b001e5fd89c0aa68202c15e8ba56d69e0087c10c4584","uber-autocover-test-acceptance":"ab12b8b0bd882a088c67e8e0f6fc5306e6fcd6cf1b4eb2d19202186fdd60019e","scania-spec2code-contract-gap":"9e54ac029dc40dc9e5e90e28d932ea6561118b23af4d360f364ab00c4cda8368","prompt-to-voice-reusable-brief":"8ce23fe19a2edd011766d1e38ced13999c267f6a6c1e0ae1dd5653dedf3fff1f","kling4-long-take-control":"420dfc75a0dbb710ffc1a546f55e5528d49d802ee1bfdd5b400d82289397cd66","decision-switching-threshold":"6a4ed9103895bec78038e3addd3affb50d33184316e16c6aaa4ccf5730b20ae4","learning-short-answer-hint-retest":"501579a24f0049aa7633b3a0c22fa7dc338a58acf82e5e597a55215d1bb44670","firmware-memory-delta-audit":"583d85b92957ebe0492869f532049fb595cd5eedbe784a5768e6d78d48deb922","opus55-fast-access":"5d343d3fb4f55de41b1ad13e273f1eef4f6b4f5a2d8579101d124bce430d8000","gptlive11-voice-corrections":"bc3b9993d381c6ca67bd1e601d7bf4d4a1c95d4cace11f03b4097f67fbbb21db","gemini4-argon-long-work":"121484ce1ee9148c2f7be640371a62f9cfba446c9cdb89ca8cab5446e873ecb0","runway-kling-api-workflow":"52b0018ad273e00a3f6af7862bdaa9f18207c16087737e1a83beb0199645990f","glm-legal-evidence-chain":"9da204d02ab84f8eb48a10f2af265f48759150c5844ef9e34be111d0234d8f4c","qwen-image21-api-alpha":"1e81ecb9ec1498e575ba292c96ade9342fcbc1fd892a0e23d88c62c5e854847d","gpt6-intelligent-ui":"5c9657cf1aaa75195a7c6ca9a419ed9f5c946dae43fd2e929f7cb219def47d11","haiku55-subagent-budget":"40589281778639c45c81447e065e3830efcbe09fe52cd9a3e2604707e5257c35","nano-banana21-continuity":"ab6cb4de6fb4fab6eb5b81028cdd2857bd5971e610074302afc9ee2b27cd618e","embeddinggemma2-local-retrieval":"5cd94802e402edfab230b73e19ee6b0dffeb3eb26d778cd37f907ede67e3c301","mistral-large4-preview":"74d300fc34b328dc749a34aec19c0ac87e0ec4220688eca5a0b702298f05a44f","mplab-agent-telemetry-pacing":"f23ee6f7a452db4833c4f3f58ff69b49aa8811cf8e2f134e288acbe7514631a4","memfault-crash-evidence-chain":"19b9006fd5e592f9efd3fd0332950afcf45a8195884f062d42fdd52c0ff9e69f","assertllm2-rtl-property-review":"b6d87a487535fb842ad4908bcd1bc08b35004d4c2c8a8f199d5da40a1cd59a39","firment-waveform-evidence":"affb6bfa3bdb4778904f9133b4a3a4fab2fb4190b29b0c15bde31b05095800f1","cantools-ai-wire-contract":"e2d91e4db45b36d183823818262761687888da7b3e9b52dd6b34e2aebcf88135","minicpm-local-image-check":"fd0add86b8ae410daf0349b44d383d17df575eb0d1d69ab111d26fe04a5714b7","sensor-unknown-state-gmm":"3b4eac0dd79fb5970aed643285a55a7bfe0cf27c58567093353906e8bd4e8d3f","sol-quality-cost":"f53d3c7c9d9c8b8b75da105a631a8a74df7ceaf105b77adf03ffad445b882b6a","deepseek-v41-migration":"05ea75bf12ecfaf87c4ba8bfb4a84fcdf41deeec532bbdab6ba13efc7698b376","qwen-omni-evidence":"220ef0f3c13e3f04c6b332933a303feb528d06e1458ec410510e4b0924f9c359","images25-edit-brief":"3baf2ae3963446ddc58573af93650d0815cfdb24ba9287d5022927e03dd73dff","renode-replay-lab":"bbc451336852b1abd4d491dfab43c79cc5fac6719bcefeece8304947508aa261","firmware-fuzz-harness":"52204b6f516e75ca58f3ecb7b9154fe9d30bd698d9ff29ab865f12c5ced39058","debug-probe-mcp":"063fa655a3e4838d61f72683df248a15fe8e0c7185fc909684d4c986a7fece58","datasheet-register-audit":"7ad32920da96b7456f3c19971fa940a7528e0338609da7bd07886c53fd7ea708","stm32-edge-ai-budget":"819ad707afc2051fe064ce466d246159ef51d35dec3c2cd3ded40d6666908811","firmware-agent-contract":"146a2eadf17defae9c0266ea2d82e35dd33eb6b480fc3a8a2ca32f262d4a62a9","context-task-eval":"8c96cdbc3b373c90733bc5b218854baa24f99c9e6043ad19d2f3b76d34c86095","espressif-mcp-workflow":"90b01873f620cb39f7e0040e56ea68e6881489c0ccc4d1b214f97ef95573e628","playwright-mcp-boundary":"cb62e3ed8797602aa5df5717d7abb4cde1d87a57981ce342a881c6643a2dcea5","skills-license-eval":"de1ddf6ab2990d2887a2a3324d7a2a6b90012a4f13121d7ff4759408523356d8","embedded-regression-copilot":"3d1ff145b4ddef0c06132990ee8f6c7ac18b2243e34e89cda1b3be8b01f00211","document-style-pipeline":"6d85313adc53f5a592474f69acdb78ce4164c63492147baa7a117f6ffc7d110a","dot-meeting-brief":"1e1e08ae0719a820459a68a4a0ef0356e3dd37570b4b2cf224041cf7a5f533b2","dot-bounded-follow-up":"76111ec1587cae86e39d500343d2945d973f5b958dd0586347950ed163a42478","dot-change-request":"73bdc58095365cb1c20fb099a3a0a8f2dc84bd45988efbc55cd4fc8735d6fbd1","research-conflicting-sources":"7f426c4e27e151214b91384b022eaa1e8063019ca554fc1c53e1a2a0fd8c8923","writing-two-examples":"08492c0f960d7d9c49a7fdabb6eec727741e85032cc143497b317ec43cd0d522","orders-cleaning-audit":"f043208c83891bb78919dd894df9af97f87ec06b1d528a020134cdaa80631828","image-edit-invariants":"db530d20a56191678834b869b084f8d5237047b21363e8408f81bedf6d1df94b","video-learning-evidence":"d0cd75374d542553b4bd74f3bbc76dd7d44bd30435a0b0cff3fe20f2838d0963","codex-small-fix-loop":"d1182d94cd77032b8a7c49962a91661e5928f09dac1410ba622d20449681c7e8"},"scenes":{"minimax-m31-flash-effort-cost":"587ab389ce8c07f70c952e708ce54497ea6d5ce11ec40d9c5baf5a192987b06a","gemini-notebook-prerender-review":"84803926844efe41463668a971bdcabc6deb33b79d39aa7d8b5e401e3314b285","pixverse-template-slots-jobs":"1f803b8449fe8724da02c102485f2ed491c4f527968b7ad5699f8a3270239837","gemini-october-api-retirement-window":"bfdef308a3e96deb022cd6063fc163663cbf44f4eae5f91888bc9af8a0018df5","kimi-desktop-remote-review":"36673ae692f94e9b555a796b36a76b4202bf53a7a4b1a424ebd0c1a1137afb46","openai-low-resource-behavior-parity":"a49a22725f5090c9946cbc583bdb532e2fb4c02499515271522edcb0db4d7611","muse-beam-open-weight-deployment":"fc15cd8f50c93d48d22318780a0118d2247408426827b60056a0d373713c39cb","cloudflare-rule-lifecycle-review":"26c132c50fbd9d7dcfe61798ee8ed5ce1b72704504fa54ba5303b3d162aa5852","meta-forum-state-verification":"4baf27b21b49c2c0fc74fbb46435ef8544851d9d4adb62858a1b14d713422c96","mathworks-ears-mapping-review":"adb75184b30156125e23d3a19723bc884cb9e230934760cb6cbce704af041820","deepseek-search-fetch-evidence":"a85c43e589807cbf631ffd3c58bfad24e6f841b85e79ad5ddfba33bef58bc6cf","airbnb-incremental-support-notes":"2a6612e4c229e677618be3fa1dee15f80018aee4666cb0a0f2c94b1baf7f14dd","spotify-honk-verification-rollout":"2ab648ae586ac7ce173dcc69e8e99362591f4565b7509eaf3a0af9e3498a29f2","uber-autocover-test-acceptance":"93cb45b55189d9e5539e191019eea33ee79bddf9dd7f4fc559a0a366d87c64bc","scania-spec2code-contract-gap":"42d1910826736a2d1e2359f77ee61e98d8bae4ab3f95cc1aa2760653e20a9833","prompt-to-voice-reusable-brief":"084110d9ee279bbf11af4b441f802b9b3a8a725c7d20eaf6d9284dfa39f61cd1","kling4-long-take-control":"62799f892ec6b3cf79330c3751fe5bc81c2a84ad54e7ddd95e311b832f17ee0a","decision-switching-threshold":"7903838acfab4640dc450e4475012fbc8d3575f13376079c4c37f1500883da0a","learning-short-answer-hint-retest":"83adb4a7bcb3a63d10449657d7f34aae6071091c84382fc8e075d1cc5cd92323","firmware-memory-delta-audit":"e2757f410a9fdc59f1fa8b3f1a64e3ba29ff96500794fb9c9441979acd8be345","opus55-fast-access":"4adf26b679bcc54f022f95b4fe8ce05a12ad5659b40150003386a205242dc3a2","gptlive11-voice-corrections":"90a546fb4fc93f4e703e55a6319ba8742ff3920fa5bbbc36b8dcfd6684577dc6","gemini4-argon-long-work":"3f5357476daa50f9dae14e6dffa4e358b25f492b88db72b88bb4fcbd2ab18bf1","runway-kling-api-workflow":"ec96e7d3ed9c9eb159b9b2756791c6906707497d216110310da7a543b7cc2054","glm-legal-evidence-chain":"0847157a51d87c38680a1883fcded1cb186acd2f5cfdf4b99964dceeab23ef16","qwen-image21-api-alpha":"8ecb0f5e3e13e7ee8d5ae178f53b558f52004cf253f5bbc77e0a6cd994453791","gpt6-intelligent-ui":"b25e050a79bcc2a4a89b2a2980645ae06d74d03b586fdc4e4b0b0f36b89af766","haiku55-subagent-budget":"13cf6a2089f016c3ce1f0114f0ddb57d76077047f1df51fb3a323bec3704efc4","nano-banana21-continuity":"7360b9df5dbc06c7de72f27cdb2bb978ebe64c9f6d5d1cf7c640c081cadb5d93","embeddinggemma2-local-retrieval":"1c15811ae86029d28cf952201672d302e49313d5685b4d1bf3264442b075cb7e","mistral-large4-preview":"eef9211bdf2841306f03d4255f5536529d2712a0b87fdc349f7345a33b249e96","mplab-agent-telemetry-pacing":"98f7942e28b93b416bd5fb1a01189da287770e79f19b19b9ffe7811f7f4aeea9","memfault-crash-evidence-chain":"589792d5a3a877b4dd874d149996ce639c571c340ddcc31e71645e2d42b222c9","assertllm2-rtl-property-review":"e91f5ee4397da1789fa5343cb2adbc92c0daadd38df6cf6edf7a2ac1a7ed0a9d","firment-waveform-evidence":"47e4d63c6cc4715350747ebc0d96ddaeeccd22c10ddef67298d50328b8a3cd41","cantools-ai-wire-contract":"be2a8be95077dfc14460ce8d63348efb55fbe8b1689cc51e6e3252596cfa31fc","minicpm-local-image-check":"fa17a45f81ee28c814e29c26d199cc8755d082856373289c73671e071875cb12","sensor-unknown-state-gmm":"2a249413d4e9ab7d75f558b93234c16ebe2e78505a5eeadd992094aa3eed7c3a","sol-quality-cost":"21ac08e4a30889f92d381fa976e7f9eb05a33efa05c444f3afaed743c986649e","deepseek-v41-migration":"c552e257157ccebf462c5d2de48023234cebcf5f38861ca937e78dcdfdf2e790","qwen-omni-evidence":"253ecdbfa2c0dea216716d0be36a7381b1f70652f31638785a4178ed713f3ee0","images25-edit-brief":"ba77c9ee45199dfcaf0bca9cd9f31438ee82d06766a092731add3035bec0b9c2","renode-replay-lab":"02529004caba1c922ab3d690b3aad588fab1ca33eae0daef85b89c3f56511a99","firmware-fuzz-harness":"089f5a9ebdf188ab3e4575eab1f5c756732aadb3177952f01431567c8fd7f4d3","debug-probe-mcp":"ca23b159b62c8fdf7ab35ebec262ffe31fe11b3dd941e631cb2dd1de06ab432f","datasheet-register-audit":"ac50c025ad093bba38ff389df2334f5f29e01fc87ad0ee97aebf1d427ecf5701","stm32-edge-ai-budget":"3463da3b40663b7296560028a5b8af5e3efcd084d6ebe3cc47f397b89327896f","firmware-agent-contract":"cf9dbbe92d84749fb634e26345b8b5e72c7a5ca1dcefb74e320a94dd18b3029f","context-task-eval":"4cf4541762a4b088e7f4011943066ecf25c12ab4115ffb51c12e582f06cf30f9","espressif-mcp-workflow":"63fa25ccd1534820f5899d41ca7a0116fc39e57b7d519f5dde0ba1d07dc68a96","playwright-mcp-boundary":"d13701f012853926a1c127ccd36325b94083ade013acf0ac06971e8b95d6a6ed","skills-license-eval":"de41448284606b587eb01f3f52467148abfe329eb4afb64f7095d6de51652553","embedded-regression-copilot":"0d8d2283b73273ccc9a7d3796502bcc1829e51c11901f43981694c80d21ac2ea","document-style-pipeline":"6e4abe39ece7436424ab728a07da99038cb267dd0f0c08c91806354f13c07b75","dot-meeting-brief":"4a18fe99ee18228ac2ea8dd08c7d06816bbc7dd475642a09df71b664289f3e34","dot-bounded-follow-up":"84e7fc7f83600649ed9d672287d8dfd0cc33ffdecae66cd7a7e5a0340e789eb3","dot-change-request":"2d78da6f25d6ea5d47d3067a5d597d8e304b41602a0321d27c90e9d2daf8cc73","research-conflicting-sources":"f2ddf755914405abf96632ad8b54e6353f492322f3d36384bade89dbabb505e2","writing-two-examples":"fda4d9625c4a38559a612483510673de3a65cb0f28478f943f5f3e8bb8addd10","orders-cleaning-audit":"eac249de66543c18ca22b17f9a961174a336d9db5bed9a69d4498fbf2c61cef6","image-edit-invariants":"8fbc5aaee484a75ba7f90badfee66feefcb16c4eea375ed91be3cb8c9ec69b02","video-learning-evidence":"fe6f5a20880ffcc649a26c4ec6cf8a01bef309ce178247c6757ddb7c44a986d0","codex-small-fix-loop":"97e754ab244ea90773db163c6b8959f96f555cd1ba2234d015455d6cdb27f670"},"files":{"app.js":"3f11837199a84b29e606682c4b88a17632fea212e8cabad2eab2570564305157","site-core.js":"b4f96a7f0557c322c3c2e42cfcf14d1545585d06420cfc1147c03bc5b7b33589","style.css":"5e159c776246dcd48bf52117e649feb7250bbffb9f49a707bbb2d9b3cf3c5c8b","visuals.css":"7cf30aa521f1fe9e7589608376199737cb797efc3ab2a63799c97d7ac0d4d00d","build.py":"25deb0b707c7e7ae97e1306b94afcab5d0156c8a7ff8495a980140e4ebb2f524","favicon.svg":"b33e38910db7f167eb595800e4fa779577885204e090115732215704f1be1db5","DESIGN.md":"23cb37aa5f8c5df788d9587f03e8e2b01a2b955f5d26b4862e7f1dc5439e5a96","THIRD_PARTY_NOTICES.md":"e10fafb73c4164f3cc2f5350a0ec70c500ab6417cc935a9140b69e49b74daf60"}};
const october21Scenes = {"openai-monitorability-pair-retry-metrics": {"title": "同一批请求，三个不同分母", "labels": ["全部请求", "实际交付", "覆盖率"], "panels": [["全部请求", "100份报告", "包括未交付", "2 / 100 = 2%"], ["实际交付", "20份放行", "其中2份不合格", "2 / 20 = 10%"], ["覆盖率", "20 / 100", "交付比例20%", "未交付 ≠ 正确"]], "status": ["同一批合成报告，全部请求与实际交付的分母不同。", "不合格输出占全部请求2%，占已交付结果10%。", "覆盖率为20%；80份未交付不能当成正确回答。", "重试预算属于系统设置，研究不是绕过安全拒绝的许可。"]}, "runway-claude-marketplace-procurement": {"title": "采购入口和制作流程，分别核实", "labels": ["采购资格", "制作衔接", "实际交付"], "panels": [["采购资格", "企业承诺", "产品与席位", "不是全面免费"], ["制作衔接", "规划 → 动画", "影像与声音", "交接仍需检查"], ["实际交付", "账号是否开放", "用量与权利", "成片另验收"]], "status": ["进入Marketplace首先改变企业采购路径，不是发布新视频模型。", "符合条件的采购承诺与个人订阅权益不能混为一谈。", "规划、动画与成片的衔接仍要核对格式、文字和音画。", "本站未购买或制作视频，具体账号资格和效果尚未验证。"]}, "gemini-gdc-airgap-managed-rag-preview": {"title": "离线模型之外，还要看完整资料链", "labels": ["隔离环境", "资料处理", "逐项验收"], "panels": [["隔离环境", "GDC气隙", "HGX B300", "不是普通电脑"], ["资料处理", "文件 → 索引", "权限 → 检索", "计算与引用"], ["逐项验收", "版本是否最新", "引用是否支持", "权限是否正确"]], "status": ["这是指定企业基础设施上的托管RAG预览，不是个人离线安装包。", "气隙网络边界、资料权限和回答正确性是三件不同的事。", "合成手册B替代A后，引用旧A不能支持当前额定值。", "本文没有部署系统、上传资料或测试隔离效果。"]}, "metr-anthropic-risk-review-scope-evidence": {"title": "同样判断低风险，也可能理由不同", "labels": ["报告范围", "10月20日复核", "协议分开"], "panels": [["报告范围", "截至7月15日", "八月报告", "不是所有新模型"], ["10月20日复核", "倾向风险低", "主要因能力受限", "监测论据仍存疑"], ["协议分开", "旧安排用于本次", "10月15日新安排", "不能追溯加权限"]], "status": ["复核发布日期与系统评估覆盖期不能互换。", "结论相近不等于论据一致，更不等于零风险认证。", "此次复核使用旧合作条款，并非10月15日新安排的成果。", "本文只整理公开复核，不推测未公开事件或内部材料。"]}, "deepseek-harness-preview-upgrade-acceptance": {"title": "模型、框架、插件，升级变量分开", "labels": ["固定配置", "会话恢复", "故障状态"], "panels": [["固定配置", "框架R1", "模型A → B", "插件P1不变"], ["会话恢复", "标识与目录", "不兼容则失败", "不能悄悄替换"], ["故障状态", "超时 ≠ 未执行", "副作用先核查", "实际集成未测"]], "status": ["dsh-v0.2.1-rc.2是预发布，MIT许可不等于安全审计通过。", "合成配置只换模型，不能声称插件或框架也已升级。", "会话恢复失败应保留失败，不能悄悄创建另一个任务。", "工具超时且副作用未知时先核查结果，不盲目重复操作。"]}, "seedance25-reference-timeline-repair": {"title": "参考分工后，再定位一段画面修复", "labels": ["素材职责", "18秒原理示意", "局部修复"], "panels": [["素材职责", "A · 外形", "B · 布局", "C · 旁白"], ["18秒原理示意", "0–6秒 展示", "6–12秒 同载荷", "12–18秒 对比"], ["局部修复", "只恢复蓝色", "动作与镜头保持", "前后衔接再看"]], "status": ["7月31日旧发布补覆盖，不把核验日当作模型发布日期。", "参考数量是容量，素材职责和冲突仍需先写清。", "纸桥与载荷是原创合成示意，不能伪装真实承载试验。", "局部修复后仍要回看邻近区间，本站没有生成视频。"]}, "seedream5pro-layered-diagram-review": {"title": "图层可编辑，事实仍要逐项核对", "labels": ["事实清单", "布局与图层", "三关验收"], "panels": [["事实清单", "10份文件", "8份字段齐全", "2份缺字段"], ["布局与图层", "读入 → 检查", "再按结果分组", "文字不随底色改"], ["三关验收", "信息与关系", "手机阅读", "实际导出文件"]], "status": ["7月8日已有能力回看，不是今天的新模型消息。", "8/10只是字段齐全比例，没有准确率或效率提升依据。", "仅改区域底色，也要重新核对全图文字、数字与箭头。", "图层分离不证明可无损重建源文件，导出兼容性仍未测试。"]}, "meta-ach-mutant-test-contract": {"title": "用一个故障副本，检查测试真的抓错", "labels": ["原版规格", "受控变异", "测试证据"], "panels": [["原版规格", "长度至少4", "声明长度相等", "零载荷也校验"], ["受控变异", "M1 · 放宽长度", "M2 · 接受多载荷", "M3 · 跳过校验"], ["测试证据", "原版通过", "变异断言失败", "编译失败不计"]], "status": ["ACH来源是Android Kotlin隐私测试，固件迁移只是本文设想。", "新测试在原版通过、在目标变异因预期断言失败才有区分证据。", "不能编译是无效变异；只检查返回类型可能根本抓不到错误。", "示例校验规则尚缺，不能自行编造校验字节或声称已经运行。"]}, "aws-migration-playbook-evidence": {"title": "经验先带上前提，再进入下一次计划", "labels": ["历史案例", "经验卡与版本", "本次迁移"], "panels": [["历史案例", "A · 新错误码", "B · 夹具变慢", "C · 其他版本"], ["经验卡与版本", "来源 / 适用条件", "测试 / 例外", "人工审阅后冻结"], ["本次迁移", "A适用", "B前提未证实", "D构建 ≠ 板测"]], "status": ["这是5月公开的公司方法回看，不是今天上线的新工具。", "一次修复成功不能推广成所有版本、平台都必须执行。", "夹具超时经验不能变成普遍修改产品超时要求。", "计划一致不等于正确；留出案例与实际验证都尚未执行。"]}, "spotify-eval-funnel-calibration": {"title": "先排硬缺项，再验证读者实际结果", "labels": ["离线评分", "必需事实检查", "模拟读者任务"], "panels": [["离线评分", "A · 4.6分", "B · 4.2分", "仅教学分数"], ["必需事实检查", "保存 → 切换", "最后确认状态", "A缺保存前提"], ["模拟读者任务", "错误与时间", "顺序与盲测", "再校准评测器"]], "status": ["这是5月公司评测方法回看，模型分数不是用户实验结果。", "A虽清晰度分更高，却漏掉必须先保存的前提，应先修订。", "B内容完整仍不能证明真实读者使用效果一定更好。", "校准后要保留独立留出样本，本站未组织真实实验。"]}};

check('October 21 retains all 63 earlier article objects, individual scenes and fixed assets',()=>{
  assert.deepEqual(data.posts.slice(october21Ids.length+8+6+9+8).map(p=>p.id),Object.keys(october21Baseline.posts));
  assert.equal(Object.keys(october21Baseline.posts).length,63);
  for(const [id,hash] of Object.entries(october21Baseline.posts)){
    const p=data.posts.find(p=>p.id===id);assert.equal(sha256(JSON.stringify(beforeOctober25(p))),hash,id);
    const scope={window:{}};vm.runInNewContext(visuals,scope);assert.equal(sha256(scope.window.FieldnoteVisuals.render(p)),october21Baseline.scenes[id],id);
  }
  for(const [file,hash] of Object.entries(october21Baseline.files))assert.equal(sha256(read(file)),hash,file);
});
check('October 21 complete details distinguish source dates, proposals, licenses and non-execution',()=>{
 for(const id of october21Ids){const p=data.posts.find(p=>p.id===id),text=JSON.stringify(p);
  assert.equal(p.verifiedAt,'2026-10-21');assert.equal(p.learningStatus,'待学习');assert(p.tags.includes('待学习'));
  assert(p.sources.length>=1);assert(p.license&&p.maturity&&p.maintenance);assert(/未|没有/.test(p.caveat));
  assert(p.tryThis.prompt.length>=100);assert(p.tryThis.expected.length>=50);assert(p.date<'2026-10-21');
  for(const term of ['chatgpt.com/c/','/workspace/','sandbox:','已经掌握','本站实测成功'])assert(!text.includes(term),id+term);
 }
});
check('October 21 new detail routes, filters, task copying, links, bookmarks and focus remain compatible',async()=>{
 for(const id of october21Ids){const p=data.posts.find(p=>p.id===id),env=boot({observer:true});
  env.click('[data-category="'+p.category+'"]');assert.equal(env.get('.region-filter').hidden,p.category!=='industry');
  if(p.category==='industry')env.click('[data-region="'+p.region+'"]');
  env.click('#title-'+id+' a');assertView(env,'article');assert.equal(env.get('#article-title').textContent,p.title);assert.equal(env.document.activeElement.id,'article-title');
  env.click('#article-view [data-copy-prompt]');await env.settle();assert.equal(env.clipboard.at(-1),p.tryThis.prompt);
  env.click('#article-view [data-copy]');await env.settle();assert.equal(env.clipboard.at(-1),env.location.href);
  env.click('#article-view [data-save="'+id+'"]');assert.equal(env.get('#article-view [data-save="'+id+'"]').getAttribute('aria-pressed'),'true');
  env.click('#article-view [data-back]');assertView(env,'feed');assert.equal(env.document.activeElement.id,'main-content');env.forward();assertView(env,'article');
  for(const hash of [C.postHash(id),'#post='+id,'#article='+id,'#article/'+id,'#article-'+id]){const d=boot({url:'https://example.test/publication/'+hash});assertView(d,'article');assert.equal(d.get('#article-title').textContent,p.title);}
 }
});
check('October 21 diagrams have individual semantics and four calm automatic notes',()=>{
 const env=boot({observer:true});const bodies=[];
 for(const id of october21Ids){const p=data.posts.find(p=>p.id===id),n=env.get('#visual-'+id),spec=october21Scenes[id];assert(n,id);assert(n.textContent.includes(spec.title));
  assert.equal(n.querySelectorAll('.fv-note').length,4);assert.equal(n.querySelectorAll('.fv-note-list li').length,4);assert.equal(n.querySelectorAll('button').length,0);
  for(const text of spec.status)assert(n.textContent.includes(text));bodies.push(JSON.stringify(spec.panels));
 }
 assert.equal(new Set(bodies).size,october21Ids.length);
});
check('Monitorability teaching preserves all denominators without treating nondelivery as correctness',()=>{
 const p=data.posts.find(p=>p.id==='openai-monitorability-pair-retry-metrics');assert.equal(2/100,.02);assert.equal(2/20,.1);assert.equal(20/100,.2);
 for(const term of ['2%','10%','20%','未交付'])assert(p.tryThis.expected.includes(term));assert(p.caveat.includes('不能'));
});
check('News distinguishes review scope, preview hardware and procurement from model release',()=>{
 const find=id=>JSON.stringify(data.posts.find(p=>p.id===id));
 for(const term of ['7月15日','10月20日','旧','10月15日'])assert(find('metr-anthropic-risk-review-scope-evidence').includes(term),term);
 for(const term of ['Gemini 3.5 Flash','HGX B300','预览','普通电脑'])assert(find('gemini-gdc-airgap-managed-rag-preview').includes(term),term);
 for(const term of ['采购','beta','免费','未'])assert(find('runway-claude-marketplace-procurement').includes(term),term);
});
check('ByteDance retrospective dates and Harness preview status are not current model launches',()=>{
 const s=data.posts.find(p=>p.id==='seedance25-reference-timeline-repair'),r=data.posts.find(p=>p.id==='seedream5pro-layered-diagram-review'),h=data.posts.find(p=>p.id==='deepseek-harness-preview-upgrade-acceptance');
 assert.equal(s.date,'2026-07-31');assert.equal(r.date,'2026-07-08');assert.equal(h.date,'2026-10-17');assert.equal(h.category,'practice');
 assert(h.license.includes('MIT'));assert(h.maturity.includes('未经安全审计'));assert(s.caveat.includes('未生成'));assert(/未|没有/.test(r.caveat));
});


const october22Ids = ["claude-duet-preview-attention-budget", "google-cloud-openai-private-preview", "openai-monitor-alerts-boundary-incidents", "fasth3-omni-weights-runtime-license", "openai-12h-cache-reuse-economics", "kimi-desktop-trust-session-boundaries", "dropbox-judge-prompt-change-budget", "dropbox-design-code-link-recovery"];
const october22Baseline = {"posts":{"openai-monitorability-pair-retry-metrics":"61c48397e70b6af8a609fa451e738c7da67a0e0e706c132813ab6a45668ea710","runway-claude-marketplace-procurement":"8524bc3463bb57b60aed830e54027b3c8f0da0eb70386c197da36e3b4208446c","gemini-gdc-airgap-managed-rag-preview":"b404463d63478a5f672cb9e69a4919781e7b0634cd38179643732c41ee1062b7","metr-anthropic-risk-review-scope-evidence":"75b82cdbb5e65edf4d0d7426bb6f23e406dfdf067b44596730ab080c6bb7aab8","deepseek-harness-preview-upgrade-acceptance":"44de886b63bd49f6e29aeb6df6b64ce45e22484b634c46565577ac1fb5b6153c","seedance25-reference-timeline-repair":"0b478ce46b0d63002867841f8e144d6104d531e108236b6ca560718712fd3359","seedream5pro-layered-diagram-review":"30d3dd62ca295785e19d4c816d273146960d095fae7c0fb70d5643fe6b6daa6a","spotify-eval-funnel-calibration":"29d71f713d44862f3c5a11561f1bbd8a9e978185ce265624ac2d3ad1b57e4eb2","aws-migration-playbook-evidence":"4383156394f86711cbe95370036fa424dbbda2733b5036573a159bd699cca52f","meta-ach-mutant-test-contract":"23eba86dd966b3c7981fc7ace758ee6683748251d854b4afcc6de6faec79ce34","minimax-m31-flash-effort-cost":"205937bece0596d0c2d47b0e536ea51f1a9cca4c613b5028755554074f7e73ca","gemini-notebook-prerender-review":"d2220608e9badca5b9790637aacd43748b1d40072f7f8d9c76d3e766936a19af","pixverse-template-slots-jobs":"f5e61db82ec5f9bdbc190526eccf1b5b1e5dd627d7e6f9298fc53cfe40261e21","gemini-october-api-retirement-window":"a90833e61978936e64a0595ec046e52519fd7ebe123e8914371bec1fbd955dc9","kimi-desktop-remote-review":"ab365fe747962759b25a4a207921bb668b5b5a2d6958939820a878f108d76577","openai-low-resource-behavior-parity":"24581b477de88aa83f6d3533a42f9e2791cfe65ea27f2e0eab116728c77f4888","muse-beam-open-weight-deployment":"efcf0e05ba47d5f109d9775d32245ff0a842a3089bb09a92f05d1a120087aabc","cloudflare-rule-lifecycle-review":"a07df039281887b4c267032d6b1cb669b3599bb24a6ad1c1eb3f4c3318a5f304","meta-forum-state-verification":"b626576ba51a1a0d90671b8f8638452e15d61bcc1551df500cda9d1891786779","mathworks-ears-mapping-review":"9f0c7a35d005a02f769859a42bb904f08903619ed33d3e27a8eed5ed3875ef06","deepseek-search-fetch-evidence":"2291b77e9a0707f2fce5e3223b645ea074a0f5f90c12c76231e94bde6d0445cf","airbnb-incremental-support-notes":"a63251a541273660582a8309b3155b77b76d8506e3718136753d07a6d4965d83","spotify-honk-verification-rollout":"42630f3308bb29ff8683b001e5fd89c0aa68202c15e8ba56d69e0087c10c4584","uber-autocover-test-acceptance":"ab12b8b0bd882a088c67e8e0f6fc5306e6fcd6cf1b4eb2d19202186fdd60019e","scania-spec2code-contract-gap":"9e54ac029dc40dc9e5e90e28d932ea6561118b23af4d360f364ab00c4cda8368","prompt-to-voice-reusable-brief":"8ce23fe19a2edd011766d1e38ced13999c267f6a6c1e0ae1dd5653dedf3fff1f","kling4-long-take-control":"420dfc75a0dbb710ffc1a546f55e5528d49d802ee1bfdd5b400d82289397cd66","decision-switching-threshold":"6a4ed9103895bec78038e3addd3affb50d33184316e16c6aaa4ccf5730b20ae4","learning-short-answer-hint-retest":"501579a24f0049aa7633b3a0c22fa7dc338a58acf82e5e597a55215d1bb44670","firmware-memory-delta-audit":"583d85b92957ebe0492869f532049fb595cd5eedbe784a5768e6d78d48deb922","opus55-fast-access":"5d343d3fb4f55de41b1ad13e273f1eef4f6b4f5a2d8579101d124bce430d8000","gptlive11-voice-corrections":"bc3b9993d381c6ca67bd1e601d7bf4d4a1c95d4cace11f03b4097f67fbbb21db","gemini4-argon-long-work":"121484ce1ee9148c2f7be640371a62f9cfba446c9cdb89ca8cab5446e873ecb0","runway-kling-api-workflow":"52b0018ad273e00a3f6af7862bdaa9f18207c16087737e1a83beb0199645990f","glm-legal-evidence-chain":"9da204d02ab84f8eb48a10f2af265f48759150c5844ef9e34be111d0234d8f4c","qwen-image21-api-alpha":"1e81ecb9ec1498e575ba292c96ade9342fcbc1fd892a0e23d88c62c5e854847d","gpt6-intelligent-ui":"5c9657cf1aaa75195a7c6ca9a419ed9f5c946dae43fd2e929f7cb219def47d11","haiku55-subagent-budget":"40589281778639c45c81447e065e3830efcbe09fe52cd9a3e2604707e5257c35","nano-banana21-continuity":"ab6cb4de6fb4fab6eb5b81028cdd2857bd5971e610074302afc9ee2b27cd618e","embeddinggemma2-local-retrieval":"5cd94802e402edfab230b73e19ee6b0dffeb3eb26d778cd37f907ede67e3c301","mistral-large4-preview":"74d300fc34b328dc749a34aec19c0ac87e0ec4220688eca5a0b702298f05a44f","mplab-agent-telemetry-pacing":"f23ee6f7a452db4833c4f3f58ff69b49aa8811cf8e2f134e288acbe7514631a4","memfault-crash-evidence-chain":"19b9006fd5e592f9efd3fd0332950afcf45a8195884f062d42fdd52c0ff9e69f","assertllm2-rtl-property-review":"b6d87a487535fb842ad4908bcd1bc08b35004d4c2c8a8f199d5da40a1cd59a39","firment-waveform-evidence":"affb6bfa3bdb4778904f9133b4a3a4fab2fb4190b29b0c15bde31b05095800f1","cantools-ai-wire-contract":"e2d91e4db45b36d183823818262761687888da7b3e9b52dd6b34e2aebcf88135","minicpm-local-image-check":"fd0add86b8ae410daf0349b44d383d17df575eb0d1d69ab111d26fe04a5714b7","sensor-unknown-state-gmm":"3b4eac0dd79fb5970aed643285a55a7bfe0cf27c58567093353906e8bd4e8d3f","sol-quality-cost":"f53d3c7c9d9c8b8b75da105a631a8a74df7ceaf105b77adf03ffad445b882b6a","deepseek-v41-migration":"05ea75bf12ecfaf87c4ba8bfb4a84fcdf41deeec532bbdab6ba13efc7698b376","qwen-omni-evidence":"220ef0f3c13e3f04c6b332933a303feb528d06e1458ec410510e4b0924f9c359","images25-edit-brief":"3baf2ae3963446ddc58573af93650d0815cfdb24ba9287d5022927e03dd73dff","renode-replay-lab":"bbc451336852b1abd4d491dfab43c79cc5fac6719bcefeece8304947508aa261","firmware-fuzz-harness":"52204b6f516e75ca58f3ecb7b9154fe9d30bd698d9ff29ab865f12c5ced39058","debug-probe-mcp":"063fa655a3e4838d61f72683df248a15fe8e0c7185fc909684d4c986a7fece58","datasheet-register-audit":"7ad32920da96b7456f3c19971fa940a7528e0338609da7bd07886c53fd7ea708","stm32-edge-ai-budget":"819ad707afc2051fe064ce466d246159ef51d35dec3c2cd3ded40d6666908811","firmware-agent-contract":"146a2eadf17defae9c0266ea2d82e35dd33eb6b480fc3a8a2ca32f262d4a62a9","context-task-eval":"8c96cdbc3b373c90733bc5b218854baa24f99c9e6043ad19d2f3b76d34c86095","espressif-mcp-workflow":"90b01873f620cb39f7e0040e56ea68e6881489c0ccc4d1b214f97ef95573e628","playwright-mcp-boundary":"cb62e3ed8797602aa5df5717d7abb4cde1d87a57981ce342a881c6643a2dcea5","skills-license-eval":"de1ddf6ab2990d2887a2a3324d7a2a6b90012a4f13121d7ff4759408523356d8","embedded-regression-copilot":"3d1ff145b4ddef0c06132990ee8f6c7ac18b2243e34e89cda1b3be8b01f00211","document-style-pipeline":"6d85313adc53f5a592474f69acdb78ce4164c63492147baa7a117f6ffc7d110a","dot-meeting-brief":"1e1e08ae0719a820459a68a4a0ef0356e3dd37570b4b2cf224041cf7a5f533b2","dot-bounded-follow-up":"76111ec1587cae86e39d500343d2945d973f5b958dd0586347950ed163a42478","dot-change-request":"73bdc58095365cb1c20fb099a3a0a8f2dc84bd45988efbc55cd4fc8735d6fbd1","research-conflicting-sources":"7f426c4e27e151214b91384b022eaa1e8063019ca554fc1c53e1a2a0fd8c8923","writing-two-examples":"08492c0f960d7d9c49a7fdabb6eec727741e85032cc143497b317ec43cd0d522","orders-cleaning-audit":"f043208c83891bb78919dd894df9af97f87ec06b1d528a020134cdaa80631828","image-edit-invariants":"db530d20a56191678834b869b084f8d5237047b21363e8408f81bedf6d1df94b","video-learning-evidence":"d0cd75374d542553b4bd74f3bbc76dd7d44bd30435a0b0cff3fe20f2838d0963","codex-small-fix-loop":"d1182d94cd77032b8a7c49962a91661e5928f09dac1410ba622d20449681c7e8"},"scenes":{"openai-monitorability-pair-retry-metrics":"b0eb54443de07342e850b219deb93aceec57e4250c5eb043efb36902fa05ff1a","runway-claude-marketplace-procurement":"3479bd8d6d59b288e1f85167a3302c5bbbaecd1a4b42fbd8ff5b1ac957ce4b97","gemini-gdc-airgap-managed-rag-preview":"73d98ba22c98d7f9f778bebd8fc2580935fa3957723b11c3d34d825b13722e1a","metr-anthropic-risk-review-scope-evidence":"d2720ede1d792e8b4d71aa041cc7e0fccc8166c89686e6aac74bd69c9997b43c","deepseek-harness-preview-upgrade-acceptance":"e51baccaaa7613fa4cb0405725990ff5854aa1fa0037bfaf279f06f60f8b5042","seedance25-reference-timeline-repair":"18224853a9d889de88fc2fc07e84bd2d05f97a44d1398d8e7d9c1bbdc7f80b18","seedream5pro-layered-diagram-review":"8ead950d70db4e56e03eb839e1aa35d4e43f74368478791c27b87a9a819bfb50","spotify-eval-funnel-calibration":"43e8414456eb2f787b66d816cbf8c21ee9fdb74ab3c532c3e406dc3dc852cded","aws-migration-playbook-evidence":"5a6c5500910ba54711133df32fc7041c899f956e0e1647b279e453d896fc586e","meta-ach-mutant-test-contract":"fdcfa9b359c36f494e7ffecef5d8b06b1375e9ed48fcc9fdcec49b8f8bc1b726","minimax-m31-flash-effort-cost":"587ab389ce8c07f70c952e708ce54497ea6d5ce11ec40d9c5baf5a192987b06a","gemini-notebook-prerender-review":"84803926844efe41463668a971bdcabc6deb33b79d39aa7d8b5e401e3314b285","pixverse-template-slots-jobs":"1f803b8449fe8724da02c102485f2ed491c4f527968b7ad5699f8a3270239837","gemini-october-api-retirement-window":"bfdef308a3e96deb022cd6063fc163663cbf44f4eae5f91888bc9af8a0018df5","kimi-desktop-remote-review":"36673ae692f94e9b555a796b36a76b4202bf53a7a4b1a424ebd0c1a1137afb46","openai-low-resource-behavior-parity":"a49a22725f5090c9946cbc583bdb532e2fb4c02499515271522edcb0db4d7611","muse-beam-open-weight-deployment":"fc15cd8f50c93d48d22318780a0118d2247408426827b60056a0d373713c39cb","cloudflare-rule-lifecycle-review":"26c132c50fbd9d7dcfe61798ee8ed5ce1b72704504fa54ba5303b3d162aa5852","meta-forum-state-verification":"4baf27b21b49c2c0fc74fbb46435ef8544851d9d4adb62858a1b14d713422c96","mathworks-ears-mapping-review":"adb75184b30156125e23d3a19723bc884cb9e230934760cb6cbce704af041820","deepseek-search-fetch-evidence":"a85c43e589807cbf631ffd3c58bfad24e6f841b85e79ad5ddfba33bef58bc6cf","airbnb-incremental-support-notes":"2a6612e4c229e677618be3fa1dee15f80018aee4666cb0a0f2c94b1baf7f14dd","spotify-honk-verification-rollout":"2ab648ae586ac7ce173dcc69e8e99362591f4565b7509eaf3a0af9e3498a29f2","uber-autocover-test-acceptance":"93cb45b55189d9e5539e191019eea33ee79bddf9dd7f4fc559a0a366d87c64bc","scania-spec2code-contract-gap":"42d1910826736a2d1e2359f77ee61e98d8bae4ab3f95cc1aa2760653e20a9833","prompt-to-voice-reusable-brief":"084110d9ee279bbf11af4b441f802b9b3a8a725c7d20eaf6d9284dfa39f61cd1","kling4-long-take-control":"62799f892ec6b3cf79330c3751fe5bc81c2a84ad54e7ddd95e311b832f17ee0a","decision-switching-threshold":"7903838acfab4640dc450e4475012fbc8d3575f13376079c4c37f1500883da0a","learning-short-answer-hint-retest":"83adb4a7bcb3a63d10449657d7f34aae6071091c84382fc8e075d1cc5cd92323","firmware-memory-delta-audit":"e2757f410a9fdc59f1fa8b3f1a64e3ba29ff96500794fb9c9441979acd8be345","opus55-fast-access":"4adf26b679bcc54f022f95b4fe8ce05a12ad5659b40150003386a205242dc3a2","gptlive11-voice-corrections":"90a546fb4fc93f4e703e55a6319ba8742ff3920fa5bbbc36b8dcfd6684577dc6","gemini4-argon-long-work":"3f5357476daa50f9dae14e6dffa4e358b25f492b88db72b88bb4fcbd2ab18bf1","runway-kling-api-workflow":"ec96e7d3ed9c9eb159b9b2756791c6906707497d216110310da7a543b7cc2054","glm-legal-evidence-chain":"0847157a51d87c38680a1883fcded1cb186acd2f5cfdf4b99964dceeab23ef16","qwen-image21-api-alpha":"8ecb0f5e3e13e7ee8d5ae178f53b558f52004cf253f5bbc77e0a6cd994453791","gpt6-intelligent-ui":"b25e050a79bcc2a4a89b2a2980645ae06d74d03b586fdc4e4b0b0f36b89af766","haiku55-subagent-budget":"13cf6a2089f016c3ce1f0114f0ddb57d76077047f1df51fb3a323bec3704efc4","nano-banana21-continuity":"7360b9df5dbc06c7de72f27cdb2bb978ebe64c9f6d5d1cf7c640c081cadb5d93","embeddinggemma2-local-retrieval":"1c15811ae86029d28cf952201672d302e49313d5685b4d1bf3264442b075cb7e","mistral-large4-preview":"eef9211bdf2841306f03d4255f5536529d2712a0b87fdc349f7345a33b249e96","mplab-agent-telemetry-pacing":"98f7942e28b93b416bd5fb1a01189da287770e79f19b19b9ffe7811f7f4aeea9","memfault-crash-evidence-chain":"589792d5a3a877b4dd874d149996ce639c571c340ddcc31e71645e2d42b222c9","assertllm2-rtl-property-review":"e91f5ee4397da1789fa5343cb2adbc92c0daadd38df6cf6edf7a2ac1a7ed0a9d","firment-waveform-evidence":"47e4d63c6cc4715350747ebc0d96ddaeeccd22c10ddef67298d50328b8a3cd41","cantools-ai-wire-contract":"be2a8be95077dfc14460ce8d63348efb55fbe8b1689cc51e6e3252596cfa31fc","minicpm-local-image-check":"fa17a45f81ee28c814e29c26d199cc8755d082856373289c73671e071875cb12","sensor-unknown-state-gmm":"2a249413d4e9ab7d75f558b93234c16ebe2e78505a5eeadd992094aa3eed7c3a","sol-quality-cost":"21ac08e4a30889f92d381fa976e7f9eb05a33efa05c444f3afaed743c986649e","deepseek-v41-migration":"c552e257157ccebf462c5d2de48023234cebcf5f38861ca937e78dcdfdf2e790","qwen-omni-evidence":"253ecdbfa2c0dea216716d0be36a7381b1f70652f31638785a4178ed713f3ee0","images25-edit-brief":"ba77c9ee45199dfcaf0bca9cd9f31438ee82d06766a092731add3035bec0b9c2","renode-replay-lab":"02529004caba1c922ab3d690b3aad588fab1ca33eae0daef85b89c3f56511a99","firmware-fuzz-harness":"089f5a9ebdf188ab3e4575eab1f5c756732aadb3177952f01431567c8fd7f4d3","debug-probe-mcp":"ca23b159b62c8fdf7ab35ebec262ffe31fe11b3dd941e631cb2dd1de06ab432f","datasheet-register-audit":"ac50c025ad093bba38ff389df2334f5f29e01fc87ad0ee97aebf1d427ecf5701","stm32-edge-ai-budget":"3463da3b40663b7296560028a5b8af5e3efcd084d6ebe3cc47f397b89327896f","firmware-agent-contract":"cf9dbbe92d84749fb634e26345b8b5e72c7a5ca1dcefb74e320a94dd18b3029f","context-task-eval":"4cf4541762a4b088e7f4011943066ecf25c12ab4115ffb51c12e582f06cf30f9","espressif-mcp-workflow":"63fa25ccd1534820f5899d41ca7a0116fc39e57b7d519f5dde0ba1d07dc68a96","playwright-mcp-boundary":"d13701f012853926a1c127ccd36325b94083ade013acf0ac06971e8b95d6a6ed","skills-license-eval":"de41448284606b587eb01f3f52467148abfe329eb4afb64f7095d6de51652553","embedded-regression-copilot":"0d8d2283b73273ccc9a7d3796502bcc1829e51c11901f43981694c80d21ac2ea","document-style-pipeline":"6e4abe39ece7436424ab728a07da99038cb267dd0f0c08c91806354f13c07b75","dot-meeting-brief":"4a18fe99ee18228ac2ea8dd08c7d06816bbc7dd475642a09df71b664289f3e34","dot-bounded-follow-up":"84e7fc7f83600649ed9d672287d8dfd0cc33ffdecae66cd7a7e5a0340e789eb3","dot-change-request":"2d78da6f25d6ea5d47d3067a5d597d8e304b41602a0321d27c90e9d2daf8cc73","research-conflicting-sources":"f2ddf755914405abf96632ad8b54e6353f492322f3d36384bade89dbabb505e2","writing-two-examples":"fda4d9625c4a38559a612483510673de3a65cb0f28478f943f5f3e8bb8addd10","orders-cleaning-audit":"eac249de66543c18ca22b17f9a961174a336d9db5bed9a69d4498fbf2c61cef6","image-edit-invariants":"8fbc5aaee484a75ba7f90badfee66feefcb16c4eea375ed91be3cb8c9ec69b02","video-learning-evidence":"fe6f5a20880ffcc649a26c4ec6cf8a01bef309ce178247c6757ddb7c44a986d0","codex-small-fix-loop":"97e754ab244ea90773db163c6b8959f96f555cd1ba2234d015455d6cdb27f670"},"files":{"app.js":"3f11837199a84b29e606682c4b88a17632fea212e8cabad2eab2570564305157","site-core.js":"b4f96a7f0557c322c3c2e42cfcf14d1545585d06420cfc1147c03bc5b7b33589","style.css":"5e159c776246dcd48bf52117e649feb7250bbffb9f49a707bbb2d9b3cf3c5c8b","visuals.css":"7cf30aa521f1fe9e7589608376199737cb797efc3ab2a63799c97d7ac0d4d00d","build.py":"25deb0b707c7e7ae97e1306b94afcab5d0156c8a7ff8495a980140e4ebb2f524","favicon.svg":"b33e38910db7f167eb595800e4fa779577885204e090115732215704f1be1db5","DESIGN.md":"23cb37aa5f8c5df788d9587f03e8e2b01a2b955f5d26b4862e7f1dc5439e5a96","THIRD_PARTY_NOTICES.md":"e10fafb73c4164f3cc2f5350a0ec70c500ab6417cc935a9140b69e49b74daf60"}};
const october22Scenes = {"google-cloud-openai-private-preview": {"title": "目录、资格和安全条件分别核实", "labels": ["企业私测", "当前交付", "后续计划"], "panels": [["部分企业", "申请 ≠ 获准", "三个GPT型号", "不是新模型发布"], ["统一采购", "API推理", "本地Codex衔接", "接口仍需验收"], ["尚待开放", "ZDR / 机密计算", "业务产品集成", "不能预先承诺"]], "status": ["10月21日公告是部分企业私有预览，不是全面开放。", "同一模型目录仍可能有不同权限、费用和接口边界。", "不用于训练不能等同零留存，后续计划不能当当前能力。", "合成团队尚未获准且要求ZDR，不能立即判断迁移条件满足。"]}, "openai-monitor-alerts-boundary-incidents": {"title": "功能、监测、通知，各有独立证据", "labels": ["业务功能", "监测覆盖", "人工接收"], "panels": [["迁移完成", "功能测试通过", "仅支持业务结论", "不扩展安全权限"], ["结果存在", "日志仍产生", "覆盖范围另核", "不能只读总结"], ["告警链路", "接收是否送达", "响应是否有效", "原因仍待研究"]], "status": ["两起事件发生于10月3日和6日，10月20日公开，日期分开记录。", "功能通过不证明监测完整，记录存在不证明通知已送达。", "官方仍研究原因，不从两例推算失效率或认定主观动机。", "图示只读评审，不运行代理，也不执行任何安全配置修改。"]}, "fasth3-omni-weights-runtime-license": {"title": "输入总量、运行条件和许可一起看", "labels": ["参考素材", "服务器数据", "本地路径"], "panels": [["8图 + 3视频", "再加2音频", "共13份 > 12", "至少减一份"], ["8 × GB200", "27组工作负载", "完整服务配方", "不是单组件加速"], ["量化另有配方", "480p默认", "硬件 / 精度", "地域许可先核"]], "status": ["每类素材上限不能直接相加，总参考数量仍不得超过12。", "发布团队速度比较附带服务器硬件与配方，不等于桌面实时。", "BF16、FP8和NVFP4 QAD可能有不同输出，需分别验收。", "模型权重采用自定义社区许可，本站没有下载或运行模型。"]}, "openai-12h-cache-reuse-economics": {"title": "先付写入费，再看够不够复用", "labels": ["合成单价", "两次调用", "三次调用"], "panels": [["普通输入 = 1", "长写入 = 2.5", "后续读取 = 0.1", "只算同一前缀"], ["2.5 + 0.1", "合计2.6", "不缓存是2", "长缓存更贵"], ["2.5 + 2×0.1", "合计2.7", "不缓存是3", "不是短缓存比较"]], "status": ["此算例只比较完全不缓存基线，不包含其他输入和输出费用。", "两次复用场景总计2.6，不能因读取便宜就宣称省钱。", "三次总计2.7低于3，仍需时间分布才能与短缓存比较。", "覆盖时长保障符合条件的读取计价，不是必然低延迟保证。"]}, "claude-duet-preview-attention-budget": {"title": "主动准备不等于已获准行动", "labels": ["信息变化", "提醒策略", "待批动作"], "panels": [["明日会议冲突", "无期限资料更新", "对外报价请求", "虚构材料"], ["冲突及时提醒", "资料合并简报", "后台也占额度", "不是无限监控"], ["报价先起草", "确认对象与内容", "批准后才执行", "本站未实际使用"]], "status": ["10月21日研究预览从美国Pro/Max候补用户开始，不是全球开放。", "云端虚拟机可持续工作，不要求原电脑一直开机。", "后台检查和其他Claude任务共享额度，提醒越多不等于越好。", "报价可准备草稿，不能推定已获准发送或作价格承诺。"]}, "dropbox-judge-prompt-change-budget": {"title": "任务契约不变，失败仍留在分母", "labels": ["评分契约", "两种候选", "三项一起看"], "panels": [["先固定", "1–5分", "字段与错误处理", "不许改题目"], ["四项合成输出", "A · 一项无效", "B · 两项差1分", "其余符合"], ["总误差", "A · 25", "B · 3.125", "有效率另列"]], "status": ["迁移时重写提示与生产时选择指令，是不同修改范围。", "A有效率75%，只看可解析样本会掩盖失败。", "B总NMSE为3.125，但四个合成样本不证明泛化。", "禁止记忆文件名或缩小分值范围，候选仍需独立留出检验。"]}, "dropbox-design-code-link-recovery": {"title": "先配对正确材料，再核实现与测试", "labels": ["设计范围", "关联候选", "仍需补证"], "panels": [["D1 · 杉木A", "完整配置导出", "诊断导出", "都不得含令牌"], ["PR-A 属于B", "PR-B 摘要相符", "PR-C 仅能打开", "不能互相替代"], ["分开核实", "具体实现", "两条路径", "字段缺失测试"]], "status": ["标题相似不证明同一设备实现，PR-A属于另一代际。", "PR-B无回链仍可为关联候选，摘要不是实现和运行证据。", "PR-C只记录功能成功，没有证明输出不含令牌。", "公司关系恢复比例不是漏洞检出率，嵌入式练习未实物验证。"]}, "kimi-desktop-trust-session-boundaries": {"title": "项目可信、上下文连续、配置生效，分别确认", "labels": ["工作区信任", "模型切换", "配置与视图"], "panels": [["本地项目来源", "项目级MCP", "拒绝则不发消息", "不是沙箱认证"], ["新建会话", "压缩后继续", "直接继续", "保留未完成检查"], ["重载有条件", "生成中不可重载", "多端非实时", "核对最新状态"]], "status": ["1.1.1工作区信任会影响项目级工具配置，不只是显示标签。", "模型切换的三种选项改变上下文处理，不能省略原有约束。", "磁盘文件已保存不等于运行会话已加载，也不等于其他窗口已刷新。", "本图仅解释官方状态，不调用接口或自动批准陌生工作区。"]}};
check('October 22 preserves all73 prior objects, scene renders and fixed runtime assets',()=>{
 assert.equal(data.posts.length,73+october22Ids.length+6+9+8);assert.deepEqual(data.posts.slice(october22Ids.length+6+9+8).map(p=>p.id),Object.keys(october22Baseline.posts));
 for(const [id,hash] of Object.entries(october22Baseline.posts)){const p=data.posts.find(p=>p.id===id);assert.equal(sha256(JSON.stringify(beforeOctober25(p))),hash,id);const scope={window:{}};vm.runInNewContext(visuals,scope);assert.equal(sha256(scope.window.FieldnoteVisuals.render(p)),october22Baseline.scenes[id],id);}
 for(const [file,hash] of Object.entries(october22Baseline.files))assert.equal(sha256(read(file)),hash,file);
});
check('October 22 additions keep original dates, complete sources, bounded exercises and pending learning',()=>{
 for(const id of october22Ids){const p=data.posts.find(p=>p.id===id),text=JSON.stringify(p);assert.equal(p.verifiedAt,'2026-10-22');assert(p.date<'2026-10-22');assert.equal(p.learningStatus,'待学习');assert(p.sources.length);assert(p.license&&p.maturity&&p.maintenance);assert(/未|没有|不是本站/.test(p.caveat));
 assert.deepEqual(p.paragraphs,p.summary);assert.deepEqual(p.takeaways,p.steps);assert.equal(p.limitations,p.caveat);for(const term of ['chatgpt.com/c/','/workspace/','sandbox:','已经掌握','本站实测成功'])assert(!text.includes(term),id+term);for(const s of p.sources)assert.equal(new URL(s.url).protocol,'https:');}
});
check('October 22 diagrams have unique teaching panels and accessible automatic notes',()=>{
 const env=boot({observer:true});const panels=[];for(const id of october22Ids){const n=env.get('#visual-'+id),spec=october22Scenes[id];assert(n.textContent.includes(spec.title));assert.equal(n.querySelectorAll('.fv-note').length,4);assert.equal(n.querySelectorAll('.fv-note-list li').length,4);assert.equal(n.querySelectorAll('button').length,0);for(const text of spec.status)assert(n.textContent.includes(text));panels.push(JSON.stringify(spec.panels));}assert.equal(new Set(panels).size,october22Ids.length);
});
check('October 22 article routes, copy, saved state, keyboard focus and return paths remain compatible',async()=>{
 for(const id of october22Ids){const p=data.posts.find(p=>p.id===id),env=boot({observer:true});env.click('[data-category="'+p.category+'"]');assert.equal(env.get('.region-filter').hidden,p.category!=='industry');if(p.category==='industry')env.click('[data-region="'+p.region+'"]');env.click('#title-'+id+' a');assertView(env,'article');assert.equal(env.get('#article-title').textContent,p.title);assert.equal(env.document.activeElement.id,'article-title');env.click('#article-view [data-copy-prompt]');await env.settle();assert.equal(env.clipboard.at(-1),p.tryThis.prompt);env.click('#article-view [data-save="'+id+'"]');assert.equal(env.get('#article-view [data-save="'+id+'"]').getAttribute('aria-pressed'),'true');env.click('#article-view [data-back]');assertView(env,'feed');env.forward();assertView(env,'article');for(const hash of [C.postHash(id),'#post='+id,'#article/'+id]){const direct=boot({url:'https://example.test/publication/'+hash});assertView(direct,'article');assert.equal(direct.get('#article-title').textContent,p.title);}}
});
check('Cache arithmetic compares only the stated baseline and preserves lifetime boundaries',()=>{
 const p=data.posts.find(p=>p.id==='openai-12h-cache-reuse-economics'),s=JSON.stringify(p);assert.equal(2.5+.1,2.6);assert.equal(2.5+2*.1,2.7);for(const term of ['2.6','2.7','短缓存','不是删除期限','总价'])assert(s.includes(term),term);
});
check('Dropbox examples separate invalid outputs, held-out evidence and document implementation pairing',()=>{
 const judge=data.posts.find(p=>p.id==='dropbox-judge-prompt-change-budget'),trace=data.posts.find(p=>p.id==='dropbox-design-code-link-recovery');assert.equal(100/4,25);assert.equal((1/16+1/16)/4*100,3.125);for(const term of ['75%','25','3.125','留出'])assert(judge.tryThis.expected.includes(term));for(const term of ['不是漏洞检出率','原创迁移','未知'])assert(JSON.stringify(trace).includes(term),term);assert.equal(judge.date,'2026-03-17');assert.equal(trace.date,'2026-06-12');
});
check('Current announcements distinguish private access, planned features and vendor-only performance',()=>{
 const text=id=>JSON.stringify(data.posts.find(p=>p.id===id));for(const term of ['私有预览','coming soon','ZDR'])assert(text('google-cloud-openai-private-preview').includes(term));for(const term of ['候补','额度','不能向用户展示'])assert(text('claude-duet-preview-attention-budget').includes(term));for(const term of ['GB200','BF16','NVFP4','未执行'])assert(text('fasth3-omni-weights-runtime-license').includes(term));assert.equal(8+3+2,13);for(const term of ['10月3日','6日','未定论'])assert(text('openai-monitor-alerts-boundary-incidents').includes(term));
});

const october23Ids = ["minimax-miniapp-persistent-review", "xing-intent-schema-multiple-results", "deepinfer-engine-service-gap", "claude-api-dated-version-migration", "brex-oncall-runbook-evidence", "zalando-search-intent-language-parity"];
const october23Baseline = {"posts":{"claude-duet-preview-attention-budget":"19f2ae7f522b8a728ae2ed37bdb31bd26f29951112f1b58d2c47aae3d1fea39e","google-cloud-openai-private-preview":"9b223b459f2f055367b1ab524291efb9f0bf3c962474a42c0963e6869a4540aa","openai-monitor-alerts-boundary-incidents":"bb51a946be3517dde52d8bb4d462f0631e22d54aa9d38d43ec130f171812ffd5","fasth3-omni-weights-runtime-license":"f370da020850bfaa02ae4824fa9f5c4eecf9e760cf382bb839ce0dfaf7408951","openai-12h-cache-reuse-economics":"651f234240d00ec00478fb222f19b40e604ca3770336b0c30ea60d3f926c5ceb","kimi-desktop-trust-session-boundaries":"7c52b32be3782b5e310ffcfb038988908a8758b6826911ebb92cd5981719c344","dropbox-judge-prompt-change-budget":"af809683e7a1d6ec0690b0ac1cb2cb9a6029077a487e1228aad0f7c845c5658a","dropbox-design-code-link-recovery":"915f9676a1b04f2a9b84a84b9d8e79ee35ea18133a04ff846dced2069f696103","openai-monitorability-pair-retry-metrics":"61c48397e70b6af8a609fa451e738c7da67a0e0e706c132813ab6a45668ea710","runway-claude-marketplace-procurement":"8524bc3463bb57b60aed830e54027b3c8f0da0eb70386c197da36e3b4208446c","gemini-gdc-airgap-managed-rag-preview":"b404463d63478a5f672cb9e69a4919781e7b0634cd38179643732c41ee1062b7","metr-anthropic-risk-review-scope-evidence":"75b82cdbb5e65edf4d0d7426bb6f23e406dfdf067b44596730ab080c6bb7aab8","deepseek-harness-preview-upgrade-acceptance":"44de886b63bd49f6e29aeb6df6b64ce45e22484b634c46565577ac1fb5b6153c","seedance25-reference-timeline-repair":"0b478ce46b0d63002867841f8e144d6104d531e108236b6ca560718712fd3359","seedream5pro-layered-diagram-review":"30d3dd62ca295785e19d4c816d273146960d095fae7c0fb70d5643fe6b6daa6a","spotify-eval-funnel-calibration":"29d71f713d44862f3c5a11561f1bbd8a9e978185ce265624ac2d3ad1b57e4eb2","aws-migration-playbook-evidence":"4383156394f86711cbe95370036fa424dbbda2733b5036573a159bd699cca52f","meta-ach-mutant-test-contract":"23eba86dd966b3c7981fc7ace758ee6683748251d854b4afcc6de6faec79ce34","minimax-m31-flash-effort-cost":"205937bece0596d0c2d47b0e536ea51f1a9cca4c613b5028755554074f7e73ca","gemini-notebook-prerender-review":"d2220608e9badca5b9790637aacd43748b1d40072f7f8d9c76d3e766936a19af","pixverse-template-slots-jobs":"f5e61db82ec5f9bdbc190526eccf1b5b1e5dd627d7e6f9298fc53cfe40261e21","gemini-october-api-retirement-window":"a90833e61978936e64a0595ec046e52519fd7ebe123e8914371bec1fbd955dc9","kimi-desktop-remote-review":"ab365fe747962759b25a4a207921bb668b5b5a2d6958939820a878f108d76577","openai-low-resource-behavior-parity":"24581b477de88aa83f6d3533a42f9e2791cfe65ea27f2e0eab116728c77f4888","muse-beam-open-weight-deployment":"efcf0e05ba47d5f109d9775d32245ff0a842a3089bb09a92f05d1a120087aabc","cloudflare-rule-lifecycle-review":"a07df039281887b4c267032d6b1cb669b3599bb24a6ad1c1eb3f4c3318a5f304","meta-forum-state-verification":"b626576ba51a1a0d90671b8f8638452e15d61bcc1551df500cda9d1891786779","mathworks-ears-mapping-review":"9f0c7a35d005a02f769859a42bb904f08903619ed33d3e27a8eed5ed3875ef06","deepseek-search-fetch-evidence":"2291b77e9a0707f2fce5e3223b645ea074a0f5f90c12c76231e94bde6d0445cf","airbnb-incremental-support-notes":"a63251a541273660582a8309b3155b77b76d8506e3718136753d07a6d4965d83","spotify-honk-verification-rollout":"42630f3308bb29ff8683b001e5fd89c0aa68202c15e8ba56d69e0087c10c4584","uber-autocover-test-acceptance":"ab12b8b0bd882a088c67e8e0f6fc5306e6fcd6cf1b4eb2d19202186fdd60019e","scania-spec2code-contract-gap":"9e54ac029dc40dc9e5e90e28d932ea6561118b23af4d360f364ab00c4cda8368","prompt-to-voice-reusable-brief":"8ce23fe19a2edd011766d1e38ced13999c267f6a6c1e0ae1dd5653dedf3fff1f","kling4-long-take-control":"420dfc75a0dbb710ffc1a546f55e5528d49d802ee1bfdd5b400d82289397cd66","decision-switching-threshold":"6a4ed9103895bec78038e3addd3affb50d33184316e16c6aaa4ccf5730b20ae4","learning-short-answer-hint-retest":"501579a24f0049aa7633b3a0c22fa7dc338a58acf82e5e597a55215d1bb44670","firmware-memory-delta-audit":"583d85b92957ebe0492869f532049fb595cd5eedbe784a5768e6d78d48deb922","opus55-fast-access":"5d343d3fb4f55de41b1ad13e273f1eef4f6b4f5a2d8579101d124bce430d8000","gptlive11-voice-corrections":"bc3b9993d381c6ca67bd1e601d7bf4d4a1c95d4cace11f03b4097f67fbbb21db","gemini4-argon-long-work":"121484ce1ee9148c2f7be640371a62f9cfba446c9cdb89ca8cab5446e873ecb0","runway-kling-api-workflow":"52b0018ad273e00a3f6af7862bdaa9f18207c16087737e1a83beb0199645990f","glm-legal-evidence-chain":"9da204d02ab84f8eb48a10f2af265f48759150c5844ef9e34be111d0234d8f4c","qwen-image21-api-alpha":"1e81ecb9ec1498e575ba292c96ade9342fcbc1fd892a0e23d88c62c5e854847d","gpt6-intelligent-ui":"5c9657cf1aaa75195a7c6ca9a419ed9f5c946dae43fd2e929f7cb219def47d11","haiku55-subagent-budget":"40589281778639c45c81447e065e3830efcbe09fe52cd9a3e2604707e5257c35","nano-banana21-continuity":"ab6cb4de6fb4fab6eb5b81028cdd2857bd5971e610074302afc9ee2b27cd618e","embeddinggemma2-local-retrieval":"5cd94802e402edfab230b73e19ee6b0dffeb3eb26d778cd37f907ede67e3c301","mistral-large4-preview":"74d300fc34b328dc749a34aec19c0ac87e0ec4220688eca5a0b702298f05a44f","mplab-agent-telemetry-pacing":"f23ee6f7a452db4833c4f3f58ff69b49aa8811cf8e2f134e288acbe7514631a4","memfault-crash-evidence-chain":"19b9006fd5e592f9efd3fd0332950afcf45a8195884f062d42fdd52c0ff9e69f","assertllm2-rtl-property-review":"b6d87a487535fb842ad4908bcd1bc08b35004d4c2c8a8f199d5da40a1cd59a39","firment-waveform-evidence":"affb6bfa3bdb4778904f9133b4a3a4fab2fb4190b29b0c15bde31b05095800f1","cantools-ai-wire-contract":"e2d91e4db45b36d183823818262761687888da7b3e9b52dd6b34e2aebcf88135","minicpm-local-image-check":"fd0add86b8ae410daf0349b44d383d17df575eb0d1d69ab111d26fe04a5714b7","sensor-unknown-state-gmm":"3b4eac0dd79fb5970aed643285a55a7bfe0cf27c58567093353906e8bd4e8d3f","sol-quality-cost":"f53d3c7c9d9c8b8b75da105a631a8a74df7ceaf105b77adf03ffad445b882b6a","deepseek-v41-migration":"05ea75bf12ecfaf87c4ba8bfb4a84fcdf41deeec532bbdab6ba13efc7698b376","qwen-omni-evidence":"220ef0f3c13e3f04c6b332933a303feb528d06e1458ec410510e4b0924f9c359","images25-edit-brief":"3baf2ae3963446ddc58573af93650d0815cfdb24ba9287d5022927e03dd73dff","renode-replay-lab":"bbc451336852b1abd4d491dfab43c79cc5fac6719bcefeece8304947508aa261","firmware-fuzz-harness":"52204b6f516e75ca58f3ecb7b9154fe9d30bd698d9ff29ab865f12c5ced39058","debug-probe-mcp":"063fa655a3e4838d61f72683df248a15fe8e0c7185fc909684d4c986a7fece58","datasheet-register-audit":"7ad32920da96b7456f3c19971fa940a7528e0338609da7bd07886c53fd7ea708","stm32-edge-ai-budget":"819ad707afc2051fe064ce466d246159ef51d35dec3c2cd3ded40d6666908811","firmware-agent-contract":"146a2eadf17defae9c0266ea2d82e35dd33eb6b480fc3a8a2ca32f262d4a62a9","context-task-eval":"8c96cdbc3b373c90733bc5b218854baa24f99c9e6043ad19d2f3b76d34c86095","espressif-mcp-workflow":"90b01873f620cb39f7e0040e56ea68e6881489c0ccc4d1b214f97ef95573e628","playwright-mcp-boundary":"cb62e3ed8797602aa5df5717d7abb4cde1d87a57981ce342a881c6643a2dcea5","skills-license-eval":"de1ddf6ab2990d2887a2a3324d7a2a6b90012a4f13121d7ff4759408523356d8","embedded-regression-copilot":"3d1ff145b4ddef0c06132990ee8f6c7ac18b2243e34e89cda1b3be8b01f00211","document-style-pipeline":"6d85313adc53f5a592474f69acdb78ce4164c63492147baa7a117f6ffc7d110a","dot-meeting-brief":"1e1e08ae0719a820459a68a4a0ef0356e3dd37570b4b2cf224041cf7a5f533b2","dot-bounded-follow-up":"76111ec1587cae86e39d500343d2945d973f5b958dd0586347950ed163a42478","dot-change-request":"73bdc58095365cb1c20fb099a3a0a8f2dc84bd45988efbc55cd4fc8735d6fbd1","research-conflicting-sources":"7f426c4e27e151214b91384b022eaa1e8063019ca554fc1c53e1a2a0fd8c8923","writing-two-examples":"08492c0f960d7d9c49a7fdabb6eec727741e85032cc143497b317ec43cd0d522","orders-cleaning-audit":"f043208c83891bb78919dd894df9af97f87ec06b1d528a020134cdaa80631828","image-edit-invariants":"db530d20a56191678834b869b084f8d5237047b21363e8408f81bedf6d1df94b","video-learning-evidence":"d0cd75374d542553b4bd74f3bbc76dd7d44bd30435a0b0cff3fe20f2838d0963","codex-small-fix-loop":"d1182d94cd77032b8a7c49962a91661e5928f09dac1410ba622d20449681c7e8"},"scenes":{"claude-duet-preview-attention-budget":"0b82a4a9bf0bd996461a5d347398cc594ab61f78c12b15e8e0bd78600e98866c","google-cloud-openai-private-preview":"b9d8e4483687605a871c9bc8958944efcf521e1678b4f3e8f858540338133b5b","openai-monitor-alerts-boundary-incidents":"50fe45065016cefc82ace42e2032d8d2c1b874ed823e89aa698ae35d61506b21","fasth3-omni-weights-runtime-license":"91ab28b690af7b362d1fa639d68dfca41772d34263ff24a1ad0ff79d02986b37","openai-12h-cache-reuse-economics":"6e0698a14e4d66dd6d1513661d9974e3eacb98a662d67da07472ebbac11a866e","kimi-desktop-trust-session-boundaries":"d6617d36cfbc5aedf75e3d6797fa6d89c99537ea520fb07acdaf132b14dbdc89","dropbox-judge-prompt-change-budget":"6601521e1ab6a775264f30b1e61b8ff49ebd1c4f5dad866cb9fb842c757e147f","dropbox-design-code-link-recovery":"79cbd5272111cc1d057caa8083b15054762c1347e62af234c49cd0616f010b26","openai-monitorability-pair-retry-metrics":"b0eb54443de07342e850b219deb93aceec57e4250c5eb043efb36902fa05ff1a","runway-claude-marketplace-procurement":"3479bd8d6d59b288e1f85167a3302c5bbbaecd1a4b42fbd8ff5b1ac957ce4b97","gemini-gdc-airgap-managed-rag-preview":"73d98ba22c98d7f9f778bebd8fc2580935fa3957723b11c3d34d825b13722e1a","metr-anthropic-risk-review-scope-evidence":"d2720ede1d792e8b4d71aa041cc7e0fccc8166c89686e6aac74bd69c9997b43c","deepseek-harness-preview-upgrade-acceptance":"e51baccaaa7613fa4cb0405725990ff5854aa1fa0037bfaf279f06f60f8b5042","seedance25-reference-timeline-repair":"18224853a9d889de88fc2fc07e84bd2d05f97a44d1398d8e7d9c1bbdc7f80b18","seedream5pro-layered-diagram-review":"8ead950d70db4e56e03eb839e1aa35d4e43f74368478791c27b87a9a819bfb50","spotify-eval-funnel-calibration":"43e8414456eb2f787b66d816cbf8c21ee9fdb74ab3c532c3e406dc3dc852cded","aws-migration-playbook-evidence":"5a6c5500910ba54711133df32fc7041c899f956e0e1647b279e453d896fc586e","meta-ach-mutant-test-contract":"fdcfa9b359c36f494e7ffecef5d8b06b1375e9ed48fcc9fdcec49b8f8bc1b726","minimax-m31-flash-effort-cost":"587ab389ce8c07f70c952e708ce54497ea6d5ce11ec40d9c5baf5a192987b06a","gemini-notebook-prerender-review":"84803926844efe41463668a971bdcabc6deb33b79d39aa7d8b5e401e3314b285","pixverse-template-slots-jobs":"1f803b8449fe8724da02c102485f2ed491c4f527968b7ad5699f8a3270239837","gemini-october-api-retirement-window":"bfdef308a3e96deb022cd6063fc163663cbf44f4eae5f91888bc9af8a0018df5","kimi-desktop-remote-review":"36673ae692f94e9b555a796b36a76b4202bf53a7a4b1a424ebd0c1a1137afb46","openai-low-resource-behavior-parity":"a49a22725f5090c9946cbc583bdb532e2fb4c02499515271522edcb0db4d7611","muse-beam-open-weight-deployment":"fc15cd8f50c93d48d22318780a0118d2247408426827b60056a0d373713c39cb","cloudflare-rule-lifecycle-review":"26c132c50fbd9d7dcfe61798ee8ed5ce1b72704504fa54ba5303b3d162aa5852","meta-forum-state-verification":"4baf27b21b49c2c0fc74fbb46435ef8544851d9d4adb62858a1b14d713422c96","mathworks-ears-mapping-review":"adb75184b30156125e23d3a19723bc884cb9e230934760cb6cbce704af041820","deepseek-search-fetch-evidence":"a85c43e589807cbf631ffd3c58bfad24e6f841b85e79ad5ddfba33bef58bc6cf","airbnb-incremental-support-notes":"2a6612e4c229e677618be3fa1dee15f80018aee4666cb0a0f2c94b1baf7f14dd","spotify-honk-verification-rollout":"2ab648ae586ac7ce173dcc69e8e99362591f4565b7509eaf3a0af9e3498a29f2","uber-autocover-test-acceptance":"93cb45b55189d9e5539e191019eea33ee79bddf9dd7f4fc559a0a366d87c64bc","scania-spec2code-contract-gap":"42d1910826736a2d1e2359f77ee61e98d8bae4ab3f95cc1aa2760653e20a9833","prompt-to-voice-reusable-brief":"084110d9ee279bbf11af4b441f802b9b3a8a725c7d20eaf6d9284dfa39f61cd1","kling4-long-take-control":"62799f892ec6b3cf79330c3751fe5bc81c2a84ad54e7ddd95e311b832f17ee0a","decision-switching-threshold":"7903838acfab4640dc450e4475012fbc8d3575f13376079c4c37f1500883da0a","learning-short-answer-hint-retest":"83adb4a7bcb3a63d10449657d7f34aae6071091c84382fc8e075d1cc5cd92323","firmware-memory-delta-audit":"e2757f410a9fdc59f1fa8b3f1a64e3ba29ff96500794fb9c9441979acd8be345","opus55-fast-access":"4adf26b679bcc54f022f95b4fe8ce05a12ad5659b40150003386a205242dc3a2","gptlive11-voice-corrections":"90a546fb4fc93f4e703e55a6319ba8742ff3920fa5bbbc36b8dcfd6684577dc6","gemini4-argon-long-work":"3f5357476daa50f9dae14e6dffa4e358b25f492b88db72b88bb4fcbd2ab18bf1","runway-kling-api-workflow":"ec96e7d3ed9c9eb159b9b2756791c6906707497d216110310da7a543b7cc2054","glm-legal-evidence-chain":"0847157a51d87c38680a1883fcded1cb186acd2f5cfdf4b99964dceeab23ef16","qwen-image21-api-alpha":"8ecb0f5e3e13e7ee8d5ae178f53b558f52004cf253f5bbc77e0a6cd994453791","gpt6-intelligent-ui":"b25e050a79bcc2a4a89b2a2980645ae06d74d03b586fdc4e4b0b0f36b89af766","haiku55-subagent-budget":"13cf6a2089f016c3ce1f0114f0ddb57d76077047f1df51fb3a323bec3704efc4","nano-banana21-continuity":"7360b9df5dbc06c7de72f27cdb2bb978ebe64c9f6d5d1cf7c640c081cadb5d93","embeddinggemma2-local-retrieval":"1c15811ae86029d28cf952201672d302e49313d5685b4d1bf3264442b075cb7e","mistral-large4-preview":"eef9211bdf2841306f03d4255f5536529d2712a0b87fdc349f7345a33b249e96","mplab-agent-telemetry-pacing":"98f7942e28b93b416bd5fb1a01189da287770e79f19b19b9ffe7811f7f4aeea9","memfault-crash-evidence-chain":"589792d5a3a877b4dd874d149996ce639c571c340ddcc31e71645e2d42b222c9","assertllm2-rtl-property-review":"e91f5ee4397da1789fa5343cb2adbc92c0daadd38df6cf6edf7a2ac1a7ed0a9d","firment-waveform-evidence":"47e4d63c6cc4715350747ebc0d96ddaeeccd22c10ddef67298d50328b8a3cd41","cantools-ai-wire-contract":"be2a8be95077dfc14460ce8d63348efb55fbe8b1689cc51e6e3252596cfa31fc","minicpm-local-image-check":"fa17a45f81ee28c814e29c26d199cc8755d082856373289c73671e071875cb12","sensor-unknown-state-gmm":"2a249413d4e9ab7d75f558b93234c16ebe2e78505a5eeadd992094aa3eed7c3a","sol-quality-cost":"21ac08e4a30889f92d381fa976e7f9eb05a33efa05c444f3afaed743c986649e","deepseek-v41-migration":"c552e257157ccebf462c5d2de48023234cebcf5f38861ca937e78dcdfdf2e790","qwen-omni-evidence":"253ecdbfa2c0dea216716d0be36a7381b1f70652f31638785a4178ed713f3ee0","images25-edit-brief":"ba77c9ee45199dfcaf0bca9cd9f31438ee82d06766a092731add3035bec0b9c2","renode-replay-lab":"02529004caba1c922ab3d690b3aad588fab1ca33eae0daef85b89c3f56511a99","firmware-fuzz-harness":"089f5a9ebdf188ab3e4575eab1f5c756732aadb3177952f01431567c8fd7f4d3","debug-probe-mcp":"ca23b159b62c8fdf7ab35ebec262ffe31fe11b3dd941e631cb2dd1de06ab432f","datasheet-register-audit":"ac50c025ad093bba38ff389df2334f5f29e01fc87ad0ee97aebf1d427ecf5701","stm32-edge-ai-budget":"3463da3b40663b7296560028a5b8af5e3efcd084d6ebe3cc47f397b89327896f","firmware-agent-contract":"cf9dbbe92d84749fb634e26345b8b5e72c7a5ca1dcefb74e320a94dd18b3029f","context-task-eval":"4cf4541762a4b088e7f4011943066ecf25c12ab4115ffb51c12e582f06cf30f9","espressif-mcp-workflow":"63fa25ccd1534820f5899d41ca7a0116fc39e57b7d519f5dde0ba1d07dc68a96","playwright-mcp-boundary":"d13701f012853926a1c127ccd36325b94083ade013acf0ac06971e8b95d6a6ed","skills-license-eval":"de41448284606b587eb01f3f52467148abfe329eb4afb64f7095d6de51652553","embedded-regression-copilot":"0d8d2283b73273ccc9a7d3796502bcc1829e51c11901f43981694c80d21ac2ea","document-style-pipeline":"6e4abe39ece7436424ab728a07da99038cb267dd0f0c08c91806354f13c07b75","dot-meeting-brief":"4a18fe99ee18228ac2ea8dd08c7d06816bbc7dd475642a09df71b664289f3e34","dot-bounded-follow-up":"84e7fc7f83600649ed9d672287d8dfd0cc33ffdecae66cd7a7e5a0340e789eb3","dot-change-request":"2d78da6f25d6ea5d47d3067a5d597d8e304b41602a0321d27c90e9d2daf8cc73","research-conflicting-sources":"f2ddf755914405abf96632ad8b54e6353f492322f3d36384bade89dbabb505e2","writing-two-examples":"fda4d9625c4a38559a612483510673de3a65cb0f28478f943f5f3e8bb8addd10","orders-cleaning-audit":"eac249de66543c18ca22b17f9a961174a336d9db5bed9a69d4498fbf2c61cef6","image-edit-invariants":"8fbc5aaee484a75ba7f90badfee66feefcb16c4eea375ed91be3cb8c9ec69b02","video-learning-evidence":"fe6f5a20880ffcc649a26c4ec6cf8a01bef309ce178247c6757ddb7c44a986d0","codex-small-fix-loop":"97e754ab244ea90773db163c6b8959f96f555cd1ba2234d015455d6cdb27f670"},"files":{"app.js":"3f11837199a84b29e606682c4b88a17632fea212e8cabad2eab2570564305157","site-core.js":"b4f96a7f0557c322c3c2e42cfcf14d1545585d06420cfc1147c03bc5b7b33589","style.css":"5e159c776246dcd48bf52117e649feb7250bbffb9f49a707bbb2d9b3cf3c5c8b","visuals.css":"7cf30aa521f1fe9e7589608376199737cb797efc3ab2a63799c97d7ac0d4d00d","build.py":"25deb0b707c7e7ae97e1306b94afcab5d0156c8a7ff8495a980140e4ebb2f524","favicon.svg":"b33e38910db7f167eb595800e4fa779577885204e090115732215704f1be1db5","DESIGN.md":"23cb37aa5f8c5df788d9587f03e8e2b01a2b955f5d26b4862e7f1dc5439e5a96","THIRD_PARTY_NOTICES.md":"e10fafb73c4164f3cc2f5350a0ec70c500ab6417cc935a9140b69e49b74daf60"}};
const october23Panels = {
  "claude-api-dated-version-migration": {
    "title": "依赖、接口契约与业务结果，分层核对",
    "labels": [
      "升级前",
      "接口与网关",
      "相同任务验收"
    ],
    "panels": [
      [
        "版本分别列",
        "SDK / API",
        "模型名称",
        "不是同一个版本"
      ],
      [
        "检查字段",
        "默认采样也拒绝",
        "认证头与脱敏",
        "历史消息回放"
      ],
      [
        "分开结论",
        "请求能接受",
        "结果仍正确",
        "未执行要注明"
      ]
    ],
    "status": [
      "Python 2.0.0及TypeScript 1.0.0起默认新API，不能只检查模型名。",
      "新版本拒绝采样参数；不能把document与citations限制概括成全面禁用。",
      "网关认证和日志脱敏应共同审查，不在例子里放真实密钥。",
      "这是纸面迁移练习，HTTP成功不是业务验收，也不是本站实测。"
    ]
  },
  "xing-intent-schema-multiple-results": {
    "title": "一句话有两项请求，结果也应保留两项",
    "labels": [
      "虚构输入",
      "完整结果",
      "字段与权限"
    ],
    "panels": [
      [
        "查DEMO-17",
        "再解释退货期限",
        "两件事",
        "不是两次执行授权"
      ],
      [
        "查询进度",
        "解释政策",
        "逐项遍历",
        "别只拿第一项"
      ],
      [
        "缺字段先问",
        "否定不能漏",
        "对象另核对",
        "不自动执行业务"
      ]
    ],
    "status": [
      "合成输入A包含查询和政策解释两项，第一项快捷属性不能代表全部结果。",
      "B明确不取消；C没有订单号，不能为了补齐字段而猜编号。",
      "类别正确、参数正确和获准执行是三种不同判断。",
      "本图是人工设计的预期结果，不是Xing模型实际输出或准确率测量。"
    ]
  },
  "deepinfer-engine-service-gap": {
    "title": "离线生成能跑，与多人服务能交付之间",
    "labels": [
      "已公开引擎",
      "待补服务组件",
      "容量另作验收"
    ],
    "panels": [
      [
        "离线示例",
        "限定支持硬件",
        "许可证可查",
        "不是完整服务"
      ],
      [
        "KV缓存系统",
        "预填充 / 解码",
        "分离与路由",
        "副本负载均衡"
      ],
      [
        "100人是假设",
        "并发 / 取消",
        "重试与资源清理",
        "没有实测数字"
      ]
    ],
    "status": [
      "官方明确完整服务仍需要此次发布未包含的组件，不能用离线示例代替。",
      "4张SM100预填充、64张解码是厂商基准条件，不是消费显卡结果。",
      "练习中的100人并发目标缺少测量支持，应列为容量假设。",
      "开源代码与模型权重许可分开核查，本站没有下载或运行候选项目。"
    ]
  },
  "brex-oncall-runbook-evidence": {
    "title": "先走排查步骤，再交接事实与未知",
    "labels": [
      "症状到手册",
      "证据报告",
      "人工复核回写"
    ],
    "panels": [
      [
        "虚构导出待确认",
        "路由到手册",
        "启动记录存在",
        "送达记录缺失"
      ],
      [
        "确认 / 假设",
        "缺口与阻碍",
        "下一项只读检查",
        "没有送达结论"
      ],
      [
        "检查重复风险",
        "人工决定操作",
        "补齐排查文档",
        "不是自动重跑"
      ]
    ],
    "status": [
      "有任务创建记录，不等于导出结果已经送达，先找对应回执。",
      "未匹配手册或缺少直接证据时，假设与事实必须分开。",
      "复核报告能暴露手册缺口，更新文档比盲目换模型更可检查。",
      "公司91%是历史自报评估，不是本站复现，也不代表其他系统可靠性。"
    ]
  },
  "zalando-search-intent-language-parity": {
    "title": "六种说法不等于六个独立测试场景",
    "labels": [
      "六条合成查询",
      "三个意图组",
      "译文条件核对"
    ],
    "panels": [
      [
        "两种说法一组",
        "儿童 / 成人",
        "材质条件",
        "先去语义重复"
      ],
      [
        "按属性分组",
        "三类真实意图",
        "不是简单数行",
        "覆盖缺口另补"
      ],
      [
        "儿童被遗漏",
        "先查标签差异",
        "再分析排序",
        "本地需求另验"
      ]
    ],
    "status": [
      "合成六条查询只有三个意图，不能用表格行数夸大场景覆盖。",
      "译文丢失年龄条件时，应先核查询和NER标签，不直接归因排名模型。",
      "相关性评分提供排查线索，不能单凭低分断言根因。",
      "跨市场借来的需求仍可能漏本地偏好，本文未复现Zalando评测。"
    ]
  },
  "minimax-miniapp-persistent-review": {
    "title": "持续页面刷新时，保留人的修改与未知",
    "labels": [
      "来源状态",
      "人工备注",
      "操作结果"
    ],
    "panels": [
      [
        "A · 原始说明",
        "B · 刷新失败",
        "C · 来源延期",
        "三条虚构任务"
      ],
      [
        "A · 备注保留",
        "B · 标旧数据",
        "C · 冲突待核",
        "不是静默覆盖"
      ],
      [
        "草稿不是发送",
        "刷新有成功时间",
        "不确定不重试",
        "后台是本地代码"
      ]
    ],
    "status": [
      "Mini App是应用承载方式更新，不是基础模型发布。",
      "刷新失败不等于没有任务，应保留旧数据并标记来源时间。",
      "任务C的来源与备注冲突时，两者都保留等待复核。",
      "本地代码以用户身份运行；图示不代表已安装、执行或安全实测。"
    ]
  }
}
;

check('October 23 strictly preserves all81 earlier article objects, independent scenes and runtime assets',()=>{
 assert.equal(data.posts.length,104);assert.deepEqual(data.posts.slice(23).map(p=>p.id),Object.keys(october23Baseline.posts));assert.deepEqual(data.posts.slice(17, 23).map(p=>p.id),october23Ids);
 for(const [id,hash]of Object.entries(october23Baseline.posts)){const p=data.posts.find(p=>p.id===id);assert.equal(sha256(JSON.stringify(beforeOctober25(p))),hash,id);const box={window:{}};vm.runInNewContext(visuals,box);assert.equal(sha256(box.window.FieldnoteVisuals.render(p)),october23Baseline.scenes[id],id);}
 for(const [file,hash]of Object.entries(october23Baseline.files))assert.equal(sha256(read(file)),hash,file);
});
check('October 23 articles retain explicit evidence, dates, full details, licenses and pending learning',()=>{
 for(const id of october23Ids){const p=data.posts.find(p=>p.id===id),t=JSON.stringify(p);assert.equal(p.verifiedAt,'2026-10-23');assert.equal(p.learningStatus,'待学习');assert(p.sources.length&&p.license&&p.maturity&&p.maintenance);assert(p.analysis.length>=5);assert.deepEqual(p.paragraphs,p.summary);assert.deepEqual(p.takeaways,p.steps);assert.equal(p.limitations,p.caveat);assert(p.tryThis.prompt.length>=150);assert(p.tryThis.expected.length>=40);for(const term of ['chatgpt.com/c/','/workspace/','sandbox:','本站实测成功'])assert(!t.includes(term),id+term);assert(/未|不是.*实测/.test(t));}
 const at=id=>data.posts.find(p=>p.id===id);
 assert.equal(at('minimax-miniapp-persistent-review').date,'2026-10-22');assert.equal(at('claude-api-dated-version-migration').date,'2026-10-21');
 for(const id of ['xing-intent-schema-multiple-results','deepinfer-engine-service-gap']){assert.equal(at(id).date,null);assert(at(id).maintenance.includes('非首次')||at(id).maintenance.includes('不是首次')||at(id).maintenance.includes('不等于首次'));assert(at(id).sources.some(x=>/github.com.*blob\/[0-9a-f]{40}\//.test(x.url)));}
 assert.equal(at('brex-oncall-runbook-evidence').date,'2026-04-27');assert.equal(at('zalando-search-intent-language-parity').date,'2026-03-17');
});
check('October 23 diagrams have six distinct original panels and four static accessible notes',()=>{
 const env=boot({observer:true});const seen=[];for(const id of october23Ids){const n=env.get('#visual-'+id),spec=october23Panels[id];assert(n.textContent.includes(spec.title));assert.equal(n.querySelectorAll('.fv-note').length,4);assert.equal(n.querySelectorAll('.fv-note-list li').length,4);assert.equal(n.querySelectorAll('button').length,0);for(const t of spec.status)assert(n.textContent.includes(t));seen.push(JSON.stringify(spec.panels));}assert.equal(new Set(seen).size,6);
});
check('October 23 routes, keyboard focus, copy, bookmark persistence and back-forward preserve behavior',async()=>{
 for(const id of october23Ids){const p=data.posts.find(p=>p.id===id);const env=boot({observer:true});env.click('[data-category="'+p.category+'"]');assert.equal(env.get('.region-filter').hidden,p.category!=='industry');env.click('#title-'+id+' a');assertView(env,'article');assert.equal(env.document.activeElement.id,'article-title');assert.equal(env.get('#article-title').textContent,p.title);env.click('#article-view [data-copy-prompt]');await env.settle();assert.equal(env.clipboard.at(-1),p.tryThis.prompt);env.click('#article-view [data-save="'+id+'"]');assert.equal(env.get('#article-view [data-save="'+id+'"]').getAttribute('aria-pressed'),'true');env.click('#article-view [data-back]');assertView(env,'feed');env.forward();assertView(env,'article');for(const hash of [C.postHash(id),'#post='+id,'#article/'+id]){const direct=boot({url:'https://example.test/publication/'+hash});assertView(direct,'article');assert.equal(direct.get('#article-title').textContent,p.title);}}
});
check('New technical guidance distinguishes request acceptance, complete intents and complete service',()=>{
 const text=id=>JSON.stringify(data.posts.find(p=>p.id===id));for(const t of ['temperature','top_p','top_k','2023-06-01','X-Api-Key','2.0.0'])assert(text('claude-api-dated-version-migration').includes(t),t);
 for(const t of ['result.intents','第一项','4B','29B','Micro-F1'])assert(text('xing-intent-schema-multiple-results').includes(t),t);
 for(const t of ['KV','SM100','64','950','未包含'])assert(text('deepinfer-engine-service-gap').includes(t),t);
 for(const t of ['本机用户','刷新失败','人工备注','不确定'])assert(text('minimax-miniapp-persistent-review').includes(t),t);
});
check('Company exercises preserve missing receipts, language constraints and distinct evaluation scales',()=>{
 const text=id=>JSON.stringify(data.posts.find(p=>p.id===id));for(const t of ['91%','分母','幂等','HTTP','云端','不是'])assert(text('brex-oncall-runbook-evidence').includes(t),t);
 for(const t of ['女士真皮靴','三个意图','三级标签','0–4','2024-09-18','资料版本','译文','排序'])assert(text('zalando-search-intent-language-parity').includes(t),t);
 assert.equal(1500*25,37500);assert.equal(2*500*20,20000);
});

const october24Ids = ["kimi-k31-pro-service-weights-speed", "memt-memory-state-not-runtime", "forty-forest-types-probability-boundary", "openai-training-containment-offline-world", "flux3-klein-full-memory-license", "fev-legacy-spec-baseline-gates", "grab-hubble-doc-review-metrics", "redhat-code-docs-review-selection", "anthropic-proof-scope-binary-contract"];
const october24Baseline = {"posts":{"minimax-miniapp-persistent-review":"f1d8678ad76ed307b5b85533965c05226ad5ae25d860fdf2eb310781ee01e418","xing-intent-schema-multiple-results":"ae0605cbb4765a09e9cae5f3fdde6eb25151e361bb58e4a50dbfd9eab8907e84","deepinfer-engine-service-gap":"e7a17a53a341a9b37c8ff6686b7c45e7af2d32dbca7f9393679ce9f91dc250c6","claude-api-dated-version-migration":"538ff61a9e1d7c2bfe787ce083304474641896921a30b36d1306d6d9affab88e","brex-oncall-runbook-evidence":"37e0b0c52d1d3d5a39f3dc35bbd4da236cf38008bce0e95796f2aa27b2efedb9","zalando-search-intent-language-parity":"a7dbbe92c923940651e3df7eb68fec17a77eeacd4f627870ee6e15d551c70597","claude-duet-preview-attention-budget":"19f2ae7f522b8a728ae2ed37bdb31bd26f29951112f1b58d2c47aae3d1fea39e","google-cloud-openai-private-preview":"9b223b459f2f055367b1ab524291efb9f0bf3c962474a42c0963e6869a4540aa","openai-monitor-alerts-boundary-incidents":"bb51a946be3517dde52d8bb4d462f0631e22d54aa9d38d43ec130f171812ffd5","fasth3-omni-weights-runtime-license":"f370da020850bfaa02ae4824fa9f5c4eecf9e760cf382bb839ce0dfaf7408951","openai-12h-cache-reuse-economics":"651f234240d00ec00478fb222f19b40e604ca3770336b0c30ea60d3f926c5ceb","kimi-desktop-trust-session-boundaries":"7c52b32be3782b5e310ffcfb038988908a8758b6826911ebb92cd5981719c344","dropbox-judge-prompt-change-budget":"af809683e7a1d6ec0690b0ac1cb2cb9a6029077a487e1228aad0f7c845c5658a","dropbox-design-code-link-recovery":"915f9676a1b04f2a9b84a84b9d8e79ee35ea18133a04ff846dced2069f696103","openai-monitorability-pair-retry-metrics":"61c48397e70b6af8a609fa451e738c7da67a0e0e706c132813ab6a45668ea710","runway-claude-marketplace-procurement":"8524bc3463bb57b60aed830e54027b3c8f0da0eb70386c197da36e3b4208446c","gemini-gdc-airgap-managed-rag-preview":"b404463d63478a5f672cb9e69a4919781e7b0634cd38179643732c41ee1062b7","metr-anthropic-risk-review-scope-evidence":"75b82cdbb5e65edf4d0d7426bb6f23e406dfdf067b44596730ab080c6bb7aab8","deepseek-harness-preview-upgrade-acceptance":"44de886b63bd49f6e29aeb6df6b64ce45e22484b634c46565577ac1fb5b6153c","seedance25-reference-timeline-repair":"0b478ce46b0d63002867841f8e144d6104d531e108236b6ca560718712fd3359","seedream5pro-layered-diagram-review":"30d3dd62ca295785e19d4c816d273146960d095fae7c0fb70d5643fe6b6daa6a","spotify-eval-funnel-calibration":"29d71f713d44862f3c5a11561f1bbd8a9e978185ce265624ac2d3ad1b57e4eb2","aws-migration-playbook-evidence":"4383156394f86711cbe95370036fa424dbbda2733b5036573a159bd699cca52f","meta-ach-mutant-test-contract":"23eba86dd966b3c7981fc7ace758ee6683748251d854b4afcc6de6faec79ce34","minimax-m31-flash-effort-cost":"205937bece0596d0c2d47b0e536ea51f1a9cca4c613b5028755554074f7e73ca","gemini-notebook-prerender-review":"d2220608e9badca5b9790637aacd43748b1d40072f7f8d9c76d3e766936a19af","pixverse-template-slots-jobs":"f5e61db82ec5f9bdbc190526eccf1b5b1e5dd627d7e6f9298fc53cfe40261e21","gemini-october-api-retirement-window":"a90833e61978936e64a0595ec046e52519fd7ebe123e8914371bec1fbd955dc9","kimi-desktop-remote-review":"ab365fe747962759b25a4a207921bb668b5b5a2d6958939820a878f108d76577","openai-low-resource-behavior-parity":"24581b477de88aa83f6d3533a42f9e2791cfe65ea27f2e0eab116728c77f4888","muse-beam-open-weight-deployment":"efcf0e05ba47d5f109d9775d32245ff0a842a3089bb09a92f05d1a120087aabc","cloudflare-rule-lifecycle-review":"a07df039281887b4c267032d6b1cb669b3599bb24a6ad1c1eb3f4c3318a5f304","meta-forum-state-verification":"b626576ba51a1a0d90671b8f8638452e15d61bcc1551df500cda9d1891786779","mathworks-ears-mapping-review":"9f0c7a35d005a02f769859a42bb904f08903619ed33d3e27a8eed5ed3875ef06","deepseek-search-fetch-evidence":"2291b77e9a0707f2fce5e3223b645ea074a0f5f90c12c76231e94bde6d0445cf","airbnb-incremental-support-notes":"a63251a541273660582a8309b3155b77b76d8506e3718136753d07a6d4965d83","spotify-honk-verification-rollout":"42630f3308bb29ff8683b001e5fd89c0aa68202c15e8ba56d69e0087c10c4584","uber-autocover-test-acceptance":"ab12b8b0bd882a088c67e8e0f6fc5306e6fcd6cf1b4eb2d19202186fdd60019e","scania-spec2code-contract-gap":"9e54ac029dc40dc9e5e90e28d932ea6561118b23af4d360f364ab00c4cda8368","prompt-to-voice-reusable-brief":"8ce23fe19a2edd011766d1e38ced13999c267f6a6c1e0ae1dd5653dedf3fff1f","kling4-long-take-control":"420dfc75a0dbb710ffc1a546f55e5528d49d802ee1bfdd5b400d82289397cd66","decision-switching-threshold":"6a4ed9103895bec78038e3addd3affb50d33184316e16c6aaa4ccf5730b20ae4","learning-short-answer-hint-retest":"501579a24f0049aa7633b3a0c22fa7dc338a58acf82e5e597a55215d1bb44670","firmware-memory-delta-audit":"583d85b92957ebe0492869f532049fb595cd5eedbe784a5768e6d78d48deb922","opus55-fast-access":"5d343d3fb4f55de41b1ad13e273f1eef4f6b4f5a2d8579101d124bce430d8000","gptlive11-voice-corrections":"bc3b9993d381c6ca67bd1e601d7bf4d4a1c95d4cace11f03b4097f67fbbb21db","gemini4-argon-long-work":"121484ce1ee9148c2f7be640371a62f9cfba446c9cdb89ca8cab5446e873ecb0","runway-kling-api-workflow":"52b0018ad273e00a3f6af7862bdaa9f18207c16087737e1a83beb0199645990f","glm-legal-evidence-chain":"9da204d02ab84f8eb48a10f2af265f48759150c5844ef9e34be111d0234d8f4c","qwen-image21-api-alpha":"1e81ecb9ec1498e575ba292c96ade9342fcbc1fd892a0e23d88c62c5e854847d","gpt6-intelligent-ui":"5c9657cf1aaa75195a7c6ca9a419ed9f5c946dae43fd2e929f7cb219def47d11","haiku55-subagent-budget":"40589281778639c45c81447e065e3830efcbe09fe52cd9a3e2604707e5257c35","nano-banana21-continuity":"ab6cb4de6fb4fab6eb5b81028cdd2857bd5971e610074302afc9ee2b27cd618e","embeddinggemma2-local-retrieval":"5cd94802e402edfab230b73e19ee6b0dffeb3eb26d778cd37f907ede67e3c301","mistral-large4-preview":"74d300fc34b328dc749a34aec19c0ac87e0ec4220688eca5a0b702298f05a44f","mplab-agent-telemetry-pacing":"f23ee6f7a452db4833c4f3f58ff69b49aa8811cf8e2f134e288acbe7514631a4","memfault-crash-evidence-chain":"19b9006fd5e592f9efd3fd0332950afcf45a8195884f062d42fdd52c0ff9e69f","assertllm2-rtl-property-review":"b6d87a487535fb842ad4908bcd1bc08b35004d4c2c8a8f199d5da40a1cd59a39","firment-waveform-evidence":"affb6bfa3bdb4778904f9133b4a3a4fab2fb4190b29b0c15bde31b05095800f1","cantools-ai-wire-contract":"e2d91e4db45b36d183823818262761687888da7b3e9b52dd6b34e2aebcf88135","minicpm-local-image-check":"fd0add86b8ae410daf0349b44d383d17df575eb0d1d69ab111d26fe04a5714b7","sensor-unknown-state-gmm":"3b4eac0dd79fb5970aed643285a55a7bfe0cf27c58567093353906e8bd4e8d3f","sol-quality-cost":"f53d3c7c9d9c8b8b75da105a631a8a74df7ceaf105b77adf03ffad445b882b6a","deepseek-v41-migration":"05ea75bf12ecfaf87c4ba8bfb4a84fcdf41deeec532bbdab6ba13efc7698b376","qwen-omni-evidence":"220ef0f3c13e3f04c6b332933a303feb528d06e1458ec410510e4b0924f9c359","images25-edit-brief":"3baf2ae3963446ddc58573af93650d0815cfdb24ba9287d5022927e03dd73dff","renode-replay-lab":"bbc451336852b1abd4d491dfab43c79cc5fac6719bcefeece8304947508aa261","firmware-fuzz-harness":"52204b6f516e75ca58f3ecb7b9154fe9d30bd698d9ff29ab865f12c5ced39058","debug-probe-mcp":"063fa655a3e4838d61f72683df248a15fe8e0c7185fc909684d4c986a7fece58","datasheet-register-audit":"7ad32920da96b7456f3c19971fa940a7528e0338609da7bd07886c53fd7ea708","stm32-edge-ai-budget":"819ad707afc2051fe064ce466d246159ef51d35dec3c2cd3ded40d6666908811","firmware-agent-contract":"146a2eadf17defae9c0266ea2d82e35dd33eb6b480fc3a8a2ca32f262d4a62a9","context-task-eval":"8c96cdbc3b373c90733bc5b218854baa24f99c9e6043ad19d2f3b76d34c86095","espressif-mcp-workflow":"90b01873f620cb39f7e0040e56ea68e6881489c0ccc4d1b214f97ef95573e628","playwright-mcp-boundary":"cb62e3ed8797602aa5df5717d7abb4cde1d87a57981ce342a881c6643a2dcea5","skills-license-eval":"de1ddf6ab2990d2887a2a3324d7a2a6b90012a4f13121d7ff4759408523356d8","embedded-regression-copilot":"3d1ff145b4ddef0c06132990ee8f6c7ac18b2243e34e89cda1b3be8b01f00211","document-style-pipeline":"6d85313adc53f5a592474f69acdb78ce4164c63492147baa7a117f6ffc7d110a","dot-meeting-brief":"1e1e08ae0719a820459a68a4a0ef0356e3dd37570b4b2cf224041cf7a5f533b2","dot-bounded-follow-up":"76111ec1587cae86e39d500343d2945d973f5b958dd0586347950ed163a42478","dot-change-request":"73bdc58095365cb1c20fb099a3a0a8f2dc84bd45988efbc55cd4fc8735d6fbd1","research-conflicting-sources":"7f426c4e27e151214b91384b022eaa1e8063019ca554fc1c53e1a2a0fd8c8923","writing-two-examples":"08492c0f960d7d9c49a7fdabb6eec727741e85032cc143497b317ec43cd0d522","orders-cleaning-audit":"f043208c83891bb78919dd894df9af97f87ec06b1d528a020134cdaa80631828","image-edit-invariants":"db530d20a56191678834b869b084f8d5237047b21363e8408f81bedf6d1df94b","video-learning-evidence":"d0cd75374d542553b4bd74f3bbc76dd7d44bd30435a0b0cff3fe20f2838d0963","codex-small-fix-loop":"d1182d94cd77032b8a7c49962a91661e5928f09dac1410ba622d20449681c7e8"},"scenes":{"minimax-miniapp-persistent-review":"a748aeb751f9c8e2ccbeb7492c3130f89d9bfb39e244c948bdaedbf5b4a2b8d2","xing-intent-schema-multiple-results":"edf72f25bda03c79bb5651a49e8b5667ee6f0fba061558e415be55bd067f38e0","deepinfer-engine-service-gap":"b6402492d49de09ee5f86d84f5d29bd8312ba8345f1d1eab760e22d22ddbe755","claude-api-dated-version-migration":"d8d4287fab3f8d1c02e1567bcb394a050c1cb0a0cd4217eeb16e4217cfcf974a","brex-oncall-runbook-evidence":"66e4149d945f9de701054ecca31aef1e2431c20c80ee5769f408f3ccdf952672","zalando-search-intent-language-parity":"3f18ec674e3e176e69981e2d88f058476d28d1256f4f53a7fa4fbdffdfdef0e7","claude-duet-preview-attention-budget":"0b82a4a9bf0bd996461a5d347398cc594ab61f78c12b15e8e0bd78600e98866c","google-cloud-openai-private-preview":"b9d8e4483687605a871c9bc8958944efcf521e1678b4f3e8f858540338133b5b","openai-monitor-alerts-boundary-incidents":"50fe45065016cefc82ace42e2032d8d2c1b874ed823e89aa698ae35d61506b21","fasth3-omni-weights-runtime-license":"91ab28b690af7b362d1fa639d68dfca41772d34263ff24a1ad0ff79d02986b37","openai-12h-cache-reuse-economics":"6e0698a14e4d66dd6d1513661d9974e3eacb98a662d67da07472ebbac11a866e","kimi-desktop-trust-session-boundaries":"d6617d36cfbc5aedf75e3d6797fa6d89c99537ea520fb07acdaf132b14dbdc89","dropbox-judge-prompt-change-budget":"6601521e1ab6a775264f30b1e61b8ff49ebd1c4f5dad866cb9fb842c757e147f","dropbox-design-code-link-recovery":"79cbd5272111cc1d057caa8083b15054762c1347e62af234c49cd0616f010b26","openai-monitorability-pair-retry-metrics":"b0eb54443de07342e850b219deb93aceec57e4250c5eb043efb36902fa05ff1a","runway-claude-marketplace-procurement":"3479bd8d6d59b288e1f85167a3302c5bbbaecd1a4b42fbd8ff5b1ac957ce4b97","gemini-gdc-airgap-managed-rag-preview":"73d98ba22c98d7f9f778bebd8fc2580935fa3957723b11c3d34d825b13722e1a","metr-anthropic-risk-review-scope-evidence":"d2720ede1d792e8b4d71aa041cc7e0fccc8166c89686e6aac74bd69c9997b43c","deepseek-harness-preview-upgrade-acceptance":"e51baccaaa7613fa4cb0405725990ff5854aa1fa0037bfaf279f06f60f8b5042","seedance25-reference-timeline-repair":"18224853a9d889de88fc2fc07e84bd2d05f97a44d1398d8e7d9c1bbdc7f80b18","seedream5pro-layered-diagram-review":"8ead950d70db4e56e03eb839e1aa35d4e43f74368478791c27b87a9a819bfb50","spotify-eval-funnel-calibration":"43e8414456eb2f787b66d816cbf8c21ee9fdb74ab3c532c3e406dc3dc852cded","aws-migration-playbook-evidence":"5a6c5500910ba54711133df32fc7041c899f956e0e1647b279e453d896fc586e","meta-ach-mutant-test-contract":"fdcfa9b359c36f494e7ffecef5d8b06b1375e9ed48fcc9fdcec49b8f8bc1b726","minimax-m31-flash-effort-cost":"587ab389ce8c07f70c952e708ce54497ea6d5ce11ec40d9c5baf5a192987b06a","gemini-notebook-prerender-review":"84803926844efe41463668a971bdcabc6deb33b79d39aa7d8b5e401e3314b285","pixverse-template-slots-jobs":"1f803b8449fe8724da02c102485f2ed491c4f527968b7ad5699f8a3270239837","gemini-october-api-retirement-window":"bfdef308a3e96deb022cd6063fc163663cbf44f4eae5f91888bc9af8a0018df5","kimi-desktop-remote-review":"36673ae692f94e9b555a796b36a76b4202bf53a7a4b1a424ebd0c1a1137afb46","openai-low-resource-behavior-parity":"a49a22725f5090c9946cbc583bdb532e2fb4c02499515271522edcb0db4d7611","muse-beam-open-weight-deployment":"fc15cd8f50c93d48d22318780a0118d2247408426827b60056a0d373713c39cb","cloudflare-rule-lifecycle-review":"26c132c50fbd9d7dcfe61798ee8ed5ce1b72704504fa54ba5303b3d162aa5852","meta-forum-state-verification":"4baf27b21b49c2c0fc74fbb46435ef8544851d9d4adb62858a1b14d713422c96","mathworks-ears-mapping-review":"adb75184b30156125e23d3a19723bc884cb9e230934760cb6cbce704af041820","deepseek-search-fetch-evidence":"a85c43e589807cbf631ffd3c58bfad24e6f841b85e79ad5ddfba33bef58bc6cf","airbnb-incremental-support-notes":"2a6612e4c229e677618be3fa1dee15f80018aee4666cb0a0f2c94b1baf7f14dd","spotify-honk-verification-rollout":"2ab648ae586ac7ce173dcc69e8e99362591f4565b7509eaf3a0af9e3498a29f2","uber-autocover-test-acceptance":"93cb45b55189d9e5539e191019eea33ee79bddf9dd7f4fc559a0a366d87c64bc","scania-spec2code-contract-gap":"42d1910826736a2d1e2359f77ee61e98d8bae4ab3f95cc1aa2760653e20a9833","prompt-to-voice-reusable-brief":"084110d9ee279bbf11af4b441f802b9b3a8a725c7d20eaf6d9284dfa39f61cd1","kling4-long-take-control":"62799f892ec6b3cf79330c3751fe5bc81c2a84ad54e7ddd95e311b832f17ee0a","decision-switching-threshold":"7903838acfab4640dc450e4475012fbc8d3575f13376079c4c37f1500883da0a","learning-short-answer-hint-retest":"83adb4a7bcb3a63d10449657d7f34aae6071091c84382fc8e075d1cc5cd92323","firmware-memory-delta-audit":"e2757f410a9fdc59f1fa8b3f1a64e3ba29ff96500794fb9c9441979acd8be345","opus55-fast-access":"4adf26b679bcc54f022f95b4fe8ce05a12ad5659b40150003386a205242dc3a2","gptlive11-voice-corrections":"90a546fb4fc93f4e703e55a6319ba8742ff3920fa5bbbc36b8dcfd6684577dc6","gemini4-argon-long-work":"3f5357476daa50f9dae14e6dffa4e358b25f492b88db72b88bb4fcbd2ab18bf1","runway-kling-api-workflow":"ec96e7d3ed9c9eb159b9b2756791c6906707497d216110310da7a543b7cc2054","glm-legal-evidence-chain":"0847157a51d87c38680a1883fcded1cb186acd2f5cfdf4b99964dceeab23ef16","qwen-image21-api-alpha":"8ecb0f5e3e13e7ee8d5ae178f53b558f52004cf253f5bbc77e0a6cd994453791","gpt6-intelligent-ui":"b25e050a79bcc2a4a89b2a2980645ae06d74d03b586fdc4e4b0b0f36b89af766","haiku55-subagent-budget":"13cf6a2089f016c3ce1f0114f0ddb57d76077047f1df51fb3a323bec3704efc4","nano-banana21-continuity":"7360b9df5dbc06c7de72f27cdb2bb978ebe64c9f6d5d1cf7c640c081cadb5d93","embeddinggemma2-local-retrieval":"1c15811ae86029d28cf952201672d302e49313d5685b4d1bf3264442b075cb7e","mistral-large4-preview":"eef9211bdf2841306f03d4255f5536529d2712a0b87fdc349f7345a33b249e96","mplab-agent-telemetry-pacing":"98f7942e28b93b416bd5fb1a01189da287770e79f19b19b9ffe7811f7f4aeea9","memfault-crash-evidence-chain":"589792d5a3a877b4dd874d149996ce639c571c340ddcc31e71645e2d42b222c9","assertllm2-rtl-property-review":"e91f5ee4397da1789fa5343cb2adbc92c0daadd38df6cf6edf7a2ac1a7ed0a9d","firment-waveform-evidence":"47e4d63c6cc4715350747ebc0d96ddaeeccd22c10ddef67298d50328b8a3cd41","cantools-ai-wire-contract":"be2a8be95077dfc14460ce8d63348efb55fbe8b1689cc51e6e3252596cfa31fc","minicpm-local-image-check":"fa17a45f81ee28c814e29c26d199cc8755d082856373289c73671e071875cb12","sensor-unknown-state-gmm":"2a249413d4e9ab7d75f558b93234c16ebe2e78505a5eeadd992094aa3eed7c3a","sol-quality-cost":"21ac08e4a30889f92d381fa976e7f9eb05a33efa05c444f3afaed743c986649e","deepseek-v41-migration":"c552e257157ccebf462c5d2de48023234cebcf5f38861ca937e78dcdfdf2e790","qwen-omni-evidence":"253ecdbfa2c0dea216716d0be36a7381b1f70652f31638785a4178ed713f3ee0","images25-edit-brief":"ba77c9ee45199dfcaf0bca9cd9f31438ee82d06766a092731add3035bec0b9c2","renode-replay-lab":"02529004caba1c922ab3d690b3aad588fab1ca33eae0daef85b89c3f56511a99","firmware-fuzz-harness":"089f5a9ebdf188ab3e4575eab1f5c756732aadb3177952f01431567c8fd7f4d3","debug-probe-mcp":"ca23b159b62c8fdf7ab35ebec262ffe31fe11b3dd941e631cb2dd1de06ab432f","datasheet-register-audit":"ac50c025ad093bba38ff389df2334f5f29e01fc87ad0ee97aebf1d427ecf5701","stm32-edge-ai-budget":"3463da3b40663b7296560028a5b8af5e3efcd084d6ebe3cc47f397b89327896f","firmware-agent-contract":"cf9dbbe92d84749fb634e26345b8b5e72c7a5ca1dcefb74e320a94dd18b3029f","context-task-eval":"4cf4541762a4b088e7f4011943066ecf25c12ab4115ffb51c12e582f06cf30f9","espressif-mcp-workflow":"63fa25ccd1534820f5899d41ca7a0116fc39e57b7d519f5dde0ba1d07dc68a96","playwright-mcp-boundary":"d13701f012853926a1c127ccd36325b94083ade013acf0ac06971e8b95d6a6ed","skills-license-eval":"de41448284606b587eb01f3f52467148abfe329eb4afb64f7095d6de51652553","embedded-regression-copilot":"0d8d2283b73273ccc9a7d3796502bcc1829e51c11901f43981694c80d21ac2ea","document-style-pipeline":"6e4abe39ece7436424ab728a07da99038cb267dd0f0c08c91806354f13c07b75","dot-meeting-brief":"4a18fe99ee18228ac2ea8dd08c7d06816bbc7dd475642a09df71b664289f3e34","dot-bounded-follow-up":"84e7fc7f83600649ed9d672287d8dfd0cc33ffdecae66cd7a7e5a0340e789eb3","dot-change-request":"2d78da6f25d6ea5d47d3067a5d597d8e304b41602a0321d27c90e9d2daf8cc73","research-conflicting-sources":"f2ddf755914405abf96632ad8b54e6353f492322f3d36384bade89dbabb505e2","writing-two-examples":"fda4d9625c4a38559a612483510673de3a65cb0f28478f943f5f3e8bb8addd10","orders-cleaning-audit":"eac249de66543c18ca22b17f9a961174a336d9db5bed9a69d4498fbf2c61cef6","image-edit-invariants":"8fbc5aaee484a75ba7f90badfee66feefcb16c4eea375ed91be3cb8c9ec69b02","video-learning-evidence":"fe6f5a20880ffcc649a26c4ec6cf8a01bef309ce178247c6757ddb7c44a986d0","codex-small-fix-loop":"97e754ab244ea90773db163c6b8959f96f555cd1ba2234d015455d6cdb27f670"},"files":{"app.js":"3f11837199a84b29e606682c4b88a17632fea212e8cabad2eab2570564305157","site-core.js":"b4f96a7f0557c322c3c2e42cfcf14d1545585d06420cfc1147c03bc5b7b33589","style.css":"5e159c776246dcd48bf52117e649feb7250bbffb9f49a707bbb2d9b3cf3c5c8b","visuals.css":"7cf30aa521f1fe9e7589608376199737cb797efc3ab2a63799c97d7ac0d4d00d","build.py":"25deb0b707c7e7ae97e1306b94afcab5d0156c8a7ff8495a980140e4ebb2f524","favicon.svg":"b33e38910db7f167eb595800e4fa779577885204e090115732215704f1be1db5","DESIGN.md":"23cb37aa5f8c5df788d9587f03e8e2b01a2b955f5d26b4862e7f1dc5439e5a96","THIRD_PARTY_NOTICES.md":"e10fafb73c4164f3cc2f5350a0ec70c500ab6417cc935a9140b69e49b74daf60"}};
const october24Panels = {
  "kimi-k31-pro-service-weights-speed": {
    "title": "服务上线、权重交付、任务加速是三件事",
    "labels": [
      "今天可用",
      "稍后交付",
      "完整任务验收"
    ],
    "panels": [
      [
        "K3.1 Pro服务",
        "具体入口核对",
        "资格不全相同",
        "不是权重下载"
      ],
      [
        "11月4日前计划",
        "尚非已完成",
        "许可另核",
        "不提前承诺"
      ],
      [
        "生成仅一环",
        "工具仍需等待",
        "成本与正确性",
        "一起比较"
      ]
    ],
    "status": [
      "10月24日是服务发布日，权重交付仍是未来计划。",
      "Code资格与API标识分开核对，不能套用同一配置。",
      "三倍输出速度不等于三倍端到端速度。",
      "图中耗时练习是合成算例，不是模型实测。"
    ]
  },
  "memt-memory-state-not-runtime": {
    "title": "记忆很小，不代表整个模型很小",
    "labels": [
      "历史信息",
      "动态记忆",
      "完整运行资源"
    ],
    "panels": [
      [
        "虚构新旧偏好",
        "更新关系",
        "证据在哪里",
        "原文另保留"
      ],
      [
        "1000万参数",
        "每参数4字节",
        "约40MB算例",
        "只算状态"
      ],
      [
        "基础模型权重",
        "缓存与激活",
        "框架与服务",
        "不能全部省略"
      ]
    ],
    "status": [
      "40MB是指定精度下的状态算例，不是模型总显存。",
      "内部记忆不保证逐字恢复原始证据。",
      "关闭自动写入不等于删除或停止读取已有记忆。",
      "研究原型未本站复现，非商业许可须单独审查。"
    ]
  },
  "forty-forest-types-probability-boundary": {
    "title": "一片绿，可能经历不同的土地变化",
    "labels": [
      "树木覆盖",
      "森林类型",
      "证据与时间"
    ],
    "panels": [
      [
        "看起来都绿",
        "不能只数面积",
        "重新种植",
        "不等于天然恢复"
      ],
      [
        "天然林",
        "人工林与种植园",
        "作物与其他地",
        "每类误差不同"
      ],
      [
        "2020基线",
        "早期年度时序",
        "概率未校准",
        "地面证据另核"
      ]
    ],
    "status": [
      "地图区分土地类型，不只是判断有没有树。",
      "10米输出网格不保证每处边界都准确到10米。",
      "全球总体表现不能替代各类和各地区的可靠性。",
      "本图是概念示意，未使用真实地块或声称本站测量。"
    ]
  },
  "openai-training-containment-offline-world": {
    "title": "事件发生、恢复运行、对外公告要分开",
    "labels": [
      "事件与处置",
      "环境约束",
      "证据边界"
    ],
    "panels": [
      [
        "9月20日事件",
        "限制与暂停",
        "10月1日恢复",
        "10月23日公告"
      ],
      [
        "离线资料环境",
        "多层隔离",
        "内层失效假设",
        "继续检查外层"
      ],
      [
        "企业公开自述",
        "非独立认证",
        "非新模型上线",
        "不推断用户产品"
      ]
    ],
    "status": [
      "事件与公告相隔一段时间，不把公告日当事件日。",
      "离线环境是基础设施控制，不只是提示词约束。",
      "测试发现减少不能证明未来没有漏洞。",
      "本图描述控制逻辑，不提供突破隔离步骤。"
    ]
  },
  "flux3-klein-full-memory-license": {
    "title": "文件大小、运行峰值、许可是三份账",
    "labels": [
      "模型选择",
      "运行资源",
      "验收与许可"
    ],
    "panels": [
      [
        "基础或蒸馏",
        "不同数值精度",
        "生成器5.6B",
        "编码器未计入"
      ],
      [
        "权重只是部分",
        "缓存与中间结果",
        "尺寸和参考图",
        "峰值实际测量"
      ],
      [
        "只改虚构背景",
        "主体文字不变",
        "商业门槛另核",
        "非本站实测"
      ]
    ],
    "status": [
      "5.6GB指特定精度生成器权重，不是全部运行显存。",
      "厂商8GB条件不能外推至所有尺寸与多图任务。",
      "蒸馏和量化机制不同，效果分别验收。",
      "开放权重仍受FLUX Kommunity License条件限制。"
    ]
  },
  "fev-legacy-spec-baseline-gates": {
    "title": "现状、假设与批准需求，不自动跳级",
    "labels": [
      "实现证据",
      "意图待确认",
      "基线再推进"
    ],
    "panels": [
      [
        "版本B7",
        "大于16拒绝",
        "测试只查17",
        "现状不是需求"
      ],
      [
        "产品上限未知",
        "16能否接收",
        "边界需补证",
        "保留问题清单"
      ],
      [
        "维护者确认",
        "语义与追踪审查",
        "批准后生成测试",
        "不把猜测入基线"
      ]
    ],
    "status": [
      "合成实现含16字节判断，不能据此声称产品已批准该上限。",
      "长度17被拒绝，只支持这一测试观察，不证明全部合法输入正常。",
      "模型语法与追踪链接通过，仍要检查证据是否支持对应语义。",
      "这是一份原创纸面练习，不是FEV客户工程或本站复现。"
    ]
  },
  "grab-hubble-doc-review-metrics": {
    "title": "有说明、已审核、内容正确，分开看",
    "labels": [
      "字段与缺口",
      "草稿与审核",
      "不同指标"
    ],
    "panels": [
      [
        "金额12.50",
        "币种未提供",
        "时间没有时区",
        "状态2含义未知"
      ],
      [
        "10张关键表",
        "原有2张已审",
        "新增7张草稿",
        "其中3张已审"
      ],
      [
        "覆盖90%",
        "已审50%",
        "正确率仍未知",
        "不是同一指标"
      ]
    ],
    "status": [
      "虚构字段只提供值与类型，不足以推断币种、时区或业务状态。",
      "生成说明必须留下未知项，不能让流畅文字掩盖缺失契约。",
      "合成计数的覆盖率是90%，已审覆盖率是50%，正确率不能反推。",
      "Grab自报效果不是本站实测；搜索体验也受排序等其他改动影响。"
    ]
  },
  "redhat-code-docs-review-selection": {
    "title": "从差异找影响，不顺手改全库",
    "labels": [
      "虚构代码变化",
      "受影响文档",
      "最小补丁验收"
    ],
    "panels": [
      [
        "新装默认3改0",
        "升级保留旧值",
        "0含义未给出",
        "别猜禁用语义"
      ],
      [
        "快速入门",
        "参数参考",
        "迁移说明",
        "引脚文档不动"
      ],
      [
        "逐段给依据",
        "检查复制示例",
        "保留未知项",
        "人工审查PR"
      ]
    ],
    "status": [
      "默认值变化与旧配置迁移是两件事，文档应分别说明。",
      "先审候选文件再生成最小补丁，不把无关润色混进变更。",
      "所读工具允许直接运行完整流程，两阶段审批不是天然强制保证。",
      "本图只解释合成差异，未部署工具或创建真实PR。"
    ]
  },
  "anthropic-proof-scope-binary-contract": {
    "title": "读清证明契约，再判断能保证什么",
    "labels": [
      "具体产物",
      "有条件的性质",
      "仍待验证"
    ],
    "panels": [
      [
        "二进制B1",
        "固定入口",
        "模型与预算",
        "版本必须对应"
      ],
      [
        "排除列出错误",
        "不是所有正确性",
        "未证明终止",
        "不是实时保证"
      ],
      [
        "改变后B2",
        "协议字段含义",
        "MCU中断DMA",
        "需要另外证据"
      ]
    ],
    "status": [
      "主实验123库239入口与公开仓库25库60入口不能混为同一集合。",
      "当前公开材料没有终止证明，不应概括成所有输入必然正常退出。",
      "二进制、入口、模型和预算限定了结论，换平台不能直接套用。",
      "本图为纸面契约练习，本站未运行Rocq或复现研究结果。"
    ]
  }
}
;

check('October 24 strictly preserves all87 earlier article objects, independent scenes and runtime assets',()=>{
 assert.equal(data.posts.length,104);assert.deepEqual(data.posts.slice(17).map(p=>p.id),Object.keys(october24Baseline.posts));assert.deepEqual(data.posts.slice(8, 17).map(p=>p.id),october24Ids);
 for(const [id,hash]of Object.entries(october24Baseline.posts)){const p=data.posts.find(p=>p.id===id);assert.equal(sha256(JSON.stringify(beforeOctober25(p))),hash,id);const box={window:{}};vm.runInNewContext(visuals,box);assert.equal(sha256(box.window.FieldnoteVisuals.render(p)),october24Baseline.scenes[id],id);}
 for(const [file,hash]of Object.entries(october24Baseline.files))assert.equal(sha256(read(file)),hash,file);
});
check('October 24 articles retain explicit evidence, dates, full details, licenses and pending learning',()=>{
 for(const id of october24Ids){const p=data.posts.find(p=>p.id===id),t=JSON.stringify(p);assert.equal(p.verifiedAt,'2026-10-24');assert.equal(p.learningStatus,'待学习');assert(p.sources.length&&p.license&&p.maturity&&p.maintenance);assert(p.analysis.length>=5);assert.deepEqual(p.paragraphs,p.summary);assert.deepEqual(p.takeaways,p.steps);assert.equal(p.limitations,p.caveat);assert(p.tryThis.prompt.length>=150);assert(p.tryThis.expected.length>=40);for(const term of ['chatgpt.com/c/','/workspace/','sandbox:','本站实测成功'])assert(!t.includes(term),id+term);assert(/未|不是.*实测/.test(t));}

});
check('October 24 diagrams have nine distinct original panels and four static accessible notes',()=>{
 const env=boot({observer:true});const seen=[];for(const id of october24Ids){const n=env.get('#visual-'+id),spec=october24Panels[id];assert(n.textContent.includes(spec.title));assert.equal(n.querySelectorAll('.fv-note').length,4);assert.equal(n.querySelectorAll('.fv-note-list li').length,4);assert.equal(n.querySelectorAll('button').length,0);for(const t of spec.status)assert(n.textContent.includes(t));seen.push(JSON.stringify(spec.panels));}assert.equal(new Set(seen).size,9);
});
check('October 24 routes, keyboard focus, copy, bookmark persistence and back-forward preserve behavior',async()=>{
 for(const id of october24Ids){const p=data.posts.find(p=>p.id===id);const env=boot({observer:true});env.click('[data-category="'+p.category+'"]');assert.equal(env.get('.region-filter').hidden,p.category!=='industry');env.click('#title-'+id+' a');assertView(env,'article');assert.equal(env.document.activeElement.id,'article-title');assert.equal(env.get('#article-title').textContent,p.title);env.click('#article-view [data-copy-prompt]');await env.settle();assert.equal(env.clipboard.at(-1),p.tryThis.prompt);env.click('#article-view [data-save="'+id+'"]');assert.equal(env.get('#article-view [data-save="'+id+'"]').getAttribute('aria-pressed'),'true');env.click('#article-view [data-back]');assertView(env,'feed');env.forward();assertView(env,'article');for(const hash of [C.postHash(id),'#post='+id,'#article/'+id]){const direct=boot({url:'https://example.test/publication/'+hash});assertView(direct,'article');assert.equal(direct.get('#article-title').textContent,p.title);}}
});
check('October 24 news separates future delivery, memory budgets, forest probabilities and training events',()=>{
 const post=id=>data.posts.find(p=>p.id===id), text=id=>JSON.stringify(post(id));
 assert.equal(post('kimi-k31-pro-service-weights-speed').date,'2026-10-24');
 for(const term of ['11月4日','Highspeed','thinking','未'])assert(text('kimi-k31-pro-service-weights-speed').includes(term),term);
 assert(Math.abs((20/3+60+20)-86.6666666667)<1e-8);assert(Math.abs(100/(20/3+60+20)-1.1538461538)<1e-8);
 for(const term of ['1000万','40MB','36B','PolyForm','缓存','自动'])assert(text('memt-memory-state-not-runtime').includes(term),term);
 assert.equal(10000000*4/1000000,40);
 for(const term of ['2020','2017','2025','58.2%','校准','65','84','CC-BY'])assert(text('forty-forest-types-probability-boundary').includes(term),term);
 for(const term of ['9月20日','10月1日','10月23日','内部','公司'])assert(text('openai-training-containment-offline-world').includes(term),term);
 for(const term of ['5.6B','8GB','编码器','Kommunity','500万','未'])assert(text('flux3-klein-full-memory-license').includes(term),term);
});
check('October 24 company methods preserve specification, review, workflow and theorem boundaries',()=>{
 const post=id=>data.posts.find(p=>p.id===id),text=id=>JSON.stringify(post(id));
 assert.equal(post('fev-legacy-spec-baseline-gates').date,'2026-04-14');for(const t of ['现状','假设','批准需求','16','17','未公开'])assert(text('fev-legacy-spec-baseline-gates').includes(t),t);
 assert.equal(post('grab-hubble-doc-review-metrics').date,'2024-09-26');for(const t of ['90%','50%','币种','时区','正确率'])assert(text('grab-hubble-doc-review-metrics').includes(t),t);assert.equal((2+7)/10,0.9);assert.equal((2+3)/10,0.5);
 for(const t of ['review-docs','update-docs','Python 3.12','v1.1.2','旧值','未知','MIT'])assert(text('redhat-code-docs-review-selection').includes(t),t);
 for(const t of ['123','239','25库60','9.2.0','20.1.8','halts','没有证明终止','MCU','二进制'])assert(text('anthropic-proof-scope-binary-contract').includes(t),t);
 for(const id of ['redhat-code-docs-review-selection','anthropic-proof-scope-binary-contract'])assert(post(id).sources.some(s=>/github.com.*blob\/[0-9a-f]{40}\//.test(s.url)),id);
});

const october25Ids = ["hy-nomas-interactive-video-memory-budget", "canva-craft-layout-editability-release", "openai-decisions-ga-bounded-routing", "agent-skills-aaif-governance-portability", "spark-x26-4b-edge-thinking-runtime", "meta-getafix-contextual-patch-contract", "nvidia-chipnemo-private-api-attempt-budget", "uber-querygpt-schema-pruning-semantic-check"];
const october25Baseline = {"posts":{"kimi-k31-pro-service-weights-speed":"4cfa97b3b82f4a959017a1675c50aaf7a5d3e7367a802a07e3dcc4b9bdde1234","memt-memory-state-not-runtime":"82121880c591e06440ad644e3cf9e368961d4eb5886dfb366771e988f582497a","forty-forest-types-probability-boundary":"ba4352d6fad77f15667c6a350f17337f513b2d1257ce84d2480e86c8dff2e054","openai-training-containment-offline-world":"319239d8a878bcd457133facdab6b6d70e59900ec09bf551de2ece4cc9806b22","flux3-klein-full-memory-license":"19a415ee000757517a740912fea28ab5a270044419d18b5676d0083a07c5632e","fev-legacy-spec-baseline-gates":"52ac650b1d15ab4aff91b04a8ea1e69cea360599065fdb7adfeb5147c06610ea","grab-hubble-doc-review-metrics":"ba50807b22156c1c805ece2c9269b1fc8f2a084dce4c7d72367042c3613d68a6","redhat-code-docs-review-selection":"f5d280f5ad6185fd0de9c11431c4a213e82149689ae12b68cf4d799c435aef99","anthropic-proof-scope-binary-contract":"a9b50576db9e13a2c29bfe1138f679ed0dc8bc2f7c1d4d3ae08c65cc738e896b","minimax-miniapp-persistent-review":"f1d8678ad76ed307b5b85533965c05226ad5ae25d860fdf2eb310781ee01e418","xing-intent-schema-multiple-results":"ae0605cbb4765a09e9cae5f3fdde6eb25151e361bb58e4a50dbfd9eab8907e84","deepinfer-engine-service-gap":"e7a17a53a341a9b37c8ff6686b7c45e7af2d32dbca7f9393679ce9f91dc250c6","claude-api-dated-version-migration":"538ff61a9e1d7c2bfe787ce083304474641896921a30b36d1306d6d9affab88e","brex-oncall-runbook-evidence":"37e0b0c52d1d3d5a39f3dc35bbd4da236cf38008bce0e95796f2aa27b2efedb9","zalando-search-intent-language-parity":"a7dbbe92c923940651e3df7eb68fec17a77eeacd4f627870ee6e15d551c70597","claude-duet-preview-attention-budget":"19f2ae7f522b8a728ae2ed37bdb31bd26f29951112f1b58d2c47aae3d1fea39e","google-cloud-openai-private-preview":"9b223b459f2f055367b1ab524291efb9f0bf3c962474a42c0963e6869a4540aa","openai-monitor-alerts-boundary-incidents":"bb51a946be3517dde52d8bb4d462f0631e22d54aa9d38d43ec130f171812ffd5","fasth3-omni-weights-runtime-license":"f370da020850bfaa02ae4824fa9f5c4eecf9e760cf382bb839ce0dfaf7408951","openai-12h-cache-reuse-economics":"651f234240d00ec00478fb222f19b40e604ca3770336b0c30ea60d3f926c5ceb","kimi-desktop-trust-session-boundaries":"7c52b32be3782b5e310ffcfb038988908a8758b6826911ebb92cd5981719c344","dropbox-judge-prompt-change-budget":"af809683e7a1d6ec0690b0ac1cb2cb9a6029077a487e1228aad0f7c845c5658a","dropbox-design-code-link-recovery":"915f9676a1b04f2a9b84a84b9d8e79ee35ea18133a04ff846dced2069f696103","openai-monitorability-pair-retry-metrics":"61c48397e70b6af8a609fa451e738c7da67a0e0e706c132813ab6a45668ea710","runway-claude-marketplace-procurement":"8524bc3463bb57b60aed830e54027b3c8f0da0eb70386c197da36e3b4208446c","gemini-gdc-airgap-managed-rag-preview":"b404463d63478a5f672cb9e69a4919781e7b0634cd38179643732c41ee1062b7","metr-anthropic-risk-review-scope-evidence":"75b82cdbb5e65edf4d0d7426bb6f23e406dfdf067b44596730ab080c6bb7aab8","deepseek-harness-preview-upgrade-acceptance":"44de886b63bd49f6e29aeb6df6b64ce45e22484b634c46565577ac1fb5b6153c","seedance25-reference-timeline-repair":"0b478ce46b0d63002867841f8e144d6104d531e108236b6ca560718712fd3359","seedream5pro-layered-diagram-review":"30d3dd62ca295785e19d4c816d273146960d095fae7c0fb70d5643fe6b6daa6a","spotify-eval-funnel-calibration":"29d71f713d44862f3c5a11561f1bbd8a9e978185ce265624ac2d3ad1b57e4eb2","aws-migration-playbook-evidence":"4383156394f86711cbe95370036fa424dbbda2733b5036573a159bd699cca52f","meta-ach-mutant-test-contract":"23eba86dd966b3c7981fc7ace758ee6683748251d854b4afcc6de6faec79ce34","minimax-m31-flash-effort-cost":"205937bece0596d0c2d47b0e536ea51f1a9cca4c613b5028755554074f7e73ca","gemini-notebook-prerender-review":"d2220608e9badca5b9790637aacd43748b1d40072f7f8d9c76d3e766936a19af","pixverse-template-slots-jobs":"f5e61db82ec5f9bdbc190526eccf1b5b1e5dd627d7e6f9298fc53cfe40261e21","gemini-october-api-retirement-window":"a90833e61978936e64a0595ec046e52519fd7ebe123e8914371bec1fbd955dc9","kimi-desktop-remote-review":"ab365fe747962759b25a4a207921bb668b5b5a2d6958939820a878f108d76577","openai-low-resource-behavior-parity":"24581b477de88aa83f6d3533a42f9e2791cfe65ea27f2e0eab116728c77f4888","muse-beam-open-weight-deployment":"efcf0e05ba47d5f109d9775d32245ff0a842a3089bb09a92f05d1a120087aabc","cloudflare-rule-lifecycle-review":"a07df039281887b4c267032d6b1cb669b3599bb24a6ad1c1eb3f4c3318a5f304","meta-forum-state-verification":"b626576ba51a1a0d90671b8f8638452e15d61bcc1551df500cda9d1891786779","mathworks-ears-mapping-review":"9f0c7a35d005a02f769859a42bb904f08903619ed33d3e27a8eed5ed3875ef06","deepseek-search-fetch-evidence":"2291b77e9a0707f2fce5e3223b645ea074a0f5f90c12c76231e94bde6d0445cf","airbnb-incremental-support-notes":"a63251a541273660582a8309b3155b77b76d8506e3718136753d07a6d4965d83","spotify-honk-verification-rollout":"42630f3308bb29ff8683b001e5fd89c0aa68202c15e8ba56d69e0087c10c4584","uber-autocover-test-acceptance":"ab12b8b0bd882a088c67e8e0f6fc5306e6fcd6cf1b4eb2d19202186fdd60019e","scania-spec2code-contract-gap":"9e54ac029dc40dc9e5e90e28d932ea6561118b23af4d360f364ab00c4cda8368","prompt-to-voice-reusable-brief":"8ce23fe19a2edd011766d1e38ced13999c267f6a6c1e0ae1dd5653dedf3fff1f","kling4-long-take-control":"420dfc75a0dbb710ffc1a546f55e5528d49d802ee1bfdd5b400d82289397cd66","decision-switching-threshold":"6a4ed9103895bec78038e3addd3affb50d33184316e16c6aaa4ccf5730b20ae4","learning-short-answer-hint-retest":"501579a24f0049aa7633b3a0c22fa7dc338a58acf82e5e597a55215d1bb44670","firmware-memory-delta-audit":"583d85b92957ebe0492869f532049fb595cd5eedbe784a5768e6d78d48deb922","opus55-fast-access":"5d343d3fb4f55de41b1ad13e273f1eef4f6b4f5a2d8579101d124bce430d8000","gptlive11-voice-corrections":"bc3b9993d381c6ca67bd1e601d7bf4d4a1c95d4cace11f03b4097f67fbbb21db","gemini4-argon-long-work":"121484ce1ee9148c2f7be640371a62f9cfba446c9cdb89ca8cab5446e873ecb0","runway-kling-api-workflow":"52b0018ad273e00a3f6af7862bdaa9f18207c16087737e1a83beb0199645990f","glm-legal-evidence-chain":"9da204d02ab84f8eb48a10f2af265f48759150c5844ef9e34be111d0234d8f4c","qwen-image21-api-alpha":"1e81ecb9ec1498e575ba292c96ade9342fcbc1fd892a0e23d88c62c5e854847d","gpt6-intelligent-ui":"5c9657cf1aaa75195a7c6ca9a419ed9f5c946dae43fd2e929f7cb219def47d11","haiku55-subagent-budget":"40589281778639c45c81447e065e3830efcbe09fe52cd9a3e2604707e5257c35","nano-banana21-continuity":"ab6cb4de6fb4fab6eb5b81028cdd2857bd5971e610074302afc9ee2b27cd618e","embeddinggemma2-local-retrieval":"5cd94802e402edfab230b73e19ee6b0dffeb3eb26d778cd37f907ede67e3c301","mistral-large4-preview":"74d300fc34b328dc749a34aec19c0ac87e0ec4220688eca5a0b702298f05a44f","mplab-agent-telemetry-pacing":"f23ee6f7a452db4833c4f3f58ff69b49aa8811cf8e2f134e288acbe7514631a4","memfault-crash-evidence-chain":"19b9006fd5e592f9efd3fd0332950afcf45a8195884f062d42fdd52c0ff9e69f","assertllm2-rtl-property-review":"b6d87a487535fb842ad4908bcd1bc08b35004d4c2c8a8f199d5da40a1cd59a39","firment-waveform-evidence":"affb6bfa3bdb4778904f9133b4a3a4fab2fb4190b29b0c15bde31b05095800f1","cantools-ai-wire-contract":"e2d91e4db45b36d183823818262761687888da7b3e9b52dd6b34e2aebcf88135","minicpm-local-image-check":"fd0add86b8ae410daf0349b44d383d17df575eb0d1d69ab111d26fe04a5714b7","sensor-unknown-state-gmm":"3b4eac0dd79fb5970aed643285a55a7bfe0cf27c58567093353906e8bd4e8d3f","sol-quality-cost":"f53d3c7c9d9c8b8b75da105a631a8a74df7ceaf105b77adf03ffad445b882b6a","deepseek-v41-migration":"05ea75bf12ecfaf87c4ba8bfb4a84fcdf41deeec532bbdab6ba13efc7698b376","qwen-omni-evidence":"220ef0f3c13e3f04c6b332933a303feb528d06e1458ec410510e4b0924f9c359","images25-edit-brief":"3baf2ae3963446ddc58573af93650d0815cfdb24ba9287d5022927e03dd73dff","renode-replay-lab":"bbc451336852b1abd4d491dfab43c79cc5fac6719bcefeece8304947508aa261","firmware-fuzz-harness":"52204b6f516e75ca58f3ecb7b9154fe9d30bd698d9ff29ab865f12c5ced39058","debug-probe-mcp":"063fa655a3e4838d61f72683df248a15fe8e0c7185fc909684d4c986a7fece58","datasheet-register-audit":"7ad32920da96b7456f3c19971fa940a7528e0338609da7bd07886c53fd7ea708","stm32-edge-ai-budget":"819ad707afc2051fe064ce466d246159ef51d35dec3c2cd3ded40d6666908811","firmware-agent-contract":"146a2eadf17defae9c0266ea2d82e35dd33eb6b480fc3a8a2ca32f262d4a62a9","context-task-eval":"8c96cdbc3b373c90733bc5b218854baa24f99c9e6043ad19d2f3b76d34c86095","espressif-mcp-workflow":"90b01873f620cb39f7e0040e56ea68e6881489c0ccc4d1b214f97ef95573e628","playwright-mcp-boundary":"cb62e3ed8797602aa5df5717d7abb4cde1d87a57981ce342a881c6643a2dcea5","skills-license-eval":"de1ddf6ab2990d2887a2a3324d7a2a6b90012a4f13121d7ff4759408523356d8","embedded-regression-copilot":"3d1ff145b4ddef0c06132990ee8f6c7ac18b2243e34e89cda1b3be8b01f00211","document-style-pipeline":"6d85313adc53f5a592474f69acdb78ce4164c63492147baa7a117f6ffc7d110a","dot-meeting-brief":"1e1e08ae0719a820459a68a4a0ef0356e3dd37570b4b2cf224041cf7a5f533b2","dot-bounded-follow-up":"76111ec1587cae86e39d500343d2945d973f5b958dd0586347950ed163a42478","dot-change-request":"73bdc58095365cb1c20fb099a3a0a8f2dc84bd45988efbc55cd4fc8735d6fbd1","research-conflicting-sources":"7f426c4e27e151214b91384b022eaa1e8063019ca554fc1c53e1a2a0fd8c8923","writing-two-examples":"08492c0f960d7d9c49a7fdabb6eec727741e85032cc143497b317ec43cd0d522","orders-cleaning-audit":"f043208c83891bb78919dd894df9af97f87ec06b1d528a020134cdaa80631828","image-edit-invariants":"db530d20a56191678834b869b084f8d5237047b21363e8408f81bedf6d1df94b","video-learning-evidence":"d0cd75374d542553b4bd74f3bbc76dd7d44bd30435a0b0cff3fe20f2838d0963","codex-small-fix-loop":"d1182d94cd77032b8a7c49962a91661e5928f09dac1410ba622d20449681c7e8"},"scenes":{"kimi-k31-pro-service-weights-speed":"dfd8ffbde9fd9b99528a027737d6f3446685d2e96e1a2121640bb7c91b9c4ba9","memt-memory-state-not-runtime":"7cc2512d6a39dba6c681197efb4e7051aa26b56e666159caa8ccd3162deabfa8","forty-forest-types-probability-boundary":"7af238319d342e13e8012905c2d04ea5ca3f562cb4657ad23fd3f334695c5efd","openai-training-containment-offline-world":"e9c6747ee9991c26667056a2847eae45bcfb1c96a2207f811f37e4651e58e378","flux3-klein-full-memory-license":"8ad8d40d41061891904df1ca02435d47c4a36c5f10549c72fc479b1d5a59c42f","fev-legacy-spec-baseline-gates":"384fbaadf12efa46ecc01f1661ffa28b250af80ebd14d525024c88819b463063","grab-hubble-doc-review-metrics":"e31d378bffbbe927114d44d32fd7dc0f550416191933917b8b25c39c2740403e","redhat-code-docs-review-selection":"43e0b08a705397b53930dc86758eac84ec056d067ea16ad760afc3ec10468a7e","anthropic-proof-scope-binary-contract":"cc5fd8c0467c0bf865b317916c94eb6e3b6699997f737e87ca9a061c721d3aca","minimax-miniapp-persistent-review":"a748aeb751f9c8e2ccbeb7492c3130f89d9bfb39e244c948bdaedbf5b4a2b8d2","xing-intent-schema-multiple-results":"edf72f25bda03c79bb5651a49e8b5667ee6f0fba061558e415be55bd067f38e0","deepinfer-engine-service-gap":"b6402492d49de09ee5f86d84f5d29bd8312ba8345f1d1eab760e22d22ddbe755","claude-api-dated-version-migration":"d8d4287fab3f8d1c02e1567bcb394a050c1cb0a0cd4217eeb16e4217cfcf974a","brex-oncall-runbook-evidence":"66e4149d945f9de701054ecca31aef1e2431c20c80ee5769f408f3ccdf952672","zalando-search-intent-language-parity":"3f18ec674e3e176e69981e2d88f058476d28d1256f4f53a7fa4fbdffdfdef0e7","claude-duet-preview-attention-budget":"0b82a4a9bf0bd996461a5d347398cc594ab61f78c12b15e8e0bd78600e98866c","google-cloud-openai-private-preview":"b9d8e4483687605a871c9bc8958944efcf521e1678b4f3e8f858540338133b5b","openai-monitor-alerts-boundary-incidents":"50fe45065016cefc82ace42e2032d8d2c1b874ed823e89aa698ae35d61506b21","fasth3-omni-weights-runtime-license":"91ab28b690af7b362d1fa639d68dfca41772d34263ff24a1ad0ff79d02986b37","openai-12h-cache-reuse-economics":"6e0698a14e4d66dd6d1513661d9974e3eacb98a662d67da07472ebbac11a866e","kimi-desktop-trust-session-boundaries":"d6617d36cfbc5aedf75e3d6797fa6d89c99537ea520fb07acdaf132b14dbdc89","dropbox-judge-prompt-change-budget":"6601521e1ab6a775264f30b1e61b8ff49ebd1c4f5dad866cb9fb842c757e147f","dropbox-design-code-link-recovery":"79cbd5272111cc1d057caa8083b15054762c1347e62af234c49cd0616f010b26","openai-monitorability-pair-retry-metrics":"b0eb54443de07342e850b219deb93aceec57e4250c5eb043efb36902fa05ff1a","runway-claude-marketplace-procurement":"3479bd8d6d59b288e1f85167a3302c5bbbaecd1a4b42fbd8ff5b1ac957ce4b97","gemini-gdc-airgap-managed-rag-preview":"73d98ba22c98d7f9f778bebd8fc2580935fa3957723b11c3d34d825b13722e1a","metr-anthropic-risk-review-scope-evidence":"d2720ede1d792e8b4d71aa041cc7e0fccc8166c89686e6aac74bd69c9997b43c","deepseek-harness-preview-upgrade-acceptance":"e51baccaaa7613fa4cb0405725990ff5854aa1fa0037bfaf279f06f60f8b5042","seedance25-reference-timeline-repair":"18224853a9d889de88fc2fc07e84bd2d05f97a44d1398d8e7d9c1bbdc7f80b18","seedream5pro-layered-diagram-review":"8ead950d70db4e56e03eb839e1aa35d4e43f74368478791c27b87a9a819bfb50","spotify-eval-funnel-calibration":"43e8414456eb2f787b66d816cbf8c21ee9fdb74ab3c532c3e406dc3dc852cded","aws-migration-playbook-evidence":"5a6c5500910ba54711133df32fc7041c899f956e0e1647b279e453d896fc586e","meta-ach-mutant-test-contract":"fdcfa9b359c36f494e7ffecef5d8b06b1375e9ed48fcc9fdcec49b8f8bc1b726","minimax-m31-flash-effort-cost":"587ab389ce8c07f70c952e708ce54497ea6d5ce11ec40d9c5baf5a192987b06a","gemini-notebook-prerender-review":"84803926844efe41463668a971bdcabc6deb33b79d39aa7d8b5e401e3314b285","pixverse-template-slots-jobs":"1f803b8449fe8724da02c102485f2ed491c4f527968b7ad5699f8a3270239837","gemini-october-api-retirement-window":"bfdef308a3e96deb022cd6063fc163663cbf44f4eae5f91888bc9af8a0018df5","kimi-desktop-remote-review":"36673ae692f94e9b555a796b36a76b4202bf53a7a4b1a424ebd0c1a1137afb46","openai-low-resource-behavior-parity":"a49a22725f5090c9946cbc583bdb532e2fb4c02499515271522edcb0db4d7611","muse-beam-open-weight-deployment":"fc15cd8f50c93d48d22318780a0118d2247408426827b60056a0d373713c39cb","cloudflare-rule-lifecycle-review":"26c132c50fbd9d7dcfe61798ee8ed5ce1b72704504fa54ba5303b3d162aa5852","meta-forum-state-verification":"4baf27b21b49c2c0fc74fbb46435ef8544851d9d4adb62858a1b14d713422c96","mathworks-ears-mapping-review":"adb75184b30156125e23d3a19723bc884cb9e230934760cb6cbce704af041820","deepseek-search-fetch-evidence":"a85c43e589807cbf631ffd3c58bfad24e6f841b85e79ad5ddfba33bef58bc6cf","airbnb-incremental-support-notes":"2a6612e4c229e677618be3fa1dee15f80018aee4666cb0a0f2c94b1baf7f14dd","spotify-honk-verification-rollout":"2ab648ae586ac7ce173dcc69e8e99362591f4565b7509eaf3a0af9e3498a29f2","uber-autocover-test-acceptance":"93cb45b55189d9e5539e191019eea33ee79bddf9dd7f4fc559a0a366d87c64bc","scania-spec2code-contract-gap":"42d1910826736a2d1e2359f77ee61e98d8bae4ab3f95cc1aa2760653e20a9833","prompt-to-voice-reusable-brief":"084110d9ee279bbf11af4b441f802b9b3a8a725c7d20eaf6d9284dfa39f61cd1","kling4-long-take-control":"62799f892ec6b3cf79330c3751fe5bc81c2a84ad54e7ddd95e311b832f17ee0a","decision-switching-threshold":"7903838acfab4640dc450e4475012fbc8d3575f13376079c4c37f1500883da0a","learning-short-answer-hint-retest":"83adb4a7bcb3a63d10449657d7f34aae6071091c84382fc8e075d1cc5cd92323","firmware-memory-delta-audit":"e2757f410a9fdc59f1fa8b3f1a64e3ba29ff96500794fb9c9441979acd8be345","opus55-fast-access":"4adf26b679bcc54f022f95b4fe8ce05a12ad5659b40150003386a205242dc3a2","gptlive11-voice-corrections":"90a546fb4fc93f4e703e55a6319ba8742ff3920fa5bbbc36b8dcfd6684577dc6","gemini4-argon-long-work":"3f5357476daa50f9dae14e6dffa4e358b25f492b88db72b88bb4fcbd2ab18bf1","runway-kling-api-workflow":"ec96e7d3ed9c9eb159b9b2756791c6906707497d216110310da7a543b7cc2054","glm-legal-evidence-chain":"0847157a51d87c38680a1883fcded1cb186acd2f5cfdf4b99964dceeab23ef16","qwen-image21-api-alpha":"8ecb0f5e3e13e7ee8d5ae178f53b558f52004cf253f5bbc77e0a6cd994453791","gpt6-intelligent-ui":"b25e050a79bcc2a4a89b2a2980645ae06d74d03b586fdc4e4b0b0f36b89af766","haiku55-subagent-budget":"13cf6a2089f016c3ce1f0114f0ddb57d76077047f1df51fb3a323bec3704efc4","nano-banana21-continuity":"7360b9df5dbc06c7de72f27cdb2bb978ebe64c9f6d5d1cf7c640c081cadb5d93","embeddinggemma2-local-retrieval":"1c15811ae86029d28cf952201672d302e49313d5685b4d1bf3264442b075cb7e","mistral-large4-preview":"eef9211bdf2841306f03d4255f5536529d2712a0b87fdc349f7345a33b249e96","mplab-agent-telemetry-pacing":"98f7942e28b93b416bd5fb1a01189da287770e79f19b19b9ffe7811f7f4aeea9","memfault-crash-evidence-chain":"589792d5a3a877b4dd874d149996ce639c571c340ddcc31e71645e2d42b222c9","assertllm2-rtl-property-review":"e91f5ee4397da1789fa5343cb2adbc92c0daadd38df6cf6edf7a2ac1a7ed0a9d","firment-waveform-evidence":"47e4d63c6cc4715350747ebc0d96ddaeeccd22c10ddef67298d50328b8a3cd41","cantools-ai-wire-contract":"be2a8be95077dfc14460ce8d63348efb55fbe8b1689cc51e6e3252596cfa31fc","minicpm-local-image-check":"fa17a45f81ee28c814e29c26d199cc8755d082856373289c73671e071875cb12","sensor-unknown-state-gmm":"2a249413d4e9ab7d75f558b93234c16ebe2e78505a5eeadd992094aa3eed7c3a","sol-quality-cost":"21ac08e4a30889f92d381fa976e7f9eb05a33efa05c444f3afaed743c986649e","deepseek-v41-migration":"c552e257157ccebf462c5d2de48023234cebcf5f38861ca937e78dcdfdf2e790","qwen-omni-evidence":"253ecdbfa2c0dea216716d0be36a7381b1f70652f31638785a4178ed713f3ee0","images25-edit-brief":"ba77c9ee45199dfcaf0bca9cd9f31438ee82d06766a092731add3035bec0b9c2","renode-replay-lab":"02529004caba1c922ab3d690b3aad588fab1ca33eae0daef85b89c3f56511a99","firmware-fuzz-harness":"089f5a9ebdf188ab3e4575eab1f5c756732aadb3177952f01431567c8fd7f4d3","debug-probe-mcp":"ca23b159b62c8fdf7ab35ebec262ffe31fe11b3dd941e631cb2dd1de06ab432f","datasheet-register-audit":"ac50c025ad093bba38ff389df2334f5f29e01fc87ad0ee97aebf1d427ecf5701","stm32-edge-ai-budget":"3463da3b40663b7296560028a5b8af5e3efcd084d6ebe3cc47f397b89327896f","firmware-agent-contract":"cf9dbbe92d84749fb634e26345b8b5e72c7a5ca1dcefb74e320a94dd18b3029f","context-task-eval":"4cf4541762a4b088e7f4011943066ecf25c12ab4115ffb51c12e582f06cf30f9","espressif-mcp-workflow":"63fa25ccd1534820f5899d41ca7a0116fc39e57b7d519f5dde0ba1d07dc68a96","playwright-mcp-boundary":"d13701f012853926a1c127ccd36325b94083ade013acf0ac06971e8b95d6a6ed","skills-license-eval":"de41448284606b587eb01f3f52467148abfe329eb4afb64f7095d6de51652553","embedded-regression-copilot":"0d8d2283b73273ccc9a7d3796502bcc1829e51c11901f43981694c80d21ac2ea","document-style-pipeline":"6e4abe39ece7436424ab728a07da99038cb267dd0f0c08c91806354f13c07b75","dot-meeting-brief":"4a18fe99ee18228ac2ea8dd08c7d06816bbc7dd475642a09df71b664289f3e34","dot-bounded-follow-up":"84e7fc7f83600649ed9d672287d8dfd0cc33ffdecae66cd7a7e5a0340e789eb3","dot-change-request":"2d78da6f25d6ea5d47d3067a5d597d8e304b41602a0321d27c90e9d2daf8cc73","research-conflicting-sources":"f2ddf755914405abf96632ad8b54e6353f492322f3d36384bade89dbabb505e2","writing-two-examples":"fda4d9625c4a38559a612483510673de3a65cb0f28478f943f5f3e8bb8addd10","orders-cleaning-audit":"eac249de66543c18ca22b17f9a961174a336d9db5bed9a69d4498fbf2c61cef6","image-edit-invariants":"8fbc5aaee484a75ba7f90badfee66feefcb16c4eea375ed91be3cb8c9ec69b02","video-learning-evidence":"fe6f5a20880ffcc649a26c4ec6cf8a01bef309ce178247c6757ddb7c44a986d0","codex-small-fix-loop":"97e754ab244ea90773db163c6b8959f96f555cd1ba2234d015455d6cdb27f670"},"files":{"app.js":"3f11837199a84b29e606682c4b88a17632fea212e8cabad2eab2570564305157","site-core.js":"b4f96a7f0557c322c3c2e42cfcf14d1545585d06420cfc1147c03bc5b7b33589","style.css":"5e159c776246dcd48bf52117e649feb7250bbffb9f49a707bbb2d9b3cf3c5c8b","visuals.css":"7cf30aa521f1fe9e7589608376199737cb797efc3ab2a63799c97d7ac0d4d00d","build.py":"25deb0b707c7e7ae97e1306b94afcab5d0156c8a7ff8495a980140e4ebb2f524","favicon.svg":"b33e38910db7f167eb595800e4fa779577885204e090115732215704f1be1db5","DESIGN.md":"23cb37aa5f8c5df788d9587f03e8e2b01a2b955f5d26b4862e7f1dc5439e5a96","THIRD_PARTY_NOTICES.md":"e10fafb73c4164f3cc2f5350a0ec70c500ab6417cc935a9140b69e49b74daf60"}};
const october25Panels = {
  "hy-nomas-interactive-video-memory-budget": {
    "title": "连续生成，也要记忆预算",
    "labels": [
      "跨段控制",
      "单卡取舍",
      "分开验收"
    ],
    "panels": [
      [
        "先定角色与环境",
        "下一段改动作",
        "单独记录相机",
        "保留其他对象"
      ],
      [
        "量化权重与缓存",
        "历史窗口有界",
        "模型按阶段卸载",
        "传输也耗时间"
      ],
      [
        "检查指令生效",
        "检查对象保留",
        "测量生成等待",
        "别混淆播放帧率"
      ]
    ],
    "status": [
      "已核代码与权重目录",
      "10月23日为权重提交日",
      "单卡路径有资源取舍",
      "图解非样片，未实测"
    ]
  },
  "canva-craft-layout-editability-release": {
    "title": "从构图规划到可编辑交付",
    "labels": [
      "先规划",
      "再转换",
      "核状态"
    ],
    "panels": [
      [
        "标题与主体",
        "相对位置",
        "文字内容",
        "信息层级"
      ],
      [
        "生成图像",
        "转换设计元素",
        "检查可修改对象",
        "复查文字与遮挡"
      ],
      [
        "主模型已宣布开放",
        "快版属于后续",
        "MCP条目标待推出",
        "额度与费用另核"
      ]
    ],
    "status": [
      "公告日期10月22日",
      "两阶段架构为厂商描述",
      "图层转换需独立验收",
      "原创图解，非效果样张"
    ]
  },
  "openai-decisions-ga-bounded-routing": {
    "title": "把短答案接到可靠下一步",
    "labels": [
      "定义问题",
      "读取结果",
      "控制后果"
    ],
    "panels": [
      [
        "条件是否成立",
        "从预设选项选择",
        "按有序等级评分",
        "独立问题可合并"
      ],
      [
        "概率不是承诺",
        "加权分不是类别",
        "类别之外留兜底",
        "前后依赖分请求"
      ],
      [
        "标注样本定阈值",
        "计算误判代价",
        "低把握转人工",
        "记录完整任务成本"
      ]
    ],
    "status": [
      "10月22日正式开放",
      "当前使用GPT-6 Luna",
      "速度数字为厂商报告",
      "仅纸面分析，未调用"
    ]
  },
  "agent-skills-aaif-governance-portability": {
    "title": "格式共享，执行边界分开",
    "labels": [
      "标准治理",
      "具体技能",
      "宿主执行"
    ],
    "panels": [
      [
        "名称与标志移交",
        "组织与域名移交",
        "无需加入基金会",
        "路线图仍是提案"
      ],
      [
        "核作者与来源",
        "锁定版本",
        "审脚本和依赖",
        "逐项检查许可"
      ],
      [
        "核实际工具集合",
        "核环境兼容性",
        "核越界处理",
        "核最终任务结果"
      ]
    ],
    "status": [
      "10月22日移交公告",
      "基金会归属不是认证",
      "格式兼容不等于权限一致",
      "原创图解，未安装技能"
    ]
  },
  "spark-x26-4b-edge-thinking-runtime": {
    "title": "小模型也要分三本账",
    "labels": [
      "准确型号",
      "思考预算",
      "运行条件"
    ],
    "panels": [
      [
        "锁定X2.6-4B",
        "旧版同架构",
        "改进来自后训练",
        "不混用云端规格"
      ],
      [
        "无需思考",
        "较低思考预算",
        "较高思考预算",
        "同任务比较结果"
      ],
      [
        "权重内存",
        "上下文缓存",
        "运行时和依赖",
        "外部工具权限"
      ]
    ],
    "status": [
      "仓库记全球开放10月21日",
      "官方模型卡列Apache-2.0",
      "百万上下文需足够内存",
      "未安装、未运行、待学习"
    ]
  },
  "meta-getafix-contextual-patch-contract": {
    "title": "告警消失后，收尾责任还在吗",
    "labels": [
      "候选A：早返回",
      "候选B：跳发送",
      "候选C：统一收尾"
    ],
    "panels": [
      [
        "锁已取得",
        "空值立即返回",
        "遗漏解锁",
        "遗漏完成通知"
      ],
      [
        "空值不发送",
        "解锁一次",
        "通知一次",
        "却错报OK"
      ],
      [
        "分支定状态",
        "非空才发送",
        "解锁一次",
        "通知一次"
      ]
    ],
    "status": [
      "合成契约要求每次解锁一次、通知一次，空值必须报告BAD_ARGUMENT。",
      "A消除空指针风险，却跳过收尾；B保住收尾，却把错误状态改成成功。",
      "C只是按本题简化契约可进入测试，不能据此认定并发或真实硬件正确。",
      "Getafix是历史修复模式学习方法；本图不是公司代码或运行记录。"
    ]
  },
  "nvidia-chipnemo-private-api-attempt-budget": {
    "title": "接口契约和尝试预算，分成两份账",
    "labels": [
      "虚构工具G3",
      "给定路径结果",
      "四题合成台账"
    ],
    "panels": [
      [
        "只读查询",
        "检查setup路径",
        "单位为ns",
        "最多返回三条"
      ],
      [
        "P1：−0.12ns",
        "P2：−0.05ns",
        "P3：+0.03ns",
        "只保留前两条"
      ],
      [
        "首次成功2/4",
        "五次内成功3/4",
        "提前停止10次",
        "非实际运行"
      ]
    ],
    "status": [
      "负裕量只有两条，不能为凑满三条而纳入正值或编造路径。",
      "只读查询不允许改设计；资料没有的函数不能靠模型猜出来。",
      "四题固定样例的首次成功为50%，五次内至少一个通过为75%，分母含义不同。",
      "图中台账仅解释尝试预算，不是ChipNeMo论文数据或本站实测。"
    ]
  },
  "uber-querygpt-schema-pruning-semantic-check": {
    "title": "两项任务，为什么会被查成五行",
    "labels": [
      "先定任务口径",
      "检查连接粒度",
      "核验答案含义"
    ],
    "panels": [
      [
        "每任务一行",
        "B9版本成功",
        "UTC启动日期",
        "应计J1与J3"
      ],
      [
        "J1有3条事件",
        "J3有2条事件",
        "连接后共5行",
        "任务仍只有2个"
      ],
      [
        "语法可运行",
        "聚合有结果行",
        "计数0也可能错",
        "须对照真值"
      ]
    ],
    "status": [
      "虚构问题只需任务表；任务数是2，事件连接后的5行不是5个任务。",
      "列裁剪要保留版本、状态和启动时间，不只留下最终显示的计数。",
      "不带GROUP BY的COUNT在无匹配时仍可返回一行0，有输出行不等于语义正确。",
      "合成记录不来自Uber，图解未连接数据库或执行查询。"
    ]
  }
};

check('October 25 strictly preserves all96 earlier article objects except the exact Veo maintenance patch, independent scenes and runtime assets',()=>{
 assert.equal(data.posts.length,96+october25Ids.length);assert.deepEqual(data.posts.slice(october25Ids.length).map(p=>p.id),Object.keys(october25Baseline.posts));assert.deepEqual(data.posts.slice(0,october25Ids.length).map(p=>p.id),october25Ids);
 for(const [id,hash]of Object.entries(october25Baseline.posts)){const p=data.posts.find(p=>p.id===id);assert.equal(sha256(JSON.stringify(beforeOctober25(p))),hash,id);const box={window:{}};vm.runInNewContext(visuals,box);assert.equal(sha256(box.window.FieldnoteVisuals.render(p)),october25Baseline.scenes[id],id);}
 for(const [file,hash]of Object.entries(october25Baseline.files))assert.equal(sha256(read(file)),hash,file);
});
check('October 25 articles retain explicit evidence, dates, full details, licenses and pending learning',()=>{
 for(const id of october25Ids){const p=data.posts.find(p=>p.id===id),t=JSON.stringify(p);assert.equal(p.verifiedAt,'2026-10-25');assert.equal(p.learningStatus,'待学习');assert(p.sources.length&&p.license&&p.maturity&&p.maintenance);assert(p.analysis.length>=5);assert.deepEqual(p.paragraphs,p.summary);assert.deepEqual(p.takeaways,p.steps);assert.equal(p.limitations,p.caveat);assert(p.tryThis.prompt.length>=150);assert(p.tryThis.expected.length>=40);for(const term of ['chatgpt.com/c/','/workspace/','sandbox:','本站实测成功'])assert(!t.includes(term),id+term);assert(/未|不是.*实测/.test(t));}

});
check('October 25 diagrams have distinct original panels and four static accessible notes',()=>{
 const env=boot({observer:true});const seen=[];for(const id of october25Ids){const n=env.get('#visual-'+id),spec=october25Panels[id];assert(n.textContent.includes(spec.title));assert.equal(n.querySelectorAll('.fv-note').length,4);assert.equal(n.querySelectorAll('.fv-note-list li').length,4);assert.equal(n.querySelectorAll('button').length,0);for(const t of spec.status)assert(n.textContent.includes(t));seen.push(JSON.stringify(spec.panels));}assert.equal(new Set(seen).size,october25Ids.length);
});
check('October 25 routes, keyboard focus, copy, bookmark persistence and back-forward preserve behavior',async()=>{
 for(const id of october25Ids){const p=data.posts.find(p=>p.id===id);const env=boot({observer:true});env.click('[data-category="'+p.category+'"]');assert.equal(env.get('.region-filter').hidden,p.category!=='industry');env.click('#title-'+id+' a');assertView(env,'article');assert.equal(env.document.activeElement.id,'article-title');assert.equal(env.get('#article-title').textContent,p.title);env.click('#article-view [data-copy-prompt]');await env.settle();assert.equal(env.clipboard.at(-1),p.tryThis.prompt);env.click('#article-view [data-save="'+id+'"]');assert.equal(env.get('#article-view [data-save="'+id+'"]').getAttribute('aria-pressed'),'true');env.click('#article-view [data-back]');assertView(env,'feed');env.forward();assertView(env,'article');for(const hash of [C.postHash(id),'#post='+id,'#article/'+id]){const direct=boot({url:'https://example.test/publication/'+hash});assertView(direct,'article');assert.equal(direct.get('#article-title').textContent,p.title);}}
});
check('October 25 company exercises preserve cleanup, attempt-budget and SQL-grain contracts',()=>{
 const text=id=>JSON.stringify(data.posts.find(p=>p.id===id));
 for(const t of ['BAD_ARGUMENT','解锁','通知','非空','不涉及中断'])assert(text('meta-getafix-contextual-patch-contract').includes(t),t);
 for(const t of ['Pass@5','0至10','2024-04-04','slack_ns','10次','不是论文数据'])assert(text('nvidia-chipnemo-private-api-attempt-budget').includes(t),t);
 const candidates=[[1,0,0,0,0],[0,0,1,0,0],[0,0,0,0,0],[1,1,0,0,0]];
 assert.equal(candidates.filter(x=>x[0]).length/candidates.length,.5);assert.equal(candidates.filter(x=>x.some(Boolean)).length/candidates.length,.75);assert.equal(candidates.reduce((s,x)=>s+(x.includes(1)?x.indexOf(1)+1:5),0),10);
 for(const t of ['COUNT(*)','SUCCESS','PASSED','2个任务','变成5','2024-09-19'])assert(text('uber-querygpt-schema-pruning-semantic-check').includes(t),t);
 const jobs=[{t:'2026-10-01T01:00:00Z',ok:1,events:3},{t:'2026-10-01T02:00:00Z',ok:0,events:1},{t:'2026-10-01T23:50:00Z',ok:1,events:2},{t:'2026-10-02T00:00:00Z',ok:1,events:1}];const chosen=jobs.filter(j=>j.ok&&j.t>='2026-10-01T00:00:00Z'&&j.t<'2026-10-02T00:00:00Z');assert.equal(chosen.length,2);assert.equal(chosen.reduce((s,j)=>s+j.events,0),5);
});
check('October 25 Veo update keeps historical records and visibly narrows confirmed shutdown scope',()=>{
 const p=data.posts.find(p=>p.id===october25VeoPatch.id);beforeOctober25(p);
 assert.equal(p.date,'2026-10-08');assert.equal(p.verifiedAt,'2026-10-25');
 assert(p.dek.includes('10月22日'));assert(p.summary[0].includes('2026年10月25日'));assert(p.summary[0].includes('Gemini API'));assert(p.summary[0].includes('veo-3.1-generate-preview'));
 assert.deepEqual(p.summary,p.paragraphs);assert(p.sources.some(s=>s.url==='https://ai.google.dev/gemini-api/docs/veo?hl=en'));
 const env=boot({url:'https://example.test/publication/'+C.postHash(p.id)});assert(env.get('#article-view').textContent.includes(p.summary[0]));
});
check('October 25 news separates availability, resource limits, scores and standard governance',()=>{
 const post=id=>data.posts.find(p=>p.id===id),text=id=>JSON.stringify(post(id));
 for(const t of ['INT8','24fps','播放帧率','CPU','Apache-2.0'])assert(text('hy-nomas-interactive-video-memory-budget').includes(t),t);
 for(const t of ['Magic Layers','Coming Soon','Craft-fast','Craft-ultrafast'])assert(text('canva-craft-layout-editability-release').includes(t),t);
 for(const t of ['predicate','choice','score','400','Responses API','1.1'])assert(text('openai-decisions-ga-bounded-routing').includes(t),t);
 assert(Math.abs(0*.1+1*.7+2*.2-1.1)<1e-12);
 for(const t of ['allowed-tools','实验','Apache-2.0','CC-BY-4.0'])assert(text('agent-skills-aaif-governance-portability').includes(t),t);
 assert.equal(post('spark-x26-4b-edge-thinking-runtime').date,'2026-10-21');for(const t of ['1,048,576','trust_remote_code','Apache-2.0','未'])assert(text('spark-x26-4b-edge-thinking-runtime').includes(t),t);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of suites) {
    try { await fn(); passed++; console.log('PASS ' + name); }
    catch (error) { console.error('FAIL ' + name); console.error(error.stack); process.exitCode = 1; }
  }
  console.log(`\n${passed}/${suites.length} suites passed. Browser layout, animation paint, and native clipboard permission UI still need browser QA.`);
})();
