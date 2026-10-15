/* Shared pure helpers: also exercised by test-site.cjs. */
(function (root) {
  'use strict';
  const escapeHTML = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const categories = {all:'全部现场',industry:'产业观察',product:'产品与图像',practice:'把 AI 用好',embedded:'脑洞实验'};
  const safeURL = value => { try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; } };
  const searchable = p => [p.title,p.dek,p.label,p.category,p.region,...(p.tags||[]),...(p.summary||[]),...(p.analysis||[]).flatMap(x => typeof x === 'string' ? [x] : [x.heading,x.text]),...(p.steps||[]).map(x=>typeof x === 'string' ? x : [x.title,x.text].join(' '))].join(' ').toLocaleLowerCase();
  const filterPosts = (posts, state) => {
    const terms = (state.query||'').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return posts.filter(p => (state.category === 'all' || p.category === state.category) && (state.region === 'all' || p.region === state.region) && (!state.savedOnly || state.saved.has(p.id)) && terms.every(term => searchable(p).includes(term)));
  };
  const dateText = p => p.dateLabel || (p.date ? String(p.date).replace(/-/g,'.') : '持续更新资料');
  const postHash = id => '#post=' + encodeURIComponent(id);
  const idFromHash = hash => { if (!String(hash).startsWith('#post=')) return null; try{return decodeURIComponent(hash.slice(6));}catch{return null;} };
  const parseSaved = (raw, ids) => { try { const value=JSON.parse(raw||'[]'); return new Set(Array.isArray(value) ? value.filter(id=>typeof id==='string'&&ids.has(id)) : []); } catch { return new Set(); } };
  const core = {escapeHTML,categories,safeURL,searchable,filterPosts,dateText,postHash,idFromHash,parseSaved};
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (root) root.SiteCore = core;
})(typeof window !== 'undefined' ? window : null);
