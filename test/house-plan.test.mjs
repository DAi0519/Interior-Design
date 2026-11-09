/**
 * [INPUT]: 依赖户型布局服务/资产解析、共享任务HTTP边界、真实图片与模型替身
 * [OUTPUT]: 验证实际标注图像素/安全转义/送模归档一致、16384-token额度/截断零生图、主卧准入、默认模型、Agent到生图顺序/原文、失败零二次调用及命名空间隔离
 * [POS]: test 的户型平面布局专项合同，不发起真实付费请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readHousePlanConfig, prepareHousePlanInput, executeHousePlan, validateHousePlanAnnotations } from '../src/house-plan-service.mjs';
import { parseHousePlanOutput, getHousePlanPrompt, housePlanHash } from '../src/house-plan-prompt.mjs';
import { createFloorPlanApiHandler } from '../src/floor-plan-api.mjs';
import { staticSecurityHeaders } from '../src/http-security.mjs';
import { housePlanAnnotationSvg } from '../public/house-plan-annotation.js';
import { floorPlanArchiveInput } from '../src/floor-plan-archive-input.mjs';
const asset = { code: 'house-plan-layout', version: 1, sha256: 'a'.repeat(64), source: 'feishu:test:house-plan-layout@v1', published: true,
  prompt: 'PRIVATE_USER_ORIGINAL' };
const getPrompt = async () => structuredClone(asset);
const getModels = async () => [{ id: 'gpt-image-2.5-sunburst' }, { id: 'gemini-3.1-pro-preview' }];
const image = async (width=96,height=64) => sharp({create:{width,height,channels:3,background:'#eeeeee'}}).png().toBuffer();
async function input() { const bytes=await image(); return { action:'layout', referenceImage:{name:'plan.png',type:'image/png',size:bytes.length,dataUrl:`data:image/png;base64,${bytes.toString('base64')}`},
  annotations:[{label:'主卧',x:.1,y:.1,width:.3,height:.3}], userRequirements:'  保留主卧，增加衣柜  ', agentModelKey:'gemini3pro', promptVersion:1,promptSha256:asset.sha256 }; }
const plan = { summary: '两卧室一卫生间，主卧增加衣柜。', spaces:[{name:'主卧',layout:'原主卧内布置床与衣柜，保留门前通行'}], layout_prompt:'保留原户型布局，在指定主卧配置家具', warnings:[] };
const prepare = async value => prepareHousePlanInput(value, {getModels,getPrompt});
test('主卧必选、标注不越界且不接受隐式数字转换', () => {
  for (const items of [[],[{label:'书房',x:0,y:0,width:.5,height:.5}],[{label:'主卧',x:.8,y:0,width:.5,height:.5}],[{label:'主卧',x:'0',y:0,width:.5,height:.5}]]) assert.throws(()=>validateHousePlanAnnotations(items));
  assert.equal(validateHousePlanAnnotations([{label:'主卧',x:0,y:0,width:.5,height:.5}])[0].label,'主卧');
});
test('默认GPT2.5、配置不泄露正文，默认失权不静默换模', async () => {
  const config=await readHousePlanConfig({getModels,getPrompt}); assert.equal(config.defaultModel,'gptImage25Sunburst'); assert.equal(config.available,true);
  assert.ok(!JSON.stringify(config).includes('PRIVATE_'));
  const value=await input(); const prepared=await prepare(value); assert.equal(prepared.modelKey,'gptImage25Sunburst'); assert.equal(prepared.source.submittedFormat,'png');
  assert.equal(prepared.source.submittedWidth,96); assert.equal(prepared.source.submittedHeight,64);
  await assert.rejects(prepareHousePlanInput(value,{getModels:async()=>[{id:'gemini-3.1-pro-preview'},{id:'gpt-image-2.6-flare'}],getPrompt}),/不可用/);
});
test('同一带标注图实际送入Agent、生图及主工作台归档，原图独立保留', async () => {
  const calls=[]; const original=await input(); const prepared=await prepare(original); let compiledPrompt;
  assert.notEqual(prepared.imageUrl, original.referenceImage.dataUrl);
  assert.equal(housePlanHash(Buffer.from(prepared.imageUrl.split(',')[1],'base64')),prepared.source.submittedSha256);
  const client={ generatePrompt:async request=>{ calls.push('agent'); assert.equal(request.maxOutputTokens,16384); assert.equal(request.requireCompleteOutput,true); assert.equal(request.systemPrompt,asset.prompt); assert.equal(request.imageUrl,prepared.imageUrl); const user=JSON.parse(request.userPrompt);
    assert.equal(Object.keys(user)[0],'user_requirements'); assert.equal(user.user_requirements,prepared.userRequirements); assert.deepEqual(user.annotations,prepared.annotations);
    assert.equal(user.default_requirements,undefined); return {text:JSON.stringify(plan),requestId:'agent-id',usageCost:{costUsd:.01}}; },
    editImageAsync:async request=>{ calls.push('image'); assert.ok(request.prompt.startsWith(prepared.userRequirements+'\n\n'));
      assert.ok(request.prompt.includes(plan.layout_prompt)); assert.ok(request.prompt.endsWith(asset.prompt)); assert.equal(request.images[0].image_url,prepared.imageUrl); assert.equal(request.n,1);
      const [w,h]=request.size.split('x').map(Number); const bytes=await image(w,h); return {images:[{url:`data:image/png;base64,${bytes.toString('base64')}`}],requestId:'image-id',usageCost:{costUsd:.02}}; }};
  const result=await executeHousePlan(prepared,{client,getModels,getPrompt,onCompiledPrompt:value=>{compiledPrompt=value;}}); assert.deepEqual(calls,['agent','image']);
  assert.equal(result.featureMode,'housePlanLayout'); assert.equal(result.receipts.agent.requestId,'agent-id'); assert.equal(result.receipts.image.requestId,'image-id'); assert.deepEqual(result.plan,plan);
  const archive=floorPlanArchiveInput({featureMode:'housePlanLayout',jobId:'annotated-test',result,
    sourceImage:original.referenceImage,submittedImageUrl:prepared.imageUrl,
    compiledPrompt});
  assert.equal(archive.referenceImages[0].imageUrl,prepared.imageUrl);
  assert.equal(archive.referenceImages[1].imageUrl,original.referenceImage.dataUrl);
  assert.deepEqual(archive.workflow.referenceRoles,['space-annotated-plan','original']);
});

test('送模图保留完整尺寸与框外原像素，主卧橙色/其他空间蓝色且文字安全转义', async () => {
  const value=await input(), bytes=await image(1000,800);
  value.referenceImage={name:'plan.png',type:'image/png',size:bytes.length,dataUrl:`data:image/png;base64,${bytes.toString('base64')}`};
  value.annotations.push({label:'书房<&"',x:.6,y:.5,width:.2,height:.3});
  const prepared=await prepare(value);
  const {data,info}=await sharp(Buffer.from(prepared.imageUrl.split(',')[1],'base64')).removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,1000);assert.equal(info.height,800);
  const pixel=(x,y)=>Array.from(data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3));
  assert.deepEqual(pixel(900,700),[238,238,238]);
  const orange=pixel(200,200),blue=pixel(700,500);
  assert.ok(orange[0]>orange[1] && orange[1]>orange[2]);
  assert.ok(blue[2]>blue[1] && blue[1]>blue[0]);
  const svg=housePlanAnnotationSvg(value.annotations,1000,800);
  assert.ok(svg.includes('书房&lt;&amp;&quot;'));assert.ok(!svg.includes('书房<&"'));
});
test('空特殊需求使用默认规则，Agent无效结果阻止生图并保留Agent费用', async () => {
  const value=await input(); value.userRequirements=''; const prepared=await prepare(value); let images=0;
  await assert.rejects(executeHousePlan(prepared,{getModels,getPrompt,client:{generatePrompt:async request=>{
    const user=JSON.parse(request.userPrompt); assert.match(user.default_requirements,/普通家庭默认布局/); assert.equal(user.user_requirements,undefined);
    return {text:'{}',requestId:'bad-agent',usageCost:{costUsd:.03}}; },editImageAsync:async()=>{images++;}}}), error=>{
    assert.equal(error.floorPlanDiagnostic.agent.requestId,'bad-agent'); return /未调用生图/.test(error.message); }); assert.equal(images,0);
});
test('Agent后失权停止生图，图片失败保留两阶段回执且不重试', async () => {
  const prepared=await prepare(await input()); let calls=0, permitted=true;
  const client={generatePrompt:async()=>{permitted=false;return{text:JSON.stringify(plan)}},editImageAsync:async()=>{calls++;}};
  await assert.rejects(executeHousePlan(prepared,{getPrompt,getModels:async()=>permitted?getModels():[],client}),/不可用/); assert.equal(calls,0);
  client.generatePrompt=async()=>({text:JSON.stringify(plan),requestId:'agent-ok'});
  client.editImageAsync=async()=>{calls++;throw Object.assign(new Error('private'),{requestId:'image-failed',usageCost:{costUsd:.02}});};
  await assert.rejects(executeHousePlan(prepared,{getPrompt,getModels,client}),e=>{assert.equal(e.floorPlanDiagnostic.agent.requestId,'agent-ok');assert.equal(e.floorPlanDiagnostic.image.requestId,'image-failed');return !e.message.includes('private');});assert.equal(calls,1);
});
test('资产核对版本SHA及记录身份，结构化输出拒绝空方案', async()=>{
  const text=asset.prompt;const getAgent=async()=>({code:asset.code,version:1,published:true,systemPrompt:text});
  const value=await getHousePlanPrompt({getAgent,listVersions:async()=>[{version:1}],expectedSha256:housePlanHash(text)});assert.equal(value.code,asset.code);
  await assert.rejects(getHousePlanPrompt({getAgent,listVersions:async()=>[{version:1},{version:2}]}));
  await assert.rejects(getHousePlanPrompt({getAgent,listVersions:async()=>[{version:1}],expectedSha256:'b'.repeat(64)}));
  assert.throws(()=>parseHousePlanOutput(JSON.stringify({...plan,spaces:[]})));
});
test('新API命名空间不接管旧接口或geometry，同ID只执行一次',async()=>{
  let runs=0;const api=createFloorPlanApiHandler({prefix:'/api/house-plan',featureMode:'housePlanLayout',geometryEnabled:false,
    readJson:async request=>request.body,sendJson:(response,status,body)=>Object.assign(response,{status,body}), getClient:async()=>({}),getModels,
    prepareInput:async input=>input,execute:async()=>{runs++;return{featureMode:'housePlanLayout'};},readConfig:async()=>({})});
  const call=async(method,path,body)=>{const response={};const handled=await api({method,url:path,body},response,path);return{handled,...response};};
  assert.equal((await call('GET','/api/floor-plan/config')).handled,false);assert.equal((await call('GET','/api/house-plan/geometry-config')).handled,false);
  const body={jobId:'house-test-123',action:'layout'};await call('POST','/api/house-plan/jobs',body);await new Promise(r=>setTimeout(r,0));await call('POST','/api/house-plan/jobs',body);
  assert.equal(runs,1);const found=await call('GET','/api/house-plan/jobs/house-test-123');assert.equal(found.body.job.featureMode,'housePlanLayout');
  await assert.rejects(call('POST','/api/house-plan/jobs',{...body,action:'other'}),/不同输入/);
  assert.equal(staticSecurityHeaders('/house-plan.html')['X-Frame-Options'],'SAMEORIGIN');
});
test('飞书多版本默认最新，显式旧版保持原文与SHA，下架及同号重复阻断', async () => {
  let versions = [{version:1},{version:2}];
  const getAgent = async (_code,{version}) => ({code:'house-plan-layout',version,published:true,systemPrompt:`用户原文v${version}`});
  const listVersions = async () => versions;
  assert.equal((await getHousePlanPrompt({getAgent,listVersions})).version,2);
  const selected = await getHousePlanPrompt({version:1,getAgent,listVersions,expectedSha256:housePlanHash('用户原文v1')});
  assert.equal(selected.prompt,'用户原文v1');
  await assert.rejects(getHousePlanPrompt({version:1,getAgent,listVersions,expectedSha256:housePlanHash('已变化')}),/已变更/);
  versions=[{version:2}]; await assert.rejects(getHousePlanPrompt({version:1,getAgent,listVersions}),/已下架/);
  versions=[{version:1},{version:1}]; await assert.rejects(getHousePlanPrompt({version:1,getAgent,listVersions}));
});

test('布局Agent截断明确提示，保留费用且不触发生图或重试', async () => {
  const prepared = await prepare(await input()); let agents = 0, images = 0;
  await assert.rejects(executeHousePlan(prepared, { getModels, getPrompt, client: {
    generatePrompt: async () => { agents++; throw Object.assign(new Error('private'), {
      code: 'incomplete_prompt', requestId: 'cut-agent', usageCost: { costUsd: .01 } }); },
    editImageAsync: async () => { images++; },
  } }), error => {
    assert.match(error.message, /输出被截断.*未调用生图/);
    assert.equal(error.floorPlanDiagnostic.agent.requestId, 'cut-agent');
    assert.equal(error.floorPlanDiagnostic.agent.usageCost.costUsd, .01); return true;
  });
  assert.equal(agents, 1); assert.equal(images, 0);
});
