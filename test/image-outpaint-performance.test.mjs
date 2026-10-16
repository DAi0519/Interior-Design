/**
 * [INPUT]: 依赖真实扩图连续交互绑定，以及共享 fixture 提供的可控 RAF、合成变换后矩形、DOM 写入与提交计数
 * [OUTPUT]: 对外提供高频输入合帧/最新坐标、结束和提交前 flush、取消和配置切换丢弃旧帧、仅变换绘制与全页通知隔离回归保障
 * [POS]: test 的扩图交互性能合同测试，用确定性工作量替代不稳定的机器耗时，不调用网络或 GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { configs, fixture, renderedImageRect, source } from "./image-outpaint-fixture.mjs";

const geometry = (ui) => renderedImageRect(ui.image);
const selectionWrites = (ui) => ui.document.writes.filter(({ kind, node }) => kind === "attribute" && (
  ["outpaintEngine", "outpaintRatio", "outpaintResolution"].some((key) => Object.hasOwn(node.dataset, key))
  || node.id === "imageOutpaintModelSelect" || node.id === "imageOutpaintModelStatus"
));
const mouse = (ui, name, x, y) => ui.document.dispatch(name, { clientX: x, clientY: y });
const startCorner = (ui) => ui.handle("se").dispatch("mousedown", { clientX: 500, clientY: 500 });
const startMove = (ui) => ui.canvas.dispatch("mousedown", { clientX: 500, clientY: 500 });

test("角点 burst 只处理本帧最新坐标，局部绘制不重渲染选项或通知全页", () => {
  const ui = fixture();
  const reference = fixture();
  startCorner(ui);
  startCorner(reference);
  const initial = geometry(ui);
  const options = [...ui.node("ModelSelect").children];
  const changes = ui.changes();
  ui.clearWrites();
  for (let index = 1; index <= 120; index += 1) mouse(ui, "mousemove", 500 + index / 2, 500 + index / 4);
  assert.deepEqual(geometry(ui), initial);
  assert.equal(ui.frames.pending(), 1);
  assert.equal(ui.paints(), 0);
  ui.frames.step();
  mouse(reference, "mousemove", 560, 530);
  reference.frames.step();
  assert.deepEqual(geometry(ui), geometry(reference));
  assert.equal(ui.paints(), 1);
  assert.equal(ui.frames.callbacks(), 1);
  assert.deepEqual(selectionWrites(ui), []);
  assert.deepEqual(ui.node("ModelSelect").children, options);
  assert.equal(ui.changes(), changes);
  mouse(ui, "mouseup", 560, 530);
  assert.equal(ui.changes(), changes + 1);
  assert.equal(ui.frames.pending(), 0);
});

test("移动原图也合并高频坐标，按帧更新位置并仅在结束时通知", () => {
  const ui = fixture();
  startMove(ui);
  const initial = geometry(ui);
  const changes = ui.changes();
  ui.clearWrites();
  for (let index = 1; index <= 80; index += 1) mouse(ui, "mousemove", 500 + index, 500 - index / 2);
  assert.deepEqual(geometry(ui), initial);
  assert.equal(ui.frames.pending(), 1);
  ui.frames.step();
  assert.equal(ui.paints(), 1);
  assert.notEqual(geometry(ui).left, initial.left);
  assert.equal(geometry(ui).width, initial.width);
  assert.deepEqual(selectionWrites(ui), []);
  assert.equal(ui.changes(), changes);
  mouse(ui, "mouseup", 580, 460);
  assert.equal(ui.changes(), changes + 1);
  assert.equal(ui.request().items[0].input.outpaintCanvas.ratio, "16:9");
});

test("mouseup 在首帧前采用松手最后坐标，任务提交与可见构图一致", () => {
  for (const start of [startMove, startCorner]) {
    const ui = fixture();
    const reference = fixture();
    start(ui);
    start(reference);
    const changes = ui.changes();
    mouse(ui, "mousemove", 510, 505);
    mouse(ui, "mouseup", 560, 530);
    mouse(reference, "mousemove", 560, 530);
    reference.frames.step();
    mouse(reference, "mouseup", 560, 530);
    assert.deepEqual(geometry(ui), geometry(reference));
    assert.deepEqual(ui.request().items[0].input, reference.request().items[0].input);
    assert.equal(ui.changes(), changes + 1);
    assert.equal(ui.frames.pending(), 0);
    const final = geometry(ui);
    ui.frames.fireCanceled();
    ui.frames.step();
    assert.deepEqual(geometry(ui), final);
  }
});

test("START 请求和 validate 在帧到来前结算最后一次缩放或移动", () => {
  for (const start of [startMove, startCorner]) {
    for (const finish of [(ui) => ui.request(), (ui) => ui.binding.validate()]) {
      const ui = fixture();
      const reference = fixture();
      start(ui);
      start(reference);
      const changes = ui.changes();
      mouse(ui, "mousemove", 560, 530);
      mouse(reference, "mousemove", 560, 530);
      reference.frames.step();
      mouse(reference, "mouseup", 560, 530);
      finish(ui);
      assert.deepEqual(ui.request().items[0].input, reference.request().items[0].input);
      assert.deepEqual(geometry(ui), geometry(reference));
      assert.equal(ui.changes(), changes + 1);
      assert.equal(ui.frames.pending(), 0);
    }
  }
});

test("touchend 使用 changedTouches 最后坐标，touchcancel 丢弃待处理坐标", () => {
  for (const target of [(ui) => ui.canvas, (ui) => ui.handle("se")]) {
    const ui = fixture();
    target(ui).dispatch("touchstart", { touches: [{ clientX: 500, clientY: 500 }] });
    ui.document.dispatch("touchmove", { touches: [{ clientX: 520, clientY: 510 }] });
    ui.frames.step();
    const visible = geometry(ui);
    ui.document.dispatch("touchmove", { touches: [{ clientX: 600, clientY: 550 }] });
    ui.document.dispatch("touchcancel", { touches: [], changedTouches: [{ clientX: 600, clientY: 550 }] });
    ui.frames.fireCanceled();
    ui.frames.step();
    assert.deepEqual(geometry(ui), visible);
    assert.equal(ui.frames.pending(), 0);
    const reference = fixture();
    target(reference).dispatch("touchstart", { touches: [{ clientX: 500, clientY: 500 }] });
    reference.document.dispatch("touchmove", { touches: [{ clientX: 520, clientY: 510 }] });
    reference.frames.step();
    reference.document.dispatch("touchend", { touches: [], changedTouches: [{ clientX: 520, clientY: 510 }] });
    target(ui).dispatch("touchstart", { touches: [{ clientX: 500, clientY: 500 }] });
    target(reference).dispatch("touchstart", { touches: [{ clientX: 500, clientY: 500 }] });
    // -------- 另一次独立触摸按最终坐标结束，以新基点计算，不重用取消的帧 --------
    ui.document.dispatch("touchmove", { touches: [{ clientX: 510, clientY: 505 }] });
    ui.document.dispatch("touchend", { touches: [], changedTouches: [{ clientX: 550, clientY: 525 }] });
    reference.document.dispatch("touchmove", { touches: [{ clientX: 550, clientY: 525 }] });
    reference.frames.step();
    reference.document.dispatch("touchend", { touches: [], changedTouches: [{ clientX: 550, clientY: 525 }] });
    assert.equal(ui.frames.pending(), 0);
    assert.notDeepEqual(geometry(ui), visible);
    assert.deepEqual(ui.request().items[0].input, reference.request().items[0].input);
    const final = geometry(ui);
    ui.frames.fireCanceled();
    assert.deepEqual(geometry(ui), final);
  }
});

test("换图、切比例/分辨率/引擎、刷新配置或隐藏预览都不会应用旧拖拽帧", () => {
  const resetters = [
    (ui) => ui.setSource({ ...source, name: "replacement.png" }),
    (ui) => ui.root.querySelector('[data-outpaint-ratio="3:4"]').dispatch("click"),
    (ui) => ui.root.querySelector('[data-outpaint-resolution="4K"]').dispatch("click"),
    (ui) => ui.root.querySelector('[data-outpaint-engine="qwenImageEdit2511"]').dispatch("click"),
    (ui) => ui.binding.configure({ ...configs[0], engines: [{ ...configs[0], key: "comfyui" }, ...configs.slice(1)] }),
    (ui) => ui.binding.closeSettings(),
    (ui) => ui.document.dispatch("pointercancel"),
    (ui) => { ui.document.hidden = true; ui.document.visibilityState = "hidden"; ui.document.dispatch("visibilitychange"); },
    (ui) => ui.document.defaultView.dispatch("blur"),
  ];
  for (const start of [startMove, startCorner]) {
    for (const reset of resetters) {
      const ui = fixture();
      start(ui);
      mouse(ui, "mousemove", 580, 540);
      assert.equal(ui.frames.pending(), 1);
      reset(ui);
      const after = geometry(ui);
      const changes = ui.changes();
      assert.equal(ui.frames.pending(), 0);
      ui.frames.fireCanceled();
      ui.frames.step();
      mouse(ui, "mouseup", 580, 540);
      assert.deepEqual(geometry(ui), after);
      assert.equal(ui.changes(), changes);
      assert.equal(ui.canvas.classList.contains("dragging"), false);
      assert.equal(ui.handle("se").parentElement.classList.contains("resizing"), false);
    }
  }
});

test("换图后立即 START 不会冲刷旧图待处理帧，新图片恢复默认构图", () => {
  for (const start of [startMove, startCorner]) {
    const ui = fixture();
    ui.preset(3).dispatch("click");
    start(ui);
    mouse(ui, "mousemove", 580, 540);
    ui.setSource({ ...source, name: "immediate-replacement.png", width: 2048, height: 768 }, { render: false });
    const request = ui.request();
    assert.equal(request.sharedInput.referenceImages[0].name, "immediate-replacement.png");
    assert.equal(request.items[0].input.outpaintCanvas.scale, 2 / 3);
    assert.deepEqual(request.items[0].input.outpaintCanvas.position, { x: 0.5, y: 0.5 });
    const visible = geometry(ui);
    ui.frames.fireCanceled();
    ui.frames.step();
    assert.deepEqual(geometry(ui), visible);
    assert.equal(ui.frames.pending(), 0);
  }
});

test("滑杆连续输入按帧预览，change 提交最新大小并只通知一次", () => {
  const ui = fixture();
  const range = ui.node("ScaleRange");
  const changes = ui.changes();
  const initial = geometry(ui);
  ui.clearWrites();
  for (const scale of [0.6, 0.57, 0.51]) { range.value = String(scale); range.dispatch("input"); }
  assert.deepEqual(geometry(ui), initial);
  assert.equal(ui.frames.pending(), 1);
  ui.frames.step();
  assert.equal(ui.paints(), 1);
  assert.equal(ui.changes(), changes);
  assert.equal(range.getAttribute("aria-valuetext"), "51%");
  range.value = "0.49";
  range.dispatch("input");
  range.dispatch("change");
  assert.equal(ui.request().items[0].input.outpaintCanvas.scale, 0.49);
  assert.equal(ui.changes(), changes + 1);
  assert.equal(ui.frames.pending(), 0);
});

test("滑杆 mouseup、失焦及 START 都结算尚未显示的末值，不重复通知", () => {
  for (const finish of [
    (ui) => ui.document.dispatch("mouseup"),
    (ui) => ui.node("ScaleRange").dispatch("blur"),
    (ui) => ui.request(),
  ]) {
    const ui = fixture();
    const changes = ui.changes();
    ui.node("ScaleRange").value = "0.47";
    ui.node("ScaleRange").dispatch("input");
    finish(ui);
    assert.equal(ui.request().items[0].input.outpaintCanvas.scale, 0.47);
    assert.equal(ui.frames.pending(), 0);
    assert.equal(ui.changes(), changes + 1);
    ui.node("ScaleRange").dispatch("change");
    ui.node("ScaleRange").dispatch("blur");
    assert.equal(ui.changes(), changes + 1);
  }
});

test("取消滑杆恢复最后已显示的大小和 thumb，不保留未处理的原生输入值", () => {
  const ui = fixture();
  const range = ui.node("ScaleRange");
  range.value = "0.55";
  range.dispatch("input");
  ui.frames.step();
  const visible = geometry(ui);
  range.value = "0.47";
  range.dispatch("input");
  ui.document.defaultView.dispatch("blur");
  assert.equal(Number(range.value), 0.55);
  ui.frames.fireCanceled();
  ui.frames.step();
  assert.deepEqual(geometry(ui), visible);
  assert.equal(ui.request().items[0].input.outpaintCanvas.scale, 0.55);
});

test("30/60/120Hz 输入在60Hz显示周期内最多每帧一次绘制，结束统一通知", (context) => {
  const samples = [];
  for (const hz of [30, 60, 120]) {
    const ui = fixture();
    startCorner(ui);
    const changes = ui.changes();
    ui.clearWrites();
    let events = 0;
    for (let tick = 1; tick <= 120; tick += 1) {
      if (tick % (120 / hz) === 0) { events += 1; mouse(ui, "mousemove", 500 + tick / 2, 500 + tick / 4); }
      if (tick % 2 === 0) ui.frames.step();
    }
    assert.equal(ui.paints(), Math.min(hz, 60));
    assert.equal(ui.frames.callbacks(), Math.min(hz, 60));
    assert.equal(ui.changes(), changes);
    assert.deepEqual(selectionWrites(ui), []);
    const frames = ui.frames.callbacks();
    mouse(ui, "mouseup", 560, 530);
    assert.equal(ui.changes(), changes + 1);
    samples.push({ inputHz: hz, inputEvents: events, displayFrames: 60, previewPaints: frames, oldPerEventPaints: events });
  }
  context.diagnostic(JSON.stringify(samples));
});
