/**
 * [INPUT]: 依赖摄影机球DOM、camera-sphere-scene绘制、RAF、localStorage及机位变更回调
 * [OUTPUT]: bindCameraSphere提供逐帧拖动、预设过渡、键盘微调、景别/机位读取；shortestCameraTurn提供最短方位弧
 * [POS]: public 共享摄影机球交互控制器，由主工作台和独立试跑复用，不上传图片或发起生成
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createCameraScene } from './camera-sphere-scene.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap = value => (value % 360 + 360) % 360;
export const shortestCameraTurn = (from, to) => (to - from + 540) % 360 - 180;
const framingName = distance => distance === 0 ? '特写' : distance === 100 ? '远景' : '标准';

export function bindCameraSphere(root, { onChange = () => {}, storageKey = 'multi-angle-pose', light = false } = {}) {
  const stage = root.querySelector('.cs-stage');
  const azimuth = root.querySelector('#cs-azimuth'), elevation = root.querySelector('#cs-elevation');
  const handle = stage.querySelector('.cs-camera-handle');
  const azOutput = root.querySelector('[data-az-value]'), elOutput = root.querySelector('[data-el-value]');
  const poseOutput = stage.querySelector('[data-pose-summary]');
  const scene = createCameraScene(stage, { light });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state = { azimuth: 0, elevation: 0, distance: 50 };
  let displayed = { ...state }, drag = null, animation = null, frame = 0;

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && ['azimuth','elevation','distance'].every(key => Number.isInteger(saved[key]))) {
        state = { azimuth: clamp(saved.azimuth,0,360), elevation: clamp(saved.elevation,-30,60), distance: saved.distance < 25 ? 0 : saved.distance > 75 ? 100 : 50 };
      }
    } catch { /* -------- 存储不可用时保持正面默认值 -------- */ }
    displayed = { ...state };
  }
  function syncControls() {
    azimuth.value = state.azimuth; elevation.value = state.elevation;
    for (const input of [azimuth,elevation]) input.style.setProperty('--pct',`${(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`);
    azOutput.value = `${state.azimuth}°`; elOutput.value = `${state.elevation}°`;
    const vertical = state.elevation === 0 ? '平视' : `${state.elevation > 0 ? '俯视' : '仰视'} ${Math.abs(state.elevation)}°`;
    if (poseOutput) poseOutput.textContent = `水平 ${state.azimuth}° · ${vertical} · ${framingName(state.distance)}`;
    handle.setAttribute('aria-label',`拖动摄影机，或使用方向键调整机位；水平${state.azimuth}度，${vertical}，${framingName(state.distance)}`);
    for (const button of root.querySelectorAll('[data-distance]')) button.setAttribute('aria-pressed',String(Number(button.dataset.distance)===state.distance));
    for (const button of root.querySelectorAll('[data-preset]')) {
      const [a,e]=button.dataset.preset.split(',').map(Number);
      button.setAttribute('aria-pressed',String(a===state.azimuth%360&&e===state.elevation));
    }
  }
  function render(time) {
    frame = 0;
    if (animation) {
      const progress = Math.min(1,(time-animation.start)/260), ease = 1-Math.pow(1-progress,4);
      displayed = {
        azimuth: animation.from.azimuth + shortestCameraTurn(animation.from.azimuth,state.azimuth)*ease,
        elevation: animation.from.elevation+(state.elevation-animation.from.elevation)*ease,
        distance: animation.from.distance+(state.distance-animation.from.distance)*ease,
      };
      if (progress === 1) { animation=null; displayed={...state}; }
    } else displayed={...state};
    scene.draw(displayed);
    if (animation) requestDraw();
  }
  function requestDraw() { if (!frame) frame=requestAnimationFrame(render); }
  function change({ animate = false, save = false } = {}) {
    animation = animate && !reducedMotion.matches ? { from: {...displayed}, start: performance.now() } : null;
    syncControls(); requestDraw();
    if (save) {
      try { localStorage.setItem(storageKey,JSON.stringify(state)); } catch { /* -------- 无持久化权限不阻断编辑 -------- */ }
      onChange({...state});
    }
  }
  function nudge(direction, step = 1) {
    if (direction === 'left' || direction === 'right') state.azimuth=wrap(state.azimuth+(direction==='left'?-5:5)*step);
    else state.elevation=clamp(state.elevation+(direction==='up'?5:-5)*step,-30,60);
  }
  for (const [input,key] of [[azimuth,'azimuth'],[elevation,'elevation']]) {
    input.addEventListener('input',()=>{ state[key]=Number(input.value);change(); });
    input.addEventListener('change',()=>change({save:true}));
  }
  function click(event) {
    if (root.classList.contains('is-busy')) return;
    const button=event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-distance')) state.distance=Number(button.dataset.distance);
    else if (button.dataset.preset) [state.azimuth,state.elevation]=button.dataset.preset.split(',').map(Number);
    else if (button.hasAttribute('data-reset')) state={azimuth:0,elevation:0,distance:50};
    else if (button.dataset.nudge) nudge(button.dataset.nudge);
    else return;
    change({animate:true,save:true});
  }
  root.addEventListener('click',click);
  stage.addEventListener('click',event=>{if(!root.contains(stage))click(event);});
  stage.addEventListener('pointerdown',event=>{
    if (root.classList.contains('is-busy') || event.button !== 0 || drag) return;
    if (event.target.closest('button') && !event.target.closest('.cs-camera-handle')) return;
    animation=null;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,az:state.azimuth,el:state.elevation};
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('is-dragging');
    event.preventDefault();
  });
  stage.addEventListener('pointermove',event=>{
    if (!drag || drag.id!==event.pointerId) return;
    state.azimuth=Math.round(wrap(drag.az+(event.clientX-drag.x)*.6));
    state.elevation=Math.round(clamp(drag.el-(event.clientY-drag.y)*.4,-30,60));
    change();
  });
  function stop(event) {
    if (!drag || (event && event.pointerId!==drag.id)) return;
    const id=drag.id;drag=null;
    stage.classList.remove('is-dragging');
    if(stage.hasPointerCapture(id))stage.releasePointerCapture(id);
    change({save:true});
  }
  for (const name of ['pointerup','pointercancel','lostpointercapture']) stage.addEventListener(name,stop);
  handle.addEventListener('keydown',event=>{
    const direction={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[event.key];
    if (!direction || root.classList.contains('is-busy')) return;
    event.preventDefault();nudge(direction,event.shiftKey?3:1);change({save:true});
  });
  // -------- 单选按钮组保留完整Tab可达，并用方向键就近切换 --------
  for (const selector of ['.cs-presets','.cs-framing']) {
    const group=root.querySelector(selector);
    group.addEventListener('keydown',event=>{
      const buttons=[...group.querySelectorAll('button')], index=buttons.indexOf(event.target);
      if(index<0||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
      const step=selector==='.cs-presets'&&['ArrowUp','ArrowDown'].includes(event.key)?3:1;
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-step:step)+buttons.length)%buttons.length;
      event.preventDefault();buttons[next].focus({preventScroll:true});buttons[next].click();
    });
  }
  stage.addEventListener('load',requestDraw,true);
  new ResizeObserver(()=>{
    if (!stage.clientWidth || !stage.clientHeight) { cancelAnimationFrame(frame);frame=0;animation=null;return; }
    requestDraw();
  }).observe(stage);
  restore();change();
  return { value:()=>({...state}), draw:requestDraw };
}
