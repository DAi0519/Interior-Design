/**
 * [INPUT]: 依赖Beta任务/布局适配层、主布局服务、模型替身和真实PNG字节
 * [OUTPUT]: 验证逐图标注准入、所选版本/权限、Agent到生图及归档、一次收费和同步恢复
 * [POS]: test 的Beta布局跨层合同，无真实收费或飞书写入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createBetaHousePlanService, normalizeBetaHousePlanInput, verifyHousePlanArchive } from '../src/beta-house-plan.mjs';
import { createBetaRunnerService } from '../src/beta-runner.mjs';
import { betaConfigSnapshot, buildBetaRunFields, betaResultVersion, betaResultCostUsd } from '../src/beta-base.mjs';
import { HOUSE_PLAN_WORKFLOW } from '../src/house-plan-service.mjs';
import { housePlanHash } from '../src/house-plan-prompt.mjs';
const prompt = { code: 'house-plan-layout', version: 2, prompt: '固定规则', sha256: housePlanHash('固定规则'), source: 'feishu:test', published: true };
const models = [{ id: 'gpt-image-2.5-sunburst' }, { id: 'gemini-3.1-pro-preview' }];
const plan = { summary: '主卧保持', spaces: [{ name: '主卧', layout: '双人床靠墙' }], layout_prompt: '保持结构布局家具', warnings: ['尺寸待核对'] };
const input = () => ({ featureMode: 'housePlanLayout', modelKey: 'gptImage25Sunburst', prompt: '增加书房', promptVersion: 2,
  promptAgentModelKey: 'gemini3pro', housePlanPromptSha256: prompt.sha256, housePlanWorkflowVersion: HOUSE_PLAN_WORKFLOW,
  annotations: [{ label: '主卧', x: .1, y: .2, width: .3, height: .4 }] });
async function image(w = 64, h = 96) { const bytes = await sharp({ create: { width: w, height: h, channels: 3, background: '#eee' } }).png().toBuffer();
  return { name: 'plan.png', type: 'image/png', size: bytes.length, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` }; }
function adapter(client) { return createBetaHousePlanService({ getModels: async () => models, getClient: () => client,
  getPrompt: async ({ version, expectedSha256 } = {}) => { if (version && (version !== 2 || expectedSha256 !== prompt.sha256)) throw new Error('版本漂移'); return prompt; } }); }
const batch = () => ({ jobId: 'beta-house-layout-12345', batchId: 'BETA-house-layout-12345', testTime: '2026-11-06 16:00:00', featureMode: 'housePlanLayout',
  sampleSetId: 'SET-house', items: [{ caseId: 'SAMPLE-house', sampleId: 'SAMPLE-house', modelLabel: 'GPT Image 2.5 Sunburst', runId: 'RUN-house-layout-12345', input: input() }] });
async function done(service, id) { for (let i=0;i<200;i++) { const job=service.getJob(id); if (job.status !== 'running') return job; await new Promise(resolve=>setTimeout(resolve,10)); } throw new Error('job timeout'); }
test('布局缺主卧/版本摘要或越界在入队前拒绝；不同样本保留独立标注', () => {
  for (const patch of [{ annotations: [] }, { annotations: [{label:'主卧',x:.9,y:0,width:.4,height:.4}] }, { promptVersion: 0 }, { housePlanPromptSha256: 'bad' }, { styleReferenceImages: [{}] }]) {
    assert.throws(()=>normalizeBetaHousePlanInput({...input(),...patch}));
  }
  assert.deepEqual(normalizeBetaHousePlanInput(input()).annotations,input().annotations);
});
test('布局版本或模型失权拒绝整个批次，不调用模型', async () => {
  const service=adapter({}); await service.verify(batch());
  for (const patch of [{promptVersion:1},{housePlanPromptSha256:'b'.repeat(64)},{modelKey:'aiTextureEnhancement'},{promptAgentModelKey:'unknown'}]) {
    const value=batch();Object.assign(value.items[0].input,patch);await assert.rejects(service.verify(value));
  }
});
test('复用主布局服务：所选Agent/原图/标注/需求到一张成图，实际Prompt及两阶段费用归档并校验', async () => {
  const calls=[];
  const service=adapter({ generatePrompt:async request=>{calls.push('agent');assert.deepEqual(JSON.parse(request.userPrompt).annotations,input().annotations);return {text:JSON.stringify(plan),usageCost:{costUsd:.01}};},
    editImageAsync:async request=>{calls.push('image');assert.ok(request.prompt.startsWith('增加书房'));const [w,h]=request.size.split('x').map(Number);return {images:[{url:(await image(w,h)).dataUrl}],usageCost:{costUsd:.02}};} });
  const request=normalizeBetaHousePlanInput({...input(),referenceImages:[await image()]});
  const prepared=await service.prepare(request);const result=await service.execute(prepared);
  assert.deepEqual(calls,['agent','image']);assert.equal(betaResultCostUsd(result),.03);assert.match(betaResultVersion(result),/house-plan-layout@v2/);
  const fields=result.sync.archiveFields, snapshot=betaConfigSnapshot(request), bytes=Buffer.from(result.images[0].url.split(',')[1],'base64');
  verifyHousePlanArchive(fields,snapshot,bytes);
  for (const changed of [{...snapshot,promptVersion:1},{...snapshot,annotations:[]},{...snapshot,modelKey:'bad'}]) assert.throws(()=>verifyHousePlanArchive(fields,changed,bytes));
  assert.throws(()=>verifyHousePlanArchive({...fields,'最终 Prompt':'篡改'},snapshot,bytes));
  const record=buildBetaRunFields({...batch(),item:batch().items[0]});assert.equal(record['功能'],'户型平面布局');assert.deepEqual(JSON.parse(record['场景参数']).annotations,input().annotations);
});
function runner({ execute, completeRun }) {
  const source=image(); let generations=0, archives=0;
  const service=createBetaRunnerService({ housePlanService:{ verify:async()=>{}, prepare:async value=>{assert.equal(value.referenceImages.length,1);return value;},execute:async value=>{generations++;return execute(value);} },
    generationService:{ executeForMode(){throw new Error('不得调用其他功能');} },sleep:async()=>{},
    baseStore:{ config:{},verifySchema:async()=>{},getSampleSet:async()=>({recordId:'rec-set',status:'可用',sampleSetId:'SET-house',featureMode:'whiteModel',samples:[{sampleId:'SAMPLE-house',recordId:'rec-sample',image:await source}]}),
      resolveSample:async()=>({image:await source}),beginRun:async()=>{archives++;return{recordId:'rec-run'};},completeRun,failRun:async()=>{} } });
  return {service,counts:()=>({generations,archives})};
}
test('Beta单次生成失败不自动收费重跑；已有结果同步失败重试只同步', async () => {
  const failed=runner({execute:async()=>{throw new Error('上游连接断开');},completeRun:async()=>({})});
  await failed.service.start(batch());const job=await done(failed.service,batch().jobId);assert.equal(job.status,'failed');assert.equal(failed.counts().generations,1);
  let sync=0;const good=runner({execute:async()=>({images:[{url:'data:image/png;base64,AA=='}]}),completeRun:async()=>{sync++;if(sync===1)throw new Error('同步超时');return{recordId:'rec-run',recordUrl:'https://example.test/run'};}});
  await good.service.start(batch());assert.equal((await done(good.service,batch().jobId)).status,'failed');assert.equal(good.counts().generations,1);
  const retry=await good.service.retry(batch().jobId,{jobId:'beta-house-layout-retry12345'});assert.equal((await done(good.service,'beta-house-layout-retry12345')).status,'success');assert.equal(good.counts().generations,1);assert.equal(sync,2);
});
test('Beta布局实际Store写入与附件回读，漂移资产阻断成功状态', async () => {
  const { createBetaBaseStore } = await import('../src/beta-base.mjs');
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const source=await image();
  const service=adapter({generatePrompt:async()=>({text:JSON.stringify(plan)}),editImageAsync:async request=>{const [w,h]=request.size.split('x').map(Number);return {images:[{url:(await image(w,h)).dataUrl}]};}});
  const result=await service.execute(await service.prepare({...input(),referenceImages:[source]}));
  for (const corrupt of [false,true]) {
    const fields={}, attachments={};
    const store=createBetaBaseStore({run:async(config,args,options)=>{
      if(args.includes('+record-batch-create')) {const body=JSON.parse(args[args.indexOf('--json')+1]);Object.assign(fields,Object.fromEntries(body.fields.map((name,i)=>[name,body.rows[0][i]])));return {ok:true,data:{record_id_list:['rec-layout']}};}
      if(args.includes('+record-upsert')) Object.assign(fields,JSON.parse(args[args.indexOf('--json')+1]));
      if(args.includes('+record-upload-attachment')) {
        const id=args[args.indexOf('--field-id')+1],name=id===config.inputFieldId?'输入图':id===config.resultFieldId?'结果图':'风格参考图';
        const filename=args[args.indexOf('--file')+1];const bytes=await readFile(join(options.cwd,filename));attachments[name]=[{file_token:`${name}-token`,size:bytes.length}];
      }
      if(args.includes('+record-get')) {const record={...fields,...attachments};return {ok:true,data:{fields:Object.keys(record),data:[Object.values(record)],record_id_list:['rec-layout']}};}
      return {ok:true,data:{}};
    }});
    const body=batch();body.items[0].input.referenceImages=[source];
    await store.beginRun({...body,item:body.items[0]});
    const actual=structuredClone(result);if(corrupt)actual.sync.archiveFields['Agent 版本']=1;
    if(corrupt) {await assert.rejects(store.completeRun('rec-layout',actual),/户型布局实际/);assert.equal(fields['状态'],'运行中');}
    else {await store.completeRun('rec-layout',actual);assert.equal(fields['状态'],'成功');assert.equal(fields['功能'],'户型平面布局');assert.ok(fields['最终 Prompt'].startsWith('增加书房'));assert.equal(attachments['输入图'].length,1);assert.equal(attachments['结果图'].length,1);}
  }
});
