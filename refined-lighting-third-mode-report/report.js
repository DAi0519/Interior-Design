
  (()=>{
    'use strict';
    const $=id=>document.getElementById(id), make=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n;};
    const legacyModes=[{key:'prompt-only',label:'仅提示词'},{key:'prompt-and-reference',label:'提示词＋参考图'}];
    const statusLabels={success:'已归档',failed:'流程失败','sync-failed':'结果同步失败',retrying:'流程重试中',queued:'待完成',held:'已开始 · 暂挂核查',missing:'缺少结果记录'};
    const finalStates=new Set(['failed','sync-failed','missing']);
    const num=n=>Number.isFinite(Number(n))?Number(n):0;
    const seconds=n=>n===null||n===undefined||!Number.isFinite(Number(n))?'未知':`${(Number(n)/1000).toFixed(1)}秒`;
    const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'||u.protocol==='http:'?u.href:null;}catch{return null;}};
    const imageUrl=image=>image&&typeof image.dataUrl==='string'&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(image.dataUrl)?image.dataUrl:null;
    let data;
    try{data=JSON.parse($('report-data').textContent);if(data.version!==1||!Array.isArray(data.records)||!data.samples?.length||!data.presets?.length||!data.models?.length)throw new Error('报告数据缺少必要字段');}
    catch(error){$('report').replaceChildren(make('p','fatal',`报告数据无法读取：${error.message}。请重新采集数据后构建报告。`));return;}
    const modeRows=data.modes||legacyModes,modes=modeRows.map(row=>[row.key,row.label]);
    document.documentElement.dataset.modeCount=String(modes.length);
    const cohorts=data.cohorts||[],cohortMap=new Map(cohorts.map(row=>[row.id,row]));
    const state={sampleId:data.samples[0].id,presetId:data.presets[0].id,models:new Set(data.models.map(m=>m.key)),dialogModel:null,dialogView:'pair'};
    const recordMap=new Map(data.records.map(r=>[JSON.stringify([r.sampleId,r.presetId,r.modelKey,r.execution]),r]));
    const sample=()=>data.samples.find(s=>s.id===state.sampleId),preset=()=>data.presets.find(p=>p.id===state.presetId);
    const record=(key,mode)=>recordMap.get(JSON.stringify([state.sampleId,state.presetId,key,mode]));
    const exclusion=(key,mode)=>(data.exclusions||[]).find(row=>row.modelKey===key&&row.execution===mode
      &&(!row.sampleId||row.sampleId===state.sampleId)&&(!row.presetId||row.presetId===state.presetId));
    const addFact=(parent,text,className)=>parent.append(make('span',className,text));
    function link(url,label){const href=safeUrl(url);if(!href)return null;const a=make('a','',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;}
    function openAsset(image,title){const url=imageUrl(image);if(!url)return;$('asset-dialog-title').textContent=title;$('asset-dialog-image').src=url;$('asset-dialog-image').alt=title;$('asset-dialog').showModal();}
    function contextImage(parent,image,title){const url=imageUrl(image);parent.replaceChildren();if(!url){parent.append(make('span','context-empty','原图预览尚未采集'));return;}const b=make('button');b.type='button';b.setAttribute('aria-label',`放大${title}`);const img=make('img');img.src=url;img.alt=title;img.decoding='async';b.append(img);b.addEventListener('click',()=>openAsset(image,title));parent.append(b);}
    function renderHeader(){
      $('report-title').textContent=data.title||'精模光影对比报告';document.title=$('report-title').textContent;
      $('scope').textContent=`${data.samples.length} 张底图 · ${data.presets.length} 个目标风格 · ${data.models.length} 个模型 · ${modes.length} 种模式 · 计划${data.expected}项`;
      const names={planned:'补充测试待开始',running:'任务进行中',complete:'任务已结束','finished-with-errors':'任务结束，存在未完成项',blocked:'任务需要处理'};
      $('run-state').dataset.state=data.status;$('state-copy').textContent=names[data.status]||'任务状态待核实';
      const progress=data.progress||{},expected=num(data.expected)||data.records.length;
      const metrics=[['已归档',progress.synced],['已生成',progress.generated],['失败／缺失',progress.failed],['待完成',progress.pending]];if(progress.held)metrics.push(['其中暂挂',progress.held]);$('progress-copy').replaceChildren();for(const [label,value] of metrics){const span=make('span');span.append(make('strong','',num(value)),document.createTextNode(` ${label}`));$('progress-copy').append(span);}
      $('test-time').textContent=cohorts.length>1?`${cohorts.length}个测试批次 · 日期与链路见下方`:`测试时间 ${data.testTime||'未记录'}`;$('progress').max=expected;$('progress').value=num(progress.synced);$('progress').setAttribute('aria-label',`已归档${num(progress.synced)}项，共${expected}项`);
      let time;try{time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(data.updatedAt));}catch{time=data.updatedAt||'未知';}
      $('updated').textContent=`数据截至 ${time}（北京时间） · 离线快照，不会自动刷新${data.terminal?'':' · 当前结果尚未齐全'}`;
      const firstUrl=data.records.map(r=>r.recordUrl).find(safeUrl);if(firstUrl){const u=new URL(firstUrl);u.searchParams.delete('record');$('base-link').href=u.href;}else $('base-link').hidden=true;
      $('cohorts').hidden=!cohorts.length;
      if(cohorts.length){$('cohort-note').textContent=[...new Set(cohorts.map(row=>row.comparisonNote).filter(Boolean))].join(' ')||'各列比较完整渲染链路；不同日期或版本的结果不构成严格单变量实验。';$('cohort-list').replaceChildren(...cohorts.map(row=>{const article=make('article');article.append(make('h3','',row.label),make('p','',`测试时间 ${row.testTime}`));if(row.ruleSummary)article.append(make('p','',row.ruleSummary));return article;}));}
    }
    function renderControls(){
      $('mode-columns').replaceChildren(...modeRows.map((mode,index)=>{const heading=make('span');heading.append(make('span','mode-index',String.fromCharCode(65+index)),document.createTextNode(mode.label));if(mode.description)heading.title=mode.description;return heading;}));
      $('dialog-views').replaceChildren(...[['pair',modes.length===2?'两种模式并排':'全部模式并排'],...modes].map(([key,label])=>{const b=make('button','choice',label);b.type='button';b.dataset.view=key;b.setAttribute('aria-pressed',String(key==='pair'));b.addEventListener('click',()=>{state.dialogView=key;renderDialog();});return b;}));
      $('sample-select').replaceChildren(...data.samples.map((s,i)=>{const o=make('option','',`${String(i+1).padStart(2,'0')}  ${s.name}`);o.value=s.id;return o;}));
      $('sample-select').value=state.sampleId;$('sample-select').addEventListener('change',e=>{state.sampleId=e.target.value;renderComparison();});
      $('preset-buttons').replaceChildren(...data.presets.map(p=>{const b=make('button','choice',p.name);b.type='button';b.dataset.preset=p.id;b.setAttribute('aria-pressed',String(p.id===state.presetId));b.addEventListener('click',()=>{state.presetId=p.id;renderComparison();});return b;}));
      $('model-buttons').replaceChildren(...data.models.map(m=>{const b=make('button','choice',m.label);b.type='button';b.dataset.model=m.key;b.setAttribute('aria-pressed','true');b.addEventListener('click',()=>{if(state.models.has(m.key))state.models.delete(m.key);else state.models.add(m.key);renderComparison();});return b;}));
      $('all-models').addEventListener('click',()=>{state.models=new Set(data.models.map(m=>m.key));renderComparison();});
    }
    function resultFigure(r,mode,model,{dialog=false}={}){
      const f=make('figure','result'),title=`${model.label} · ${modes.find(m=>m[0]===mode)[1]}`;
      const excluded=!r&&exclusion(model.key,mode);
      f.append(make('div','result-mode',modes.find(m=>m[0]===mode)[1]));const url=imageUrl(r?.image);
      if(url){const b=make('button','image-button');b.type='button';b.setAttribute('aria-label',`放大${title}`);const img=make('img','result-image');img.src=url;img.alt=`${sample().name}，${preset().name}，${title}`;img.decoding='async';img.loading=dialog?'eager':'lazy';b.append(img);b.addEventListener('click',()=>dialog?openAsset(r.image,title):openComparison(model.key,mode));f.append(b);}
      else{const empty=make('div','result-empty');empty.dataset.status=excluded?'excluded':r?.status||'missing';let label=excluded?excluded.reason:statusLabels[r?.status]||'未采集到结果';if(r?.status==='success')label='结果已归档，预览尚未采集';empty.append(make('strong','',label));if(excluded)empty.append(make('p','','该组合不在本轮测试计划内，不计入失败、缺失或待完成。'));else if(r?.error?.message)empty.append(make('p','',r.error.message));else empty.append(make('p','',r?.status==='success'?'可通过下方飞书记录查看原图。':data.terminal?'本次报告保留这一空位，未用其他图片替代。':data.status==='blocked'?'服务已中断，此项结果待核实；未重新提交。':data.status==='planned'?'此项已列入补充测试计划，尚未开始执行。':'任务仍在运行，结果将按原计划归档。'));f.append(empty);}
      const caption=make('figcaption','result-caption'),facts=make('div','result-facts');
      let status=excluded?'未测试':statusLabels[r?.status]||'未记录';if(r?.status==='success'&&r.auditPassed===true)status+=' · 核验通过';else if(r?.status==='success'&&r.auditPassed===false)status+=' · 核验异常';
      addFact(facts,status,finalStates.has(r?.status)||r?.auditPassed===false?'result-status warning':'result-status');if(r?.actualSize)addFact(facts,String(r.actualSize).replace(/x/g,'×'));if(r?.durationMs!==null&&r?.durationMs!==undefined)addFact(facts,seconds(r.durationMs));if(num(r?.attempt)>1)addFact(facts,`第${r.attempt}次流程`,'warning');
      if(r?.cohortId||r?.testTime)addFact(facts,[cohortMap.get(r.cohortId)?.label,r.testTime].filter(Boolean).join(' · '),'result-cohort');
      caption.append(facts);const a=link(r?.recordUrl,'飞书原图');if(a)caption.append(a);f.append(caption);return f;
    }
    function renderComparison(){
      document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===state.presetId)));
      document.querySelectorAll('[data-model]').forEach(b=>b.setAttribute('aria-pressed',String(state.models.has(b.dataset.model))));$('all-models').hidden=state.models.size===data.models.length;
      $('source-name').textContent=sample().name;$('target-name').textContent=preset().name;$('target-description').textContent=preset().description||'';contextImage($('source-frame'),sample().image,`底图：${sample().name}`);contextImage($('target-frame'),preset().image,`目标光影：${preset().name}`);
      const selected=data.models.filter(m=>state.models.has(m.key)),visible=selected.flatMap(m=>modes.map(([mode])=>record(m.key,mode))).filter(Boolean);
      const excludedCount=selected.reduce((count,model)=>count+modes.filter(([mode])=>exclusion(model.key,mode)).length,0);
      $('comparison-count').textContent=`${selected.length} 个模型 · ${visible.filter(r=>r.status==='success').length} / ${visible.length} 张已归档${excludedCount?` · ${excludedCount}个组合未测试`:''}`;
      const rows=$('comparison-rows');rows.replaceChildren();if(!selected.length){const e=make('div','empty-selection');e.append(make('p','','当前没有选中的模型。'));const b=make('button','text-button',`显示全部${data.models.length}个模型`);b.type='button';b.addEventListener('click',()=>{$('all-models').click();});e.append(b);rows.append(e);}
      selected.forEach(model=>{const row=make('article','model-row');const heading=make('div','model-row-head');heading.append(make('h3','',model.label));const b=make('button','text-button','放大对照');b.type='button';b.disabled=!modes.some(([mode])=>imageUrl(record(model.key,mode)?.image));b.addEventListener('click',()=>openComparison(model.key,'pair'));heading.append(b);const pair=make('div','pair');modes.forEach(([mode])=>pair.append(resultFigure(record(model.key,mode),mode,model)));row.append(heading,pair);rows.append(row);});
      const images=visible.filter(r=>imageUrl(r.image)),low=images.some(r=>r.image.kind==='preview-360');$('image-note').textContent=!images.length?'所选组合暂无已采集的结果图片；计划槽位与真实状态仍完整保留。':low?'当前含360px实际结果临时预览，适合先看光影方向。最终报告将替换为1024px预览；细节请在飞书原图中查看。':'分享版使用1024px结果预览，保留完整画面；模型原始输出及内部取证链接保存在内部归档。';
    }
    function renderSummary(){
      const supplied=new Map((data.summaries?.models||[]).map(m=>[m.key,m]));$('summary-body').replaceChildren(...data.models.map(model=>{
        const rows=data.records.filter(r=>r.modelKey===model.key),durations=rows.filter(r=>r.status==='success'&&r.durationMs!==null&&r.durationMs!==undefined).map(r=>num(r.durationMs)).sort((a,b)=>a-b),middle=durations.length?durations.length%2?durations[(durations.length-1)/2]:(durations[durations.length/2-1]+durations[durations.length/2])/2:null;
        const s=supplied.get(model.key)||{expected:rows.length,succeeded:rows.filter(r=>r.status==='success').length,failed:rows.filter(r=>finalStates.has(r.status)).length,pending:rows.filter(r=>!finalStates.has(r.status)&&r.status!=='success').length,medianDurationMs:middle,retryCount:rows.reduce((n,r)=>n+Math.max(0,num(r.attempt)-1),0),knownCostUsd:rows.filter(r=>r.costUsd!==null&&r.costUsd!==undefined).reduce((n,r)=>n+num(r.costUsd),0),unknownCostCount:rows.filter(r=>r.costUsd===null||r.costUsd===undefined).length};
        const tr=make('tr');[model.label,`${num(s.succeeded)} / ${num(s.expected)}`,num(s.failed),num(s.pending),seconds(s.medianDurationMs),num(s.retryCount)].forEach(value=>tr.append(make('td','',value)));
        const fee=make('td');const known=rows.filter(r=>r.costUsd!==null&&r.costUsd!==undefined).length;if(!known)fee.append(document.createTextNode('未返回'));else{fee.append(document.createTextNode(`$${num(s.knownCostUsd).toFixed(3)}`));if(num(s.unknownCostCount)>0)fee.append(make('span','table-detail',`${s.unknownCostCount}项费用未知`));}tr.append(fee);return tr;
      }));
      const a=data.audits||{};$('audit-line').replaceChildren(make('p','',`归档核验：${num(a.audited)}项已核验，${num(a.passed)}项通过，${num(a.failed)}项存在异常。${a.terminal?'核验已结束。':'核验尚在进行。'}`),make('p','','核验覆盖模型、模式、版本、图片身份、附件和尺寸；这些记录不构成视觉质量评分。'));
      renderIssues();const observations=(data.observations||[]).filter(o=>o&&o.title&&o.body&&['verified-metrics','visual-review'].includes(o.source));$('observations').hidden=!observations.length;$('observation-list').replaceChildren(...observations.map(o=>{const a=make('article');a.append(make('h3','',o.title),make('p','',o.body));return a;}));
    }
    function renderIssues(){
      const issues=new Map();for(const item of data.retryHistory||[])issues.set(`${item.id}:${item.stage}:${item.attempt}`,{...item,recovered:item.recovered===true,kind:item.recovered?'recovered':'retrying'});
      for(const item of data.warnings||[])issues.set(`${item.id}:${item.stage}:${item.attempt}`,{...item,kind:item.stage==='upstream-unresolved'?'held':'retrying',recovered:false});
      for(const r of data.records.filter(r=>finalStates.has(r.status))){const k=`${r.id}:${r.error?.stage}:${r.attempt}`;issues.set(k,{id:r.id,label:[data.models.find(m=>m.key===r.modelKey)?.label,data.samples.find(s=>s.id===r.sampleId)?.name,data.presets.find(p=>p.id===r.presetId)?.name,modes.find(m=>m[0]===r.execution)?.[1]].filter(Boolean).join(' · '),stage:r.error?.stage,message:r.error?.message||statusLabels[r.status],attempt:r.attempt,kind:'failed'});}
      const list=[...issues.values()];$('issues-title').textContent=`运行异常与流程重试 · ${list.length}条记录`;$('issues').open=list.some(i=>i.kind==='failed');$('issue-list').replaceChildren();
      if(!list.length)$('issue-list').append(make('li','issue-detail','当前未记录到流程异常。'));
      list.forEach(item=>{const li=make('li'),label=make('p','issue-label'),tag=make('span','issue-tag',item.kind==='failed'?'未完成':item.kind==='held'?'暂挂核查':item.recovered?'已恢复':'处理中');tag.dataset.kind=item.kind;label.append(tag,document.createTextNode(item.label||item.id||'任务记录'));const stage={archive:'建档／输入上传',generation:'模型生成',sync:'结果归档','upstream-unresolved':'上游状态待核查'}[item.stage]||item.stage||'阶段未知';li.append(label,make('p','issue-detail',`${stage}${item.attempt?` · 第${item.attempt}次流程`:''} · ${item.message||'未记录具体原因'}`));$('issue-list').append(li);});
    }
    function renderDialog(){
      const model=data.models.find(m=>m.key===state.dialogModel);if(!model)return;$('dialog-title').textContent=model.label;$('dialog-subtitle').textContent=`${sample().name} · ${preset().name}`;
      const pair=$('dialog-pair');pair.dataset.layout=state.dialogView==='pair'?'pair':'one';pair.replaceChildren();modes.filter(([mode])=>state.dialogView==='pair'||state.dialogView===mode).forEach(([mode])=>pair.append(resultFigure(record(model.key,mode),mode,model,{dialog:true})));
      document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.dialogView)));
      $('dialog-context').replaceChildren(...[[sample().image,`底图：${sample().name}`],[preset().image,`目标：${preset().name}`]].map(([image,title])=>{const f=make('figure');f.append(make('figcaption','',title));const url=imageUrl(image);if(url){const img=make('img');img.src=url;img.alt=title;f.append(img);}else f.append(make('p','context-empty','原图预览尚未采集'));return f;}));
    }
    function openComparison(key,view){state.dialogModel=key;state.dialogView=view;renderDialog();$('dialog-context').hidden=true;$('toggle-dialog-context').setAttribute('aria-expanded','false');$('toggle-dialog-context').textContent='显示底图与目标';$('compare-dialog').showModal();}
    $('toggle-dialog-context').addEventListener('click',()=>{const show=$('dialog-context').hidden;$('dialog-context').hidden=!show;$('toggle-dialog-context').setAttribute('aria-expanded',String(show));$('toggle-dialog-context').textContent=show?'收起底图与目标':'显示底图与目标';});
    document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
    document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const box=d.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)d.close();}}));
    renderHeader();renderControls();renderComparison();renderSummary();
  })();
  