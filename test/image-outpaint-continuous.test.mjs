/**
 * [INPUT]: 依赖三引擎真实扩图控制器/共享 DOM fixture、连续变换模块及服务端共用的整数画布规划
 * [OUTPUT]: 对外提供亚像素逐帧拖动/四角缩放无冻结、固定比例与对角、结束/重绘无回弹、4K图像仅合成变换及提交网格误差界限回归保障
 * [POS]: test 的扩图可见轨迹验证，保存旧整数算法的确定性对照，不以事件或函数计数代替连续性，不调用网络或 GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { outpaintCanvasPlan, outpaintScaleBounds } from "../public/image-outpaint-geometry.js";
import { outpaintCornerTransform, outpaintVisualPlan, prepareOutpaintCorner } from "../public/image-outpaint-transform.js";
import { configs, fixture, renderedImageRect, source } from "./image-outpaint-fixture.mjs";

const EPSILON = 1e-8;
const ENGINES = ["comfyui", "qwenImageEdit2511", "gptImage25Sunburst"];
const CORNERS = ["nw", "ne", "sw", "se"];
const targetFor = (ui) => Object.fromEntries(ui.node("OutputSize").textContent.split(" × ").map((value, index) => [index ? "height" : "width", Number(value)]));
const rectFor = (ui) => renderedImageRect(ui.image, targetFor(ui));
const mouse = (ui, name, x, y) => ui.document.dispatch(name, { clientX: x, clientY: y });
const anchor = (rect, corner) => ({ x: rect.left + (corner.endsWith("w") ? rect.width : 0), y: rect.top + (corner.startsWith("n") ? rect.height : 0) });
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < EPSILON, `${message}: ${actual} / ${expected}`);
const sameRect = (actual, expected) => Object.keys(expected).forEach((key) => near(actual[key], expected[key], key));

function selectEngine(ui, engine) {
  ui.root.querySelector(`[data-outpaint-engine="${engine}"]`).dispatch("click");
}

function sampleTrajectory({ ui, operation, step, screen }) {
  const target = targetFor(ui);
  ui.canvas.getBoundingClientRect = () => ({ ...screen, left: 0, top: 0 });
  const handle = operation === "move" ? ui.canvas : ui.handle("se");
  handle.dispatch("mousedown", { clientX: 500, clientY: 500 });
  const first = rectFor(ui);
  const samples = [first];
  for (let index = 1; index <= 100; index += 1) {
    mouse(ui, "mousemove", 500 + index * step, 500 + (operation === "resize" ? index * step : 0));
    ui.frames.step();
    samples.push(rectFor(ui));
  }
  const field = operation === "move" ? "left" : "width";
  const deltas = samples.slice(1).map((rect, index) => (rect[field] - samples[index][field]) * screen.width / target.width);
  return { target, first, samples, deltas, freezes: deltas.filter((delta) => Math.abs(delta) < EPSILON).length };
}

// -------- 复现改动前的可见整数轨迹：移动 round，缩放走源图取整及 Flux ceil32 --------
function legacyTrajectory({ operation, step, screen, limits, target }) {
  const options = { source, ratio: "16:9", resolution: "2K", scale: 2 / 3, position: { x: 0.5, y: 0.5 }, limits };
  const initial = outpaintCanvasPlan(options);
  const field = operation === "move" ? "left" : "width";
  let previous = operation === "move" ? initial.expansion.left : initial.prepared.width;
  const deltas = [];
  for (let index = 1; index <= 100; index += 1) {
    const dx = index * step / screen.width * target.width;
    const dy = index * step / screen.height * target.height;
    const projection = (dx * initial.prepared.width + dy * initial.prepared.height) / (initial.prepared.width ** 2 + initial.prepared.height ** 2);
    const plan = outpaintCanvasPlan({ ...options, ...(operation === "move"
      ? { position: { x: 0.5 + dx / (target.width - initial.prepared.width), y: 0.5 } }
      : { scale: options.scale * (1 + projection) }) });
    const value = field === "left" ? plan.expansion.left : plan.prepared.width;
    deltas.push((value - previous) * screen.width / target.width);
    previous = value;
  }
  return { freezes: deltas.filter((delta) => Math.abs(delta) < EPSILON).length, maxJump: Math.max(...deltas.map(Math.abs)) };
}

test("三引擎100帧0.1/0.2屏幕像素移动与缩放每帧连续，保留真实原图比例", (context) => {
  const metrics = [];
  for (const [engineIndex, engine] of ENGINES.entries()) {
    for (const operation of ["move", "resize"]) {
      for (const compact of [false, true]) {
        const ui = fixture();
        selectEngine(ui, engine);
        const target = targetFor(ui);
        const step = compact ? 0.2 : 0.1;
        const screen = compact ? { width: 688, height: 387 } : target;
        const trajectory = sampleTrajectory({ ui, operation, step, screen });
        const baseline = legacyTrajectory({ operation, step, screen, limits: configs[engineIndex], target });
        assert.equal(trajectory.freezes, 0, `${engine} ${operation} ${step}px 冻结帧`);
        assert.ok(baseline.freezes > 0, "对照输入必须能暴露原整数取整停顿");
        const firstDelta = trajectory.deltas[0];
        assert.ok(firstDelta > 0);
        for (const delta of trajectory.deltas) near(delta, firstDelta, "匀速输入必须保持连续匀速可见轨迹");
        for (const rect of trajectory.samples) {
          near(rect.width / rect.height, source.width / source.height, "原图比例");
          assert.ok(rect.left >= 0 && rect.top >= 0);
          assert.ok(rect.left + rect.width <= target.width + EPSILON && rect.top + rect.height <= target.height + EPSILON);
        }
        if (operation === "move") near(trajectory.samples.at(-1).left - trajectory.first.left, 100 * step / screen.width * target.width, "移动末坐标");
        const beforeEnd = rectFor(ui);
        mouse(ui, "mouseup", 500 + 100 * step, 500 + (operation === "resize" ? 100 * step : 0));
        sameRect(rectFor(ui), beforeEnd);
        ui.binding.renderSummary();
        sameRect(rectFor(ui), beforeEnd);
        ui.request();
        sameRect(rectFor(ui), beforeEnd);
        assert.equal(ui.node("OutputSize").textContent, `${target.width} × ${target.height}`);
        metrics.push({ engine, operation, screenStep: step, frames: 100, oldFrozenFrames: baseline.freezes,
          newFrozenFrames: trajectory.freezes, oldLargestScreenJump: baseline.maxJump,
          newLargestScreenJump: Math.max(...trajectory.deltas) });
      }
    }
  }
  context.diagnostic(JSON.stringify(metrics));
});

test("四角亚像素等比缩放逐帧固定对角，浮点预览不会被整像素计划拉回", () => {
  for (const engine of ENGINES) {
    for (const corner of CORNERS) {
      const ui = fixture();
      selectEngine(ui, engine);
      const handle = ui.handle(corner);
      const first = rectFor(ui);
      const opposite = anchor(first, corner);
      const horizontal = corner.endsWith("w") ? -1 : 1;
      const vertical = corner.startsWith("n") ? -1 : 1;
      handle.dispatch("mousedown", { clientX: 500, clientY: 500 });
      for (let index = 1; index <= 100; index += 1) {
        mouse(ui, "mousemove", 500 + horizontal * index * 0.1, 500 + vertical * index * 0.1);
        ui.frames.step();
        const visible = rectFor(ui);
        const fixed = anchor(visible, corner);
        near(fixed.x, opposite.x, `${engine} ${corner} 水平对角`);
        near(fixed.y, opposite.y, `${engine} ${corner} 垂直对角`);
        near(visible.width / visible.height, source.width / source.height, "等比缩放");
      }
      const last = rectFor(ui);
      ui.document.dispatch("mouseup");
      sameRect(rectFor(ui), last);
      ui.binding.renderSummary();
      sameRect(rectFor(ui), last);
    }
  }
});

test("视觉保留浮点，提交只携带归一化构图且真实执行几何仍满足引擎网格", () => {
  for (const [engineIndex, engine] of ENGINES.entries()) {
    const ui = fixture();
    selectEngine(ui, engine);
    ui.handle("se").dispatch("mousedown", { clientX: 500, clientY: 500 });
    mouse(ui, "mousemove", 503.7, 502.9);
    const request = ui.request();
    const canvas = request.items[0].input.outpaintCanvas;
    const visible = rectFor(ui);
    const limits = configs[engineIndex];
    const actual = outpaintCanvasPlan({ source, ...canvas, limits });
    assert.deepEqual(Object.keys(canvas).sort(), ["position", "ratio", "resolution", "scale"]);
    assert.ok(canvas.scale > 2 / 3);
    assert.ok(!Number.isInteger(visible.width));
    for (const dimension of Object.values(actual.prepared)) assert.ok(Number.isInteger(dimension));
    for (const edge of Object.values(actual.expansion)) assert.ok(Number.isInteger(edge) && edge >= 0);
    assert.equal(actual.prepared.width + actual.expansion.left + actual.expansion.right, actual.target.width);
    assert.equal(actual.prepared.height + actual.expansion.top + actual.expansion.bottom, actual.target.height);
    assert.equal(actual.target.width % limits.outputAlignment, 0);
    assert.equal(actual.target.height % limits.outputAlignment, 0);
    const grid = limits.sourceSizing === "original" ? 1 : limits.inputAlignment;
    if (grid > 1) {
      assert.equal(actual.prepared.width % grid, 0);
      assert.equal(actual.prepared.height % grid, 0);
    }
    for (const [key, value] of Object.entries({ width: actual.prepared.width, height: actual.prepared.height, left: actual.expansion.left, top: actual.expansion.top })) {
      assert.ok(Math.abs(value - visible[key]) < grid + 2, `${engine} ${key} 超出当前引擎整数网格误差`);
    }
    assert.equal(request.sharedInput.referenceImages.length, 1);
    sameRect(rectFor(ui), visible);
  }
});

test("4K源图高频移动和缩放仅写transform，源图布局宽高固定且不重传图片", () => {
  for (const operation of ["move", "resize"]) {
    const ui = fixture({ ...source, width: 4096, height: 3072 });
    ui.root.querySelector('[data-outpaint-resolution="4K"]').dispatch("click");
    const target = operation === "move" ? ui.canvas : ui.handle("se");
    target.dispatch("mousedown", { clientX: 500, clientY: 500 });
    const base = { width: ui.image.style.width, height: ui.image.style.height };
    const imageUrl = ui.image.src;
    ui.clearWrites();
    for (let index = 1; index <= 100; index += 1) {
      mouse(ui, "mousemove", 500 + index * 0.2, 500 + (operation === "resize" ? index * 0.2 : 0));
      ui.frames.step();
    }
    const writes = ui.document.writes.filter(({ kind, node }) => kind === "style" && node === ui.image);
    assert.equal(writes.length, 100);
    assert.ok(writes.every(({ name }) => name === "transform"));
    assert.deepEqual({ width: ui.image.style.width, height: ui.image.style.height }, base);
    assert.equal(ui.image.src, imageUrl);
    assert.equal(ui.image.style.transformOrigin, "0 0");
  }
});

test("解析角点边界不读取模型计划，最小/最大位置与对角始终有效", () => {
  for (const limits of configs) {
    const options = { source, ratio: "16:9", resolution: "2K", limits };
    const bounds = outpaintScaleBounds(options);
    const actual = outpaintCanvasPlan({ ...options, scale: 2 / 3 });
    const plan = outpaintVisualPlan({ source, target: actual.target, scale: 2 / 3, limits });
    for (const corner of CORNERS) {
      const state = { plan, scale: 2 / 3, bounds, corner, planForScale() { assert.fail("连续视觉角点不得调用整数模型规划"); } };
      const cornerGeometry = prepareOutpaintCorner(state);
      for (const delta of [-100000, 100000]) {
        const next = outpaintCornerTransform({ ...state, cornerGeometry, deltaX: delta, deltaY: delta });
        const visible = outpaintVisualPlan({ source, target: actual.target, limits, ...next });
        assert.ok(next.scale >= bounds.min && next.scale <= bounds.max);
        assert.ok(next.position.x >= 0 && next.position.x <= 1 && next.position.y >= 0 && next.position.y <= 1);
        for (const edge of Object.values(visible.expansion)) assert.ok(edge >= -EPSILON);
        const fixed = anchor({ left: visible.expansion.left, top: visible.expansion.top, ...visible.prepared }, corner);
        near(fixed.x, cornerGeometry.anchorX, "最大/最小水平对角");
        near(fixed.y, cornerGeometry.anchorY, "最大/最小垂直对角");
      }
    }
  }
});
