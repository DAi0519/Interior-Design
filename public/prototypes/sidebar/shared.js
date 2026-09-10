/**
 * [INPUT]: 依赖 DESIGN.md 选择语义、房型家具目录快照及共享品牌按钮类
 * [OUTPUT]: 对外提供房型/风格单选、家具多选、1–4 模型多选与张数联动控件
 * [POS]: prototypes/sidebar 隔离探索模块，不接入生产链路
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const rooms = {
  客厅: { defaults: ["沙发", "茶几", "电视柜", "电视"], options: ["沙发", "茶几", "电视柜", "电视", "落地灯", "地毯", "绿植", "挂画"] },
  厨房: { defaults: ["橱柜", "灶台", "水槽"], options: ["橱柜", "冰箱", "灶台", "水槽"] },
  卧室: { defaults: ["床", "床头柜", "衣柜", "窗帘"], options: ["床", "床头柜", "衣柜", "台灯", "梳妆台", "窗帘", "地毯"] },
  书房: { defaults: ["书桌", "办公椅", "书架", "台灯"], options: ["书桌", "办公椅", "书架", "落地灯", "台灯"] },
  餐厅: { defaults: ["餐桌", "餐椅", "餐边柜"], options: ["餐桌", "餐椅", "吊灯", "餐边柜"] },
  儿童房: { defaults: ["儿童床", "书桌", "衣柜", "玩具收纳"], options: ["儿童床", "书桌", "衣柜", "地毯", "玩具收纳"] },
  卫生间: { defaults: ["洗手台", "马桶", "淋浴区", "镜柜"], options: ["洗手台", "马桶", "淋浴区", "镜柜", "毛巾架"] },
  阳台: { defaults: ["休闲椅", "小茶几", "绿植架"], options: ["休闲椅", "小茶几", "绿植架"] },
  玄关: { defaults: ["鞋柜", "换鞋凳"], options: ["鞋柜", "换鞋凳", "全身镜", "收纳筐"] },
  其他: { defaults: [], options: ["沙发", "床", "桌椅", "柜子", "灯具", "窗帘", "地毯", "绿植"] },
};
export const state={room:'客厅',cache:{},style:'智能默认',model:'Flux2 Klein',models:['Flux2 Klein'],resolution:'2K',count:'1 张',notes:'',image:'./sample-before.svg',after:'./sample-after.svg',sample:true,compare:50,resultIndex:0,configTab:'空间',reference:'',generated:false,view:'左右对比',feature:'空房设计',zoom:false};
export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function selection(){return state.cache[state.room]??={items:[...rooms[state.room].defaults],other:'',custom:false};}
export function select(key,label,values){return `<label class="field"><span>${label}</span><select data-field="${key}" aria-label="${label}">${values.map(v=>`<option ${state[key]===v?'selected':''}>${v}</option>`).join('')}</select></label>`;}
export function roomStyle(){return `<div class="block"><div class="labelrow">房间类型</div><div class="roomchoices" role="group" aria-label="房间类型">${Object.keys(rooms).map(r=>`<button class="room-type-option ${r===state.room?'selected':''}" role="radio" aria-checked="${r===state.room}" data-room="${r}">${r}</button>`).join('')}</div></div>`;}
export function styleChoices(){return `<div class="block"><div class="labelrow">设计风格</div><div class="choices" role="group" aria-label="设计风格">${['智能默认','北欧风','奶油法式','现代简约','新中式','中古风'].map(r=>`<button class="style-choice-option ${r===state.style?'selected':''}" role="radio" aria-checked="${r===state.style}" data-style="${r}">${r}</button>`).join('')}</div></div>`;}
export function furniture(){const s=selection();return `<div class="block"><div class="labelrow"><span>确认家具</span><span class="muted">可多选</span></div><div class="roomchoices" role="group" aria-label="家具多选">${[...rooms[state.room].options,'其他'].map(r=>{const checked=r==='其他'?s.custom:s.items.includes(r);return `<button class="room-type-option ${checked?'selected':''}" role="checkbox" aria-checked="${checked}" data-item="${r}">${r}</button>`;}).join('')}</div>${s.custom?`<input class="custom" data-other maxlength="200" aria-label="其他家具" placeholder="填写其他家具" value="${esc(s.other)}">`:''}<p class="hint">${s.items.length?'已选作为需求，未选项仍可由 AI 搭配。':'未指定家具，由 AI 按房型与风格搭配。'}</p></div>`;}
export function modelChoices(){return `<div class="block"><div class="labelrow"><span>出图模型</span><span class="muted">已选 ${state.models.length} / 4</span></div><div class="choices" role="group" aria-label="出图模型多选">${['Banana 2','GPT Image 2','Flux2 Klein','Seedream 5.0','Seedream 5.0 Pro'].map(m=>`<button class="model-option-toggle ${state.models.includes(m)?'selected':''}" role="checkbox" aria-checked="${state.models.includes(m)}" data-model="${m}"><span>${m}</span><i aria-hidden="true">${state.models.includes(m)?'✓':''}</i></button>`).join('')}</div><p class="hint">${state.models.length>1?`每个模型各生成 1 张，共 ${state.models.length} 张。`:'单模型可生成 1–4 张，也可继续选择模型。'}</p></div>`;}
export function featureChoices(){return `<details class="feature-menu"><summary>功能 · 空房设计</summary><div class="choices" role="group" aria-label="功能预览">${['白模渲染','空房设计','精模渲染','效果图美化','图片超分','风格反推','自由生图'].map(f=>`<button class="feature-mode-option ${f==='空房设计'?'selected':''}" data-feature="${f}">${f}</button>`).join('')}</div></details>`;}
export function upload(reference=false){const key=reference?'reference':'image';return `<label class="upload ${reference?'reference':''}">${state[key]?`<img src="${state[key]}" alt="${reference?'风格参考图':'空房原图'}"><span>${reference?'风格参考':'空房原图'}<small>点击替换</small></span>`:`<span class="plus">＋</span><span>${reference?'添加风格参考 · 选填':'上传空房照片'}<small>${reference?'只参考风格，不改变结构':'点击选择，或拖入图片'}</small></span>`}<input type="file" accept="image/png,image/jpeg,image/webp" data-upload="${key}" aria-label="${reference?'上传风格参考图':'上传空房照片'}"></label>`;}
export function notes(demand=false){return `<label class="block"><span>${demand?'你想怎么设计？':'补充要求'} <small class="muted">选填</small></span><textarea data-notes aria-label="设计要求" placeholder="${demand?'例如：奶油法式客厅，需要沙发、茶几和落地灯，不要电视。':'例如：保持通道宽敞，不要电视'}">${esc(state.notes)}</textarea></label>`;}
export function settings(){return `<div class="settings">${modelChoices()}${state.models.includes('Flux2 Klein')?`<label class="block">Flux 负向提示词 <small class="muted">可选</small><textarea data-negative aria-label="负向提示词" placeholder="留空使用系统默认；填写后整段覆盖，仅影响 Flux">${esc(state.negative||'')}</textarea></label>`:''}<div class="pair">${select('resolution','分辨率',['1K','2K'])}${state.models.length===1?select('count','生成张数',['1 张','2 张','3 张','4 张']):'<div class="field"><span>生成张数</span><p>每模型 1 张</p></div>'}</div></div>`;}
export function start(){return `<div class="startbar generation-actions"><button class="start generate-button" data-action="generate" aria-label="开始生成"><span class="button-label">START</span></button><div class="hint">交互演示 · 不调用模型</div></div>`;}
