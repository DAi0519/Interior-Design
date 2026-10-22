/**
 * [INPUT]: 依赖共享camera-sphere控件及本地试跑服务
 * [OUTPUT]: 摄影机球与特写/标准/远景选择、20MB图片准入、旧机位迁移及分版本结果标签
 * [POS]: public/prototypes/multi-angle 的独立测试页，不接入生产入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { bindCameraSphere } from "/camera-sphere.js";
import { api, readFileAsInput } from "/workbench-utils.js";

(()=>{
const root=document.getElementById('camera-sphere-v2');
const photo=root.querySelector('[data-photo]'),file=root.querySelector('.cs-file');
const status=root.querySelector('.cs-status'),generate=root.querySelector('.cs-generate');
let reference=null,busy=true;
const sphere=bindCameraSphere(root);
// -------- 图片输入、后台任务与真实结果 --------
function setReference(value){reference=value;let img=photo.querySelector('img');if(!img){img=document.createElement('img');img.alt='参考原图';photo.append(img);}img.src=value.dataUrl;photo.classList.add('has-image');photo.setAttribute('aria-label','更换参考图片');}
function setBusy(value){busy=value;root.classList.toggle('is-busy',value);root.querySelectorAll('button,input').forEach(control=>control.disabled=value);generate.textContent=value?'生成中…':'生成';}
function message(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
function showResult(result){const section=document.querySelector('.results');section.hidden=false;section.querySelector('[data-original]').src=result.inputUrl;section.querySelector('[data-result]').src=result.outputUrl;section.querySelector('[data-download]').href=result.outputUrl;const p=result.pose;section.querySelector('[data-result-label]').textContent=`水平 ${p.azimuth}° · 垂直 ${p.elevation}° · ${['2026-10-19.preview.3','2026-10-19.preview.4'].includes(result.workflowVersion)?({0:'特写',50:'标准',100:'远景'}[p.distance]):result.workflowVersion==='2026-10-19.preview.2'?({0:'特写',50:'标准',100:'旧版广角'}[p.distance]):'旧版景别 '+p.distance}`;section.querySelector('.run-meta').textContent=`${result.width} × ${result.height} · 执行 ${(result.executionDurationMs/1000).toFixed(1)} 秒 · ${result.promptId}`;}
async function follow(job){
 if(job.status==='success'){showResult(job.result);localStorage.removeItem('multi-angle-pending');setBusy(false);message('生成完成');return;}
 if(['failed','unknown','not-submitted'].includes(job.status)){if(job.status!=='unknown')localStorage.removeItem('multi-angle-pending');setBusy(job.status==='unknown');message(job.error||'生成失败',true);return;}
 setBusy(true);message(job.message||'MaaS 正在处理');
 setTimeout(async()=>{try{await follow(await api('/api/jobs/'+job.jobId));}catch(error){message('连接暂时中断，继续查询原任务');setTimeout(()=>follow(job),3000);}},1500);
}
photo.addEventListener('click',()=>file.click());
file.addEventListener('change',async()=>{const f=file.files?.[0];if(!f)return;try{if(f.size>20*1024*1024)throw new Error('原图不能超过 20MB');setReference(await readFileAsInput(f));message('已更换原图');}catch(error){message(error.message,true);}});
generate.addEventListener('click',async()=>{
 if(busy||!reference)return;
 const jobId=crypto.randomUUID();const submittedPose=sphere.value();
 localStorage.setItem('multi-angle-pending',jobId);setBusy(true);message('正在提交机位…');
 try{await follow(await api('/api/generate',{method:'POST',body:JSON.stringify({jobId,pose:submittedPose,reference})}));}
 catch(error){try{const job=await api('/api/jobs/'+jobId);await follow(job);if(job.status==='not-submitted')message(error.message,true);}catch{message(error.message+'；请刷新核验任务状态',true);}}
});
async function initialize(){
 try{
  setBusy(true);generate.textContent='连接中…';
  const [sample,latest]=await Promise.all([api('/api/sample'),api('/api/latest')]);setReference(sample.reference);
  if(latest){if(latest.status==='running'){await follow(latest);return;}if(latest.status==='success')showResult(latest.result);}
  const pending=localStorage.getItem('multi-angle-pending');
  if(pending){await follow(await api('/api/jobs/'+pending));return;}
  await api('/api/health');setBusy(false);message('MaaS 已连接 · 单张生成');
 }catch(error){message(error.message,true);setBusy(true);generate.textContent='连接未就绪';}
}
initialize();
})();
