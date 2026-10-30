/* Original editorial illustrations. No model output, live tooling or measured results. */
(function () {
  'use strict';
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const art = body => `<svg class="fv-art" viewBox="0 0 640 160" aria-hidden="true" focusable="false">${body}</svg>`;
  const line = (d, cls = '') => `<path class="fv-line ${cls}" d="${d}"/>`;
  const sheet = (x,y,w=64,h=82,cls='') => `<g class="${cls}"><rect class="fv-paper" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>${line(`M${x+13} ${y+20}h${w-26}M${x+13} ${y+32}h${w-26}M${x+13} ${y+44}h${w-35}`)}<rect class="fv-soft-fill" x="${x+13}" y="${y+h-24}" width="${w-26}" height="10" rx="2"/></g>`;
  const check = (x,y,cls='') => `<g class="${cls}"><circle class="fv-check-ring" cx="${x}" cy="${y}" r="11"/>${line(`m${x-5} ${y} 3.5 3.5 7-8`,'fv-check-mark')}</g>`;
  const arrow = (x,y,w=36) => line(`M${x} ${y}h${w}m-5-4 5 4-5 4`,'fv-arrow');
  const labels = values => `<div class="fv-labels" style="--fv-label-count:${values.length}">${values.map(t=>`<span>${escape(t)}</span>`).join('')}</div>`;

  const scenes = {
    'sol-quality-cost': n => ({
      kind:'balance', title:'让质量与总成本，慢慢找到平衡',
      status:n%2?'费用之外，也计入重试和人工复核。':'先固定任务集，再比较验收结果。',
      labels:['真实任务质量','固定验收标准','费用 + 复核时间'],
      body:art(`<ellipse class="fv-ground" cx="320" cy="143" rx="215" ry="8"/>${line('M320 52v78M289 133h62','fv-heavy')}<path class="fv-sage-fill" d="m320 47-9 17h18Z"/><g class="fv-animated fv-balance-beam">${line('M157 58h326','fv-heavy')}<circle class="fv-ochre-fill" cx="320" cy="58" r="6"/>${line('M174 59v52m-32 0h64M466 59v52m-32 0h64')}<path class="fv-bowl" d="M135 110q39 38 78 0ZM427 110q39 38 78 0Z"/><g class="fv-animated fv-quality-token"><path class="fv-sage-fill" d="m174 79 16 13-16 13-16-13Z"/></g><g class="fv-animated fv-cost-token"><ellipse class="fv-coin" cx="466" cy="101" rx="18" ry="5"/><path class="fv-coin" d="M448 94v7q18 10 36 0v-7Z"/><ellipse class="fv-coin" cx="466" cy="94" rx="18" ry="5"/></g></g><g>${sheet(276,74,88,55)}${check(342,105)}</g>`)
    }),
    'deepseek-v41-migration': n => ({
      kind:'migration', title:'名字没变，请求可能已换一条路',
      status:n%2?'把可解析、内容正确与允许执行分别验收。':'别名路由变化，也应触发一次回归。',
      labels:['现有模型别名','路由检查','新模型 · 回归验收'],
      body:art(`${line('M131 43h90q21 0 21 22v15h181M131 119h90q21 0 21-22V80M503 80h70','fv-route')}<rect class="fv-paper" x="47" y="23" width="84" height="40" rx="8"/><rect class="fv-paper" x="47" y="99" width="84" height="40" rx="8"/>${line('M64 39h50M64 48h33M64 115h50M64 124h33')}<g class="fv-animated fv-packet-a"><rect class="fv-ochre-fill" x="156" y="36" width="18" height="14" rx="3"/>${line('m161 43 3 3 5-6','fv-light-line')}</g><g class="fv-animated fv-packet-b"><rect class="fv-sage-fill" x="167" y="112" width="18" height="14" rx="3"/></g><g class="fv-animated fv-packet-c"><rect class="fv-ochre-fill" x="340" y="73" width="20" height="14" rx="3"/></g>${line('M303 43v77M295 120h16','fv-heavy')}<g class="fv-animated fv-gate">${line('M303 78h45','fv-gate-arm')}</g><rect class="fv-ink-fill" x="423" y="41" width="80" height="78" rx="9"/><rect class="fv-chip-core" x="439" y="57" width="48" height="46" rx="5"/>${line('M435 29v12m16-12v12m16-12v12m16-12v12M435 119v12m16-12v12m16-12v12m16-12v12','fv-pins')}<path class="fv-chip-spark" d="m465 62-15 22h13l-4 16 18-25h-13Z"/>${check(573,80)}${line('M549 111h47','fv-soft-line')}`)
    }),
    'qwen-omni-evidence': n => ({
      kind:'multimodal', title:'让每一条摘要，都能回到现场',
      status:n%2?'回看对应时间点；看不清的读数标为不确定。':'画面、声音与摘要，需要共用一条时间线。',
      labels:['画面与声音','定位时间点','可回看的摘要'],
      body:art(`<rect class="fv-window-fill" x="37" y="17" width="353" height="122" rx="8"/>${[57,130,203,276].map((x,i)=>`<g><rect class="fv-frame" x="${x}" y="32" width="58" height="42" rx="3"/><path class="fv-mountain-${i%2}" d="m${x+2} 72 17-22 15 13 12-18 10 27Z"/><circle class="fv-ochre-fill" cx="${x+44}" cy="42" r="5"/></g>`).join('')}<g class="fv-waveform">${Array.from({length:29},(_,i)=>`<rect class="fv-animated fv-wave" x="${59+i*10}" y="${104-[8,14,21,12,25,18,9][i%7]/2}" width="4" height="${[8,14,21,12,25,18,9][i%7]}" rx="2" style="animation-delay:-${i*.19}s"/>`).join('')}</g>${line('M58 123h292','fv-soft-line')}<g class="fv-animated fv-playhead">${line('M152 24v105','fv-ochre-line')}<path class="fv-ochre-fill" d="m147 22 5 7 5-7Z"/><rect class="fv-selection" x="127" y="29" width="64" height="49" rx="4"/></g>${line('M390 60h35q14 0 14 13v14h22M390 105h34q15 0 15-13v-5','fv-dotted')}<rect class="fv-paper" x="461" y="24" width="134" height="111" rx="5"/><circle class="fv-sage-fill" cx="481" cy="46" r="4"/>${line('M493 46h80M480 64h92M480 75h72')}<rect class="fv-highlight" x="475" y="90" width="106" height="25" rx="3"/>${line('M486 103h29m10 0h40','fv-ochre-line')}`)
    }),
    'images25-edit-brief': n => ({
      kind:'landscape', title:'只改变天空，留住这片山的轮廓',
      status:n%2?'修改单：天空转暖；保留构图、山体与光向。':'局部编辑，从说清楚“保留什么”开始。',
      labels:['天空的色温可以变','山体与构图保持不变'],
      body:art(`<defs><linearGradient id="fv-sky-${n%2}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${n%2?'#dba77c':'#e7c6a3'}"/><stop offset="1" stop-color="#f0dfbb"/></linearGradient><clipPath id="fv-land-clip-${n%2}"><rect x="34" y="8" width="572" height="135" rx="6"/></clipPath></defs><g clip-path="url(#fv-land-clip-${n%2})"><rect x="34" y="8" width="572" height="135" fill="url(#fv-sky-${n%2})"/><g class="fv-animated fv-sunset-orb"><circle cx="409" cy="54" r="37" fill="#f4d6a4" opacity=".45"/><circle cx="409" cy="54" r="27" fill="#c97943"/></g><path fill="#c4b59a" d="m34 118 86-58 80 45 85-60 79 66 95-36 78 31 69-24v65H34Z"/><path fill="#8d987b" d="m34 144 113-58 88 35 70-26 109 39 101-59 91 35v35H34Z"/><path fill="#5f7462" d="m34 145 123-22 110 24 97-28 122 21 120-26v40H34Z"/><path fill="#e2d3ae" d="M393 129c-30 3-61 8-56 14s38 8 17 16h38c22-10-23-15-11-20 4-2 15-4 22-6Z"/><g class="fv-animated fv-birds">${line('M156 43q7-7 14 0 7-7 14 0M192 33q5-5 10 0 5-5 10 0M214 49q6-5 12 0 6-5 12 0','fv-bird-line')}</g><rect class="fv-animated fv-edit-frame" x="365" y="18" width="88" height="73" rx="3"/>${line('M369 18h14m-18 4v14M435 18h14m4 4v14M365 73v14m4 4h14M453 73v14m-4 4h-14','fv-light-line')}</g><rect class="fv-land-border" x="34" y="8" width="572" height="135" rx="6"/>`)
    }),
    'context-task-eval': n => ({
      kind:'evidence', title:'把一摞资料，整理成可以验收的任务',
      status:n%2?'任务包写清目标、证据、约束与验收标准。':'材料按需进入；错误样本回到验收集。',
      labels:['挑选相关资料','组成任务包','核验后交付'],
      body:art(`<ellipse class="fv-ground" cx="319" cy="140" rx="260" ry="7"/>${sheet(61,34,65,80)}${sheet(78,27,65,80)}${sheet(96,20,65,80,'fv-animated fv-source-card')}${arrow(185,74,44)}<path class="fv-folder-back" d="M252 47V27h61l12 13h73v86H252Z"/><g class="fv-animated fv-evidence-card">${sheet(268,17,110,88)}</g><path class="fv-folder-front" d="m244 63 13 68h141l12-68Z"/>${line('M274 90h104M274 103h71','fv-light-line')}${arrow(427,74,34)}${sheet(484,24,95,108)}${check(558,111,'fv-animated fv-evidence-check')}${line('M526 143v7H126v-16','fv-return-line')}<path class="fv-sage-fill" d="m122 138 4-6 4 6Z"/>`)
    }),
    'espressif-mcp-workflow': n => ({
      kind:'terminal', title:'让资料、构建日志与故障线索接起来',
      status:n%2?'编译属于本地验证；烧录仍需单独授权。':'先核对文档出处，再读完整构建日志。',
      labels:['文档与构建日志','汇总故障线索','烧录前确认'],
      body:art(`<rect class="fv-terminal-shell" x="34" y="15" width="296" height="127" rx="7"/><path class="fv-terminal-bar" d="M41 15h282q7 0 7 7v16H34V22q0-7 7-7Z"/><circle cx="50" cy="27" r="3" fill="#cda27a"/><circle cx="61" cy="27" r="3" fill="#929b80"/><circle cx="72" cy="27" r="3" fill="#ccc8ae"/><g class="fv-animated fv-log-scroll">${Array.from({length:5},(_,i)=>`${line(`m49 ${54+i*17} 4 3-4 3`,'fv-terminal-prompt')}<rect class="fv-animated fv-compile-line" x="65" y="${54+i*17}" width="${[196,151,220,172,111][i]}" height="5" rx="2" style="animation-delay:-${i*1.2}s"/>`).join('')}</g><rect class="fv-animated fv-caret" x="184" y="122" width="7" height="9"/>${arrow(342,78,31)}${sheet(391,30,81,99)}<circle class="fv-ochre-fill" cx="409" cy="102" r="4"/>${line('M420 102h34')}${line('M491 79h54','fv-dotted')}<g><rect class="fv-sage-fill" x="548" y="55" width="57" height="57" rx="6"/><rect class="fv-chip-core" x="561" y="69" width="29" height="27" rx="2"/>${line('M553 45v10m13-10v10m13-10v10m13-10v10M553 112v10m13-10v10m13-10v10m13-10v10','fv-pins')}</g><g class="fv-animated fv-approval-tag"><circle class="fv-lock-ring" cx="520" cy="79" r="16"/>${line('M514 77v-4a6 6 0 0 1 12 0v4')}<rect class="fv-lock" x="511" y="76" width="18" height="13" rx="2"/></g>`)
    }),
    'playwright-mcp-boundary': n => ({
      kind:'browser', title:'浏览器走过的每一步，都留下证据',
      status:n%2?'提交或修改前停下，确认目标与权限。':'在允许访问的页面，保留节点与测试证据。',
      labels:['可访问的页面','观察与定位','证据记录'],
      body:art(`<rect class="fv-boundary" x="29" y="7" width="581" height="143" rx="14"/><rect class="fv-browser-shell" x="50" y="21" width="266" height="115" rx="6"/><path class="fv-window-bar" d="M56 21h254q6 0 6 6v16H50V27q0-6 6-6Z"/><circle class="fv-sage-fill" cx="64" cy="32" r="3"/><circle class="fv-soft-fill" cx="75" cy="32" r="3"/><rect class="fv-paper" x="103" y="27" width="181" height="10" rx="3"/><rect class="fv-soft-fill" x="65" y="57" width="59" height="62" rx="3"/>${line('M139 59h112M139 70h150M139 80h121')}<rect class="fv-browser-button" x="139" y="94" width="74" height="22" rx="4"/><g class="fv-animated fv-browser-cursor"><path class="fv-cursor" d="m180 92 0 27 8-7 7 12 5-3-7-12 11-3Z"/></g>${line('M329 79h30m0-31v62m0-62h35m-35 31h35m-35 31h35','fv-tree')}<circle class="fv-sage-fill" cx="359" cy="79" r="4"/>${[48,79,110].map(y=>`<rect class="fv-paper" x="393" y="${y-8}" width="39" height="16" rx="3"/>`).join('')}<g class="fv-animated fv-browser-evidence">${sheet(468,30,107,98)}${check(553,107)}</g>${line('M431 79h28','fv-dotted')}`)
    }),
    'skills-license-eval': n => ({
      kind:'skill', title:'一份操作手册，也要经过四道检查',
      status:n%2?'脚本可以执行；说明文字不能代替权限控制。':'许可证、依赖、权限与验收，缺一项都先停。',
      labels:['说明 / 资料 / 脚本','许可 · 依赖 · 权限','小型任务验收'],
      body:art(`<path class="fv-folder-back" d="M47 47V25h51l15 14h88v90H47Z"/>${sheet(64,34,70,82,'fv-animated fv-skill-page-one')}${sheet(87,25,70,82,'fv-animated fv-skill-page-two')}${sheet(110,17,70,82,'fv-animated fv-skill-page-three')}<path class="fv-folder-front" d="m39 66 13 68h140l14-68Z"/>${line('M67 91h92M67 104h63','fv-light-line')}${arrow(224,80,37)}${line('M292 80h186','fv-route')}${[293,354,415].map((x,i)=>`<g><circle class="fv-check-disc" cx="${x}" cy="80" r="22"/>${line(`m${x-9} 80 6 6 12-13`,'fv-animated fv-skill-check fv-check-step-'+i)}</g>`).join('')}${sheet(500,30,89,101)}${check(569,111)}<g class="fv-animated fv-skill-token"><circle class="fv-ochre-fill" cx="278" cy="80" r="5"/></g>`)
    }),
    'embedded-regression-copilot': n => ({
      kind:'embedded', title:'让失败证据回流，让硬件操作有边界',
      status:['读取变更与历史日志，整理测试矩阵。','模拟器先验证；真实硬件写入需要授权。','收集输出与日志，形成可复查的故障卡。','人工验收后，再决定下一步。'][n%4],
      labels:['固件与测试矩阵','模拟器 / 授权测试板','故障证据回流'],
      body:art(`${sheet(45,41,76,87)}${line('M121 82h53m0 0V38h72m-72 44v40h72M323 38h49v44h65M323 122h49V82M526 82h48v67H82v-17','fv-circuit')}<g class="fv-animated fv-signal-upper"><circle class="fv-ochre-fill" cx="163" cy="82" r="5"/></g><g class="fv-animated fv-signal-return"><circle class="fv-sage-fill" cx="562" cy="149" r="5"/></g><rect class="fv-paper" x="246" y="15" width="77" height="46" rx="5"/>${line('M260 28h49M260 39h29')}<path class="fv-sage-fill" d="m301 34 8 6-8 6Z"/><rect class="fv-sage-fill" x="246" y="97" width="77" height="47" rx="5"/><rect class="fv-chip-core" x="267" y="107" width="35" height="26" rx="2"/>${line('M255 90v7m14-7v7m14-7v7m14-7v7m14-7v7','fv-pins')}<circle class="fv-lock-ring" cx="216" cy="122" r="13"/>${line('M211 120v-4a5 5 0 0 1 10 0v4')}<rect class="fv-lock" x="208" y="120" width="16" height="11" rx="2"/>${sheet(437,34,89,94)}<g class="fv-animated fv-fault-record"><circle class="fv-ochre-fill" cx="457" cy="105" r="5"/>${line('M469 105h37','fv-ochre-line')}</g>${check(575,82)}`)
    }),
    'renode-replay-lab': n => ({
      kind:'replay', title:'把同一段输入，带回出错的那一刻',
      status:n%2?'保存快照、输入与配置，再检查能否重现。':'回放只覆盖已建模的外设与行为。',
      labels:['事件记录 · 回放','虚拟 MCU','失败快照 · 复查'],
      body:art(`<ellipse class="fv-ground" cx="325" cy="143" rx="275" ry="8"/>
        <rect class="fv-replay-case" x="32" y="29" width="164" height="99" rx="9"/>
        <circle class="fv-paper" cx="72" cy="67" r="24"/><circle class="fv-paper" cx="156" cy="67" r="24"/>
        <g class="fv-animated fv-replay-reel-one">${line('M72 46v42M51 67h42M57 52l30 30M57 82l30-30','fv-reel-spoke')}</g>
        <g class="fv-animated fv-replay-reel-two">${line('M156 46v42M135 67h42M141 52l30 30M141 82l30-30','fv-reel-spoke')}</g>
        <circle class="fv-sage-fill" cx="72" cy="67" r="7"/><circle class="fv-sage-fill" cx="156" cy="67" r="7"/>
        <path class="fv-replay-tape" d="M74 90h80v21H74Z"/>${line('M45 112h140','fv-soft-line')}
        <g class="fv-animated fv-replay-ticks">${[0,1,2,3,4].map(i=>`<rect class="fv-sage-fill" x="${83+i*13}" y="97" width="5" height="7" rx="1"/>`).join('')}</g>
        ${line('M196 100h35v-18h29','fv-circuit-route')}
        <path class="fv-device-depth" d="M255 44h132v88H255Z"/><rect class="fv-device-board" x="248" y="36" width="132" height="88" rx="8"/>
        ${line('M265 53h17v15M265 109h17V94M346 53h17v15M346 94v15h17','fv-board-traces')}
        <rect class="fv-ink-fill" x="282" y="58" width="64" height="47" rx="4"/><text class="fv-chip-label" x="314" y="78" text-anchor="middle">MCU</text>
        <g class="fv-animated fv-replay-registers">${[0,1,2].map(i=>`<rect class="fv-register-bar" x="${291+i*16}" y="87" width="10" height="6" rx="1"/>`).join('')}</g>
        <circle class="fv-replay-event" cx="361" cy="84" r="5"/>
        ${line('M259 138h108','fv-replay-time')}
        <g class="fv-animated fv-replay-head"><path class="fv-ochre-fill" d="m259 130 5 6-5 6-5-6Z"/></g>
        <rect class="fv-snapshot-back" x="464" y="34" width="118" height="102" rx="4"/><rect class="fv-snapshot-middle" x="472" y="26" width="118" height="102" rx="4"/>
        <g class="fv-animated fv-replay-copy"><rect class="fv-paper" x="294" y="61" width="43" height="36" rx="3"/>${line('M300 73h27M300 81h17','fv-sage-line')}<circle class="fv-ochre-fill" cx="326" cy="89" r="3"/></g>
        <g class="fv-animated fv-replay-snapshot"><rect class="fv-paper" x="480" y="18" width="118" height="102" rx="4"/>
        <text class="fv-note-label" x="492" y="38">失败快照</text>${line('M492 49h94','fv-soft-line')}
        <path class="fv-failure-trace" d="M492 76h15V64h16v20h16V60h15v32h15V76h16"/>
        <circle class="fv-failure-dot" cx="554" cy="60" r="5"/>${line('M492 105h45M550 105h34','fv-soft-line')}</g>`)
    }),
    'firmware-fuzz-harness': n => ({
      kind:'fuzz', title:'让输入变异，变成可以追查的测试路径',
      status:n%2?'保留触发样本；覆盖率不能代替正确性判断。':'AI 辅助写 harness，运行边界仍由人定义。',
      labels:['输入字节 · 变异','AI 辅助测试 harness','覆盖路径 · 失败样本'],
      body:art(`<ellipse class="fv-ground" cx="321" cy="141" rx="272" ry="7"/>
        <path class="fv-byte-tray" d="M38 113h144l10 17H28Z"/>
        ${[[48,39,'00'],[107,39,'FF'],[48,81,'7F'],[107,81,'A5']].map(([x,y,t],i)=>`<g class="fv-animated fv-fuzz-byte fv-fuzz-byte-${i}"><rect class="fv-byte-shadow" x="${x+4}" y="${y+5}" width="43" height="29" rx="4"/><rect class="fv-byte-tile" x="${x}" y="${y}" width="43" height="29" rx="4"/><text class="fv-byte-text" x="${x+21.5}" y="${y+19}" text-anchor="middle">${t}</text></g>`).join('')}
        ${line('M187 78h46','fv-soft-line')}
        <path class="fv-device-depth" d="M249 43h139v82H249Z"/><rect class="fv-harness-shell" x="242" y="35" width="139" height="82" rx="8"/>
        <text class="fv-note-label" x="311" y="53" text-anchor="middle">HARNESS</text>
        <path class="fv-harness-bracket" d="M268 68h-9v29h9M354 68h9v29h-9"/>
        <g class="fv-animated fv-fuzz-die"><path class="fv-byte-tile" d="m286 65 18-5 22 8v27l-18 6-22-8Z"/>${line('m286 65 22 9 18-6M308 74v27','fv-die-seam')}<circle class="fv-ochre-fill" cx="297" cy="79" r="2"/><circle class="fv-ochre-fill" cx="298" cy="89" r="2"/><circle class="fv-sage-fill" cx="318" cy="81" r="2"/><circle class="fv-sage-fill" cx="318" cy="91" r="2"/></g>
        <g class="fv-animated fv-fuzz-insert"><rect class="fv-ochre-fill" x="187" y="71" width="26" height="16" rx="3"/>${line('M192 76h15M192 82h9','fv-light-line')}</g>
        ${line('M381 79h51M432 79v-38h64M432 79h64M432 79v38h64','fv-coverage-tree')}
        <g class="fv-animated fv-fuzz-covered-one">${line('M381 79h51V41h64','fv-covered-path')}</g>
        <g class="fv-animated fv-fuzz-covered-two">${line('M381 79h115','fv-covered-path')}</g>
        ${[41,79,117].map((y,i)=>`<rect class="fv-coverage-node ${i===2?'fv-coverage-open':''}" x="496" y="${y-10}" width="28" height="20" rx="4"/>`).join('')}
        ${check(510,41)}${check(510,79)}<text class="fv-note-label" x="510" y="121" text-anchor="middle">?</text>
        <g class="fv-animated fv-fuzz-corpus"><rect class="fv-snapshot-back" x="552" y="62" width="47" height="64" rx="3"/><rect class="fv-paper" x="558" y="55" width="47" height="64" rx="3"/><circle class="fv-failure-dot" cx="582" cy="77" r="6"/>${line('M569 94h25M569 102h17')}<text class="fv-note-label" x="580" y="42" text-anchor="middle">样本</text></g>`)
    }),
    'debug-probe-mcp': n => ({
      kind:'probe', title:'请求可以自动整理，调试权限要明确停下',
      status:n%2?'读取、复位和写入，需要分别声明权限。':'未经授权，执行停在闸门前。',
      labels:['代理整理请求','人工确认 · 默认停止','J-Link → Cortex-M'],
      body:art(`<ellipse class="fv-ground" cx="326" cy="140" rx="277" ry="7"/>
        <rect class="fv-agent-back" x="41" y="45" width="92" height="77" rx="13"/><rect class="fv-agent-face" x="47" y="36" width="92" height="77" rx="13"/>
        <circle class="fv-agent-eye" cx="76" cy="65" r="7"/><circle class="fv-agent-eye" cx="111" cy="65" r="7"/>${line('M77 88h33','fv-heavy')}
        <path class="fv-agent-antenna" d="M94 36V21"/><circle class="fv-ochre-fill" cx="94" cy="18" r="4"/>
        ${line('M143 83h54','fv-dotted')}
        <g class="fv-animated fv-probe-request"><rect class="fv-paper" x="151" y="67" width="35" height="30" rx="3"/>${line('M157 76h22M157 83h22M157 90h13','fv-sage-line')}</g>
        <rect class="fv-permission-shadow" x="227" y="26" width="111" height="110" rx="5"/>
        <rect class="fv-paper" x="222" y="20" width="111" height="110" rx="5"/>
        <text class="fv-note-label" x="277" y="40" text-anchor="middle">操作范围</text>
        <g class="fv-animated fv-probe-scope"><rect class="fv-scope-box" x="235" y="52" width="9" height="9" rx="1"/>${line('M252 57h63')}<rect class="fv-scope-box" x="235" y="70" width="9" height="9" rx="1"/>${line('M252 75h49')}<rect class="fv-scope-box" x="235" y="88" width="9" height="9" rx="1"/>${line('M252 93h58')}</g>
        <path class="fv-permission-bar" d="M205 49v69"/><circle class="fv-lock-ring" cx="205" cy="83" r="17"/>${line('M199 81v-6a6 6 0 0 1 12 0v6')}<rect class="fv-lock" x="196" y="80" width="18" height="14" rx="2"/>
        <text class="fv-pending-label" x="278" y="117" text-anchor="middle">待确认</text>
        ${line('M346 83h32','fv-dotted')}
        <path class="fv-probe-shadow" d="m383 61 70-7v56l-70 7Z"/><rect class="fv-probe-case" x="378" y="51" width="70" height="56" rx="7"/>
        <text class="fv-probe-label" x="413" y="77" text-anchor="middle">J-Link</text><rect class="fv-probe-port" x="395" y="89" width="36" height="7" rx="2"/>
        <path class="fv-probe-cable" d="M448 80h19q13 0 13 13v14q0 12 12 12h14"/>
        <path class="fv-device-depth" d="M507 47h104v86H507Z"/><rect class="fv-device-board" x="501" y="40" width="104" height="86" rx="6"/>
        ${line('M512 61h17M512 76h17M512 92h17M579 61h15M579 76h15M579 92h15','fv-board-traces')}
        <rect class="fv-ink-fill" x="528" y="57" width="51" height="51" rx="3"/><text class="fv-chip-label" x="554" y="80" text-anchor="middle">Cortex</text><text class="fv-chip-label" x="554" y="94" text-anchor="middle">-M</text>
        <g class="fv-animated fv-probe-boundary"><path class="fv-boundary-bracket" d="M193 32h-7v99h7"/></g>`)
    }),
    'datasheet-register-audit': n => ({
      kind:'registers', title:'从表格提取字段，也把出处一起带走',
      status:n%2?'地址、位域、复位值和访问属性逐项对照。':'PDF 与 SVD 的版本、出处和冲突都要保留。',
      labels:['PDF 寄存器表','字段 + 来源','SVD 交叉核验'],
      body:art(`<ellipse class="fv-ground" cx="318" cy="142" rx="272" ry="7"/>
        <path class="fv-snapshot-back" d="M42 23h126l18 18v95H42Z"/><path class="fv-paper" d="M48 17h126l18 18v95H48Z"/><path class="fv-paper-fold" d="M174 17v18h18"/>
        <text class="fv-note-label" x="62" y="39">PDF</text><rect class="fv-table-head" x="61" y="49" width="117" height="15" rx="1"/>
        ${line('M61 49v64h117V49M100 49v64M137 49v64M61 64h117M61 80h117M61 96h117M61 113h117','fv-register-grid')}
        ${[70,86,102].map(y=>line(`M69 ${y}h23M107 ${y}h22M145 ${y}h24`,'fv-register-datum')).join('')}
        <rect class="fv-animated fv-register-scan" x="62" y="65" width="115" height="14" rx="1"/>
        ${line('M193 72h52','fv-dotted')}
        <g class="fv-animated fv-register-extract"><rect class="fv-field-slice" x="63" y="65" width="113" height="14" rx="2"/>${line('M71 72h23M108 72h22M146 72h21','fv-sage-line')}</g>
        <path class="fv-snapshot-back" d="M258 36h130v89H258Z"/><rect class="fv-paper" x="252" y="28" width="130" height="89" rx="5"/>
        <text class="fv-note-label" x="265" y="47">字段与来源</text>
        ${[[65,'地址 / 位域'],[84,'复位 / 访问']].map(([y,t])=>`<rect class="fv-field-row" x="264" y="${y-11}" width="105" height="16" rx="2"/><text class="fv-field-text" x="272" y="${y}">${t}</text>`).join('')}
        <path class="fv-source-tag" d="m264 97 7-4h85v17h-85l-7-4Z"/><circle class="fv-source-hole" cx="272" cy="102" r="2"/><text class="fv-source-text" x="281" y="106">文档 · 版本 · 表格</text>
        ${line('M382 73h58','fv-dotted')}
        <rect class="fv-snapshot-back" x="447" y="28" width="149" height="105" rx="5"/><rect class="fv-paper" x="453" y="21" width="149" height="105" rx="5"/>
        <text class="fv-note-label" x="466" y="41">SVD</text><text class="fv-note-label" x="538" y="41">核验</text>
        ${[61,83,105].map((y,i)=>`<g><rect class="fv-svd-field" x="466" y="${y-8}" width="53" height="15" rx="2"/>${line(`M476 ${y}h32`,'fv-sage-line')}<rect class="${i===2?'fv-audit-conflict':'fv-audit-match'}" x="538" y="${y-8}" width="49" height="15" rx="2"/>${i===2?`<text class="fv-conflict-text" x="562" y="${y+4}" text-anchor="middle">复查</text>`:line(`m556 ${y} 4 3 8-7`,'fv-check-mark')}</g>`).join('')}
        <g class="fv-animated fv-register-compare"><path class="fv-compare-bracket" d="M461 51h-5v18h5M592 51h5v18h-5"/></g>`)
    }),
    'stm32-edge-ai-budget': n => ({
      kind:'edgeai', title:'权重可以打包，部署预算仍要逐项实测',
      status:n%2?'量化后的精度，需要用代表性数据重新评估。':'形状仅作概念示意，不代表内存或延迟收益。',
      labels:['浮点模型权重','INT8 打包示意','内存 · 延迟 · 精度'],
      body:art(`<ellipse class="fv-ground" cx="316" cy="141" rx="271" ry="7"/>
        <rect class="fv-model-card-back" x="45" y="27" width="149" height="102" rx="5"/><rect class="fv-model-card" x="38" y="19" width="149" height="102" rx="5"/>
        <text class="fv-note-label" x="53" y="38">FLOAT</text>
        ${Array.from({length:9},(_,i)=>`<rect class="fv-weight-ghost" x="${63+(i%3)*35}" y="${49+Math.floor(i/3)*22}" width="25" height="15" rx="3"/>`).join('')}
        <path class="fv-quantizer-rear" d="m219 46 20-10 33 14v60l-20 10-33-14Z"/><path class="fv-quantizer-front" d="m219 46 33 14v60l-33-14Z"/>
        <path class="fv-quantizer-slot" d="m227 66 17 7v24l-17-7Z"/>
        <path class="fv-device-depth" d="M300 51h106v81H300Z"/><rect class="fv-device-board" x="294" y="44" width="106" height="81" rx="6"/>
        ${line('M308 34v10m18-10v10m18-10v10m18-10v10m18-10v10M308 125v9m18-9v9m18-9v9m18-9v9m18-9v9','fv-pins')}
        <rect class="fv-chip-core" x="314" y="59" width="66" height="48" rx="3"/>
        ${Array.from({length:9},(_,i)=>`<rect class="fv-packed-weight" x="${325+(i%3)*15}" y="${68+Math.floor(i/3)*11}" width="11" height="7" rx="1"/>`).join('')}
        <text class="fv-note-label" x="347" y="30" text-anchor="middle">INT8</text>
        <g class="fv-animated fv-weights-pack">${Array.from({length:9},(_,i)=>`<rect class="fv-weight-cell ${i%3===0?'fv-weight-warm':''}" x="${63+(i%3)*35}" y="${49+Math.floor(i/3)*22}" width="25" height="15" rx="3"/>`).join('')}</g>
        <path class="fv-budget-divider" d="M428 29v103"/>
        ${[[37,'内存'],[78,'延迟'],[119,'精度']].map(([y,t],i)=>`<g><rect class="fv-budget-card" x="457" y="${y-18}" width="141" height="34" rx="5"/><text class="fv-budget-text" x="474" y="${y+4}">${t}</text><circle class="fv-budget-empty" cx="578" cy="${y-1}" r="7"/><path class="fv-budget-symbol" d="${['M525 30h20v13h-20Zm5-4v4m10-4v4m-10 13v4m10-4v4','M536 71v8l5 3M528 68h16M536 65v3','M526 119h5l4-7 5 13 5-8h5'][i]}"/></g>`).join('')}
        <g class="fv-animated fv-budget-focus"><path class="fv-budget-bracket" d="M450 23h-6v26h6M605 23h6v26h-6"/></g>`)
    }),
    'firmware-agent-contract': n => ({
      kind:'contract', title:'产物向前走，每一步都遵守同一份约定',
      status:['构建先输出产物与日志，不把成功等同验收。','检查变更和风险，再进入允许的测试范围。','限定命令、资源和时长，失败立即留下证据。','把证据交给人复核，再决定下一步。'][n%4],
      labels:['构建产物','静态检查','限时测试','人工复核'],
      body:art(`<ellipse class="fv-ground" cx="320" cy="141" rx="289" ry="7"/>
        <path class="fv-conveyor-base" d="M37 117h565v12H37Z"/>${line('M48 123h542','fv-conveyor-rail')}
        <rect class="fv-build-frame" x="43" y="29" width="93" height="83" rx="5"/>
        <g class="fv-animated fv-contract-press"><path class="fv-build-press" d="M63 37h53v14H97v16H82V51H63Z"/></g>
        <g class="fv-animated fv-contract-build-one"><rect class="fv-build-piece" x="64" y="78" width="23" height="10" rx="2"/></g><g class="fv-animated fv-contract-build-two"><rect class="fv-build-piece" x="95" y="78" width="23" height="10" rx="2"/></g>
        <path class="fv-inspection-arch" d="M198 112V46q0-15 15-15h56q15 0 15 15v66"/><path class="fv-inspection-shadow" d="M204 111V48q0-10 10-10h55"/>
        <g class="fv-animated fv-contract-scan"><path class="fv-inspection-beam" d="M208 54h66v16h-66Z"/>${line('M211 62h60','fv-ochre-line')}</g>
        <rect class="fv-test-shadow" x="344" y="33" width="100" height="84" rx="6"/><rect class="fv-test-chamber" x="338" y="26" width="100" height="84" rx="6"/>
        <path class="fv-test-limit" d="M350 39h14M350 39v15M426 39h-14M426 39v15M350 98h14M350 98V83M426 98h-14M426 98V83"/>
        <circle class="fv-timer-face" cx="388" cy="48" r="12"/><g class="fv-animated fv-contract-clock">${line('M388 48v-8','fv-timer-hand')}</g><circle class="fv-sage-fill" cx="388" cy="48" r="2"/>
        <rect class="fv-snapshot-back" x="513" y="32" width="82" height="88" rx="4"/>
        <g class="fv-animated fv-contract-report"><rect class="fv-paper" x="506" y="23" width="82" height="88" rx="4"/><text class="fv-note-label" x="518" y="42">复核记录</text>${line('M518 53h57M518 64h48M518 75h57','fv-soft-line')}<rect class="fv-review-pending" x="518" y="87" width="56" height="14" rx="3"/><text class="fv-pending-label" x="546" y="97" text-anchor="middle">待复核</text></g>
        <g class="fv-animated fv-contract-artifact"><path class="fv-artifact-shadow" d="m72 89 45-6 15 8-45 6Z"/><rect class="fv-firmware-cartridge" x="68" y="77" width="42" height="30" rx="4"/><path class="fv-artifact-label" d="M75 83h28v10H75Z"/>${line('M77 101h5m6 0h5m6 0h4','fv-artifact-pins')}</g>`)
    }),
    'document-style-pipeline': n => ({
      kind:'documents', title:'内容先站稳，风格才有一致的尺度',
      status:n%2?'层级、术语、引用与预览，分别检查。':'同一组事实，经过可检查的样式契约。',
      labels:['结构化内容','样式契约','预览与校验'],
      body:art(`${sheet(49,24,112,112)}${line('M63 47h24M63 65h69M63 85h44M63 110h78','fv-raw-lines')}${arrow(180,80,39)}<rect class="fv-style-frame" x="243" y="29" width="140" height="99" rx="6"/><g class="fv-style-rule"><rect class="fv-ink-fill" x="260" y="46" width="30" height="7" rx="1"/>${line('M304 49h61M260 70h105M260 91h105M260 111h105','fv-dotted')}<circle class="fv-ochre-fill" cx="286" cy="70" r="5"/><circle class="fv-sage-fill" cx="330" cy="91" r="5"/><circle class="fv-ochre-fill" cx="303" cy="111" r="5"/></g>${arrow(401,80,38)}<rect class="fv-paper" x="461" y="15" width="126" height="123" rx="3"/><rect class="fv-sage-fill" x="476" y="30" width="36" height="4"/><g class="fv-animated fv-doc-title"><rect class="fv-ink-fill" x="476" y="44" width="94" height="9" rx="1"/></g><g class="fv-animated fv-doc-align-one">${line('M476 67h94M476 78h94M476 89h70')}</g><g class="fv-animated fv-doc-align-two"><rect class="fv-soft-fill" x="476" y="101" width="94" height="21" rx="2"/>${line('M483 111h77','fv-sage-line')}</g>${line('M523 144v8H309v-15','fv-return-line')}<path class="fv-sage-fill" d="m305 141 4-6 4 6Z"/>`)
    })
  };


  /* Practical guide scene variants: shared abstract art, article-specific meaning. */
  /* Daily additions: original teaching diagrams, never measured model output. */
  scenes['minicpm-local-image-check'] = n => ({
    kind:'evidence', title:'让图片里的空白，在答案里仍然空着',
    status:n%2?'1.8GB 是所列模型包大小，不是运行内存。':'逐格核对原图；看不清和未填写要分别留下。',
    labels:['带空白格的教学图','本地 1B 读图','字段 · 未提供 · 复查'],
    body:art(`<ellipse class="fv-ground" cx="320" cy="143" rx="278" ry="7"/>
      <rect class="fv-paper" x="43" y="21" width="122" height="111" rx="5"/>
      <text class="fv-note-label" x="58" y="42">教学清单</text>
      <rect class="fv-table-head" x="55" y="53" width="98" height="17"/>
      ${line('M55 53v60h98V53M55 70h98M55 91h98M98 53v60','fv-register-grid')}
      <text class="fv-field-text" x="61" y="85">3</text><text class="fv-field-text" x="104" y="85">12.50</text>
      <text class="fv-field-text" x="61" y="106">8</text>
      ${arrow(184,77,46)}
      <rect class="fv-ink-fill" x="247" y="24" width="157" height="101" rx="7"/>
      <rect class="fv-paper" x="259" y="35" width="133" height="76" rx="3"/>
      <text class="fv-note-label" x="326" y="61" text-anchor="middle">本地读图</text>
      <text class="fv-note-label" x="326" y="86" text-anchor="middle">:1b</text>
      <path class="fv-sage-fill" d="m235 127 181 0-14 11H249Z"/>
      ${arrow(424,77,45)}
      <rect class="fv-paper" x="484" y="23" width="116" height="109" rx="4"/>
      <text class="fv-note-label" x="497" y="44">逐格复查</text>${line('M497 54h89','fv-soft-line')}
      <text class="fv-field-text" x="498" y="75">3 × 12.50</text>
      <rect class="fv-source-tag" x="497" y="87" width="89" height="24" rx="3"/>
      <text class="fv-field-text" x="541" y="103" text-anchor="middle">未提供</text>`)
  });
  scenes['sensor-unknown-state-gmm'] = n => ({
    kind:'evidence', title:'给不熟悉的输入，留一个未知出口',
    status:n%2?'越过模型边界不等于机械故障；先记录、待复核。':'先按采集批次分组，避免重叠窗口泄漏到测试。',
    labels:['波形与独立批次','特征空间 · 示意边界','继续分类 / 未知待查'],
    body:art(`<ellipse class="fv-ground" cx="320" cy="144" rx="280" ry="7"/>
      <rect class="fv-paper" x="38" y="24" width="126" height="106" rx="5"/>
      <text class="fv-note-label" x="52" y="45">独立批次</text>
      ${line('M50 70q8-25 16 0t16 0t16 0t16 0t16 0t16 0','fv-sage-line')}
      ${line('M50 101q5-16 10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0','fv-ochre-line')}
      ${arrow(181,77,48)}
      <rect class="fv-paper" x="245" y="16" width="163" height="120" rx="5"/>
      ${line('M260 30v90h134','fv-soft-line')}
      <ellipse class="fv-check-disc" cx="292" cy="89" rx="23" ry="24"/>
      <ellipse class="fv-check-disc" cx="351" cy="58" rx="25" ry="21"/>
      ${[[284,84],[294,97],[302,84],[343,52],[351,65],[361,56]].map(([x,y])=>`<circle class="fv-sage-fill" cx="${x}" cy="${y}" r="3"/>`).join('')}
      <circle class="fv-ochre-fill" cx="372" cy="108" r="5"/>
      <text class="fv-field-text" x="381" y="111">?</text>
      ${line('M412 77h35V43h35M447 77v35h35','fv-circuit')}
      <rect class="fv-paper" x="484" y="23" width="116" height="40" rx="4"/>
      <text class="fv-field-text" x="542" y="47" text-anchor="middle">继续分类</text>
      <rect class="fv-source-tag" x="484" y="92" width="116" height="40" rx="4"/>
      <text class="fv-field-text" x="542" y="116" text-anchor="middle">未知 · 待查</text>`)
  });

  const guideSceneVariants = {
  "dot-meeting-brief": {
    "source": "context-task-eval",
    "title": "把会前材料，收成三个待决问题",
    "labels": [
      "相关更新",
      "事实与提议分开",
      "一页会前简报"
    ],
    "status": [
      "更新较晚的建议，仍可能没有得到确认。",
      "人数、日期与负责人，都回到材料逐项核对。"
    ]
  },
  "dot-bounded-follow-up": {
    "source": "context-task-eval",
    "title": "先定检查规则，再决定何时提醒",
    "labels": [
      "指定来源",
      "时间与变化条件",
      "通知后结束"
    ],
    "status": [
      "有变化才通知，重复记录不再提醒。",
      "到期或无法读取时，说明结果与最后核查时间。"
    ]
  },
  "dot-change-request": {
    "source": "document-style-pipeline",
    "title": "让同一条变更，落到每一份新稿",
    "labels": [
      "原稿与现有版本",
      "新要求及保留项",
      "逐稿对照验收"
    ],
    "status": [
      "同时查新值是否出现、旧值是否残留。",
      "文字改完，不代表图片或其他附件也已更新。"
    ]
  },
  "research-conflicting-sources": {
    "source": "context-task-eval",
    "title": "每个结论，都留下采用与排除的理由",
    "labels": [
      "来源与适用范围",
      "逐项比较冲突",
      "结论及待核问题"
    ],
    "status": [
      "新页面可能谈的是另一地点或另一类对象。",
      "保留真正的冲突，不用猜测补齐未知。"
    ]
  },
  "writing-two-examples": {
    "source": "document-style-pipeline",
    "title": "借用表达方法，把事实留给新材料",
    "labels": [
      "两份同场景样例",
      "结构与语气共性",
      "新事实的新稿"
    ],
    "status": [
      "样例里的旧日期、旧人物，不随文风迁移。",
      "先查事实和承诺，再调整句子是否顺口。"
    ]
  },
  "orders-cleaning-audit": {
    "source": "document-style-pipeline",
    "title": "每一行有去向，小计才有解释",
    "labels": [
      "原始订单及行号",
      "重复与异常分流",
      "小计和行数对账"
    ],
    "status": [
      "空白表示未知，不能自动改成零。",
      "280元只是本例已确认小计，不是完整月销售额。"
    ]
  },
  "image-edit-invariants": {
    "source": "images25-edit-brief",
    "title": "背景可以改，主体仍要对照原图",
    "labels": [
      "天空代表可改背景",
      "山体代表保留主体"
    ],
    "status": [
      "图中以山体和天空示意分区，并非杯子编辑结果。",
      "对照原图检查轮廓、文字和位置，不能只看整体美观。"
    ]
  },
  "video-learning-evidence": {
    "source": "qwen-omni-evidence",
    "title": "让学习卡和自测题，都能回到原片",
    "labels": [
      "声音与画面材料",
      "换算原片时间",
      "学习卡与待查项"
    ],
    "status": [
      "片段时间加上起点偏移，才是原片位置。",
      "文字摘录只能支持材料整理，不能冒充看过视频。"
    ]
  },
  "codex-small-fix-loop": {
    "source": "skills-license-eval",
    "title": "把一个小故障，变成一次可复查的修复",
    "labels": [
      "代码与失败输入",
      "复现 · 修改 · 重测",
      "差异与运行证据"
    ],
    "status": [
      "先让测试抓住原问题，再做必要的修改。",
      "没有实际执行，就明确写未运行。"
    ]
  }
};
  for (const [id, spec] of Object.entries(guideSceneVariants)) {
    scenes[id] = n => ({ ...scenes[spec.source](n), title:spec.title, labels:spec.labels, status:spec.status[n % spec.status.length], control:'阅读图解说明' });
  }
  /* End practical guide scene variants. */

  /* October coverage: original conceptual artwork; no generated vendor samples. */
  const coverageText = (x, y, value, centered = false) => `<text class="fv-note-label" x="${x}" y="${y}"${centered ? ' text-anchor="middle"' : ''}>${escape(value)}</text>`;
  const coveragePanel = (x, y, w, h) => `<rect class="fv-paper" x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/>`;
  const coverageRoute = () => `${arrow(181,74,47)}${arrow(425,74,45)}`;
  const coverageWindmill = (x,y,scale=1) => `<g transform="translate(${x} ${y}) scale(${scale})">${line('M0 0v44','fv-heavy')}<path class="fv-sage-fill" d="M0 0-22-22 0-15ZM0 0 22 22 0 15Z"/><path class="fv-ochre-fill" d="M0 0 22-22 15 0ZM0 0-22 22-15 0Z"/><circle class="fv-paper" cx="0" cy="0" r="4"/></g>`;
  const coverageTravelCup = (x,y,scale=1) => `<g transform="translate(${x} ${y}) scale(${scale})"><rect x="-13" y="-14" width="26" height="47" rx="5" fill="#344b66"/><rect x="-15" y="-21" width="30" height="10" rx="3" fill="#f1eadb" stroke="#5b655f" stroke-width="1.4"/><circle cx="0" cy="2" r="3" fill="#d5ad54"/><circle cx="0" cy="13" r="3" fill="#d5ad54"/></g>`;
  const coverageArt = {
    preview: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,45,'公开预览',true)}${coverageText(102,71,'API',true)}${line('M54 91h94M54 109h71')}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'相同材料反复验收',true)}${[263,307,351].map((x,i)=>`${sheet(x,55,37,64)}${coverageText(x+18,73,String(i+1),true)}`).join('')}${coveragePanel(484,24,119,110)}${coverageText(543,45,'权重交付',true)}<rect class="fv-boundary" x="498" y="57" width="90" height="58" rx="3"/>${coverageText(543,80,'月底计划',true)}${coverageText(543,101,'尚未开放',true)}`),
    interface: () => art(`${coveragePanel(40,24,124,110)}${coverageText(54,45,'一个具体问题')}${line('M54 61h95M54 75h74M54 89h87')}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(259,40,'回答中的临时工具')}<rect class="fv-soft-fill" x="258" y="51" width="140" height="26" rx="3"/>${line('M268 64h44m14 0h58')}<rect class="fv-highlight" x="258" y="86" width="66" height="36" rx="3"/><rect class="fv-soft-fill" x="333" y="86" width="65" height="36" rx="3"/>${coverageText(291,108,'输入',true)}${coverageText(365,108,'结果',true)}${coveragePanel(484,24,119,110)}${coverageText(497,45,'回到原始事实')}${line('M497 61h91M497 75h70M497 89h84')}${check(574,113)}`),
    latency: () => art(`${coveragePanel(40,24,124,110)}${coverageText(54,45,'同一任务与模型')}${line('M54 64h96M54 80h78M54 96h87')}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'选择推理速度档',true)}${line('M260 66h134M260 105h134','fv-soft-line')}<rect class="fv-sage-fill" x="261" y="59" width="82" height="8" rx="3"/><rect class="fv-ochre-fill" x="261" y="98" width="119" height="8" rx="3"/>${coverageText(260,85,'速度档示意 · 非测量')}${coveragePanel(484,24,119,110)}${coverageText(497,45,'分开记录')}${coverageText(497,68,'等待 · 生成')}${coverageText(497,90,'重试 · 费用')}${line('M497 108h87')}`),
    voice: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,45,'说话与倾听',true)}${[0,1,2,3,4,5,6,7,8].map((i)=>`<rect class="fv-sage-fill" x="${55+i*11}" y="${82-[8,16,24,17,29,19,11,21,9][i]/2}" width="5" height="${[8,16,24,17,29,19,11,21,9][i]}" rx="2"/>`).join('')}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'语音服务分层',true)}<rect class="fv-highlight" x="260" y="54" width="136" height="25" rx="3"/><rect class="fv-soft-fill" x="260" y="91" width="136" height="25" rx="3"/>${coverageText(328,71,'GPT-Live-1.1',true)}${coverageText(328,108,'Quip',true)}${coveragePanel(484,24,119,110)}${coverageText(497,45,'可观察的体验')}${coverageText(497,67,'口音与断句')}${coverageText(497,89,'打断与等待')}${coverageText(497,111,'逐项复核')}`),
    continuity: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,45,'同一主体参考',true)}${coverageTravelCup(102,78,.9)}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'逐轮改变场景',true)}${[260,307,354].map((x,i)=>`<rect class="${i%2?'fv-highlight':'fv-soft-fill'}" x="${x}" y="52" width="39" height="69" rx="3"/>${coverageTravelCup(x+19,78,.8)}`).join('')}${coveragePanel(484,24,119,110)}${coverageText(497,45,'逐轮对照')}${coverageText(497,67,'形状 · 文字')}${coverageText(497,89,'位置 · 颜色')}${line('M497 107h87')}`),
    retrieval: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,45,'不同类型材料',true)}${coverageText(54,68,'文字   图像')}${line('M55 83h20m8-5 8 10 8-10 8 10 8-10 8 10','fv-sage-line')}${coverageText(54,113,'音频   视频')}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'统一向量空间',true)}${line('M262 113V54M262 113h132','fv-soft-line')}${[[278,92],[291,83],[309,95],[342,63],[352,80],[378,58],[366,99]].map(([x,y],i)=>`<circle class="fv-${i<3?'sage':'ochre'}-fill" cx="${x}" cy="${y}" r="4"/>`).join('')}<ellipse class="fv-selection" cx="293" cy="90" rx="28" ry="20"/>${coveragePanel(484,24,119,110)}${coverageText(497,45,'候选材料排序')}${[62,84,106].map((y,i)=>`${coverageText(497,y,String(i+1))}${line(`M512 ${y-3}h${72-i*12}`)}`).join('')}`),
    video: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,45,'镜头与参考材料',true)}${line('M54 61h96M54 75h73')}<rect class="fv-soft-fill" x="55" y="88" width="38" height="29" rx="3"/><rect class="fv-highlight" x="103" y="88" width="47" height="29" rx="3"/>${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'入口与模型分开选',true)}<rect class="fv-soft-fill" x="260" y="54" width="62" height="62" rx="4"/><rect class="fv-highlight" x="333" y="54" width="63" height="62" rx="4"/>${coverageText(291,79,'草稿',true)}${coverageText(291,101,'480p',true)}${coverageText(365,79,'成片',true)}${coverageText(365,101,'另计费',true)}${coveragePanel(484,24,119,110)}${coverageText(497,45,'导出前核对')}${coverageText(497,67,'时长与声音')}${coverageText(497,89,'画幅与授权')}${line('M497 108h85')}`),
    alpha: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,45,'描述与参考图',true)}${coverageWindmill(102,79,.85)}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'真正的透明通道',true)}${Array.from({length:5},(_,r)=>Array.from({length:8},(_,c)=>`<rect class="${(r+c)%2?'fv-soft-fill':'fv-paper'}" x="${263+c*16}" y="${51+r*15}" width="16" height="15"/>`).join('')).join('')}${coverageWindmill(328,79,.85)}${coveragePanel(484,24,119,110)}${coverageText(543,45,'三种底色合成',true)}${['fv-paper','fv-ink-fill','fv-ochre-fill'].map((cls,i)=>`<rect class="${cls}" x="${496+i*33}" y="56" width="31" height="64" rx="3"/>${coverageWindmill(511+i*33,79,.55)}`).join('')}`),
    telemetry: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,45,'ADC 与 I2C',true)}${line('M54 72h16v-14h18v29h18V66h20v18h20','fv-sage-line')}${coverageText(102,113,'读取速率',true)}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'定时发布 · 有限缓冲',true)}${line('M263 96h131','fv-soft-line')}${[274,306,338,370].map(x=>`${line(`M${x} 62v43`)}<circle class="fv-ochre-fill" cx="${x}" cy="96" r="4"/>`).join('')}${coverageText(328,122,'刻度为机制示意',true)}${coveragePanel(484,24,119,110)}${coverageText(543,45,'Data Streamer',true)}${line('M498 111V59M498 111h88','fv-soft-line')}${line('M500 99l15-13 17 7 16-25 17 9 18-11','fv-sage-line')}`),
    trace: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,45,'一个现场崩溃',true)}${[65,85,105].map((y,i)=>`<circle class="fv-${i===1?'ochre':'sage'}-fill" cx="60" cy="${y}" r="4"/>${line(`M73 ${y}h${[72,58,66][i]}`)}`).join('')}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'锁定同一条证据链',true)}${coverageText(261,65,'trace / 软件版本')}${coverageText(261,87,'硬件 / 构建标识')}${coverageText(261,109,'匹配的源码')}${coveragePanel(484,24,119,110)}${coverageText(497,45,'分开写结论')}${coverageText(497,68,'已见事实')}${coverageText(497,90,'候选原因')}${coverageText(497,112,'下一步验证')}`),
    assertion: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,45,'规格与 RTL',true)}${line('M54 63h94M54 78h77M54 93h86')}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'AI 起草 SVA',true)}<rect class="fv-highlight" x="260" y="54" width="136" height="25" rx="3"/>${coverageText(328,71,'假设 → 保证',true)}${coverageText(261,101,'证明通过后仍查')}${coverageText(261,119,'触发覆盖与空真')}${coveragePanel(484,24,119,110)}${coverageText(497,45,'对照注入错误')}${line('M500 67h37m7-5 8 10 8-10 8 10','fv-ochre-line')}${coverageText(497,94,'能否抓住坏设计')}${coverageText(497,114,'研究结果 ≠ 保证')}`),
    waveform: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,45,'目标引脚与地线',true)}<rect class="fv-sage-fill" x="69" y="61" width="57" height="42" rx="4"/>${line('M126 70h24M126 92h24','fv-pins')}${coverageText(102,122,'确认安全电平',true)}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'捕获原始电平',true)}${line('M260 103h16V63h29v40h28V63h29v40h31','fv-sage-line')}${coverageText(328,123,'目标方波示意',true)}${coveragePanel(484,24,119,110)}${coverageText(497,45,'确定性测量')}${coverageText(497,67,'频率与占空比')}${coverageText(497,89,'样本与置信度')}${coverageText(497,111,'不以日志代波形')}`),
    canframe: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,45,'DBC 信号合同',true)}${coverageText(54,68,'位宽与字节序')}${coverageText(54,91,'比例与偏移')}${line('M54 109h94')}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'独立手算黄金字节',true)}${Array.from({length:8},(_,i)=>`<rect class="${i%2?'fv-soft-fill':'fv-highlight'}" x="${259+i*17}" y="59" width="16" height="22"/>`).join('')}${coverageText(328,108,'Python / C 双路核对',true)}${coveragePanel(484,24,119,110)}${coverageText(497,45,'分开检查')}${coverageText(497,67,'有效值编解码')}${coverageText(497,89,'非法值处理')}${coverageText(497,111,'离线，不发总线')}`)
  };

  const coverageSceneSpecs = {
  "gpt6-intelligent-ui": {
    "art": "interface",
    "title": "回答成为小工具，事实仍要能核对",
    "labels": [
      "具体问题与约束",
      "回答中的临时界面",
      "结果回到原始事实"
    ],
    "status": [
      "临时界面帮助探索，不等于已经执行外部事务。",
      "同一组输入应得到可复核的计算与解释。"
    ]
  },
  "haiku55-subagent-budget": {
    "source": "sol-quality-cost",
    "title": "把子任务的用量，算进整次交付",
    "labels": [
      "子任务验收",
      "上下文与推理配置",
      "费用与返工"
    ],
    "status": [
      "每 token 单价下降，不等于每件工作同比省钱。",
      "主代理和子代理都要计费，失败重试也入账。"
    ]
  },
  "gemini4-argon-long-work": {
    "source": "context-task-eval",
    "title": "长任务的每个结论，都保留回查路径",
    "labels": [
      "版本与原始材料",
      "逐项核对任务",
      "证据与待补项"
    ],
    "status": [
      "九月宣布与十月正式开放，是不同的事件。",
      "修复声明不是复测记录；长上下文不能替代证据。"
    ]
  },
  "nano-banana21-continuity": {
    "art": "continuity",
    "title": "逐轮换场景，保留同一个主体",
    "labels": [
      "固定主体参考",
      "每轮只改一件事",
      "身份与细节对照"
    ],
    "status": [
      "图为连续编辑的教学示意，不是模型生成样张。",
      "一次只改一个要素；发现主体漂移就退回已通过版本。"
    ]
  },
  "embeddinggemma2-local-retrieval": {
    "art": "retrieval",
    "title": "让不同材料，进入同一张检索地图",
    "labels": [
      "文字 · 图像 · 声音",
      "共享表示空间",
      "排序后回查原件"
    ],
    "status": [
      "向量接近用于寻找候选，不等于答案已经正确。",
      "按需加载编码器；本地索引也要核对资源与数据范围。"
    ]
  },
  "runway-kling-api-workflow": {
    "art": "video",
    "title": "先选镜头，再选入口与生成档位",
    "labels": [
      "镜头和参考资料",
      "草稿与成片分阶段",
      "时长 · 声音 · 费用"
    ],
    "status": [
      "十月更新是平台入口变化，不能改写成底层模型首发。",
      "草稿增强与音频可能另计费；先核对所选模型的支持项。"
    ]
  },
  "glm-legal-evidence-chain": {
    "source": "context-task-eval",
    "title": "先交事实卡，再讨论专业结论",
    "labels": [
      "有编号的原始材料",
      "事实与推断分开",
      "引用与未知项"
    ],
    "status": [
      "邀测与正式开放不同；本文只演示信息整理。",
      "计划完成不等于已经完成，缺失附件不能靠模型补出。"
    ]
  },
  "qwen-image21-api-alpha": {
    "art": "alpha",
    "title": "透明风车，要经得起三种底色检查",
    "labels": [
      "自造纸风车",
      "真实 Alpha 通道",
      "三色合成验收"
    ],
    "status": [
      "棋盘格只是透明预览的惯例，画出棋盘格不算透明。",
      "十月为托管 API 上新；权重发布日和许可另行区分。"
    ]
  },
  "mistral-large4-preview": {
    "art": "preview",
    "title": "API 预览与权重交付，分成两步判断",
    "labels": [
      "十月六日 API 预览",
      "同材料持续验收",
      "权重仍为未来计划"
    ],
    "status": [
      "公开预览允许行为更新，固定验收样本仍需重跑。",
      "截至十月十六日，不能把月底权重计划写成已可下载。"
    ]
  },
  "mplab-agent-telemetry-pacing": {
    "art": "telemetry",
    "title": "读取与发布分开，数据流才有节奏",
    "labels": [
      "ADC 与 I2C 输入",
      "定时发布与缓冲",
      "遥测协议验收"
    ],
    "status": [
      "厂商已展示 AI 工作流，本刊未上板验证时序。",
      "读取频率、输出频率与串口容量要分别核算。"
    ]
  },
  "memfault-crash-evidence-chain": {
    "art": "trace",
    "title": "从一次现场崩溃，走到可验证的假设",
    "labels": [
      "指定现场 trace",
      "版本与源码对应",
      "事实 · 假设 · 验证"
    ],
    "status": [
      "同一设备可产生多条 trace，不能把两种计数混用。",
      "只读权限仍会涉及数据传输，先确认项目与模型授权。"
    ]
  },
  "assertllm2-rtl-property-review": {
    "art": "assertion",
    "title": "一条断言，既要能证明，也要能检错",
    "labels": [
      "规格与候选属性",
      "前提可达性与证明",
      "变异缺陷对照"
    ],
    "status": [
      "触发条件从未发生，属性也可能真空通过。",
      "完整运行需要商业 JasperGold；只读学习不等于复现。"
    ]
  },
  "firment-waveform-evidence": {
    "art": "waveform",
    "title": "引脚真正输出什么，要看原始捕获",
    "labels": [
      "安全引脚与接线",
      "逻辑分析仪捕获",
      "频率与占空比检查"
    ],
    "status": [
      "方波是目标机制示意，本刊未生成任何硬件测量。",
      "低置信度不能判为通过，固件日志不能替代电平证据。"
    ]
  },
  "cantools-ai-wire-contract": {
    "art": "canframe",
    "title": "字节由合同确定，AI 负责组织核对",
    "labels": [
      "DBC 字段与单位",
      "独立黄金字节",
      "Python 与 C 对照"
    ],
    "status": [
      "这是一条原创 AI 教学组合，不是 cantools 自带的 AI 功能。",
      "先做离线编解码；不向车辆或在线总线发送测试帧。"
    ]
  },
  "opus55-fast-access": {
    "art": "latency",
    "title": "更快的输出，仍需单独计算费用",
    "labels": [
      "同一任务与模型",
      "推理速度档",
      "等待与费用分开记"
    ],
    "status": [
      "Opus 5.5 Fast 正式开放，是服务档位变化，不是新模型首发。",
      "输出速度不等于整项任务速度，工具等待和重试仍需计入。"
    ]
  },
  "gptlive11-voice-corrections": {
    "art": "voice",
    "title": "语音更顺畅，也要听清最后一次更正",
    "labels": [
      "说话与打断",
      "主模型与轻量分层",
      "关键事实回读核对"
    ],
    "status": [
      "新声音与口音是体验更新，不代表可以自动替人承诺。",
      "数字和否定句回读确认；全双工不是此次首次出现。"
    ]
  }
};
  for (const [id, spec] of Object.entries(coverageSceneSpecs)) {
    scenes[id] = n => ({
      ...(spec.source ? scenes[spec.source](n) : {kind:'evidence', body:coverageArt[spec.art]()}),
      title:spec.title, labels:spec.labels, status:spec.status[n % spec.status.length]
    });
  }
  /* End October coverage scenes. */

  /* October 17: original, bounded teaching scenes, never tool output. */
  const dailyArt = {
    voice: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,44,'分别写清两件事',true)}<rect class="fv-highlight" x="51" y="53" width="102" height="26" rx="3"/>${coverageText(102,70,'成人音色 · 节奏',true)}<rect class="fv-soft-fill" x="51" y="91" width="102" height="26" rx="3"/>${coverageText(102,108,'事实 · 对话规则',true)}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'创建后保存',true)}${sheet(282,50,92,73)}${coverageText(328,73,'voice ID',true)}${coverageText(328,113,'描述版本',true)}${coveragePanel(484,24,119,110)}${coverageText(543,45,'统一台词试听',true)}${coverageText(497,69,'数字听写')}${coverageText(497,91,'听感偏好')}${coverageText(497,113,'实际会话费用')}`),
    video: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,45,'同一辆玩具车',true)}<rect x="65" y="82" width="73" height="24" rx="5" fill="#d5ad54"/><circle class="fv-ink-fill" cx="80" cy="110" r="7"/><circle class="fv-ink-fill" cx="124" cy="110" r="7"/>${line('M103 83V53')}<path class="fv-sage-fill" d="M103 54v21l25-10Z"/>${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'遮挡前后逐段检查',true)}${line('M261 112h133','fv-soft-line')}${[270,321,372].map((x,i)=>`<g opacity="${i===1?'.5':'1'}"><rect x="${x-9}" y="84" width="30" height="14" rx="3" fill="#d5ad54"/><circle class="fv-ink-fill" cx="${x-3}" cy="101" r="4"/><circle class="fv-ink-fill" cx="${x+15}" cy="101" r="4"/>${line(`M${x+4} 85V65`)}<path class="fv-sage-fill" d="M${x+4} 66v13l15-7Z"/></g>`).join('')}<path d="M310 111V64q23-29 46 0v47h-9V67q-14-18-28 0v44Z" fill="#70909f"/>${coverageText(328,129,'概念图 · 非视频帧',true)}${coveragePanel(484,24,119,110)}${coverageText(543,45,'完整时间线',true)}${coverageText(497,69,'外观与旗帜')}${coverageText(497,91,'动作与停车')}${coverageText(497,113,'镜头单独检查')}`),
    comparison: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,45,'先筛硬条件',true)}${coverageText(54,68,'容量 · 预算')}${line('M54 83h94')}<circle class="fv-sage-fill" cx="62" cy="102" r="4"/>${coverageText(74,106,'可行候选')}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'找到结论翻转点',true)}${line('M262 118V55M262 118h132','fv-soft-line')}${line('M265 112.4L385 56.4','fv-sage-line')}${line('M265 95.6L385 67.6','fv-ochre-line')}<circle class="fv-paper" cx="337" cy="78.8" r="5"/>${line('M337 86v28','fv-dashed')}${coverageText(337,130,'24人',true)}${coveragePanel(484,24,119,110)}${coverageText(543,45,'条件式建议',true)}${coverageText(497,69,'区间内选谁')}${coverageText(497,91,'越界如何改')}${coverageText(497,113,'先补哪项事实')}`),
    tutor: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,45,'先独立作答',true)}${coverageText(102,70,'20% → 25%',true)}${line('M55 89h94M55 106h75')}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'按需给一层提示',true)}${[0,1,2].map(i=>`<rect class="${i===0?'fv-highlight':'fv-soft-fill'}" x="${261+i*12}" y="${55+i*23}" width="${132-i*24}" height="18" rx="3"/>`).join('')}${coveragePanel(484,24,119,110)}${coverageText(543,45,'换一个例子',true)}${coverageText(543,72,'25% → 20%',true)}${coverageText(543,98,'0% → 5%',true)}${line('M498 116h89')}`),
    memory: () => art(`${coveragePanel(40,24,124,110)}${coverageText(102,45,'可比的两次构建',true)}${sheet(53,57,43,61)}${sheet(109,57,43,61)}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'ROM 与 RAM 分账',true)}${coverageText(260,65,'ROM')}<rect class="fv-sage-fill" x="304" y="55" width="60" height="13" rx="2"/><rect class="fv-ochre-fill" x="364" y="55" width="29" height="13" rx="2"/>${coverageText(260,98,'RAM')}<rect class="fv-sage-fill" x="304" y="88" width="43" height="13" rx="2"/><rect class="fv-ochre-fill" x="347" y="88" width="21" height="13" rx="2"/>${coverageText(328,124,'条长仅解释组成',true)}${coveragePanel(484,24,119,110)}${coverageText(543,45,'增量回到符号',true)}${coverageText(497,69,'来源与未归因')}${coverageText(497,91,'对照独立预算')}${coverageText(497,113,'运行峰值待测')}`)
  };

  const dailySceneSpecs = {
  "prompt-to-voice-reusable-brief": {
    "art": "voice",
    "title": "声音描述、会话规则与试听记录，各有自己的位置",
    "labels": [
      "听感与规则分开",
      "保存真实声音身份",
      "统一台词逐项试听"
    ],
    "status": [
      "声音创建返回配置，不会直接返回一段试听音频。",
      "创建免费与会话免费不同；未试听的检查项保持待验证。"
    ]
  },
  "kling4-long-take-control": {
    "art": "video",
    "title": "玩具车穿过门洞，每一段都要保住同一主体",
    "labels": [
      "自制主体参考",
      "遮挡前后连续检查",
      "时间线与镜头验收"
    ],
    "status": [
      "图中玩具车为原创概念示意，不是模型生成视频。",
      "API、4K与两分钟延长仍属公告中的后续计划。"
    ]
  },
  "decision-switching-threshold": {
    "art": "comparison",
    "title": "先满足硬条件，再看推荐会在哪里翻转",
    "labels": [
      "容量门槛先筛选",
      "24人处费用相同",
      "按人数给出选择"
    ],
    "status": [
      "合成报价在24人同为660元，跨过交点就要重新比较。",
      "人数范围不是概率分布；AI不能替你默认风险偏好。"
    ]
  },
  "learning-short-answer-hint-retest": {
    "art": "tutor",
    "title": "独立作答、按需提示，再用新题检查",
    "labels": [
      "先暴露真实答案",
      "一次只给一级提示",
      "反转方向与零基数"
    ],
    "status": [
      "提示后答对是进展，但应与独立完成分开记录。",
      "题型上新不保证教学效果；有争议就回到可靠材料。"
    ]
  },
  "firmware-memory-delta-audit": {
    "art": "memory",
    "title": "新增字节先分账，再追到具体符号",
    "labels": [
      "同目标的两份构建",
      "ROM与RAM独立核算",
      "运行与升级另验证"
    ],
    "status": [
      "XIP初始化数据占两个区域，不能把ROM和RAM混成一个容量。",
      "静态余量与观测栈余量都不能证明最坏路径已经安全。"
    ]
  }
};
  for (const [id, spec] of Object.entries(dailySceneSpecs)) {
    scenes[id] = n => ({kind: 'evidence', body: dailyArt[spec.art](), title: spec.title, labels: spec.labels, status: spec.status[n % spec.status.length]});
  }
  /* End October 17 teaching scenes. */

  /* Company practice batch: original evidence maps, never execution recordings. */
  const companyCaseSpecs = {
    'spotify-honk-verification-rollout': {
      title:'先筛适用条件，再分开检查与发布',
      labels:['A继续 · B跳过 · C停止','独立验证与人工审查','发布观察与回滚'],
      status:['图中组件是合成练习；检查通过只够进入下一道审查。','公司披露的自动升级事故，不能改写为已证实由AI代码造成。'],
      body:art(`${coveragePanel(40,24,124,110)}${coverageText(102,44,'先筛适用条件',true)}${coverageText(55,68,'A  可准备补丁')}${coverageText(55,91,'B  版本不符')}${coverageText(55,114,'C  键值冲突')}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'两种不同的检查',true)}<rect class="fv-soft-fill" x="259" y="55" width="138" height="27" rx="3"/>${coverageText(328,73,'可解析 · 行为保持',true)}<rect class="fv-highlight" x="259" y="94" width="138" height="26" rx="3"/>${coverageText(328,112,'任务边界 · 人工审查',true)}${coveragePanel(484,24,119,110)}${coverageText(543,45,'上线后仍要观察',true)}${coverageText(498,70,'负责人在场')}${coverageText(498,94,'小范围发布')}${coverageText(498,118,'异常可回滚')}`)
    },
    'uber-autocover-test-acceptance': {
      title:'同一份教学台账，三个阶段各有分母',
      labels:['10个候选测试','6个检查通过','4个人工接受'],
      status:['10、6、4是本站合成数据，不是Uber的生产测量。','6/10、4/10、4/6分别回答不同问题，不能交换分母。'],
      body:art(`${coveragePanel(40,24,124,110)}${coverageText(102,44,'候选 10',true)}${Array.from({length:10},(_,i)=>`<circle class="fv-soft-fill" cx="${62+(i%5)*20}" cy="${68+Math.floor(i/5)*23}" r="6"/>`).join('')}${coverageText(102,119,'合成教学台账',true)}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'检查通过 6',true)}${Array.from({length:6},(_,i)=>`<rect class="fv-sage-fill" x="${277+(i%3)*38}" y="${57+Math.floor(i/3)*25}" width="23" height="14" rx="3"/>`).join('')}${coverageText(328,123,'6 / 10 = 60%',true)}${coveragePanel(484,24,119,110)}${coverageText(543,45,'人工接受 4',true)}${coverageText(543,72,'4 / 10 = 40%',true)}${coverageText(543,96,'4 / 6 ≈ 66.7%',true)}${coverageText(543,119,'两种接受率',true)}`)
    },
    'scania-spec2code-contract-gap': {
      title:'规格内的证明，与完整替换是两件事',
      labels:['人工固定规格','编译与证明义务','等价与系统仍待查'],
      status:['证明目标通过，只覆盖已经写下的规格与模型假设。','等价未证成需要调查；图示不是实物复现或安全认证。'],
      body:art(`${coveragePanel(40,24,124,110)}${coverageText(102,44,'固定规格',true)}${coverageText(54,69,'前提与初态')}${coverageText(54,92,'输出与副作用')}${coverageText(54,115,'禁止弱化规则')}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'分开保存证据',true)}${sheet(261,51,61,70)}${sheet(340,51,55,70)}${coverageText(291,77,'编译',true)}${coverageText(367,77,'义务',true)}${coverageText(328,130,'未执行 · 不画绿灯',true)}${coveragePanel(484,24,119,110)}${coverageText(543,45,'不能跳过的问题',true)}${coverageText(498,70,'规格完整吗')}${coverageText(498,94,'行为等价吗')}${coverageText(498,118,'环境一致吗')}`)
    }
  };
  for (const [id,spec] of Object.entries(companyCaseSpecs)) {
    scenes[id] = n => ({kind:'evidence', body:spec.body, title:spec.title, labels:spec.labels, status:spec.status[n % spec.status.length]});
  }
  /* End company practice batch. */

  /* October 18: two original evidence workflows, not vendor UI or live results.
   * Separate scene kinds keep their bounded routes aligned with their own inputs. */
  const october18SceneSpecs = {
    'deepseek-search-fetch-evidence': {
      kind:'searchfetch',
      title:'候选链接先打开，证据和费用再分开记',
      labels:['Search 找候选','Fetch 读正文','出处与日期逐项核对'],
      status:[
        'Search 返回候选链接与摘要；结论还要回到 Fetch 取回的正文。',
        '核对原始发布日期、适用范围与原文；证据不足就保留待核。',
        '成功且有结果的请求才进入计费口径；免费期按入口核对，模型 tokens 另记。',
        '图中是合成练习的查证路径，本刊未调用接口或验证模型效果。'
      ],
      body:art(`${coveragePanel(35,16,145,103)}${coverageText(107,35,'Search · 候选',true)}
        ${[52,73,94].map((y,i)=>`<circle class="fv-soft-fill" cx="51" cy="${y}" r="5"/>${line(`M64 ${y-3}h${[98,83,92][i]}M64 ${y+4}h${[72,94,60][i]}`,'fv-sage-line')}`).join('')}
        ${arrow(189,70,56)}
        ${coveragePanel(255,16,145,103)}${coverageText(327,35,'Fetch · 正文',true)}
        ${line('M268 44h119','fv-soft-line')}${coverageText(270,61,'发布日期 · 适用范围')}
        ${line('M270 76h114M270 86h101M270 96h114M270 106h82')}
        ${arrow(409,70,56)}
        ${coveragePanel(475,16,132,103)}${coverageText(541,35,'逐项回查',true)}
        ${coverageText(488,59,'出处 + 日期')}${coverageText(488,80,'结论对应原文')}
        <rect x="486" y="91" width="110" height="19" rx="3" fill="#eee1c9"/>
        ${coverageText(541,104,'证据不足 · 待核',true)}
        ${[[35,176,'合格 Search 请求'],[224,176,'合格 Fetch 请求'],[413,194,'模型 tokens 另记']].map(([x,w,t])=>`<rect class="fv-paper" x="${x}" y="130" width="${w}" height="22" rx="3"/>${coverageText(x+w/2,145,t,true)}`).join('')}`)
    },
    'airbnb-incremental-support-notes': {
      kind:'supportnotes',
      title:'保留人工修订，只把新事实追加到笔记',
      labels:['旧笔记 + 历史和新消息','候选增量先过滤','检查修改后再离线复用'],
      status:[
        '新消息触发候选增量；提示含全量历史与人工修订笔记，再过滤无关或重复条目。',
        '新增事实追加到原记录，重复消息不追加，未解决事项继续保留。',
        '人工修改先经过检查，再决定能否离线复用；修改不自动成为标准答案。',
        '这是对公司 2025 年实践的原创示意，不是其客服界面或本站复现。'
      ],
      body:art(`${coveragePanel(35,15,145,58)}${coverageText(107,34,'人工修订的旧笔记',true)}
        ${line('M49 47h116M49 59h91','fv-sage-line')}
        ${coveragePanel(35,87,145,58)}${coverageText(107,106,'历史 + 新消息',true)}
        ${coverageText(49,124,'全量历史在提示中')}${line('M49 134h89','fv-soft-line')}
        ${line('M183 45h34q16 0 16 16v3h34M183 116h34q16 0 16-8h34','fv-route')}
        ${coveragePanel(270,16,160,129)}${coverageText(350,35,'候选增量先过滤',true)}
        <rect class="fv-soft-fill" x="282" y="46" width="136" height="35" rx="3"/>
        ${coverageText(350,60,'无关 / 重复 → 滤除',true)}${coverageText(350,75,'已有修正不覆盖',true)}
        <rect x="282" y="88" width="136" height="31" rx="3" fill="#eee1c9"/>
        ${coverageText(350,108,'+ 有效增量',true)}${coverageText(350,135,'未解决事项仍保留',true)}
        ${line('M433 80h47','fv-dotted')}
        ${coveragePanel(486,25,121,109)}${coverageText(546,45,'离线复用前',true)}
        ${coverageText(500,68,'检查人工修改')}${coverageText(500,89,'判断可否复用')}
        <rect x="498" y="101" width="97" height="22" rx="3" fill="#eee1c9"/>
        ${coverageText(546,116,'未审不回流',true)}`)
    }
  };
  for (const [id,spec] of Object.entries(october18SceneSpecs)) {
    scenes[id] = n => ({kind:spec.kind, body:spec.body, title:spec.title, labels:spec.labels, status:spec.status[n % spec.status.length]});
  }
  /* End October 18 evidence workflows. */

  /* October 19: original teaching records using the established evidence scene.
   * Particles indicate evidence transfer, never test success or authorization. */
  const october19SceneSpecs = {
    'meta-forum-state-verification': {
      title:'页面、版本和行为，三项证据要对上',
      labels:['先确认目标页面','记录同一构建的验证','原型隔离再审查'],
      status:[
        '先读当前页面、对象和状态；同名搜索按钮不等于同一个任务目标。',
        '编译、单测与返回路径分开记录；旧构建和错页面的记录不能补证。',
        '隐藏入口不等于正式包排除原型；构建清单与专用依赖还需核对。',
        '图中是本站合成台账，未运行公司工具；交付仍需负责人审查。'
      ],
      body:art(`${coveragePanel(40,24,124,110)}${coverageText(102,44,'页面身份',true)}${coverageText(54,68,'GroupHome')}${coverageText(54,91,'g-17 · 搜索本群')}${coverageText(54,115,'不改 HomeFeed')}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'C17 · 分项记录',true)}${coverageText(260,64,'构建 / 单测')}${coverageText(260,86,'搜索 → 返回')}${coverageText(260,108,'版本与页面相符')}${coveragePanel(484,24,119,110)}${coverageText(543,45,'交付前审查',true)}${coverageText(498,70,'原型排除？')}${coverageText(498,94,'缺失项保留')}${coverageText(498,118,'人工判断')}`)
    },
    'mathworks-ears-mapping-review': {
      title:'术语映射先审，编译与仿真分开验',
      labels:['需求对照实际信号','人工确认映射与假设','逐项保存验证证据'],
      status:[
        '把需求中的术语、单位和时间条件映射到模型信号；未知项先保留。',
        '人工确认 YAML 映射后才准备测试草稿；在可写副本中检查修改范围。',
        '生成文件、编译通过、仿真运行和断言通过是不同证据，不能合成一个成功。',
        '这是原创合成练习，本站未执行模型工具或硬件实验；上游结果按范围引用。'
      ],
      body:art(`${coveragePanel(40,24,124,110)}${coverageText(102,44,'术语 → 信号',true)}${coverageText(54,68,'70°C → 700')}${coverageText(54,91,'实际状态 ≠ 命令')}${coverageText(54,115,'时序仍待确认')}${coverageRoute()}${coveragePanel(245,19,166,119)}${coverageText(328,40,'人工映射审查',true)}${coverageText(260,64,'单位 / 初态')}${coverageText(260,86,'触发 / 时间起点')}${coverageText(260,108,'未决问题不补写')}${coveragePanel(484,24,119,110)}${coverageText(543,45,'证据逐项记',true)}${coverageText(498,70,'编译记录')}${coverageText(498,94,'仿真记录')}${coverageText(498,118,'断言结果')}`)
    }
  };
  for (const [id,spec] of Object.entries(october19SceneSpecs)) {
    scenes[id] = n => ({kind:'evidence', body:spec.body, title:spec.title, labels:spec.labels, status:spec.status[n % spec.status.length]});
  }
  /* End October 19 teaching records. */


  /* October 20 original teaching scenes; existing 55 scenes remain unchanged. */
  const october20SceneSpecs = {"minimax-m31-flash-effort-cost":{"kind":"balance","reuse":"sol-quality-cost","title":"先锁定思考深度，再比较整项任务","labels":["固定任务与深度","分类结果与重试","模型 + 缓存 + 工具"],"status":["正式在线服务已经开放；权重发布仍是后续安排。","省略effort默认max，输出预算也包含思考消耗。","0.0171美元模型用量加两次搜索，合成为0.0371美元。","图与费用均为合成说明，不能当成实测速度或真实账单。"]},"gemini-notebook-prerender-review":{"kind":"evidence","title":"先审每页要说什么，再生成画面","labels":["来源与听众","提纲 / 制作说明","成品仍需检查"],"panels":[["A · B · C","10条练习记录","8条字段完整","不是效率提升"],["Review","四页各有目的","旁白对应画面","未证实不补写"],["生成后","数字与字幕","图像与读音","再检查一次"]],"status":["先核来源、听众与每页目的，再审提纲或视频制作说明。","8/10只说明字段完整比例，不能改写成效率提升80%。","公告为一周滚动开放，帮助页仍列Ultra；账号入口需核对。","这是一份合成计划，未生成成品；审阅提纲不替代成品检查。"]},"pixverse-template-slots-jobs":{"kind":"evidence","title":"输入槽位有顺序，生成任务逐个追踪","labels":["模板与槽位","输入顺序 / 锁定参数","每个返回任务"],"panels":[["先读模板","图片 / 视频 / 文本","槽位顺序","模板自己的约束"],["匹配输入","每项对应位置","输出参数可锁定","缺项先检查"],["逐项状态","任务ID分别存","完成或失败","成片另验收"]],"status":["先查模板要求的槽位类型和顺序，不能只数上传了几个文件。","模板可锁定时长、画幅或分辨率，通用默认值不应强行覆盖。","多媒体返回不等于一个成品；按每个任务ID分别追踪状态。","这是原创流程示意，未安装CLI、上传素材或消耗生成积分。"]},"gemini-october-api-retirement-window":{"kind":"evidence","title":"研究代理与视频型号，分别检查退役窗口","labels":["完整标识与期限","接口 / 状态 / 返回","替代项逐条验收"],"panels":[["先列标识","Veo预览型号","旧研究agent","日期语义分开"],["分别迁移","agent / model","后台任务状态","SDK / REST结果"],["交付检查","引用支持范围","视频规格与内容","失败保留退路"]],"status":["Veo相关预览最早10月22日退役；旧Deep Research公告计划10月23日停用。","具体API标识的生命周期，不能外推为整个消费端产品或品牌关闭。","保留原任务ID与状态，断线不等于失败；不把创建成功当成完成。","替代项仍需验证接口和输出，本文没有调用服务或执行迁移。"]},"kimi-desktop-remote-review":{"kind":"evidence","title":"换一块屏幕，仍接着同一件工作","labels":["电脑上的原任务","远端同账号会话","新要求与停点"],"panels":[["原任务","练习目录","三份源文件","只读核对"],["远端检查","设备与会话","事实差异仍保留","日期变更单列"],["明确停点","不改文件","必要操作再判断","停任务需核对"]],"status":["远控是控制界面；项目文件与本地工具仍在原电脑执行。","先核对设备、会话和源文件，再补充新要求，避免接错上下文。","新日期更新报告，不应伪称旧文件已经修改。","关闭远端页面不会自动停止电脑上的任务，停止后仍需核对状态。"]},"openai-low-resource-behavior-parity":{"kind":"evidence","title":"编译通过之后，再核对可观察行为","labels":["明确输出契约","数值 / 缺失 / 行尾","逐项差异与未测项"],"panels":[["旧行为","12.349 → 12.34","缺失不是零","行尾只有LF"],["逐项比较","舍入差异","多一个CR","来源与输出对应"],["审查记录","四例仅一例符合","分母不能混用","真实迁移未验证"]],"status":["低资源语言指可学习资料相对较少，并非小内存设备语言。","数据库功能通过率与整个COBOL迁移成功判定，是两种评测口径。","合成四例中只有T4满足契约；成功退出不能证明输出一致。","原始输出差异先保留，不为让测试全绿临时增加trim或容差。"]},"muse-beam-open-weight-deployment":{"kind":"evidence","title":"开放权重的两个入口，部署证据逐项比较","labels":["Muse Spark Open","许可 / 内存 / 任务","Reflection Beam"],"panels":[["多模态输入","816B总参数","42B激活","输出为文本"],["分别核对","完整权重常驻","量化和缓存","同任务再比较"],["文本输入输出","501B总参数","23B激活","Apache-2.0"]],"status":["Muse与Beam分别于10月15日和16日开放权重，初次宣布和权重可用分开记。","激活参数影响每步计算，不等于只需存放同样数量的权重。","自定义Muse许可与Apache-2.0不同；卡片不能替代完整条款审查。","图示与预算练习均为原创合成材料，本站未下载或部署模型。"]},"cloudflare-rule-lifecycle-review":{"kind":"evidence","title":"先确定适用规则，再决定意见级别","labels":["当前规则与版本","适用范围 / 强度 / 状态","分级意见待复核"],"panels":[["规则来源","稳定编号 + 版本","原文条件保留","负责人已确认"],["分别判断","适用或待澄清","MUST / SHOULD","approved / enforced"],["处置区分","阻断候选 / 发现","建议 / 不适用","人工复核"]],"status":["这是2026年8月公司实践的回看，不是当天新增能力。","条款编号、当前版本、适用条件与执行状态分别核对。","approved的MUST不自动阻断；SHOULD不能升级成MUST。","R3范围未知先问清，R5不适用；合成意见不执行真实审批。"]}};
  for (const [id,spec] of Object.entries(october20SceneSpecs)) {
    const panel = (rows,x,w) => coveragePanel(x,24,w,110)+coverageText(x+w/2,44,rows[0],true)+rows.slice(1).map((text,i)=>coverageText(x+w/2,68+i*23,text,true)).join('');
    const body = spec.reuse ? scenes[spec.reuse](0).body : art(panel(spec.panels[0],40,124)+coverageRoute()+panel(spec.panels[1],245,166)+panel(spec.panels[2],484,119));
    scenes[id] = n => ({kind:spec.kind,body,title:spec.title,labels:spec.labels,status:spec.status[n % spec.status.length]});
  }
  /* End October 20 teaching scenes. */


  /* October 21 original teaching diagrams; all 63 earlier scenes remain unchanged. */
  const october21SceneSpecs = {"openai-monitorability-pair-retry-metrics":{"title":"同一批请求，三个不同分母","labels":["全部请求","实际交付","覆盖率"],"panels":[["全部请求","100份报告","包括未交付","2 / 100 = 2%"],["实际交付","20份放行","其中2份不合格","2 / 20 = 10%"],["覆盖率","20 / 100","交付比例20%","未交付 ≠ 正确"]],"status":["同一批合成报告，全部请求与实际交付的分母不同。","不合格输出占全部请求2%，占已交付结果10%。","覆盖率为20%；80份未交付不能当成正确回答。","重试预算属于系统设置，研究不是绕过安全拒绝的许可。"]},"runway-claude-marketplace-procurement":{"title":"采购入口和制作流程，分别核实","labels":["采购资格","制作衔接","实际交付"],"panels":[["采购资格","企业承诺","产品与席位","不是全面免费"],["制作衔接","规划 → 动画","影像与声音","交接仍需检查"],["实际交付","账号是否开放","用量与权利","成片另验收"]],"status":["进入Marketplace首先改变企业采购路径，不是发布新视频模型。","符合条件的采购承诺与个人订阅权益不能混为一谈。","规划、动画与成片的衔接仍要核对格式、文字和音画。","本站未购买或制作视频，具体账号资格和效果尚未验证。"]},"gemini-gdc-airgap-managed-rag-preview":{"title":"离线模型之外，还要看完整资料链","labels":["隔离环境","资料处理","逐项验收"],"panels":[["隔离环境","GDC气隙","HGX B300","不是普通电脑"],["资料处理","文件 → 索引","权限 → 检索","计算与引用"],["逐项验收","版本是否最新","引用是否支持","权限是否正确"]],"status":["这是指定企业基础设施上的托管RAG预览，不是个人离线安装包。","气隙网络边界、资料权限和回答正确性是三件不同的事。","合成手册B替代A后，引用旧A不能支持当前额定值。","本文没有部署系统、上传资料或测试隔离效果。"]},"metr-anthropic-risk-review-scope-evidence":{"title":"同样判断低风险，也可能理由不同","labels":["报告范围","10月20日复核","协议分开"],"panels":[["报告范围","截至7月15日","八月报告","不是所有新模型"],["10月20日复核","倾向风险低","主要因能力受限","监测论据仍存疑"],["协议分开","旧安排用于本次","10月15日新安排","不能追溯加权限"]],"status":["复核发布日期与系统评估覆盖期不能互换。","结论相近不等于论据一致，更不等于零风险认证。","此次复核使用旧合作条款，并非10月15日新安排的成果。","本文只整理公开复核，不推测未公开事件或内部材料。"]},"deepseek-harness-preview-upgrade-acceptance":{"title":"模型、框架、插件，升级变量分开","labels":["固定配置","会话恢复","故障状态"],"panels":[["固定配置","框架R1","模型A → B","插件P1不变"],["会话恢复","标识与目录","不兼容则失败","不能悄悄替换"],["故障状态","超时 ≠ 未执行","副作用先核查","实际集成未测"]],"status":["dsh-v0.2.1-rc.2是预发布，MIT许可不等于安全审计通过。","合成配置只换模型，不能声称插件或框架也已升级。","会话恢复失败应保留失败，不能悄悄创建另一个任务。","工具超时且副作用未知时先核查结果，不盲目重复操作。"]},"seedance25-reference-timeline-repair":{"title":"参考分工后，再定位一段画面修复","labels":["素材职责","18秒原理示意","局部修复"],"panels":[["素材职责","A · 外形","B · 布局","C · 旁白"],["18秒原理示意","0–6秒 展示","6–12秒 同载荷","12–18秒 对比"],["局部修复","只恢复蓝色","动作与镜头保持","前后衔接再看"]],"status":["7月31日旧发布补覆盖，不把核验日当作模型发布日期。","参考数量是容量，素材职责和冲突仍需先写清。","纸桥与载荷是原创合成示意，不能伪装真实承载试验。","局部修复后仍要回看邻近区间，本站没有生成视频。"]},"seedream5pro-layered-diagram-review":{"title":"图层可编辑，事实仍要逐项核对","labels":["事实清单","布局与图层","三关验收"],"panels":[["事实清单","10份文件","8份字段齐全","2份缺字段"],["布局与图层","读入 → 检查","再按结果分组","文字不随底色改"],["三关验收","信息与关系","手机阅读","实际导出文件"]],"status":["7月8日已有能力回看，不是今天的新模型消息。","8/10只是字段齐全比例，没有准确率或效率提升依据。","仅改区域底色，也要重新核对全图文字、数字与箭头。","图层分离不证明可无损重建源文件，导出兼容性仍未测试。"]},"meta-ach-mutant-test-contract":{"title":"用一个故障副本，检查测试真的抓错","labels":["原版规格","受控变异","测试证据"],"panels":[["原版规格","长度至少4","声明长度相等","零载荷也校验"],["受控变异","M1 · 放宽长度","M2 · 接受多载荷","M3 · 跳过校验"],["测试证据","原版通过","变异断言失败","编译失败不计"]],"status":["ACH来源是Android Kotlin隐私测试，固件迁移只是本文设想。","新测试在原版通过、在目标变异因预期断言失败才有区分证据。","不能编译是无效变异；只检查返回类型可能根本抓不到错误。","示例校验规则尚缺，不能自行编造校验字节或声称已经运行。"]},"aws-migration-playbook-evidence":{"title":"经验先带上前提，再进入下一次计划","labels":["历史案例","经验卡与版本","本次迁移"],"panels":[["历史案例","A · 新错误码","B · 夹具变慢","C · 其他版本"],["经验卡与版本","来源 / 适用条件","测试 / 例外","人工审阅后冻结"],["本次迁移","A适用","B前提未证实","D构建 ≠ 板测"]],"status":["这是5月公开的公司方法回看，不是今天上线的新工具。","一次修复成功不能推广成所有版本、平台都必须执行。","夹具超时经验不能变成普遍修改产品超时要求。","计划一致不等于正确；留出案例与实际验证都尚未执行。"]},"spotify-eval-funnel-calibration":{"title":"先排硬缺项，再验证读者实际结果","labels":["离线评分","必需事实检查","模拟读者任务"],"panels":[["离线评分","A · 4.6分","B · 4.2分","仅教学分数"],["必需事实检查","保存 → 切换","最后确认状态","A缺保存前提"],["模拟读者任务","错误与时间","顺序与盲测","再校准评测器"]],"status":["这是5月公司评测方法回看，模型分数不是用户实验结果。","A虽清晰度分更高，却漏掉必须先保存的前提，应先修订。","B内容完整仍不能证明真实读者使用效果一定更好。","校准后要保留独立留出样本，本站未组织真实实验。"]}};
  for (const [id,spec] of Object.entries(october21SceneSpecs)) {
    const panel = (rows,x,w) => coveragePanel(x,24,w,110)+coverageText(x+w/2,44,rows[0],true)+rows.slice(1).map((text,i)=>coverageText(x+w/2,68+i*23,text,true)).join('');
    const body = art(panel(spec.panels[0],40,124)+coverageRoute()+panel(spec.panels[1],245,166)+panel(spec.panels[2],484,119));
    scenes[id] = n => ({kind:'evidence',body,title:spec.title,labels:spec.labels,status:spec.status[n % spec.status.length]});
  }
  /* End October 21 teaching scenes. */

  /* October 22 original teaching diagrams; earlier scenes remain exact. */
  const october22SceneSpecs = {"google-cloud-openai-private-preview":{"title":"目录、资格和安全条件分别核实","labels":["企业私测","当前交付","后续计划"],"panels":[["部分企业","申请 ≠ 获准","三个GPT型号","不是新模型发布"],["统一采购","API推理","本地Codex衔接","接口仍需验收"],["尚待开放","ZDR / 机密计算","业务产品集成","不能预先承诺"]],"status":["10月21日公告是部分企业私有预览，不是全面开放。","同一模型目录仍可能有不同权限、费用和接口边界。","不用于训练不能等同零留存，后续计划不能当当前能力。","合成团队尚未获准且要求ZDR，不能立即判断迁移条件满足。"]},"openai-monitor-alerts-boundary-incidents":{"title":"功能、监测、通知，各有独立证据","labels":["业务功能","监测覆盖","人工接收"],"panels":[["迁移完成","功能测试通过","仅支持业务结论","不扩展安全权限"],["结果存在","日志仍产生","覆盖范围另核","不能只读总结"],["告警链路","接收是否送达","响应是否有效","原因仍待研究"]],"status":["两起事件发生于10月3日和6日，10月20日公开，日期分开记录。","功能通过不证明监测完整，记录存在不证明通知已送达。","官方仍研究原因，不从两例推算失效率或认定主观动机。","图示只读评审，不运行代理，也不执行任何安全配置修改。"]},"fasth3-omni-weights-runtime-license":{"title":"输入总量、运行条件和许可一起看","labels":["参考素材","服务器数据","本地路径"],"panels":[["8图 + 3视频","再加2音频","共13份 > 12","至少减一份"],["8 × GB200","27组工作负载","完整服务配方","不是单组件加速"],["量化另有配方","480p默认","硬件 / 精度","地域许可先核"]],"status":["每类素材上限不能直接相加，总参考数量仍不得超过12。","发布团队速度比较附带服务器硬件与配方，不等于桌面实时。","BF16、FP8和NVFP4 QAD可能有不同输出，需分别验收。","模型权重采用自定义社区许可，本站没有下载或运行模型。"]},"openai-12h-cache-reuse-economics":{"title":"先付写入费，再看够不够复用","labels":["合成单价","两次调用","三次调用"],"panels":[["普通输入 = 1","长写入 = 2.5","后续读取 = 0.1","只算同一前缀"],["2.5 + 0.1","合计2.6","不缓存是2","长缓存更贵"],["2.5 + 2×0.1","合计2.7","不缓存是3","不是短缓存比较"]],"status":["此算例只比较完全不缓存基线，不包含其他输入和输出费用。","两次复用场景总计2.6，不能因读取便宜就宣称省钱。","三次总计2.7低于3，仍需时间分布才能与短缓存比较。","覆盖时长保障符合条件的读取计价，不是必然低延迟保证。"]},"claude-duet-preview-attention-budget":{"title":"主动准备不等于已获准行动","labels":["信息变化","提醒策略","待批动作"],"panels":[["明日会议冲突","无期限资料更新","对外报价请求","虚构材料"],["冲突及时提醒","资料合并简报","后台也占额度","不是无限监控"],["报价先起草","确认对象与内容","批准后才执行","本站未实际使用"]],"status":["10月21日研究预览从美国Pro/Max候补用户开始，不是全球开放。","云端虚拟机可持续工作，不要求原电脑一直开机。","后台检查和其他Claude任务共享额度，提醒越多不等于越好。","报价可准备草稿，不能推定已获准发送或作价格承诺。"]},"dropbox-judge-prompt-change-budget":{"title":"任务契约不变，失败仍留在分母","labels":["评分契约","两种候选","三项一起看"],"panels":[["先固定","1–5分","字段与错误处理","不许改题目"],["四项合成输出","A · 一项无效","B · 两项差1分","其余符合"],["总误差","A · 25","B · 3.125","有效率另列"]],"status":["迁移时重写提示与生产时选择指令，是不同修改范围。","A有效率75%，只看可解析样本会掩盖失败。","B总NMSE为3.125，但四个合成样本不证明泛化。","禁止记忆文件名或缩小分值范围，候选仍需独立留出检验。"]},"dropbox-design-code-link-recovery":{"title":"先配对正确材料，再核实现与测试","labels":["设计范围","关联候选","仍需补证"],"panels":[["D1 · 杉木A","完整配置导出","诊断导出","都不得含令牌"],["PR-A 属于B","PR-B 摘要相符","PR-C 仅能打开","不能互相替代"],["分开核实","具体实现","两条路径","字段缺失测试"]],"status":["标题相似不证明同一设备实现，PR-A属于另一代际。","PR-B无回链仍可为关联候选，摘要不是实现和运行证据。","PR-C只记录功能成功，没有证明输出不含令牌。","公司关系恢复比例不是漏洞检出率，嵌入式练习未实物验证。"]},"kimi-desktop-trust-session-boundaries":{"title":"项目可信、上下文连续、配置生效，分别确认","labels":["工作区信任","模型切换","配置与视图"],"panels":[["本地项目来源","项目级MCP","拒绝则不发消息","不是沙箱认证"],["新建会话","压缩后继续","直接继续","保留未完成检查"],["重载有条件","生成中不可重载","多端非实时","核对最新状态"]],"status":["1.1.1工作区信任会影响项目级工具配置，不只是显示标签。","模型切换的三种选项改变上下文处理，不能省略原有约束。","磁盘文件已保存不等于运行会话已加载，也不等于其他窗口已刷新。","本图仅解释官方状态，不调用接口或自动批准陌生工作区。"]}};
  for (const [id,spec] of Object.entries(october22SceneSpecs)) {
    const panel = (rows,x,w) => coveragePanel(x,24,w,110)+coverageText(x+w/2,44,rows[0],true)+rows.slice(1).map((text,i)=>coverageText(x+w/2,68+i*23,text,true)).join('');
    const body = art(panel(spec.panels[0],40,124)+coverageRoute()+panel(spec.panels[1],245,166)+panel(spec.panels[2],484,119));
    scenes[id] = n => ({kind:'evidence',body,title:spec.title,labels:spec.labels,status:spec.status[n % spec.status.length]});
  }

  // October 23: original, evidence-bounded panels; existing scene output is unchanged.
  const october23Scenes = {"claude-api-dated-version-migration":{"title":"依赖、接口契约与业务结果，分层核对","labels":["升级前","接口与网关","相同任务验收"],"panels":[["版本分别列","SDK / API","模型名称","不是同一个版本"],["检查字段","默认采样也拒绝","认证头与脱敏","历史消息回放"],["分开结论","请求能接受","结果仍正确","未执行要注明"]],"status":["Python 2.0.0及TypeScript 1.0.0起默认新API，不能只检查模型名。","新版本拒绝采样参数；不能把document与citations限制概括成全面禁用。","网关认证和日志脱敏应共同审查，不在例子里放真实密钥。","这是纸面迁移练习，HTTP成功不是业务验收，也不是本站实测。"]},"xing-intent-schema-multiple-results":{"title":"一句话有两项请求，结果也应保留两项","labels":["虚构输入","完整结果","字段与权限"],"panels":[["查DEMO-17","再解释退货期限","两件事","不是两次执行授权"],["查询进度","解释政策","逐项遍历","别只拿第一项"],["缺字段先问","否定不能漏","对象另核对","不自动执行业务"]],"status":["合成输入A包含查询和政策解释两项，第一项快捷属性不能代表全部结果。","B明确不取消；C没有订单号，不能为了补齐字段而猜编号。","类别正确、参数正确和获准执行是三种不同判断。","本图是人工设计的预期结果，不是Xing模型实际输出或准确率测量。"]},"deepinfer-engine-service-gap":{"title":"离线生成能跑，与多人服务能交付之间","labels":["已公开引擎","待补服务组件","容量另作验收"],"panels":[["离线示例","限定支持硬件","许可证可查","不是完整服务"],["KV缓存系统","预填充 / 解码","分离与路由","副本负载均衡"],["100人是假设","并发 / 取消","重试与资源清理","没有实测数字"]],"status":["官方明确完整服务仍需要此次发布未包含的组件，不能用离线示例代替。","4张SM100预填充、64张解码是厂商基准条件，不是消费显卡结果。","练习中的100人并发目标缺少测量支持，应列为容量假设。","开源代码与模型权重许可分开核查，本站没有下载或运行候选项目。"]},"brex-oncall-runbook-evidence":{"title":"先走排查步骤，再交接事实与未知","labels":["症状到手册","证据报告","人工复核回写"],"panels":[["虚构导出待确认","路由到手册","启动记录存在","送达记录缺失"],["确认 / 假设","缺口与阻碍","下一项只读检查","没有送达结论"],["检查重复风险","人工决定操作","补齐排查文档","不是自动重跑"]],"status":["有任务创建记录，不等于导出结果已经送达，先找对应回执。","未匹配手册或缺少直接证据时，假设与事实必须分开。","复核报告能暴露手册缺口，更新文档比盲目换模型更可检查。","公司91%是历史自报评估，不是本站复现，也不代表其他系统可靠性。"]},"zalando-search-intent-language-parity":{"title":"六种说法不等于六个独立测试场景","labels":["六条合成查询","三个意图组","译文条件核对"],"panels":[["两种说法一组","儿童 / 成人","材质条件","先去语义重复"],["按属性分组","三类真实意图","不是简单数行","覆盖缺口另补"],["儿童被遗漏","先查标签差异","再分析排序","本地需求另验"]],"status":["合成六条查询只有三个意图，不能用表格行数夸大场景覆盖。","译文丢失年龄条件时，应先核查询和NER标签，不直接归因排名模型。","相关性评分提供排查线索，不能单凭低分断言根因。","跨市场借来的需求仍可能漏本地偏好，本文未复现Zalando评测。"]},"minimax-miniapp-persistent-review":{"title":"持续页面刷新时，保留人的修改与未知","labels":["来源状态","人工备注","操作结果"],"panels":[["A · 原始说明","B · 刷新失败","C · 来源延期","三条虚构任务"],["A · 备注保留","B · 标旧数据","C · 冲突待核","不是静默覆盖"],["草稿不是发送","刷新有成功时间","不确定不重试","后台是本地代码"]],"status":["Mini App是应用承载方式更新，不是基础模型发布。","刷新失败不等于没有任务，应保留旧数据并标记来源时间。","任务C的来源与备注冲突时，两者都保留等待复核。","本地代码以用户身份运行；图示不代表已安装、执行或安全实测。"]}};
  for (const [id,spec] of Object.entries(october23Scenes)) {
    const panel = (rows,x,w) => coveragePanel(x,24,w,110)+coverageText(x+w/2,44,rows[0],true)+rows.slice(1).map((text,i)=>coverageText(x+w/2,68+i*23,text,true)).join('');
    const body = art(panel(spec.panels[0],40,124)+coverageRoute()+panel(spec.panels[1],245,166)+panel(spec.panels[2],484,119));
    scenes[id] = n => ({kind:'evidence',body,title:spec.title,labels:spec.labels,status:spec.status[n % spec.status.length]});
  }

  // October 24: original, evidence-bounded panels; existing scene output is unchanged.
  const october24Scenes = {"kimi-k31-pro-service-weights-speed":{"title":"服务上线、权重交付、任务加速是三件事","labels":["今天可用","稍后交付","完整任务验收"],"panels":[["K3.1 Pro服务","具体入口核对","资格不全相同","不是权重下载"],["11月4日前计划","尚非已完成","许可另核","不提前承诺"],["生成仅一环","工具仍需等待","成本与正确性","一起比较"]],"status":["10月24日是服务发布日，权重交付仍是未来计划。","Code资格与API标识分开核对，不能套用同一配置。","三倍输出速度不等于三倍端到端速度。","图中耗时练习是合成算例，不是模型实测。"]},"memt-memory-state-not-runtime":{"title":"记忆很小，不代表整个模型很小","labels":["历史信息","动态记忆","完整运行资源"],"panels":[["虚构新旧偏好","更新关系","证据在哪里","原文另保留"],["1000万参数","每参数4字节","约40MB算例","只算状态"],["基础模型权重","缓存与激活","框架与服务","不能全部省略"]],"status":["40MB是指定精度下的状态算例，不是模型总显存。","内部记忆不保证逐字恢复原始证据。","关闭自动写入不等于删除或停止读取已有记忆。","研究原型未本站复现，非商业许可须单独审查。"]},"forty-forest-types-probability-boundary":{"title":"一片绿，可能经历不同的土地变化","labels":["树木覆盖","森林类型","证据与时间"],"panels":[["看起来都绿","不能只数面积","重新种植","不等于天然恢复"],["天然林","人工林与种植园","作物与其他地","每类误差不同"],["2020基线","早期年度时序","概率未校准","地面证据另核"]],"status":["地图区分土地类型，不只是判断有没有树。","10米输出网格不保证每处边界都准确到10米。","全球总体表现不能替代各类和各地区的可靠性。","本图是概念示意，未使用真实地块或声称本站测量。"]},"openai-training-containment-offline-world":{"title":"事件发生、恢复运行、对外公告要分开","labels":["事件与处置","环境约束","证据边界"],"panels":[["9月20日事件","限制与暂停","10月1日恢复","10月23日公告"],["离线资料环境","多层隔离","内层失效假设","继续检查外层"],["企业公开自述","非独立认证","非新模型上线","不推断用户产品"]],"status":["事件与公告相隔一段时间，不把公告日当事件日。","离线环境是基础设施控制，不只是提示词约束。","测试发现减少不能证明未来没有漏洞。","本图描述控制逻辑，不提供突破隔离步骤。"]},"flux3-klein-full-memory-license":{"title":"文件大小、运行峰值、许可是三份账","labels":["模型选择","运行资源","验收与许可"],"panels":[["基础或蒸馏","不同数值精度","生成器5.6B","编码器未计入"],["权重只是部分","缓存与中间结果","尺寸和参考图","峰值实际测量"],["只改虚构背景","主体文字不变","商业门槛另核","非本站实测"]],"status":["5.6GB指特定精度生成器权重，不是全部运行显存。","厂商8GB条件不能外推至所有尺寸与多图任务。","蒸馏和量化机制不同，效果分别验收。","开放权重仍受FLUX Kommunity License条件限制。"]},"fev-legacy-spec-baseline-gates":{"title":"现状、假设与批准需求，不自动跳级","labels":["实现证据","意图待确认","基线再推进"],"panels":[["版本B7","大于16拒绝","测试只查17","现状不是需求"],["产品上限未知","16能否接收","边界需补证","保留问题清单"],["维护者确认","语义与追踪审查","批准后生成测试","不把猜测入基线"]],"status":["合成实现含16字节判断，不能据此声称产品已批准该上限。","长度17被拒绝，只支持这一测试观察，不证明全部合法输入正常。","模型语法与追踪链接通过，仍要检查证据是否支持对应语义。","这是一份原创纸面练习，不是FEV客户工程或本站复现。"]},"grab-hubble-doc-review-metrics":{"title":"有说明、已审核、内容正确，分开看","labels":["字段与缺口","草稿与审核","不同指标"],"panels":[["金额12.50","币种未提供","时间没有时区","状态2含义未知"],["10张关键表","原有2张已审","新增7张草稿","其中3张已审"],["覆盖90%","已审50%","正确率仍未知","不是同一指标"]],"status":["虚构字段只提供值与类型，不足以推断币种、时区或业务状态。","生成说明必须留下未知项，不能让流畅文字掩盖缺失契约。","合成计数的覆盖率是90%，已审覆盖率是50%，正确率不能反推。","Grab自报效果不是本站实测；搜索体验也受排序等其他改动影响。"]},"redhat-code-docs-review-selection":{"title":"从差异找影响，不顺手改全库","labels":["虚构代码变化","受影响文档","最小补丁验收"],"panels":[["新装默认3改0","升级保留旧值","0含义未给出","别猜禁用语义"],["快速入门","参数参考","迁移说明","引脚文档不动"],["逐段给依据","检查复制示例","保留未知项","人工审查PR"]],"status":["默认值变化与旧配置迁移是两件事，文档应分别说明。","先审候选文件再生成最小补丁，不把无关润色混进变更。","所读工具允许直接运行完整流程，两阶段审批不是天然强制保证。","本图只解释合成差异，未部署工具或创建真实PR。"]},"anthropic-proof-scope-binary-contract":{"title":"读清证明契约，再判断能保证什么","labels":["具体产物","有条件的性质","仍待验证"],"panels":[["二进制B1","固定入口","模型与预算","版本必须对应"],["排除列出错误","不是所有正确性","未证明终止","不是实时保证"],["改变后B2","协议字段含义","MCU中断DMA","需要另外证据"]],"status":["主实验123库239入口与公开仓库25库60入口不能混为同一集合。","当前公开材料没有终止证明，不应概括成所有输入必然正常退出。","二进制、入口、模型和预算限定了结论，换平台不能直接套用。","本图为纸面契约练习，本站未运行Rocq或复现研究结果。"]}};
  for (const [id,spec] of Object.entries(october24Scenes)) {
    const panel = (rows,x,w) => coveragePanel(x,24,w,110)+coverageText(x+w/2,44,rows[0],true)+rows.slice(1).map((text,i)=>coverageText(x+w/2,68+i*23,text,true)).join('');
    const body = art(panel(spec.panels[0],40,124)+coverageRoute()+panel(spec.panels[1],245,166)+panel(spec.panels[2],484,119));
    scenes[id] = n => ({kind:'evidence',body,title:spec.title,labels:spec.labels,status:spec.status[n % spec.status.length]});
  }

  // October 25: original, evidence-bounded panels; existing scene output is unchanged.
  const october25Scenes = {"hy-nomas-interactive-video-memory-budget":{"title":"连续生成，也要记忆预算","labels":["跨段控制","单卡取舍","分开验收"],"panels":[["先定角色与环境","下一段改动作","单独记录相机","保留其他对象"],["量化权重与缓存","历史窗口有界","模型按阶段卸载","传输也耗时间"],["检查指令生效","检查对象保留","测量生成等待","别混淆播放帧率"]],"status":["已核代码与权重目录","10月23日为权重提交日","单卡路径有资源取舍","图解非样片，未实测"]},"canva-craft-layout-editability-release":{"title":"从构图规划到可编辑交付","labels":["先规划","再转换","核状态"],"panels":[["标题与主体","相对位置","文字内容","信息层级"],["生成图像","转换设计元素","检查可修改对象","复查文字与遮挡"],["主模型已宣布开放","快版属于后续","MCP条目标待推出","额度与费用另核"]],"status":["公告日期10月22日","两阶段架构为厂商描述","图层转换需独立验收","原创图解，非效果样张"]},"openai-decisions-ga-bounded-routing":{"title":"把短答案接到可靠下一步","labels":["定义问题","读取结果","控制后果"],"panels":[["条件是否成立","从预设选项选择","按有序等级评分","独立问题可合并"],["概率不是承诺","加权分不是类别","类别之外留兜底","前后依赖分请求"],["标注样本定阈值","计算误判代价","低把握转人工","记录完整任务成本"]],"status":["10月22日正式开放","当前使用GPT-6 Luna","速度数字为厂商报告","仅纸面分析，未调用"]},"agent-skills-aaif-governance-portability":{"title":"格式共享，执行边界分开","labels":["标准治理","具体技能","宿主执行"],"panels":[["名称与标志移交","组织与域名移交","无需加入基金会","路线图仍是提案"],["核作者与来源","锁定版本","审脚本和依赖","逐项检查许可"],["核实际工具集合","核环境兼容性","核越界处理","核最终任务结果"]],"status":["10月22日移交公告","基金会归属不是认证","格式兼容不等于权限一致","原创图解，未安装技能"]},"spark-x26-4b-edge-thinking-runtime":{"title":"小模型也要分三本账","labels":["准确型号","思考预算","运行条件"],"panels":[["锁定X2.6-4B","旧版同架构","改进来自后训练","不混用云端规格"],["无需思考","较低思考预算","较高思考预算","同任务比较结果"],["权重内存","上下文缓存","运行时和依赖","外部工具权限"]],"status":["仓库记全球开放10月21日","官方模型卡列Apache-2.0","百万上下文需足够内存","未安装、未运行、待学习"]},"meta-getafix-contextual-patch-contract":{"title":"告警消失后，收尾责任还在吗","labels":["候选A：早返回","候选B：跳发送","候选C：统一收尾"],"panels":[["锁已取得","空值立即返回","遗漏解锁","遗漏完成通知"],["空值不发送","解锁一次","通知一次","却错报OK"],["分支定状态","非空才发送","解锁一次","通知一次"]],"status":["合成契约要求每次解锁一次、通知一次，空值必须报告BAD_ARGUMENT。","A消除空指针风险，却跳过收尾；B保住收尾，却把错误状态改成成功。","C只是按本题简化契约可进入测试，不能据此认定并发或真实硬件正确。","Getafix是历史修复模式学习方法；本图不是公司代码或运行记录。"]},"nvidia-chipnemo-private-api-attempt-budget":{"title":"接口契约和尝试预算，分成两份账","labels":["虚构工具G3","给定路径结果","四题合成台账"],"panels":[["只读查询","检查setup路径","单位为ns","最多返回三条"],["P1：−0.12ns","P2：−0.05ns","P3：+0.03ns","只保留前两条"],["首次成功2/4","五次内成功3/4","提前停止10次","非实际运行"]],"status":["负裕量只有两条，不能为凑满三条而纳入正值或编造路径。","只读查询不允许改设计；资料没有的函数不能靠模型猜出来。","四题固定样例的首次成功为50%，五次内至少一个通过为75%，分母含义不同。","图中台账仅解释尝试预算，不是ChipNeMo论文数据或本站实测。"]},"uber-querygpt-schema-pruning-semantic-check":{"title":"两项任务，为什么会被查成五行","labels":["先定任务口径","检查连接粒度","核验答案含义"],"panels":[["每任务一行","B9版本成功","UTC启动日期","应计J1与J3"],["J1有3条事件","J3有2条事件","连接后共5行","任务仍只有2个"],["语法可运行","聚合有结果行","计数0也可能错","须对照真值"]],"status":["虚构问题只需任务表；任务数是2，事件连接后的5行不是5个任务。","列裁剪要保留版本、状态和启动时间，不只留下最终显示的计数。","不带GROUP BY的COUNT在无匹配时仍可返回一行0，有输出行不等于语义正确。","合成记录不来自Uber，图解未连接数据库或执行查询。"]}};
  for (const [id,spec] of Object.entries(october25Scenes)) {
    const panel = (rows,x,w) => coveragePanel(x,24,w,110)+coverageText(x+w/2,44,rows[0],true)+rows.slice(1).map((text,i)=>coverageText(x+w/2,68+i*23,text,true)).join('');
    const body = art(panel(spec.panels[0],40,124)+coverageRoute()+panel(spec.panels[1],245,166)+panel(spec.panels[2],484,119));
    scenes[id] = n => ({kind:'evidence',body,title:spec.title,labels:spec.labels,status:spec.status[n % spec.status.length]});
  }

  // October 26: original explanatory panels; previous scene output stays exact.
  const october26Scenes = {"hy-memory-writer-context-boundary":{"title":"记忆写入：范围、状态与证据","panels":[["原记录","默认串口","本周例外"],["写入者","保留范围","不加推断"],["长期状态","默认仍在","临时另存"]],"labels":["输入记录","更新判断","分范围保存"],"status":["写入者维护记忆，不包办检索与回答。","固定其他组件，才看得清更换写入者的贡献。","基础上下文配置不等于最佳训练分块。","示意为合成验收设计，不是模型实测。"]},"qwen-blenderworld-editable-scene-evaluation":{"title":"三维交付：好看、可改与完整","panels":[["任务输入","参考画面","尺寸规格"],["两类交付","可编辑工程","指定导出物"],["验收证据","结构检查","视觉评分","失败留分母"]],"labels":["要求","交付","分别验收"],"status":["漂亮图片不能单独证明三维结构可编辑。","工程、纹理依赖与导出物需要分别齐全。","失败记零并留在分母，不只统计成功作品。","这是原理解说，不是已运行的评测成绩。"]},"eleven-realtime-websocket-platform-boundary":{"title":"语音迁移：协议、音频与平台","panels":[["原应用","WebRTC","知识库渠道"],["迁移核对","WebSocket","PCM16音频","短期凭证"],["独立验收","数字修正","平台能力","alpha范围"]],"labels":["现有依赖","连接变化","实际边界"],"status":["SDK兼容不代表WebRTC传输原样可用。","直接API不自动携带ElevenAgents平台能力。","实时语音模型与企业翻译alpha是两条产品线。","合成纠错用例尚未执行，不冒充通话实测。"]},"nxp-staged-uart-context-premise":{"title":"先核硬件前提，再逐层增加复杂度","labels":["接口前提","分层检查","合成DMA快照"],"panels":[["精确器件型号","核对主机总线","参考规格章节","冲突先澄清"],["基本收发","空闲事件","再接DMA","保留旧检查"],["容量8字节","剩余5字节","本轮写入3字节","限定无回卷"]],"status":["NXP笔记提出逐层验证；其中MPU6050与SPI的提示示例不能直接照搬。","TDK规格区分MPU6000和MPU6050，芯片型号相近不表示接口相同。","合成快照仅在无回卷、无重装载且接收停止的条件下，计算8−5=3字节。","图示不是实测波形或驱动运行结果；真实中断、溢出和硬件仍需单独验证。"]},"stripe-harbor-comment-anchor-version":{"title":"页面变了，旧批注不能偷偷换对象","labels":["保留原身份","重新判定锚点","保留版本账"],"panels":[["版本v1","对象O17","稳定ID","文字与上下文"],["A：可以附着","B：语义需复核","C：坐标需复核","D：目标已移除"],["附着不等于解决","保留v1来源","v2确认另留痕","不静默改写历史"]],"status":["本图使用虚构订单与批注，解释身份、语义、版本三种不同检查。","A身份与语义一致可以附着；B即使ID不变，责任改变也必须复核。","只有行坐标的C不能可靠定位；目标删除的D应保留失去锚点状态。","定位成功不代表意见已采纳；这不是Harbor实测或其内部评分器复刻。"]},"stripe-kai-task-context-isolation":{"title":"账号能读取，不等于本任务能混用","labels":["可读取资料","任务A的范围","输出前检查"],"panels":[["F1：项目A","F2：项目B","F3：通用术语","均为虚构材料"],["允许F1事实","允许必要F3","排除F2证据","缺失标待确认"],["核对引用归属","核对旧摘要","核对缓存草稿","新任务重新定界"]],"status":["Stripe的Kai案例强调任务上下文边界；本图不复刻内部隔离实现。","合成题允许分析A与通用参考，因此读取权限不能自动扩成混用B的许可。","F2引用准确也不能拿来解释A；缺少A证据时应留白而不是借别项补齐。","旧摘要、缓存与中间草稿同样要检查；图示不是平台安全测试或认证。"]}};
  for (const [id,spec] of Object.entries(october26Scenes)) {
    const panel = (rows,x,w) => coveragePanel(x,24,w,110)+coverageText(x+w/2,44,rows[0],true)+rows.slice(1).map((text,i)=>coverageText(x+w/2,68+i*23,text,true)).join('');
    const body = art(panel(spec.panels[0],40,124)+coverageRoute()+panel(spec.panels[1],245,166)+panel(spec.panels[2],484,119));
    scenes[id] = n => ({kind:'evidence',body,title:spec.title,labels:spec.labels,status:spec.status[n % spec.status.length]});
  }

  // October 30: original article-specific explanatory panels; no external execution.
  const october30Scenes = {"qwen-code-pr-local-state-attribution":{"title":"自动修复先过三道检查","labels":["① 先看本地","② 再看差异","③ 留下依据"],"panels":[["远端：B","B → C未推送","parser.c：未提交","结论：暂停自动修复"],["T1：A✓ / B✓","T2：A✓ / B越界","T3：A断连 / B断连","只把T2列为新差异"],["基线 / PR头SHA","相同输入与环境","日志位置与退出状态","未证明根因单列"]],"status":["本地比远端多出的提交和未提交文件仍是作者的工作，自动修复应先停下来。","基线和PR都出现的断连，先记为共有环境阻塞。","PR才出现的失败需要继续调查，不能直接补写根因。","结论绑定版本、输入与日志，整个图仅示意审查流程。"]},"gemini4-carbon-restricted-rollout-boundary":{"title":"Carbon选型的三层状态","labels":["① 已有公告","② 当前访问","③ 选型待办"],"panels":[["网络安全与长任务","厂商公布评测结果","不是本站复现"],["部分网络防御者","Fairwind可信伙伴","通用接入：待后续"],["团队访问确认","固定任务验收","介绍期 / 常规价","审批继续保留"]],"status":["模型公告提供候选信息，尚不能证明你的账号已能调用。","初期访问优先面向部分防御者和可信伙伴，通用接入仍待后续。","预算同时保留介绍期与常规单价，不自填优惠结束时间。","零攻击成功率属于特定评测，不是生产权限控制的替代物。"]},"gemini-files-inline-review-export":{"title":"文件编辑的三段验收","labels":["① 定义修改","② 选择入口","③ 验收交付"],"panels":[["周二 → 周四","预算12万元：保留","负责人：保留","两项风险：仍待确认"],["PDF：网页 + 移动","其他所列格式：网页","先核当前账号与端"],["PDF：完整、清晰","演示：结构可编辑","事实逐项对照","暂不共享或发送"]],"status":["修改范围只有日期，金额、负责人和风险状态需要保持。","PDF与其他文件格式的内联预览编辑支持范围不同。","聊天预览与实际导出文件分开检查，不能用前者代替后者。","图中展示的是合成工作流，不代表已生成或发送真实文件。"]},"openai-model-spec-intent-correctable-assumptions":{"title":"当前意图与行动边界","labels":["① 当前要求","② 历史线索","③ 行动闸门"],"panels":[["比较A与B","实操值得投入一天","暂时不要报名"],["过去偏好短活动","说明引用依据","允许用户修正"],["补齐课程资料","保留两项选择","报名需新授权","不伪造执行结果"]],"status":["本次明确要求优先用于理解当前任务，旧偏好只是可纠正的线索。","代理应说明关键假设，不能静默删掉一个选项。","比较、准备和提交具有不同后果，授权范围需要逐步检查。","规范描述目标行为；本图是评审设计，不是模型遵循率的实测。"]},"uber-policy-tables-retrieval-context":{"title":"表格检索先保住关系","labels":["① 原表有条件","② 碎片丢关系","③ 入库前验收"],"panels":[["甲区 / 日志 / 7天","冻结时暂停删除","乙区 / 日志 / 30天","合同例外交人工"],["日志 · 7 · 30","地区不见了","例外脱离对应行","不能直接回答"],["重复必要表头","保留R1/R2与版本","数值连着适用条件","回查原始位置"]],"status":["教学表中同一种记录在不同地区具有不同条件，数值必须连着行列关系。","只留下关键词和数字，会让检索命中错误的答案材料。","必要表头、例外和来源标识应随检索块保留，缺失事实不能由模型补写。","先验抽取，再验召回，最后验答案；本图不是Uber真实政策或测评结果。"]},"gpt61-terra-long-context-cost":{"title":"跨过门槛，整次请求重新计价","labels":["固定条件","分别计算","验收总成本"],"panels":[["Standard纸面题","无缓存、无工具","输出均为10K"],["A：输入270K","$0.27 + $0.05","$0.32"],["B：输入280K","$0.56 + $0.075","$0.635"]],"status":["A未超过272K输入门槛，按普通Standard费率计算。","B超过门槛后整次输入乘2、输出乘1.5，不只加价超出部分。","两题均排除缓存、工具、区域、重试和人工验收成本。","图解是纸面预算，未调用模型或产生账单。"]},"nordic-ppk2-power-functional-contract":{"title":"先过功能门槛，再比较功耗","labels":["共同条件","方案A","方案B"],"panels":[["1000秒测量窗","必须1000条UART","基线1.20mA"],["平均0.80mA","只收到900条","功能未通过"],["平均0.95mA","1000条完整","下降约20.83%"]],"status":["UART是产品硬要求，不能靠关闭它获取更低电流。","A只有900条记录，平均电流更低也不能通过功能验收。","B通过题给功能条件；供电、峰值、时序与长期稳定性仍需实际检查。","所有数字均为合成纸面练习，不是Nordic测量结果。"]},"edenlive-state-render-license-split":{"title":"状态、外观、组件许可分开核对","labels":["固定状态","只改外观","分组件核查"],"panels":[["2秒门开启","3秒角色通过","三个箱子"],["白天换夜晚","路径保持","事件时间保持"],["第一方代码","DINOv3编码器","FLUX首帧工作台"]],"status":["上游程序维护规则，生成渲染负责画面外观。","夜景改写要保留事件时刻、路径与物体数量；图示是合成验收。","RTX 5090加速、80GB验证环境与B200集成是不同部署路径。","FLUX仅供工作台首帧，视频管线不加载；每个实际组件仍需分别核许可。"]}};
  for (const [id,spec] of Object.entries(october30Scenes)) {
    const panel = (rows,x,w) => coveragePanel(x,24,w,110)+coverageText(x+w/2,44,rows[0],true)+rows.slice(1).map((text,i)=>coverageText(x+w/2,68+i*23,text,true)).join('');
    const body = art(panel(spec.panels[0],40,124)+coverageRoute()+panel(spec.panels[1],245,166)+panel(spec.panels[2],484,119));
    scenes[id] = n => ({kind:'evidence',body,title:spec.title,labels:spec.labels,status:spec.status[n % spec.status.length]});
  }

  /* Small, authored optical accents follow the information in each illustration.
   * No random particle field, timers, canvas, filters, SMIL or external assets.
   * Everything animated shares the existing viewport observer's fv-animated hook. */
  let renderSerial = 0;
  let scanSerial = 0;
  const effectDefs = `<defs>
    <radialGradient id="fv-fx-amber"><stop stop-color="#e6ba72" stop-opacity=".72"/><stop offset=".38" stop-color="#d6a35d" stop-opacity=".3"/><stop offset="1" stop-color="#d6a35d" stop-opacity="0"/></radialGradient>
    <radialGradient id="fv-fx-sage"><stop stop-color="#adc59a" stop-opacity=".7"/><stop offset=".4" stop-color="#99b185" stop-opacity=".24"/><stop offset="1" stop-color="#99b185" stop-opacity="0"/></radialGradient>
    <linearGradient id="fv-fx-scan" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d7aa67" stop-opacity="0"/><stop offset="1" stop-color="#d7aa67" stop-opacity=".28"/></linearGradient>
    <linearGradient id="fv-fx-daylight" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff4c5" stop-opacity=".45"/><stop offset="1" stop-color="#fff4c5" stop-opacity="0"/></linearGradient>
  </defs>`;
  const glow = (x,y,rx,ry,tone='sage',detail=false) => `<ellipse class="fv-fx-glow${detail?' fv-fx-detail':''}" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#fv-fx-${tone})"/>`;
  const contour = d => `<path class="fv-fx-contour fv-fx-detail" d="${d}"/>`;
  const flow = (d, {tone='sage',period=7,delay=0,count=2,detail=false,quiet=false}={}) => {
    const timing = `--signal-period:${period}s;--fv-delay:${delay}s`;
    return `<g class="fv-flow fv-flow-${tone}${detail?' fv-fx-detail':''}${quiet?' fv-flow-quiet':''}" style="${timing}">
      <path class="fv-flow-track" d="${d}"/>
      <path class="fv-animated fv-flow-trail" pathLength="100" d="${d}"/>
      ${Array.from({length:count},(_,i)=>`<g class="fv-animated fv-flow-runner${i>1?' fv-fx-detail':''}" style="--fv-path:path('${d}');--fv-delay:${delay-i*period/count}s">
        <circle class="fv-particle-halo" r="8" fill="url(#fv-fx-${tone})"/>
        <circle class="fv-particle-core" r="2.3"/><circle class="fv-particle-light" cx="-.6" cy="-.7" r=".7"/>
      </g>`).join('')}
    </g>`;
  };
  const pulse = (x,y,r,{tone='sage',period=7,delay=0,detail=false}={}) => `<g class="fv-signal-pulse fv-flow-${tone}${detail?' fv-fx-detail':''}" transform="translate(${x} ${y})" style="--signal-period:${period}s;--fv-delay:${delay}s"><circle class="fv-animated fv-pulse-ring" r="${r}"/><circle class="fv-pulse-seat" r="${r*.82}"/></g>`;
  const scan = (x,y,w,h,{period=8,delay=0,detail=false}={}) => {
    const id = `fv-scan-window-${++scanSerial}`;
    return `<g class="fv-optical-scan${detail?' fv-fx-detail':''}" transform="translate(${x} ${y})" style="--signal-period:${period}s;--fv-delay:${delay}s;--fv-scan-span:${h}px"><defs><clipPath id="${id}"><rect width="${w}" height="${h}" rx="2"/></clipPath></defs><g clip-path="url(#${id})"><g class="fv-animated fv-scan-pass"><rect y="-14" width="${w}" height="14" fill="url(#fv-fx-scan)"/><path class="fv-scan-edge" d="M0 0H${w}"/></g></g></g>`;
  };
  const accents = {
    balance: () => ({
      back:glow(320,88,106,65)+contour('M151 35Q320-4 489 35M151 40v-9m338 9v-9'),
      front:flow('M174 120C207 146 246 149 282 126',{period:9,tone:'sage'})+flow('M466 120C433 146 394 149 358 126',{period:9,delay:-4.5,tone:'amber'})+pulse(342,105,17,{period:9,delay:-3})+flow('M202 28Q320 9 438 28',{period:12,count:1,detail:true,quiet:true})
    }),
    migration: () => ({
      back:glow(464,80,80,68)+contour('M414 21h96M414 139h96'),
      front:flow('M133 43H221Q242 43 242 65V80H285',{period:8,tone:'amber'})+flow('M133 119H221Q242 119 242 97V80H285',{period:8,delay:-4,count:1})+flow('M505 80H558',{period:8,delay:-5,count:1})+pulse(303,79,23,{tone:'amber',period:8,delay:-4,detail:true})+scan(440,57,46,46,{period:8,delay:-4,detail:true})
    }),
    multimodal: () => ({
      back:glow(441,86,64,48,'amber')+contour('M49 146h321m-292-3v6m73-6v6m73-6v6m73-6v6'),
      front:`<g class="fv-animated fv-playhead fv-fx-detail"><rect x="145" y="29" width="15" height="96" fill="url(#fv-fx-daylight)"/></g>`+flow('M392 60H424Q439 60 439 75V87H459',{tone:'amber',period:10})+flow('M392 105H424Q439 105 439 92V87H459',{period:10,delay:-4,count:1})+pulse(481,46,11,{period:10,delay:-7})+scan(478,91,99,22,{period:10,delay:-6,detail:true})
    }),
    landscape: () => ({
      back:'',
      front:`<defs><clipPath id="fv-fx-sky-only"><path d="M34 8H606V82L537 106 459 75 364 111 285 45 200 105 120 60 34 118Z"/></clipPath></defs><g clip-path="url(#fv-fx-sky-only)">
        <g class="fv-animated fv-sky-light"><path class="fv-sun-ray" fill="url(#fv-fx-daylight)" d="M407 25 275 113 332 120 430 38Z"/><path class="fv-sun-ray fv-fx-detail" fill="url(#fv-fx-daylight)" d="m423 24 118 91-35 12-98-89Z"/>${glow(409,52,102,61,'amber')}</g>
        <g class="fv-animated fv-sky-haze"><path class="fv-haze-stroke" d="M67 44q60-13 125-7M469 33q59-7 109 5"/></g>
        ${flow('M344 29Q397 9 465 41',{tone:'amber',period:15,count:2,quiet:true})}${flow('M484 62Q446 35 394 25',{tone:'amber',period:18,count:1,quiet:true,detail:true})}
      </g>`
    }),
    evidence: () => ({
      back:glow(327,78,118,69)+contour('M234 142h174M242 18h8m147 0h8'),
      front:flow('M164 73H238',{period:10})+flow('M412 74H480',{period:10,delay:-5,tone:'amber'})+scan(497,44,67,43,{period:10,delay:-5,detail:true})+flow('M525 143V149H126V135',{period:12,delay:-5,count:1,detail:true,quiet:true})
    }),
    terminal: () => ({
      back:glow(433,80,74,66,'amber')+contour('M379 18h105M379 140h105'),
      front:scan(47,44,270,87,{period:7,delay:-2})+flow('M332 78H388',{period:7,count:2})+flow('M473 79H496',{period:8,delay:-3,tone:'amber',count:1})+pulse(520,79,23,{tone:'amber',period:8,detail:true})
    }),
    browser: () => ({
      back:glow(357,79,64,61)+contour('M448 21h9m-9 115h9'),
      front:scan(65,56,224,63,{period:9,delay:-2})+flow('M329 79H359V48H390',{period:9,count:1})+flow('M329 79H390',{period:9,delay:-3,count:1})+flow('M329 79H359V110H390',{period:9,delay:-6,count:1,detail:true})+flow('M434 79H461',{tone:'amber',period:9,delay:-6,count:1})+pulse(553,107,17,{period:9,delay:-6,detail:true})
    }),
    skill: () => ({
      back:glow(354,80,119,61)+contour('M271 119h166M293 112v14m61-14v14m61-14v14'),
      front:flow('M265 80H478',{period:9,tone:'amber',count:2})+pulse(293,80,28,{period:9})+pulse(354,80,28,{period:9,delay:-3,detail:true})+pulse(415,80,28,{period:9,delay:-6,detail:true})+scan(513,51,61,53,{period:11,delay:-5,detail:true})
    }),
    embedded: () => ({
      back:glow(285,39,79,38)+contour('M234 7h101M426 23h109'),
      front:flow('M124 82H174V38H243',{period:10,count:2,tone:'amber'})+flow('M325 38H372V82H434',{period:10,delay:-4,count:2})+flow('M574 105V149H82V134',{period:12,delay:-5,count:2,detail:true,quiet:true})+pulse(216,122,18,{tone:'amber',period:10,detail:true})
    }),
    replay: () => ({
      back:glow(315,78,94,64)+contour('M226 16h167M240 21v-9m140 9v-9'),
      front:flow('M198 100H231V82H258',{period:12,tone:'amber',count:2})+flow('M383 82H472',{period:12,delay:-5,count:2})+scan(491,52,95,41,{period:12,delay:-6,detail:true})+pulse(554,60,15,{tone:'amber',period:12,delay:-7,detail:true})
    }),
    fuzz: () => ({
      back:glow(309,79,105,67,'amber')+contour('M231 23h162M231 132h162'),
      front:flow('M151 53Q174 53 187 78H239',{period:8,count:1,tone:'amber'})+flow('M151 96Q175 96 187 78H239',{period:8,delay:-4,count:1})+flow('M383 79H432V41H493',{period:9,delay:-2,count:1})+flow('M383 79H493',{period:9,delay:-5,count:1})+flow('M525 117H549',{period:11,delay:-6,count:1,tone:'amber',detail:true})+pulse(582,77,15,{period:11,tone:'amber',detail:true})
    }),
    probe: () => ({
      back:glow(204,83,57,66,'amber')+contour('M493 29h120M493 137h120'),
      /* The only moving request path ends before the locked permission boundary. */
      front:flow('M144 83H182',{period:8,count:2,tone:'amber'})+pulse(205,83,24,{tone:'amber',period:8})+scan(249,51,68,48,{period:10,delay:-3,detail:true})+`<path class="fv-fx-contour fv-fx-detail" d="M347 139h132m-66-4v8"/>`
    }),
    registers: () => ({
      back:glow(317,76,94,65)+contour('M242 16h150M242 137h150'),
      front:scan(62,64,115,49,{period:9})+flow('M194 72H245',{period:9,count:2,tone:'amber'})+flow('M384 73H439',{period:9,delay:-4,count:2})+flow('M520 61H536',{period:9,delay:-5,count:1,detail:true,quiet:true})+flow('M520 83H536',{period:9,delay:-7,count:1,detail:true,quiet:true})+`<rect class="fv-animated fv-conflict-outline fv-fx-detail" x="534" y="94" width="57" height="23" rx="4"/>`
    }),
    edgeai: () => ({
      back:glow(246,81,64,67,'amber')+contour('M207 133h201M219 129v8m181-8v8'),
      front:flow('M189 80H216',{period:10,tone:'amber',count:2})+flow('M273 81H291',{period:10,delay:-4,count:2})+flow('M189 54Q202 54 216 74',{period:10,count:1,tone:'amber',detail:true})+flow('M189 103Q202 103 216 88',{period:10,delay:-5,count:1,detail:true})+`<g class="fv-animated fv-budget-focus fv-fx-detail"><rect class="fv-budget-aura" fill="url(#fv-fx-sage)" x="452" y="16" width="151" height="40" rx="8"/></g>`
    }),
    contract: () => ({
      back:glow(241,79,66,62,'amber')+glow(388,76,65,61,'sage',true),
      front:`<g class="fv-animated fv-contract-scan"><rect x="208" y="43" width="66" height="18" fill="url(#fv-fx-scan)"/></g>`+flow('M138 123H196',{period:15,delay:-3,count:1,tone:'amber'})+flow('M286 123H336',{period:15,delay:-7,count:1})+flow('M440 123H504',{period:15,delay:-10,count:1,tone:'amber'})+pulse(388,48,19,{period:15,delay:-7,detail:true})+scan(518,49,57,29,{period:15,delay:-11,detail:true})
    }),
    documents: () => ({
      back:glow(313,80,104,66)+contour('M450 17v120m144-120v120M444 44h12m132 0h12M444 89h12m132 0h12'),
      front:flow('M163 80H240',{period:10,count:2})+flow('M385 80H458',{period:10,delay:-5,tone:'amber',count:2})+scan(475,42,96,82,{period:10,delay:-4,detail:true})+flow('M523 144V152H309V138',{period:13,delay:-7,count:1,detail:true,quiet:true})
    })
  };
  /* Each new scene has exactly four runners. They trace information transfer,
   * never a successful answer or an automatically approved reuse decision. */
  accents.searchfetch = () => ({
    back:glow(327,72,99,59)+contour('M35 124h572'),
    front:flow('M183 70H250',{period:10,count:2})+flow('M403 70H470',{period:10,delay:-5,tone:'amber',count:2})+scan(270,70,114,38,{period:10,delay:-4,detail:true})
  });
  accents.supportnotes = () => ({
    back:glow(350,82,102,65)+contour('M279 84h142'),
    front:flow('M183 45H217Q233 45 233 61V64H267',{period:11,count:2})+flow('M183 116H217Q233 116 233 108H267',{period:11,delay:-5.5,tone:'amber',count:2})
  });
  function illuminate(body,kind) {
    const layers=accents[kind] ? accents[kind]() : {back:'',front:''};
    const marked=body.replace(/(<svg\b[^>]*>)/,`$1${effectDefs}<g class="fv-optical-depth" aria-hidden="true">${layers.back}</g>`).replace('</svg>',`<g class="fv-optical-signals" aria-hidden="true">${layers.front}</g></svg>`);
    /* Feed and article can coexist while one route is hidden. Scope every SVG
     * gradient and clip ID per render, including the original landscape defs. */
    const namespace=`fv-render-${++renderSerial}-`;
    return marked.replace(/\bid="([^"]+)"/g,(_,id)=>`id="${namespace}${id}"`).replace(/url\(#([^)]+)\)/g,(_,id)=>`url(#${namespace}${id})`);
  }

  window.FieldnoteVisuals = Object.freeze({
    render(p) {
      if (!p || !scenes[p.id]) return '';
      const scene = scenes[p.id](0);
      // Every authored explanation remains available without operating a demo.
      const notes = [...new Set([0, 1, 2, 3].map(n => scenes[p.id](n).status))];
      const noteCount = notes.length;
      const rotating = noteCount === 2 || noteCount === 4;
      const noteList = notes.map(note => `<li>${escape(note)}</li>`).join('');
      const reading = rotating ? `<div class="fv-note-window" aria-hidden="true" data-note-count="${noteCount}">${notes.map((note, index) => `<div class="fv-note fv-animated" style="animation-delay:-${(noteCount - index) * 6}s"><span class="fv-note-index">${String(index + 1).padStart(2, '0')} / ${String(noteCount).padStart(2, '0')}</span><span>${escape(note)}</span></div>`).join('')}</div>` : '';
      const accessibleNotes = `<ol class="fv-note-list${rotating ? ' fv-note-transcript' : ''}" aria-label="图解要点">${noteList}</ol>`;
      const id = escape(p.id);
      const disclaimer = scene.kind === 'landscape' ? '原创编辑流程示意，非模型效果样张' : '原创流程示意，非官方演示或实测结果';
      return `<div class="visual fv-visual motion-scene fv-${scene.kind}" id="visual-${id}"><div class="fv-heading"><strong>${escape(scene.title)}</strong><span class="fv-illustration-note">现场图解</span></div><div class="fv-stage">${illuminate(scene.body,scene.kind)}${labels(scene.labels)}</div><div class="fv-footer">${reading}${accessibleNotes}</div><p class="fv-caption">${disclaimer}</p></div>`;
    }
  });
})();
