/**
 * [INPUT]: 已核验的逐张结果、五张原图及场景定位点
 * [OUTPUT]: 场景与档位导航、原图与模型全图常显、下排原件同步拖动及定点缩放
 * [POS]: 本地网页的交互层，放大时读取原件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const scenes = [
 ['003','客厅','看沙发的暗部纹理、木饰面拼缝，以及地毯边缘有没有被锐化。',[['沙发',.49,.65],['木饰面',.53,.42],['地毯',.36,.78],['钢琴',.70,.61]]],
 ['029','卧室','比较床品的织纹与褶皱，再看藤编椅背上的细孔是否连续。',[['床品',.46,.74],['编织椅',.82,.65],['木门',.12,.51]]],
 ['036','厨房','对照不锈钢挡板的拉丝和反射层次，也可以看柜门接缝。',[['金属挡板',.65,.44],['柜门接缝',.32,.76],['台面',.67,.66]]],
 ['027','卫浴','观察淋浴墙上的石纹走向、玻璃边缘和浴缸收口。',[['淋浴石纹',.78,.40],['玻璃边缘',.58,.55],['浴缸收口',.70,.74]]],
 ['044','过道','比较两侧木饰面的竖纹、墙脚石材分缝和地面反射。',[['墙面木纹',.22,.50],['石材地面',.53,.86],['远端石墙',.52,.49]]],
];
const models = [['banana21','Banana 2.1'],['gptImage25Sunburst','GPT Image 2.5 Sunburst'],['aiTextureEnhancement','Flux2 Klein'],['seedream5Pro','Seedream 5.0 Pro'],['seedream5','Seedream 5.0 Lite']];
const rows = window.ASSETS, $ = id => document.getElementById(id);
const sceneFromHash=()=>scenes.find(s=>s[0]===location.hash.slice(1))||scenes[0];
const notes={
 '003':'沙发靠背在 GPT 4K 中亮暗起伏明显，木墙纹理也更突出。Flux 4K 在木墙和地毯上出现了更强的投影。',
 '029':'Banana 两档的床罩绗缝都较浅。Flux 2K 加深了缝线阴影，Flux 4K 的床面光照和毛毯高光也发生了变化。',
 '044':'壁灯右侧能同时看木纹和板缝。Banana 4K 保留了接近原图的细竖纹，GPT 4K 把壁灯旁的暖色光晕提亮，板缝也显得更深。',
 '027':'看淋浴墙左下的灰色石纹。Banana 两档保留了较浅的轮廓，GPT 4K 把它强化为更密的裂纹状纹理，Flux 4K 的整片石材也偏暖。',
 '036':'看挡板左侧的反光。原图与两档 Banana 都是白色光斑，GPT 两档明显偏暖，4K 的金属竖纹也更突出。',
};
const zoomLevels = [2, 4, 8, 16];
const initial = new URLSearchParams(location.search);
const requestedZoom = Number(initial.get('zoom'));
let zoom = zoomLevels.includes(requestedZoom) ? requestedZoom : 4;
let scene=sceneFromHash(), tier=initial.get('tier')==='4K'?'4K':'2K', point=0, focus, panes=[];
const el=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
function choices(id,items,selected,choose){
 const panel=$(id);
 panel.replaceChildren(...items.map(([key,label])=>{
  const b=el('button',label);b.type='button';b.setAttribute('aria-pressed',String(key===selected));
  b.onclick=()=>{choose(key);panel.querySelector('[aria-pressed=true]')?.focus({preventScroll:true})};return b;
 }));
}
function setScene(detailName){
 scene=sceneFromHash();
 point=Math.max(0,scene[3].findIndex(([name])=>name===detailName));
 focus=scene[3][point].slice(1);
 render();
}
function nav(){
 choices('scenes',scenes.map(([k,n])=>[k,k+' '+n]),scene[0],k=>{
  if(location.hash!=='#'+k){history.pushState(null,'','#'+k);setScene()}
 });
 choices('tiers',[['2K','2K'],['4K','4K']],tier,k=>{tier=k;render()});
 pointNav();
}
function pointNav(){
 choices('points',[...scene[3].map(([n],i)=>[i,n]),[-1,'只看全图']],point,k=>{
  point=k;focus=k<0?[.5,.5]:scene[3][k].slice(1);pointNav();draw();
 });
 $('magnification').hidden=point===-1;
 choices('zoom',zoomLevels.map(level=>[level,level+'×']),zoom,level=>setZoom(level));
 $('compare').classList.toggle('whole-only',point===-1);
 $('hint').textContent=point===-1?'同一场景，横向比较各模型的完整构图。':'上排看全图，下排看同一处细节。滚轮缩放，双击放大，拖动平移。';
}
function link(name,url){const a=el('a',name);Object.assign(a,{href:url,target:'_blank',rel:'noreferrer'});return a}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(v,hi));
function setZoom(level,pane,event){
 if(level===zoom)return;
 if(pane && pane.dw){
  const rect=pane.box.getBoundingClientRect();
  const x=event.clientX-rect.left, y=event.clientY-rect.top;
  const factor=level/zoom;
  focus=[
   (x-parseFloat(pane.img.style.left))/pane.dw+(rect.width/2-x)/(pane.dw*factor),
   (y-parseFloat(pane.img.style.top))/pane.dh+(rect.height/2-y)/(pane.dh*factor),
  ].map(n=>clamp(n,0,1));
  point=-2;
 }
 zoom=level;
 pointNav();
 draw();
}
function bindZoom(pane){
 let lastStep=-Infinity;
 pane.box.addEventListener('wheel',event=>{
  if(!event.deltaY || Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
  const index=zoomLevels.indexOf(zoom)-Math.sign(event.deltaY);
  if(!zoomLevels[index])return;
  event.preventDefault();
  if(event.timeStamp-lastStep<140)return;
  lastStep=event.timeStamp;
  setZoom(zoomLevels[index],pane,event);
 },{passive:false});
 pane.box.ondblclick=event=>{
  const next=zoomLevels[zoomLevels.indexOf(zoom)+1];
  if(next)setZoom(next,pane,event);
 };
}
function draw(){
 for(const p of panes){
  const {box,img}=p;if(!img.naturalWidth||!box.clientWidth)continue;
  const w=box.clientWidth,h=box.clientHeight;
  const scale=point===-1?Math.min(w/img.naturalWidth,h/img.naturalHeight):w*zoom/img.naturalWidth;
  const dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;
  const offset=(n,view,full)=>full<=view?(view-full)/2:clamp(view/2-n*full,view-full,0);
  Object.assign(img.style,{width:dw+'px',height:dh+'px',left:offset(focus[0],w,dw)+'px',top:offset(focus[1],h,dh)+'px'});
  p.dw=dw;p.dh=dh;
 }
}
function pane(name,r){
 const card=el('article');card.append(el('h2',name));
 const overview=el('div');overview.className='overview';card.append(overview);
 const box=el('div');box.className='frame';card.append(box);
 if(!r){overview.append(el('span','无原生 4K'));box.append(el('span','无原生 4K'));return card}
 const full=new Image();full.src=r.thumb||r.url;full.alt=scene[1]+' · '+name+'全图';overview.append(full);
 if(!r.width){full.onload=()=>{if(full.isConnected)$('compare').style.setProperty('--scene-aspect',String(full.naturalWidth/full.naturalHeight))}}
 const img=new Image();img.alt=scene[1]+' · '+name;img.draggable=false;box.append(img);
 const p={box,img};panes.push(p);bindZoom(p);
 img.onload=draw;img.onerror=()=>box.replaceChildren(el('span','原件加载失败'));img.src=r.url;
 const meta=el('div');meta.className='meta';meta.append(link('原尺寸 ↗',r.url));
 const dims=el('small',r.width?r.width+' × '+r.height:'输入原图');card.append(dims,meta);
 let drag=null;
 box.onpointerdown=e=>{if(point===-1||!p.dw)return;drag=[e.clientX,e.clientY,...focus];box.setPointerCapture(e.pointerId)};
 box.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag[0],dy=e.clientY-drag[1];if(!dx&&!dy)return;
  focus=[clamp(drag[2]-dx/p.dw,0,1),clamp(drag[3]-dy/p.dh,0,1)];if(point!==-2){point=-2;pointNav()}draw()};
 box.onpointerup=box.onpointercancel=()=>{drag=null};
 return card;
}
function render(){
 $('compare').style.setProperty('--scene-aspect',String(scene[0]==='029'?4/3:16/9));nav();$('observation').textContent=notes[scene[0]];panes=[];
 const cards=[pane('输入原图',{url:'images/'+scene[0]+'.jpg'})];
 for(const [key,name] of models){
  const r=rows.find(a=>a.scene===scene[0]&&a.key===key&&a.tier===tier);
  cards.push(pane(name+(key==='aiTextureEnhancement'&&tier==='4K'?' · KS 超分':''),r));
 }
 $('compare').replaceChildren(...cards);draw();
}
window.addEventListener('hashchange',()=>setScene());window.addEventListener('resize',draw);setScene(initial.get('detail'));
