/**
 * [INPUT]: 依赖原生测试、摄影机球纯绘制与最短路径算法，使用独立记录前后球网的无浏览器 Canvas 记录器
 * [OUTPUT]: 验证原图前后球网和摄影机分层、拖动不重建两份球网缓存、尺寸/DPR更新、隐藏不分配、极限机位有限坐标与跨零度过渡
 * [POS]: test 的多角度绘制回归，不访问GPU、网络或持久化用户图片
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraScene } from '../public/camera-sphere-scene.js';
import { shortestCameraTurn } from '../public/camera-sphere.js';

function canvasRecorder() {
  const calls = { resize:0, stroke:0, fill:0, invalid:0, drawImage:0 };
  const events = [];
  const ctx = new Proxy({}, {
    get(target,key) {
      if (key in target) return target[key];
      if (key==='createLinearGradient') return ()=>({addColorStop(){}});
      return (...args)=>{
        if(key in calls) calls[key]++;
        if(args.some(value=>typeof value==='number'&&!Number.isFinite(value)))calls.invalid++;
        if(['drawImage','stroke','fill','clearRect'].includes(key))events.push({ method:key, args, strokeStyle:target.strokeStyle });
      };
    },
  });
  const canvas={ getContext:()=>ctx };
  for(const key of ['width','height'])Object.defineProperty(canvas,key,{set(){calls.resize++;}});
  return {canvas,calls,events};
}

function sceneFixture(t) {
  const base=canvasRecorder(), front=canvasRecorder(), grids=[];
  const previousDocument=globalThis.document, previousWindow=globalThis.window;
  globalThis.document={createElement:()=>{
    const grid=canvasRecorder();grids.push(grid);return grid.canvas;
  }};
  globalThis.window={devicePixelRatio:2};
  t.after(()=>{
    globalThis.document=previousDocument;globalThis.window=previousWindow;
  });
  const handle={style:{},hidden:true};
  const photo={offsetWidth:96,offsetHeight:132,querySelector:()=>null};
  const stage={clientWidth:720,clientHeight:480,style:{setProperty(){}},querySelector:selector=>({
    '[data-scene]':base.canvas,'.cs-camera-front':front.canvas,'[data-photo]':photo,'.cs-camera-handle':handle,
  })[selector]};
  return { base, front, grids, handle, stage, scene:createCameraScene(stage,{light:true}) };
}

test('后球网在原图底层、前球网在顶层且先于前方摄影机绘制，背面机位不覆盖原图',(t)=>{
  const {base,front,grids,handle,scene}=sceneFixture(t);
  scene.draw({azimuth:0,elevation:0,distance:50});
  assert.equal(grids.length,2,'前后球网使用两个独立缓存');
  const [backGrid,frontGrid]=grids;
  assert.deepEqual(base.events.filter(event=>event.method==='drawImage').map(event=>event.args[0]),[backGrid.canvas]);
  assert.deepEqual(front.events.filter(event=>event.method==='drawImage').map(event=>event.args[0]),[frontGrid.canvas]);
  assert.ok(backGrid.calls.stroke>0);assert.ok(frontGrid.calls.stroke>0);
  assert.deepEqual(new Set(backGrid.events.filter(event=>event.method==='stroke').map(event=>event.strokeStyle)),new Set(['#e4e5e8']));
  assert.deepEqual(new Set(frontGrid.events.filter(event=>event.method==='stroke').map(event=>event.strokeStyle)),new Set(['#c4c6cb']));
  assert.ok(front.events.findIndex(event=>event.method==='drawImage')<front.events.findIndex(event=>event.method==='fill'),
    '前方摄影机绘制在前球网之上');
  assert.ok(front.calls.fill>0);assert.equal(handle.hidden,false);
  const frontFill=front.calls.fill,backFill=base.calls.fill,frontStart=front.events.length;
  scene.draw({azimuth:180,elevation:0,distance:50});
  assert.deepEqual(front.events.slice(frontStart).map(event=>event.method),['clearRect','drawImage'],
    '背面机位仍显示前球网，但不把摄影机画到原图前方');
  assert.equal(front.calls.fill,frontFill);
  assert.ok(base.calls.fill>backFill+1,'背面摄影机与视锥共同绘制到原图底层');
});

test('摄影机逐帧不重建两份球网；尺寸或DPR变化才重建，隐藏时不分配',(t)=>{
  const {base,front,grids,stage,scene}=sceneFixture(t);
  stage.clientHeight=0;scene.draw({azimuth:0,elevation:0,distance:0});
  assert.ok([base,front,...grids].every(layer=>layer.calls.resize===0),'初始隐藏不分配零尺寸画布');
  stage.clientHeight=480;scene.draw({azimuth:0,elevation:0,distance:50});
  assert.equal(grids.length,2);
  const firstGridStrokes=grids.map(grid=>grid.calls.stroke);
  assert.ok(firstGridStrokes.every(count=>count>0));
  for(let a=0;a<=360;a+=15)for(const e of [-30,0,60])scene.draw({azimuth:a,elevation:e,distance:100});
  assert.equal(grids.length,2,'拖动不创建新的缓存画布');
  for(const layer of [base,front,...grids]) {
    assert.equal(layer.calls.resize,2);
    assert.equal(layer.calls.invalid,0,'所有极限机位绘制坐标均有限');
  }
  assert.deepEqual(grids.map(grid=>grid.calls.stroke),firstGridStrokes);
  stage.clientWidth=390;scene.draw({azimuth:0,elevation:0,distance:0});
  const resizedGridStrokes=grids.map(grid=>grid.calls.stroke);
  for(const layer of [base,front,...grids])assert.equal(layer.calls.resize,4);
  assert.ok(resizedGridStrokes.every((count,index)=>count>firstGridStrokes[index]));
  globalThis.window.devicePixelRatio=1;scene.draw({azimuth:0,elevation:0,distance:50});
  for(const layer of [base,front,...grids])assert.equal(layer.calls.resize,6);
  assert.ok(grids.every((grid,index)=>grid.calls.stroke>resizedGridStrokes[index]));
  stage.clientHeight=0;scene.draw({azimuth:0,elevation:0,distance:0});
  for(const layer of [base,front,...grids]) {
    assert.equal(layer.calls.resize,6,'隐藏工作区不分配零尺寸画布');
    assert.equal(layer.calls.invalid,0);
  }
});

test('方位预设跨过零度时沿最短弧线移动',()=>{
  assert.equal(shortestCameraTurn(350,10),20);
  assert.equal(shortestCameraTurn(10,350),-20);
  assert.equal(shortestCameraTurn(360,0),0);
  assert.equal(shortestCameraTurn(315,45),90);
});
