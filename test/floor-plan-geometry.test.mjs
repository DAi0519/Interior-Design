/**
 * [INPUT]: 依赖几何识图服务、内存视觉目录与旧方案样例
 * [OUTPUT]: 验证所选模型执行和收费前阻断
 * [POS]: test 的几何识别模型路由合同
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { prepareGeometry, executeGeometry, readGeometryConfig } from '../src/floor-plan-geometry.mjs';
import { demoFloorPlanSpec } from '../public/floor-plan-state.js';
test('识图只列可读图且有权限的模型，执行使用用户选择，撤权后不调用', async () => {
  let ids = ['kimi-k2.5','gemini-3.1-pro-preview','deepseek-v4-pro'];
  const deps = { getModels: async () => ids.map(id => ({ id })), getAsset: async () => ({ version:1, sha256:'test', body:'test' }) };
  const config = await readGeometryConfig(deps);
  assert.equal(config.models.length, 2);
  const bytes = await sharp({create:{width:30,height:20,channels:3,background:'#fff'}}).png().toBuffer();
  const prepared = await prepareGeometry({ action:'geometry',modelKey:config.models.find(m=>m.id==='kimi-k2.5').key,promptVersion:1,promptSha256:'test',
    referenceImage:{type:'image/png',dataUrl:'data:image/png;base64,'+bytes.toString('base64')} },deps);
  let calls = 0;
  const client = {generatePrompt: async request => {calls++; assert.equal(request.model,'kimi-k2.5'); return {text:JSON.stringify({spec:demoFloorPlanSpec(),warnings:[]})};}};
  const run = () => executeGeometry(prepared,{...deps,client,onProgress:()=>{}});
  assert.equal((await run()).model.id,'kimi-k2.5');
  ids=['gemini-3.1-pro-preview'];
  await assert.rejects(run(),/不可用/);assert.equal(calls,1);
});
