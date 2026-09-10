/**
 * [INPUT]: 依赖共享配置、多选状态、comparison 对比模块与现有下拉交互
 * [OUTPUT]: 对外提供完整工作台中的简化配置原型
 * [POS]: prototypes/sidebar 隔离探索模块，不接入生产链路
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import {state,selection,esc,upload,select,featureChoices} from './shared.js';
import {comparison,resultArea,bindComparison,syncComparison} from './comparison.js';
import {initSelects} from './selects.js';
import {summary} from './summary.js';
import {steps} from './steps.js';
import {compact} from './compact.js';
const renderers=[summary,steps,compact];
function render(i){return `<div class="workbench direction-${i}"><header class="topbar"><b>Canvas Lab</b><nav><a class="active" href="/prototypes/sidebar/index.html?v=${i+1}">生图工作台</a><a href="/beta.html" target="_blank">Beta跑图 ↗</a><a href="/benchmark.html" target="_blank">模型评测 ↗</a></nav><span class="prototype-status">● 原型预览</span></header><div class="modebar">${featureChoices()}<span>空房设计 <span class="slash">/</span> ${state.room}</span><small>${['所有设置直接填写','上传移到画布，设置留在左侧','空间、风格、输出分栏编辑，随时切换'][i]}</small></div><div class="layout">${renderers[i]()}${resultArea(i)}</div>${state.zoom?`<dialog open class="zoom"><button class="plain" data-action="close">关闭 ✕</button>${comparison()}</dialog>`:''}<div class="toast" role="status" hidden></div></div>`;}
const variants=renderers.map((_,i)=>()=>render(i));
// `variants` is an array of render functions, one per variant, in picker order.
const stage = document.getElementById('stage');
bindComparison(stage);
const picker = document.querySelector('.proto-picker');
const highlight = picker.querySelector('.proto-picker-highlight');
const items = [...picker.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')];
const replay = picker.querySelector('.proto-picker-replay');
let current = 0;

function moveHighlight() {
  const el = items[current];
  highlight.style.width = el.offsetWidth + 'px';
  highlight.style.transform = `translateX(${el.offsetLeft}px)`;
}

function mount(i) {
  stage.innerHTML = '';
  // Clear first, render next frame, so entrance animations re-run.
  requestAnimationFrame(() => { stage.innerHTML = variants[i](); initSelects(); syncComparison(stage); });
}

function setActive(i) {
  if (i < 0 || i >= variants.length) return;
  current = i;
  items.forEach((el, j) => {
    el.toggleAttribute('data-active', j === i);
    if (j === i) el.setAttribute('aria-current', 'true');
    else el.removeAttribute('aria-current');
  });
  moveHighlight();
  const url = new URL(location);
  url.searchParams.set('v', i + 1);
  history.replaceState(null, '', url);
  mount(i);
}

items.forEach((el, i) => el.addEventListener('click', () => setActive(i)));
replay?.addEventListener('click', () => mount(current));
window.addEventListener('resize', moveHighlight);

document.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= variants.length) setActive(num - 1);
  else if (e.key === 'ArrowRight') setActive((current + 1) % variants.length);
  else if (e.key === 'ArrowLeft') setActive((current - 1 + variants.length) % variants.length);
  else if (e.key === 'r' || e.key === 'R') mount(current);
});

setActive((parseInt(new URLSearchParams(location.search).get('v'), 10) || 1) - 1);
// Enable the slide only after first paint, so load doesn't animate.
requestAnimationFrame(() => requestAnimationFrame(() => picker.setAttribute('data-ready', '')));


function refresh(){const focused=document.activeElement;const key=['room','style','item','model'].find(k=>focused?.dataset[k]);const value=key?focused.dataset[key]:null;const top=stage.querySelector('.scroll')?.scrollTop||0;stage.innerHTML=render(current);initSelects();syncComparison(stage);stage.querySelector('.scroll').scrollTop=top;if(key)stage.querySelector(`[data-${key}="${CSS.escape(value)}"]`)?.focus({preventScroll:true});}
function toast(message){const el=stage.querySelector('.toast');el.textContent=message;el.hidden=false;setTimeout(()=>{if(el.isConnected)el.hidden=true;},2600);}
stage.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.configTab){state.configTab=b.dataset.configTab;refresh();}if(b.dataset.result!==undefined){state.resultIndex=Number(b.dataset.result);if(state.generated)state.after=state.resultItems[state.resultIndex].image;refresh();}if(b.dataset.item){const s=selection();if(b.dataset.item==='其他'){s.custom=!s.custom;if(!s.custom)s.other='';}else{s.items=s.items.includes(b.dataset.item)?s.items.filter(x=>x!==b.dataset.item):[...s.items,b.dataset.item];}refresh();}if(b.dataset.room){state.room=b.dataset.room;refresh();}if(b.dataset.style){state.style=b.dataset.style;refresh();}if(b.dataset.feature){toast('当前探索范围：空房设计完整工作台');}if(b.dataset.model){const m=b.dataset.model;if(state.models.includes(m)){if(state.models.length===1){toast('请至少保留一个出图模型');return;}state.models=state.models.filter(x=>x!==m);}else{if(state.models.length===4){toast('最多同时选择 4 个模型');return;}state.models.push(m);}state.model=state.models[0];if(state.models.length>1)state.count='1 张';refresh();}if(b.dataset.view){state.view=b.dataset.view;refresh();}const a=b.dataset.action;if(a==='generate'){if(!state.image){toast('请先上传一张空房照片');return;}if(!state.after){toast('原型不调用模型，请先载入一张结果图体验对比');return;}state.resultItems=state.models.flatMap(model=>Array.from({length:state.models.length===1?parseInt(state.count):1},(_,n)=>({model:model+(state.models.length===1?' · '+(n+1):''),image:state.after||'./sample-after.svg'})));state.generated=true;state.resultIndex=0;state.after=state.resultItems[0].image;state.view='左右对比';refresh();toast('已演示生成完成状态；图像为示例，未调用模型');}if(a==='reset-compare'){state.compare=50;refresh();}if(a==='sample'){state.image='./sample-before.svg';state.after='./sample-after.svg';state.sample=true;state.compare=50;state.view='左右对比';state.generated=false;refresh();}if(a==='remove'){URL.revokeObjectURL(state.image);state.image='';state.generated=false;refresh();}if(a==='zoom'){state.zoom=true;refresh();const dialog=stage.querySelector('dialog');dialog.removeAttribute('open');dialog.showModal();syncComparison(stage);}if(a==='close'){state.zoom=false;refresh();stage.querySelector('[data-action="zoom"]')?.focus();}});
stage.addEventListener('change',e=>{if(e.target.dataset.field){state[e.target.dataset.field]=e.target.value;refresh();}if(e.target.dataset.upload)loadImage(e.target.files[0],e.target.dataset.upload);});
stage.addEventListener('toggle',e=>{if(e.target.matches('[data-group="furniture"]'))state.furnitureOpen=e.target.open;},true);
stage.addEventListener('input',e=>{if(e.target.matches('[data-notes]'))state.notes=e.target.value;if(e.target.matches('[data-other]'))selection().other=e.target.value;if(e.target.matches('[data-negative]'))state.negative=e.target.value;});
function loadImage(file,key){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('请选择 PNG、JPEG 或 WebP 图片');return;}if(state[key])URL.revokeObjectURL(state[key]);state[key]=URL.createObjectURL(file);state.sample=false;state.generated=false;state.resultIndex=0;if(key==='image'){state.after='';const probe=new Image();probe.onload=()=>{state.imageRatio=probe.naturalWidth+' / '+probe.naturalHeight;refresh();};probe.src=state.image;}if(key==='after')state.view='左右对比';refresh();}
stage.addEventListener('dragover',e=>{if(e.target.closest('.upload,.canvas'))e.preventDefault();});
stage.addEventListener('drop',e=>{if(!e.target.closest('.upload,.canvas'))return;e.preventDefault();loadImage(e.dataTransfer.files[0],e.target.closest('.reference')?'reference':'image');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.zoom){e.preventDefault();state.zoom=false;refresh();}});

function fitPreview(){document.documentElement.style.setProperty("--preview-scale",Math.min(1,innerWidth/1280));}
window.addEventListener("resize",()=>{fitPreview();syncComparison(stage);});fitPreview();

stage.addEventListener('keydown',event=>{
  if(!event.target.matches('[data-config-tab]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();
  const tabs=['空间','风格','输出'];let next=tabs.indexOf(state.configTab);
  next=event.key==='Home'?0:event.key==='End'?2:(next+(event.key==='ArrowRight'?1:2))%3;
  state.configTab=tabs[next];refresh();stage.querySelector(`[data-config-tab="${state.configTab}"]`).focus();
});
