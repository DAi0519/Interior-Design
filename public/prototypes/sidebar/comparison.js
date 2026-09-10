/**
 * [INPUT]: 依赖共享原型状态、原图与结果图 URL
 * [OUTPUT]: 对外提供完整工作台对比预览与结果切换
 * [POS]: sidebar 的独立结果交互模块，不调用模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import {state,esc,upload} from './shared.js';
export function comparison(){const before=state.image,after=state.after;return `<div class="compare-frame">${state.view==='左右对比'&&before&&after?`<img class="compare-image" src="${after}" alt="生成结果对比图" draggable="false"><img class="compare-image compare-before" src="${before}" alt="原图" draggable="false"><div class="compare-divider" aria-hidden="true"><span>‹ ›</span></div><span class="compare-label before-label">原图</span><span class="compare-label after-label">${state.sample?'设计示意':'生成结果'}</span><input class="compare-range" type="range" min="0" max="100" value="${state.compare}" aria-label="原图与生成结果对比分界" aria-valuetext="原图显示 ${state.compare}%" data-compare>`:`<img class="compare-image" src="${state.view==='原图'?before:(after||before)}" alt="${state.view==='原图'?'原图':'结果图'}" draggable="false">`}</div>`;}
export function resultArea(i){return `<main class="results"><div class="resulthead"><h2>生成结果</h2><div class="segmented">${['左右对比','原图','生成结果'].map(v=>`<button data-view="${v}" aria-pressed="${state.view===v}">${v}</button>`).join('')}</div><button class="plain" data-action="zoom">放大 ⤢</button></div><div class="canvas">${state.image?comparison():`<div class="canvasupload">${upload()}<p>上传原图开始设计，也可以载入示例体验对比</p><button class="secondary-button" data-action="sample">载入示例</button></div>`}</div><div class="compare-toolbar"><span>${state.sample?'空间示意图 · 非真实模型生成':state.after?'拖动分界线查看同一位置的变化':'已载入原图，请载入结果图进行对比'}</span><button class="plain" data-action="reset-compare">居中</button><label class="image-loader">更换原图<input type="file" accept="image/png,image/jpeg,image/webp" data-upload="image" aria-label="更换对比原图"></label><label class="image-loader">载入结果图<input type="file" accept="image/png,image/jpeg,image/webp" data-upload="after" aria-label="载入对比结果图"></label></div><div class="result-strip">${(state.generated?state.resultItems:[{model:'示例对比',image:state.after||state.image}]).map((r,n)=>`<button class="result-thumb ${state.resultIndex===n?'selected':''}" data-result="${n}" aria-pressed="${state.resultIndex===n}"><img src="${r.image||'./sample-after.svg'}" alt=""><span>${esc(r.model)}</span></button>`).join('')}<div class="result-info">${state.generated?`${state.resultItems.length} 张演示结果 · 未调用模型`:'拖动分界线对比原图与设计'}<small>${state.room} · ${state.style}</small></div></div></main>`;}
export function bindComparison(stage){stage.addEventListener('input',e=>{if(!e.target.matches('[data-compare]'))return;state.compare=Number(e.target.value);stage.querySelectorAll('.compare-frame').forEach(frame=>frame.style.setProperty('--split',state.compare+'%'));e.target.setAttribute('aria-valuetext',`原图显示 ${state.compare}%`);});}

export function syncComparison(stage) {
  const [w,h] = (state.imageRatio || '3 / 2').split('/').map(Number);
  const ratio = w / h;
  stage.querySelectorAll('.compare-frame').forEach(frame => {
    const parent = frame.parentElement;
    const css = getComputedStyle(parent);
    const availableWidth = parent.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const availableHeight = parent.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom) - (parent.matches('dialog') ? 50 : 0);
    const width = Math.max(0, Math.min(availableWidth, availableHeight * ratio));
    frame.style.width = width + 'px';
    frame.style.height = width / ratio + 'px';
    frame.style.setProperty('--split',state.compare + '%');
  });
}
