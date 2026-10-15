/* Dependency-free structural, content, filter, persistence, and app smoke tests. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('./site-core.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname,'content.json'),'utf8'));
const index = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const css = fs.readFileSync(path.join(__dirname,'style.css'),'utf8');
const app = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
let checks = 0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
const base=()=>({category:'all',region:'all',query:'',savedOnly:false,saved:new Set()});
check('Content: unique safe IDs, dates, articles, and HTTPS primary sources',()=>{
  assert.equal(new Set(data.posts.map(p=>p.id)).size,data.posts.length);
  assert(data.posts.length>=8);
  for(const p of data.posts){
    assert(/^[a-z0-9-]+$/.test(p.id));assert(C.categories[p.category]);assert(['china','global'].includes(p.region));
    assert(p.title&&p.dek&&p.summary.length&&p.analysis.length&&p.caveat);assert(p.sources.length>0);
    assert.equal(p.verifiedAt,'2026-10-15');
    if(p.date)assert(/^\d{4}-\d{2}-\d{2}$/.test(p.date));
    for(const s of p.sources)assert(C.safeURL(s.url).startsWith('https://'));
  }
});
check('Bundle is exactly synchronized with content.json',()=>{const box={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'content-data.js'),'utf8'),box);assert.equal(JSON.stringify(box.window.AI_FIELDNOTES),JSON.stringify(data));});
check('All local scripts, styles, icons, and data references resolve under a subpath',()=>{for(const match of index.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g))assert(fs.existsSync(path.join(__dirname,match[1])));assert(!/(?:src|href)="\/(?!\/)/.test(index));});
check('All, category, region, and combined filters',()=>{assert.equal(C.filterPosts(data.posts,base()).length,data.posts.length);for(const cat of Object.keys(C.categories).filter(x=>x!=='all'))assert(C.filterPosts(data.posts,{...base(),category:cat}).every(p=>p.category===cat));const china=C.filterPosts(data.posts,{...base(),category:'industry',region:'china'});assert(china.length>=1);assert(china.every(p=>p.category==='industry'&&p.region==='china'));});
check('Case-insensitive and multiple-keyword search includes body text',()=>{assert(C.filterPosts(data.posts,{...base(),query:'  mCp  '}).length>=1);const p=data.posts.find(p=>p.tags.length>1);const q=p.tags.slice(0,2).join(' ');assert(C.filterPosts(data.posts,{...base(),query:q}).some(x=>x.id===p.id));assert.equal(C.filterPosts(data.posts,{...base(),query:'not-a-real-topic-789'}).length,0);});
check('Bookmark-only mode and storage corruption recovery',()=>{const id=data.posts[0].id;assert.deepEqual(C.filterPosts(data.posts,{...base(),savedOnly:true,saved:new Set([id])}).map(p=>p.id),[id]);assert.equal(C.parseSaved('broken',new Set([id])).size,0);assert.equal(C.parseSaved('{}',new Set([id])).size,0);assert.deepEqual([...C.parseSaved(JSON.stringify([id,'missing',2]),new Set([id]))],[id]);});
check('Permalink round-trip and invalid-hash safety',()=>{for(const p of data.posts)assert.equal(C.idFromHash(C.postHash(p.id)),p.id);assert.equal(C.idFromHash('#post=%ZZ'),null);assert.equal(C.idFromHash('#top'),null);});
check('HTML escaping and URL protocol guard',()=>{assert.equal(C.escapeHTML('<script>"&'), '&lt;script&gt;&quot;&amp;');assert.equal(C.safeURL('javascript:alert(1)'),'');assert.equal(C.safeURL('data:text/html,foo'),'');});
check('Responsive, print, reduced-motion, focus, and semantic hooks exist',()=>{for(const value of ['max-width:650px','max-width:360px','prefers-reduced-motion:reduce','@media print',':focus-visible'])assert(css.includes(value));for(const value of ['lang="zh-CN"','class="skip-link"','type="search"','aria-live="polite"','<main','<dialog'])assert(index.includes(value));});
check('App boot and input/click event rendering without a browser',()=>{
  class Stub {constructor(id){this.id=id;this.innerHTML='';this.textContent='';this.value='';this.hidden=false;this.dataset={};this.style={};this.classList={toggle(){},add(){},remove(){}};this.listeners={};this.tagName='DIV';}setAttribute(){}addEventListener(t,f){this.listeners[t]=f;}focus(){}scrollIntoView(){}contains(){return false;}closest(){return null;}}
  const els=new Map([...index.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Stub(m[1])]));
  const listeners={};const doc={getElementById:id=>els.get(id)||null,querySelectorAll:()=>[],querySelector:()=>null,addEventListener:(t,f)=>listeners[t]=f,activeElement:{tagName:'BODY'},documentElement:{scrollHeight:1000}};
  const context={window:{SiteCore:C,AI_FIELDNOTES:data,innerHeight:800,scrollY:0,addEventListener(){},matchMedia:()=>({matches:true})},document:doc,location:{href:'https://example.test/ai-fieldnotes/',hash:''},history:{replaceState(){}},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:fn=>fn(),setTimeout:()=>0,clearTimeout(){},navigator:{},CSS:{escape:x=>x},URL,console};
  vm.runInNewContext(app,context);
  assert.equal((els.get('feed').innerHTML.match(/<article /g)||[]).length,data.posts.length);
  assert.equal(els.get('result-count').textContent,data.posts.length+' 篇');
  assert(els.get('feed').innerHTML.includes('回到原始资料'));
  assert(els.get('feed').innerHTML.includes('data-demo='));
  assert.equal((els.get('feed').innerHTML.match(/data-copy-prompt=/g)||[]).length,data.posts.filter(p=>p.tryThis).length);
  els.get('search').listeners.input({target:{value:'not-a-real-topic-789'}});
  assert.equal(els.get('feed').innerHTML,'');assert.equal(els.get('empty-state').hidden,false);
  els.get('search').listeners.input({target:{value:''}});
  const button={dataset:{category:'practice'},closest:()=>null};listeners.click({target:{closest:()=>button}});
  assert.equal((els.get('feed').innerHTML.match(/<article /g)||[]).length,data.posts.filter(p=>p.category==='practice').length);
  const region={dataset:{region:'china'},closest:()=>null};listeners.click({target:{closest:()=>region}});
  assert.equal((els.get('feed').innerHTML.match(/<article /g)||[]).length,data.posts.filter(p=>p.category==='practice'&&p.region==='china').length);
});
console.log(`\n${checks} suites passed. Browser layout and real clipboard behavior require browser QA.`);
