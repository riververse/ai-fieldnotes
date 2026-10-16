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
