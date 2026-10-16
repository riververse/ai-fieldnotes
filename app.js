(function () {
  'use strict';
  const C = window.SiteCore;
  const data = window.AI_FIELDNOTES;
  const feed = document.getElementById('feed');
  if (!C || !data || !Array.isArray(data.posts)) {
    feed.innerHTML = '<div class="empty-state"><h2>文章资料未能载入</h2><p>请刷新页面，或查看 <a href="./content.json">原始文章资料</a>。</p></div>';
    document.getElementById('result-count').textContent = '载入失败';
    return;
  }
  const e = C.escapeHTML;
  const posts = data.posts;
  const byId = new Map(posts.map(p => [p.id, p]));
  const feedView = document.getElementById('feed-view');
  const articleView = document.getElementById('article-view');
  const storageKey = 'ai-fieldnotes-bookmarks-v1';
  const baseTitle = 'AI 现场 · AI Fieldnotes';
  let rawSaved = null;
  try { rawSaved = localStorage.getItem(storageKey); } catch (_) {}
  const state = { category: 'all', region: 'all', query: '', savedOnly: false, saved: C.parseSaved(rawSaved, new Set(byId.keys())) };
  let currentId = null, feedSnapshot = null, toastTimer, positionTimer, entryTimer, progressFrame = false, storageWorks = true;
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const icons = {
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 15 6-6m-7 9-1 1a4.2 4.2 0 0 1-6-6l4-4a4.2 4.2 0 0 1 6 0m2 6a4.2 4.2 0 0 0 6 0l4-4a4.2 4.2 0 0 0-6-6l-1 1" transform="translate(1 1) scale(.9)"/></svg>'
  };
  const avatar = { industry: '观', practice: '用', embedded: '试' };
  const visual = p => window.FieldnoteVisuals ? window.FieldnoteVisuals.render(p) : '';
  // Scenes keep their own looping rhythm. Viewport exits pause the CSS timeline;
  // returning resumes it. Retired local pause values are deliberately ignored.
  const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
    entries.forEach(entry => entry.target.classList.toggle('is-visible', entry.isIntersecting));
  }, { rootMargin: '0px', threshold: 0.01 }) : null;
  function observeMotion() {
    if (observer) observer.disconnect();
    document.querySelectorAll('.motion-scene').forEach(el => {
      if (observer) observer.observe(el);
      else el.classList.add('is-visible');
    });
  }
  function applyMotion() {
    document.body.classList.toggle('motion-paused', motionQuery.matches);
  }
  function detail(p) {
    const summaries=p.summary||[];
    const analyses=(p.analysis||[]).filter(x=>!p.tryThis || typeof x==='string' || !String(x.heading).startsWith('动手试试'));
    const steps=p.steps||[];
    const official = p.kind==='experiment' ? '方案出发点' : '先读事实';
    return `<div class="detail-evidence"><span class="evidence-dot" aria-hidden="true"></span><span>${e(p.evidence||'来源见文末')}</span><span>核验于 ${e(p.verifiedAt||data.site.verifiedAt)}</span></div>
    ${summaries.length?`<section class="article-section"><h3>${official}</h3>${summaries.map(x=>`<p>${e(x)}</p>`).join('')}</section>`:''}
    ${analyses.map(x=>typeof x==='string'?`<p>${e(x)}</p>`:`<section class="article-section"><h3>${e(x.heading)}</h3><p>${e(x.text)}</p></section>`).join('')}
    ${p.tryThis?`<section class="try-this"><div class="try-this-heading"><h3>动手试试：一份任务包</h3><button data-copy-prompt="${e(p.id)}">复制任务包</button></div><label class="sr-only" for="prompt-${e(p.id)}">可复制的任务提示</label><textarea id="prompt-${e(p.id)}" readonly rows="5">${e(p.tryThis.prompt)}</textarea><p><strong>预期得到：</strong>${e(p.tryThis.expected)}</p></section>`:''}
    ${steps.length?`<section class="article-section"><h3>${p.kind==='experiment'?'可以怎样验证':'把它用起来'}</h3><ol>${steps.map(x=>`<li>${typeof x==='string'?e(x):`<strong>${e(x.title||x.heading||'')}</strong> ${e(x.text||x.description||'')}`}</li>`).join('')}</ol></section>`:''}
    ${p.caveat?`<aside class="caveat"><strong>${p.kind==='experiment'?'方案边界':'适用边界'}</strong><p>${e(p.caveat)}</p></aside>`:''}
    <section class="source-list"><h3>回到原始资料</h3><ol>${(p.sources||[]).map(s=>{const url=C.safeURL(s.url);if(!url)return '';return `<li><a href="${e(url)}" target="_blank" rel="noopener noreferrer"><span>${e(s.title||s.label)}</span><span aria-label="在新标签页打开">↗</span></a><small>${e(new URL(url).hostname)}</small></li>`;}).join('')}</ol><div class="source-facts"><span>${p.date?e((p.dateLabel||'资料日期')+'：'+p.date):e(p.dateLabel||'持续更新资料')}</span><span>核验：${e(p.verifiedAt||data.site.verifiedAt)}</span></div>${p.license?`<p>许可证：${e(p.license)}</p>`:''}${p.maturity?`<p>成熟度：${e(p.maturity)}</p>`:''}${p.maintenance?`<p>维护观察：${e(p.maintenance)}</p>`:''}</section><button class="article-return" data-back>← 返回信息流</button>`;
  }

  function byline(p) {
    return `<div class="post-header"><span class="post-avatar" aria-hidden="true">${avatar[C.categoryFor(p)] || '记'}</span><div class="post-byline"><strong>AI 现场 <span aria-hidden="true">/</span> ${e(C.categories[C.categoryFor(p)] || '现场笔记')}</strong><small>${C.categoryFor(p) === 'industry' ? e(p.region === 'china' ? '中国视野' : '全球视野') + ' · ' : ''}${p.date ? e(p.date.replace(/-/g, '.')) : e(p.dateLabel || '持续更新资料')}</small></div><span class="post-label">${e(p.evidenceBadge || (p.kind === 'experiment' ? '原创实验方案' : p.label || '选读'))}</span></div>`;
  }
  function utilities(p) {
    const saved = state.saved.has(p.id);
    return `<div class="utility-actions"><button class="icon-button" data-copy="${e(p.id)}" aria-label="复制文章链接：${e(p.title)}">${icons.link}<span>链接</span></button><button class="icon-button ${saved ? 'saved' : ''}" data-save="${e(p.id)}" aria-pressed="${saved}" aria-label="${saved ? '取消收藏' : '收藏'}：${e(p.title)}">${icons.bookmark}<span>${saved ? '已剪报' : '剪报'}</span></button></div>`;
  }
  function tags(p) {
    return `<div class="post-tags" aria-label="话题标签">${(p.tags || []).map(t => `<button data-tag="${e(t)}" aria-label="搜索话题：${e(t)}">${e(t)}</button>`).join('')}</div>`;
  }
  function card(p) {
    return `<article class="post" id="post-${e(p.id)}" data-post="${e(p.id)}" data-category="${e(C.categoryFor(p))}" aria-labelledby="title-${e(p.id)}">${byline(p)}<h2 class="post-title" id="title-${e(p.id)}"><a href="${e(C.postHash(p.id))}" data-read="${e(p.id)}">${e(p.title)}</a></h2><p class="post-dek">${e(p.dek)}</p>${visual(p)}${tags(p)}<div class="post-actions"><a class="read-button" data-read="${e(p.id)}" href="${e(C.postHash(p.id))}"><span>阅读全文</span><span aria-hidden="true">↗</span><small>约 ${Number(p.readMinutes) || 3} 分钟</small></a>${utilities(p)}</div></article>`;
  }
  function renderFeed() {
    const visible = C.filterPosts(posts, state);
    feed.innerHTML = visible.map(card).join('');
    document.querySelectorAll('button[data-category]').forEach(el => {
      const active = el.dataset.category === state.category;
      el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active));
    });
    document.querySelector('.region-filter').hidden = state.category !== 'industry';
    document.querySelectorAll('[data-region]').forEach(el => {
      const active = el.dataset.region === state.region;
      el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-count]').forEach(el => {
      el.textContent = String(el.dataset.count === 'all' ? posts.length : posts.filter(p => C.categoryFor(p) === el.dataset.count).length).padStart(2, '0');
    });
    ['shelf-button', 'mobile-shelf'].forEach(id => {
      const el = document.getElementById(id); el.classList.toggle('active', state.savedOnly); el.setAttribute('aria-pressed', String(state.savedOnly));
    });
    document.getElementById('bookmark-count').textContent = state.saved.size;
    const descriptions = { all: '产业变化、通用方法与工程脑洞，放在同一条阅读流里。', industry: '中国与全球的产业趋势、模型进展与产品变化。', practice: '不分行业，把 AI 用好的方法与实践。', embedded: '嵌入式工具、工程方法与值得验证的新想法。' };
    document.getElementById('category-description').textContent = state.savedOnly ? '你在这个浏览器里留下的剪报。' : descriptions[state.category];
    document.getElementById('search').value = state.query;
    document.getElementById('search').placeholder = state.category === 'all' ? '搜索所有栏目' : '搜索' + C.categories[state.category];
    document.getElementById('result-count').textContent = (state.savedOnly ? '我的剪报 · ' : '') + visible.length + ' 篇';
    document.getElementById('feed-title').innerHTML = state.savedOnly ? '留住值得<br>再读的想法。' : '看见变化，<br>也找到用法。';
    document.getElementById('empty-state').hidden = visible.length > 0;
    document.getElementById('empty-message').textContent = state.savedOnly ? (state.saved.size ? '当前筛选下没有剪报，试试清除筛选。' : '点击文章右下角的“剪报”，把值得再读的内容留在这里。') : '换个关键词，或看看全部现场。';
    document.getElementById('endnote').hidden = visible.length === 0;
    observeMotion(); updateProgress();
  }
  function renderArticle(id) {
    const p = byId.get(id);
    if (!p) {
      articleView.innerHTML = '<div class="article-toolbar"><button data-back>← 返回信息流</button></div><div class="empty-state"><h1 id="article-title" tabindex="-1">没有找到这篇文章</h1><p>这个链接可能已过时。回到信息流，看看其他选读。</p></div>';
      document.title = '文章未找到 · AI 现场';
      return;
    }
    articleView.innerHTML = `<div class="article-toolbar"><button data-back><span aria-hidden="true">←</span> 返回信息流</button><span>${e(C.categories[C.categoryFor(p)])} <i aria-hidden="true">/</i> 约 ${Number(p.readMinutes) || 3} 分钟</span>${utilities(p)}</div><article class="article-paper" data-category="${e(C.categoryFor(p))}" aria-labelledby="article-title">${byline(p)}<h1 class="article-title" id="article-title" tabindex="-1">${e(p.title)}</h1><p class="article-dek">${e(p.dek)}</p>${visual(p)}<div class="post-detail">${detail(p)}</div>${tags(p)}</article>`;
    document.title = p.title + ' · AI 现场';
    observeMotion();
  }
  function snapshot(scroll = window.scrollY) {
    return { category: state.category, region: state.region, query: state.query, savedOnly: state.savedOnly, scroll };
  }
  function restoreSnapshot(saved) {
    if (!saved) return;
    state.category = saved.category === 'all' || C.categories[saved.category] ? saved.category : 'all';
    state.region = ['all', 'china', 'global'].includes(saved.region) ? saved.region : 'all';
    state.query = typeof saved.query === 'string' ? saved.query : '';
    state.savedOnly = !!saved.savedOnly;
  }
  function replaceEntry(value, url) { try { history.replaceState(value, '', url); } catch (_) {} }
  function persistPosition() {
    if (currentId) replaceEntry({ ...history.state, view: 'article', id: currentId, scroll: window.scrollY, feed: feedSnapshot });
    else { feedSnapshot = snapshot(); replaceEntry({ view: 'feed', feed: feedSnapshot }); }
  }
  function changeView(id, scroll = 0, focus = true) {
    currentId = id;
    feedView.hidden = !!id; articleView.hidden = !id;
    document.body.classList.toggle('article-open', !!id);
    document.querySelector('.skip-link').href = id ? '#article-title' : '#feed';
    clearTimeout(entryTimer); articleView.classList.remove('is-entering');
    if (id) { feed.innerHTML = ''; renderArticle(id); articleView.classList.add('is-entering'); entryTimer = setTimeout(() => articleView.classList.remove('is-entering'), 220); } else { articleView.innerHTML = ''; document.title = baseTitle; renderFeed(); }
    requestAnimationFrame(() => {
      if (focus) {
        const target = id ? document.getElementById('article-title') : document.getElementById('main-content');
        if (target) target.focus({ preventScroll: true });
      }
      window.scrollTo({ top: Math.max(0, Number(scroll) || 0), behavior: 'instant' });
      updateProgress();
    });
  }
  function openPost(id) {
    clearTimeout(positionTimer);
    if (!byId.has(id) || currentId === id) return;
    persistPosition();
    history.pushState({ view: 'article', id, scroll: 0, feed: feedSnapshot, fromFeed: !currentId }, '', C.postHash(id));
    changeView(id);
  }
  function goFeed() {
    if (!currentId) { window.scrollTo({ top: 0, behavior: motionQuery.matches ? 'instant' : 'smooth' }); return; }
    if (history.state && history.state.fromFeed) { clearTimeout(positionTimer); persistPosition(); history.back(); return; }
    restoreSnapshot(feedSnapshot);
    replaceEntry({ view: 'feed', feed: feedSnapshot || snapshot(0) }, '#feed');
    changeView(null, feedSnapshot ? feedSnapshot.scroll : 0);
  }
  function showRoute() {
    clearTimeout(positionTimer);
    const id = C.idFromHash(location.hash);
    // Local article anchors (including the skip link) must not dismiss the article.
    if (!id && currentId && !['', '#feed', '#top', '#main-content'].includes(location.hash)) return;
    const entry = history.state;
    if (entry && entry.feed) feedSnapshot = entry.feed;
    if (!id) restoreSnapshot(feedSnapshot);
    changeView(id, id ? (entry && entry.view === 'article' ? entry.scroll : 0) : (feedSnapshot ? feedSnapshot.scroll : 0));
  }
  function resetState() { state.category = 'all'; state.region = 'all'; state.query = ''; state.savedOnly = false; }
  function filterChanged() {
    if (currentId) { currentId = null; replaceEntry({ view: 'feed' }, '#feed'); changeView(null, 0, false); }
    else renderFeed();
    persistPosition();
  }
  function toast(message) {
    const el = document.getElementById('toast'); el.textContent = message; el.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 3200);
  }
  function saveBookmarks() { try { localStorage.setItem(storageKey, JSON.stringify([...state.saved])); storageWorks = true; } catch (_) { storageWorks = false; } }
  async function copyLink(id) {
    const url = new URL(location.href); url.hash = C.postHash(id);
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(url.href); toast('文章链接已复制');
    } catch (_) {
      const dialog = document.getElementById('link-dialog'), input = document.getElementById('link-input'); input.value = url.href;
      if (typeof dialog.showModal === 'function') { dialog.showModal(); input.focus(); input.select(); }
      else { input.hidden = false; toast('请复制文章标题的链接，或使用支持对话框的浏览器。'); }
    }
  }
  async function copyPrompt(id) {
    const p = byId.get(id); if (!p || !p.tryThis) return;
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(p.tryThis.prompt); toast('任务包已复制');
    } catch (_) {
      const field = document.getElementById('prompt-' + id); if (field) { field.focus(); field.select(); toast('已选中任务包，请使用系统复制操作。'); }
    }
  }
  function updateProgress() {
    if (progressFrame) return; progressFrame = true;
    requestAnimationFrame(() => {
      const range = document.documentElement.scrollHeight - window.innerHeight;
      document.getElementById('reading-progress').style.width = (range > 0 ? Math.min(100, Math.max(0, window.scrollY / range * 100)) : 0) + '%';
      progressFrame = false;
    });
  }
  document.addEventListener('click', event => {
    const skip = event.target.closest('.skip-link');
    if (skip) { event.preventDefault(); const target = currentId ? document.getElementById('article-title') : feed; if (target) { target.focus({ preventScroll: true }); target.scrollIntoView({ behavior: 'instant', block: 'start' }); } return; }
    const link = event.target.closest('a[data-read], a[data-home]');
    if (link) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
      event.preventDefault(); if (link.dataset.read) openPost(link.dataset.read); else goFeed(); return;
    }
    const button = event.target.closest('button');
    if (button) {
      if (button.hasAttribute('data-back')) goFeed();
      else if (button.dataset.category) { state.category = button.dataset.category; state.savedOnly = false; filterChanged(); }
      else if (button.dataset.region) { state.region = button.dataset.region; filterChanged(); }
      else if (button.dataset.save) {
        const id = button.dataset.save, saving = !state.saved.has(id); if (saving) state.saved.add(id); else state.saved.delete(id);
        saveBookmarks(); if (currentId) renderArticle(currentId); else renderFeed();
        document.getElementById('bookmark-count').textContent = state.saved.size;
        const replacement = document.querySelector(`${currentId ? '#article-view' : '#feed'} [data-save="${CSS.escape(id)}"]`);
        if (replacement) replacement.focus({ preventScroll: true }); else feed.focus({ preventScroll: true });
        toast(storageWorks ? (saving ? '已放入我的剪报，仅保存在当前浏览器' : '已从我的剪报移除') : '浏览器不允许本地保存；剪报仅保留到本次页面关闭。');
      } else if (button.dataset.copy) copyLink(button.dataset.copy);
      else if (button.dataset.copyPrompt) copyPrompt(button.dataset.copyPrompt);
      else if (button.dataset.tag) { resetState(); state.query = button.dataset.tag; filterChanged(); document.getElementById('search').focus(); document.querySelector('.feed-tools').scrollIntoView({ behavior: 'instant' }); }
      else if (button.id === 'shelf-button' || button.id === 'mobile-shelf') { const showSaved = !state.savedOnly; resetState(); state.savedOnly = showSaved; if (showSaved) state.category = 'all'; filterChanged(); }
      else if (button.id === 'reset-filters' || button.id === 'show-all') { resetState(); filterChanged(); document.getElementById('search').focus(); }
      else if (button.id === 'try-practice') { resetState(); state.category = 'practice'; filterChanged(); document.getElementById('main-content').scrollIntoView({ behavior: motionQuery.matches ? 'instant' : 'smooth' }); }
      return;
    }
    if (event.target.closest('a,input,textarea,select,summary,details,label,.fv-visual')) return;
    if (window.getSelection && String(window.getSelection()).trim()) return;
    const post = event.target.closest('[data-post]'); if (post && !currentId) openPost(post.dataset.post);
  });
  document.getElementById('search').addEventListener('input', event => { state.query = event.target.value; filterChanged(); });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !currentId && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !document.activeElement.isContentEditable && !document.getElementById('link-dialog').open) { event.preventDefault(); document.getElementById('search').focus(); }
    if (event.key === 'Escape' && document.activeElement.id === 'search') { state.query = ''; filterChanged(); }
  });
  window.addEventListener('popstate', showRoute);
  window.addEventListener('hashchange', () => { if (C.idFromHash(location.hash) !== currentId || !currentId) showRoute(); });
  window.addEventListener('scroll', () => { updateProgress(); clearTimeout(positionTimer); positionTimer = setTimeout(persistPosition, 140); }, { passive: true });
  window.addEventListener('pagehide', persistPosition);
  window.addEventListener('resize', updateProgress);
  window.addEventListener('storage', event => {
    if (event.key === storageKey) { state.saved = C.parseSaved(event.newValue, new Set(byId.keys())); if (currentId) renderArticle(currentId); else renderFeed(); }
  });
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', applyMotion);
  else if (motionQuery.addListener) motionQuery.addListener(applyMotion);
  try { history.scrollRestoration = 'manual'; } catch (_) {}
  document.getElementById('edition-date').textContent = '最近核验 ' + (data.site.verifiedAt || '2026-10-16').replace(/-/g, '.');
  if (history.state && history.state.feed) { feedSnapshot = history.state.feed; restoreSnapshot(feedSnapshot); }
  else feedSnapshot = snapshot(0);
  const initialId = C.idFromHash(location.hash);
  if (!history.state || !history.state.view) replaceEntry({ view: initialId ? 'article' : 'feed', id: initialId, feed: feedSnapshot, scroll: 0 });
  applyMotion(); changeView(initialId, initialId ? (history.state.scroll || 0) : feedSnapshot.scroll, false);
})();
