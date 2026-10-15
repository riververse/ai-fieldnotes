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
  const byId = new Map(posts.map(p => [p.id,p]));
  const storageKey = 'ai-fieldnotes-bookmarks-v1';
  let rawSaved = null;
  try { rawSaved = localStorage.getItem(storageKey); } catch (_) {}
  const state = {category:'all',region:'all',query:'',savedOnly:false,saved:C.parseSaved(rawSaved,new Set(byId.keys()))};
  const expanded = new Set();
  const demos = new Map();
  let toastTimer;
  let storageWorks = true;
  const icons = {
    bookmark:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    link:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 15 6-6m-7 9-1 1a4.2 4.2 0 0 1-6-6l4-4a4.2 4.2 0 0 1 6 0m2 6a4.2 4.2 0 0 0 6 0l4-4a4.2 4.2 0 0 0-6-6l-1 1" transform="translate(1 1) scale(.9)"/></svg>',
    down:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>'
  };
  const avatar = {industry:'观',product:'新',practice:'用',embedded:'试'};
  const svg = (label,body) => `<svg viewBox="0 0 440 170" role="img" aria-label="${e(label)}">${body}</svg>`;
  const text = (x,y,label,extra='') => `<text x="${x}" y="${y}" text-anchor="middle" ${extra}>${e(label)}</text>`;
  const box = (x,y,w,h,label,active=false) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${active?'#f0dfd4':'#f8f7ee'}" stroke="${active?'#b32d23':'#9da28c'}"/>${text(x+w/2,y+h/2+4,label,'font-size="12"')}`;
  const arrow = (x1,y1,x2,y2,color='#9da28c') => `<path d="M${x1} ${y1}H${x2-5}" fill="none" stroke="${color}"/><path d="m${x2-9} ${y2-4} 5 4-5 4" fill="none" stroke="${color}"/>`;
  const demoLabel = p => p.visual === 'docs' ? '切换风格稿' : p.visual === 'vision' ? (p.id.includes('images') ? '细化编辑要求' : '切换输入方式') : p.visual === 'model' ? '换个判断视角' : p.visual === 'chip' ? (p.category==='embedded'?'走一步流程':'检查迁移关口') : p.visual === 'mcp' ? '查看检查重点' : p.visual === 'workflow' ? '整理证据包' : '切换权限边界';

  function visual(p) {
    const n = demos.get(p.id)||0;
    const mode = n%2;
    let body='', title='', status='';
    if(p.visual === 'model') {
      title = '模型选型，不止看单价'; status= mode ? '当前视角：把复核与重试算进来' : '当前视角：先定义任务验收';
      body = svg('模型选型的三个判断维度：任务质量、推理成本、人工复核，没有展示性能跑分', `<path d="M40 128H400" stroke="#b8b9a9"/>${[70,220,370].map((x,i)=>`<path d="M${x} 50v65m-32 0h64m-32-65-37 30h74Z" fill="none" stroke="${mode && i===2?'#b32d23':'#6f7867'}"/><circle cx="${x}" cy="47" r="3" fill="#b32d23"/>${text(x,33,['任务质量','推理成本','人工复核'][i],'font-size="13"')}${text(x,151,['能否验收','含工具与重试','时间与责任'][i],'class="diagram-label"')}`).join('')}<rect x="173" y="63" width="94" height="45" fill="#f9f7ef" stroke="#909881"/>${text(220,82,'真实任务集','font-size="10"')}${text(220,98,'固定验收标准','class="diagram-label"')}`);
    } else if(p.visual === 'docs') {
      title='先有内容，再有稳定风格';status=mode?'风格稿：层级、语气与事实分开校验':'原始稿：事实相同，表达待整理';
      body=`<div class="doc-demo"><div class="doc-spec">同一组事实<br>固定术语<br>统一层级<br>保留引用</div><div class="doc-page ${mode?'refined':''}"><small>FIELD NOTE / 01</small><h4>${mode?'串口异常：先核对时序':'今天的调试记录'}</h4><p>${mode?'现象：接收数据间歇丢失。\n下一步：比对中断与缓冲区日志。':'串口有时会丢数据，需要再看一下中断和缓冲区的日志。'}</p></div></div>`;
    } else if(p.visual === 'vision' && p.id.includes('images')) {
      title='把“改好看一点”变成编辑简报';status=mode?'明确保留项与变更项':'先描述目标，再约束修改范围';
      body=`<div class="vision-stage"><div class="vision-art">${svg('原创山景线稿，用于解释局部图像编辑要求；不是模型输出',`<rect x="42" y="4" width="275" height="159" fill="${mode?'#e7d3b5':'#e4e5d4'}" stroke="#8f967e"/><circle cx="${mode?243:115}" cy="43" r="20" fill="${mode?'#b32d23':'#b4b99a'}"/><path d="m43 145 75-90 54 55 53-38 91 77v14H43Z" fill="#79836c"/><path d="m43 149 117-40 88 43 69-25v36H43Z" fill="#a8ad91"/><rect x="213" y="86" width="57" height="52" fill="none" stroke="#b32d23" stroke-dasharray="4 3"/><path d="M277 111h36" stroke="#b32d23"/>`)}</div><div class="vision-prompt"><small>${mode?'可执行的修改要求':'模糊的初始要求'}</small><p>${mode?'保留构图与山体轮廓。仅将天空调整为暖色黄昏，并让光照方向一致。':'“这张图再温暖一点，其他地方尽量别变。”'}</p></div></div>`;
    } else if(p.visual === 'vision') {
      title='多模态：输入更多，证据也要更清楚';status=mode?'音视频输入仍需检查时间与来源':'文本、声音与画面，进入同一任务';
      body=svg('文字、声音、画面输入多模态模型，再输出带来源的回答示意',`${box(8,7,88,38,'文本',!mode)}${box(8,67,88,38,'声音',!!mode)}${box(8,127,88,38,'画面',!!mode)}<path d="M96 26h41v60h35M96 86h76M96 146h41V86" fill="none" stroke="#8f967e"/><rect x="173" y="48" width="106" height="76" fill="#20211e"/>${text(226,81,'多模态任务','font-size="14" fill="#f5f2e9" style="fill:#f5f2e9"')}${text(226,105,'上下文 + 时序','font-size="9" style="fill:#c6c9b9"')}${arrow(279,86,319,86)}${box(320,60,112,52,'可追溯的回答',true)}`);
    } else if(p.visual === 'chip' && p.category==='embedded') {
      const step=n%4;title='嵌入式回归副驾驶 · 方案示意';status=['读取资料与历史日志','先生成测试草案','受控环境执行与回传','人工验收后再推进'][step];
      body=svg('嵌入式闭环方案：资料、测试草案、受控执行、人工验收。当前环节：'+status,`${[13,125,237,349].map((x,i)=>`${box(x,49,79,60,['资料输入','测试草案','受控执行','人工验收'][i],step===i)}${text(x+39,35,['01','02','03','04'][i],'class="diagram-label"')}${i<3?arrow(x+79,79,x+108,79):''}`).join('')}<path d="M388 114v29H52v-29" stroke="#969e87" fill="none" stroke-dasharray="4 4"/>${text(220,162,'失败证据回流；烧录与设备控制保留授权','class="diagram-label"')}<circle class="flow-dot" cx="${52+step*112}" cy="123" r="3" fill="#b32d23"/>`);
    } else if(p.visual === 'chip') {
      title='升级接口，也要升级验收';status=mode?'关口：固定任务集通过后，再迁移':'先对照接口、参数和输出差异';
      body=svg('模型迁移检查示意：现有接口、新版接口和回归验收',`${box(14,28,147,46,'现有调用方式')}${box(14,104,147,46,'新版 API 约定',!!mode)}<path d="M161 51h47v76h35M161 127h82" fill="none" stroke="#9da28c"/>${box(245,65,181,64,mode?'回归测试 → 人工验收':'差异清单 → 测试草案',!!mode)}${text(88,95,'参数 / 上下文 / 输出','class="diagram-label"')}${text(335,150,'不要只替换模型名','class="diagram-label"')}`);
    } else if(p.visual === 'mcp') {
      title='Skill 是可检查的操作手册';status=mode?'重点检查：脚本权限与评测结果':'先看说明，再看参考资料和脚本';
      body=svg('Skill 目录示意：说明文档、参考资料、可选脚本，使用前检查权限与结果',`<path d="M152 29v-9h61l12 9h65v124H152Z" fill="#f9f7ef" stroke="#89937a"/>${text(220,50,'一个 Skill 目录','font-size="12"')}<path d="M168 62h106" stroke="#c7c8b8"/>${text(218,81,'SKILL.md','font-size="11"')}${text(218,105,'references/','font-size="11"')}${text(218,129,'scripts/','font-size="11"')}<path d="M20 88h121M302 88h116" stroke="${mode?'#b32d23':'#89937a'}"/>${text(73,76,mode?'权限最小化':'任务与适用条件','class="diagram-label"')}${text(364,76,mode?'结果需验收':'载入必要材料','class="diagram-label"')}<circle class="signal" cx="${mode?367:72}" cy="108" r="5" fill="#b32d23"/>`);
    } else if(p.visual === 'workflow') {
      title='上下文不是越多越好';status=mode?'证据包：目标、事实、约束、验收':'零散输入先整理，再拆任务';
      body=svg('将零散文件整理成目标、事实、约束和验收四部分证据包',`${[21,31,41].map((x,i)=>`<rect x="${x}" y="${35+i*13}" width="93" height="80" fill="#f7f6ed" stroke="#9ca38d"/>`).join('')}${text(88,93,'零散资料','font-size="12"')}${arrow(150,87,209,87)}${[0,1,2,3].map((v)=>box(223+(v%2)*103,27+Math.floor(v/2)*66,90,51,['目标','事实','约束','验收'][v],!!mode)).join('')}`);
    } else {
      title=p.visual==='browser'?'浏览器代理的权限边界':'先让 Agent 学会只读';status=mode?'修改与提交：在执行前确认':'读取与分析：保留可追溯证据';
      body=`<div class="permission-demo"><div class="permission-window"><div class="window-bar"><i></i><i></i><i></i><span>${p.visual==='browser'?'Browser context':'Tool context'}</span></div><div class="window-lines"><i></i><i></i><i></i></div></div><div class="permission-card ${mode?'confirm':''}"><span>${mode?'写操作 / 外部副作用':'读取 / 检索 / 归纳'}</span><strong>${mode?'先确认，再执行':'最小权限开始'}</strong></div></div>`;
    }
    return `<div class="visual ${n?'changed':''}" id="visual-${e(p.id)}"><div class="visual-topline"><strong>${e(title)}</strong><span>现场图解</span></div><div class="visual-body">${body}</div><div class="visual-bottom"><span class="demo-status" aria-live="polite">${e(status)}</span><button class="demo-control" data-demo="${e(p.id)}">${e(demoLabel(p))}<span aria-hidden="true">↻</span></button></div></div><p class="visual-caption">原创示意 · 点击可切换说明，不执行真实任务${p.visual==='vision'?'，非模型输出样张':''}</p>`;
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
    ${p.caveat?`<aside class="caveat"><strong>${p.kind==='experiment'?'方案边界':'需要保留的判断'}</strong><p>${e(p.caveat)}</p></aside>`:''}
    <section class="source-list"><h3>回到原始资料</h3><ol>${(p.sources||[]).map(s=>{const url=C.safeURL(s.url);if(!url)return '';return `<li><a href="${e(url)}" target="_blank" rel="noopener noreferrer"><span>${e(s.title||s.label)}</span><span aria-label="在新标签页打开">↗</span></a><small>${e(new URL(url).hostname)}</small></li>`;}).join('')}</ol><div class="source-facts"><span>${p.date?e((p.dateLabel||'资料日期')+'：'+p.date):e(p.dateLabel||'持续更新资料')}</span><span>核验：${e(p.verifiedAt||data.site.verifiedAt)}</span></div>${p.license?`<p>许可证：${e(p.license)}</p>`:''}${p.maturity?`<p>成熟度：${e(p.maturity)}</p>`:''}${p.maintenance?`<p>维护观察：${e(p.maintenance)}</p>`:''}</section><button class="collapse-bottom" data-read="${e(p.id)}">收起文章 ↑</button>`;
  }

  function card(p) {
    const open=expanded.has(p.id), saved=state.saved.has(p.id);
    return `<article class="post" id="post-${e(p.id)}" data-category="${e(p.category)}" aria-labelledby="title-${e(p.id)}"><div class="post-header"><span class="post-avatar" aria-hidden="true">${avatar[p.category]||'记'}</span><div class="post-byline"><strong>AI 现场 <span aria-hidden="true">/</span> ${e(C.categories[p.category]||'现场笔记')}</strong><small>${e(p.region==='china'?'中国视野':'全球视野')} · ${p.date?e(p.date.replace(/-/g,'.')):e(p.dateLabel||'持续更新资料')}</small></div><span class="post-label">${e(p.kind==='experiment'?'原创实验方案':p.label||'选读')}</span></div><h2 class="post-title" id="title-${e(p.id)}"><button data-read="${e(p.id)}" aria-expanded="${open}" aria-controls="detail-${e(p.id)}">${e(p.title)}</button></h2><p class="post-dek">${e(p.dek)}</p>${visual(p)}<div class="post-tags" aria-label="话题标签">${(p.tags||[]).map(t=>`<button data-tag="${e(t)}" aria-label="搜索话题：${e(t)}">${e(t)}</button>`).join('')}</div><div class="post-actions"><button class="read-button" data-read="${e(p.id)}" aria-expanded="${open}" aria-controls="detail-${e(p.id)}"><span>${open?'收起全文':'展开阅读'}</span>${icons.down}<small>约 ${Number(p.readMinutes)||3} 分钟</small></button><div class="utility-actions"><button class="icon-button" data-copy="${e(p.id)}" aria-label="复制文章链接：${e(p.title)}">${icons.link}<span>链接</span></button><button class="icon-button ${saved?'saved':''}" data-save="${e(p.id)}" aria-pressed="${saved}" aria-label="${saved?'取消收藏':'收藏'}：${e(p.title)}">${icons.bookmark}<span>${saved?'已剪报':'剪报'}</span></button></div></div><div class="post-detail" id="detail-${e(p.id)}" ${open?'':'hidden'}>${detail(p)}</div></article>`;
  }

  function render() {
    const visible=C.filterPosts(posts,state);
    feed.innerHTML=visible.map(card).join('');
    document.querySelectorAll('[data-category]').forEach(el=>{
      if(el.tagName!=='BUTTON')return;
      const active=el.dataset.category===state.category;
      el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));
    });
    document.querySelectorAll('[data-region]').forEach(el=>{const active=el.dataset.region===state.region;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-count]').forEach(el=>{el.textContent=String(el.dataset.count==='all'?posts.length:posts.filter(p=>p.category===el.dataset.count).length).padStart(2,'0');});
    ['shelf-button','mobile-shelf'].forEach(id=>{const el=document.getElementById(id);el.classList.toggle('active',state.savedOnly);el.setAttribute('aria-pressed',String(state.savedOnly));});
    document.getElementById('bookmark-count').textContent=state.saved.size;
    document.getElementById('result-count').textContent=(state.savedOnly?'我的剪报 · ':'')+visible.length+' 篇';
    document.getElementById('feed-title').textContent=state.savedOnly?'留住值得再读的想法。':'看见变化，也找到用法。';
    document.getElementById('empty-state').hidden=visible.length>0;
    document.getElementById('empty-message').textContent=state.savedOnly?(state.saved.size?'当前筛选下没有剪报，试试清除筛选。':'点击文章右下角的“剪报”，把值得再读的内容留在这里。'):'换个关键词，或看看全部现场。';
    document.getElementById('endnote').hidden=visible.length===0;
    updateProgress();
  }
  function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3200);}
  function saveBookmarks(){try{localStorage.setItem(storageKey,JSON.stringify([...state.saved]));storageWorks=true;}catch(_){storageWorks=false;}}
  function setHash(id){try{history.replaceState(null,'',C.postHash(id));}catch(_){location.hash=C.postHash(id);}}
  function toggleRead(id,force){
    if(!byId.has(id))return;
    const open=typeof force==='boolean'?force:!expanded.has(id);
    if(open)expanded.add(id);else expanded.delete(id);
    const panel=document.getElementById('detail-'+id);
    if(!panel)return;
    const collapseButtonHadFocus=panel.contains(document.activeElement);
    panel.hidden=!open;
    document.querySelectorAll('[data-read]').forEach(btn=>{if(btn.dataset.read!==id)return;btn.setAttribute('aria-expanded',String(open));if(btn.classList.contains('read-button'))btn.querySelector('span').textContent=open?'收起全文':'展开阅读';});
    if(open)setHash(id);
    if(!open && collapseButtonHadFocus){const button=document.querySelector('#post-'+CSS.escape(id)+' .read-button');button.focus({preventScroll:true});button.scrollIntoView({block:'center',behavior:reducedMotion()?'instant':'smooth'});}
    updateProgress();
  }
  function reducedMotion(){return window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
  function showHash(){const id=C.idFromHash(location.hash);if(!id||!byId.has(id))return;state.category='all';state.region='all';state.query='';state.savedOnly=false;document.getElementById('search').value='';expanded.add(id);render();requestAnimationFrame(()=>document.getElementById('post-'+id).scrollIntoView({block:'start',behavior:'instant'}));}
  function clearFilters(){state.category='all';state.region='all';state.query='';state.savedOnly=false;document.getElementById('search').value='';render();}
  async function copyLink(id){
    const url=new URL(location.href);url.hash=C.postHash(id);setHash(id);
    try{if(!navigator.clipboard||!window.isSecureContext)throw new Error('clipboard unavailable');await navigator.clipboard.writeText(url.href);toast('文章链接已复制');}
    catch(_){const dialog=document.getElementById('link-dialog');const input=document.getElementById('link-input');input.value=url.href;if(typeof dialog.showModal==='function'){dialog.showModal();input.focus();input.select();}else{toast('当前浏览器不支持复制，请复制地址栏中的文章链接。');}}
  }
  async function copyPrompt(id){
    const p=byId.get(id);if(!p||!p.tryThis)return;
    try{if(!navigator.clipboard||!window.isSecureContext)throw new Error('clipboard unavailable');await navigator.clipboard.writeText(p.tryThis.prompt);toast('任务包已复制');}
    catch(_){const field=document.getElementById('prompt-'+id);field.focus();field.select();toast('已选中任务包，请使用系统复制操作。');}
  }
  let progressFrame=false;
  function updateProgress(){if(progressFrame)return;progressFrame=true;requestAnimationFrame(()=>{const range=document.documentElement.scrollHeight-window.innerHeight;document.getElementById('reading-progress').style.width=(range>0?Math.min(100,Math.max(0,window.scrollY/range*100)):0)+'%';progressFrame=false;});}
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.category){state.category=button.dataset.category;state.savedOnly=false;render();if(button.closest('.right-rail')||button.id==='try-practice')document.getElementById('main-content').scrollIntoView({behavior:reducedMotion()?'instant':'smooth'});}
    else if(button.dataset.region){state.region=button.dataset.region;render();}
    else if(button.dataset.read){toggleRead(button.dataset.read);}
    else if(button.dataset.save){const id=button.dataset.save;const saving=!state.saved.has(id);if(saving)state.saved.add(id);else state.saved.delete(id);saveBookmarks();render();const replacement=document.querySelector(`[data-save="${CSS.escape(id)}"]`);if(replacement)replacement.focus({preventScroll:true});else feed.focus({preventScroll:true});toast(storageWorks?(saving?'已放入我的剪报，仅保存在当前浏览器':'已从我的剪报移除'):'浏览器不允许本地保存；剪报仅保留到本次页面关闭。');}
    else if(button.dataset.copy){copyLink(button.dataset.copy);}
    else if(button.dataset.copyPrompt){copyPrompt(button.dataset.copyPrompt);}
    else if(button.dataset.tag){state.query=button.dataset.tag;state.category='all';state.region='all';state.savedOnly=false;document.getElementById('search').value=state.query;render();document.getElementById('search').focus();document.querySelector('.feed-tools').scrollIntoView({behavior:reducedMotion()?'instant':'smooth'});}
    else if(button.dataset.demo){const id=button.dataset.demo;demos.set(id,(demos.get(id)||0)+1);const wrapper=button.closest('.visual');const temp=document.createElement('div');temp.innerHTML=visual(byId.get(id));wrapper.replaceWith(temp.firstElementChild);document.querySelector(`[data-demo="${CSS.escape(id)}"]`).focus({preventScroll:true});}
    else if(button.id==='shelf-button'||button.id==='mobile-shelf'){state.savedOnly=!state.savedOnly;state.category='all';state.region='all';state.query='';document.getElementById('search').value='';render();}
    else if(button.id==='reset-filters'){clearFilters();document.getElementById('search').focus();}
    else if(button.id==='try-practice'){clearFilters();state.category='practice';render();document.getElementById('main-content').scrollIntoView({behavior:reducedMotion()?'instant':'smooth'});}
  });
  document.getElementById('search').addEventListener('input',event=>{state.query=event.target.value;render();});
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!document.activeElement.isContentEditable&&!document.getElementById('link-dialog').open){event.preventDefault();document.getElementById('search').focus();}if(event.key==='Escape'&&document.activeElement.id==='search'){document.getElementById('search').value='';state.query='';render();}});
  window.addEventListener('hashchange',showHash);
  window.addEventListener('scroll',updateProgress,{passive:true});
  window.addEventListener('resize',updateProgress);
  window.addEventListener('storage',event=>{if(event.key!==storageKey)return;state.saved=C.parseSaved(event.newValue,new Set(byId.keys()));render();});
  document.getElementById('edition-date').textContent='资料核验 '+(data.site.verifiedAt||'2026-10-15').replace(/-/g,'.');
  render();showHash();
})();
