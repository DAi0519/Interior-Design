/**
 * [INPUT]: 依赖扩图控制器/四角变换模块与共享 fixture 的三引擎内存 DOM/显式动画帧
 * [OUTPUT]: 对外提供连续倍率/滑杆端点、四角鼠标与触摸/键盘缩放、浮点对角锚点/边界提示、设置随视口重排/关闭委托、缩放透传及换图重置回归保障
 * [POS]: test 的扩图真实绑定交互验证，不使用第三方 DOM、不上传图片或调用模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { configs, fixture, renderedImageRect, source } from "./image-outpaint-fixture.mjs";

function imageRect(ui, width = 2048, height = 1152) {
  return renderedImageRect(ui.image, { width, height });
}

function opposite(rect, corner) {
  return { x: rect.left + (corner.endsWith("w") ? rect.width : 0), y: rect.top + (corner.startsWith("n") ? rect.height : 0) };
}

test("图像设置真实绑定1.5/2/3倍和自定义滑杆，请求只携带一次原图及当前scale", () => {
  const ui = fixture();
  assert.equal(ui.root.querySelectorAll("[data-outpaint-corner]").length, 4);
  assert.equal(ui.node("ScaleValue").textContent, "1.5倍");
  ui.node("Settings").dispatch("click");
  assert.equal(ui.node("Settings").getAttribute("aria-expanded"), "true");
  assert.equal(ui.node("ScalePopover").hidden, false);
  ui.preset(2).dispatch("click");
  assert.equal(ui.preset(2).getAttribute("aria-pressed"), "true");
  assert.equal(ui.request().items[0].input.outpaintCanvas.scale, 0.5);
  ui.node("ScaleRange").value = "0.57";
  ui.node("ScaleRange").dispatch("input");
  ui.frames.step();
  assert.equal(ui.node("ScaleValue").textContent, "自定义");
  assert.equal(ui.request().items[0].input.outpaintCanvas.scale, 0.57);
  assert.equal(ui.request().sharedInput.referenceImages.length, 1);
  assert.equal(ui.request().sharedInput.referenceImages[0].dataUrl, source.dataUrl);
  assert.equal(ui.node("OutputSize").textContent, "2048 × 1152");
  assert.equal(ui.node("ScaleRange").getAttribute("aria-valuetext"), "57%");
  assert.equal(ui.node("ScaleRange").step, "any");
  assert.equal(Number(ui.node("ScaleRange").max), 1);
  assert.ok(ui.changes() >= 2);
});

test("打开的图像设置随resize和容器scroll留在视口，关闭委托清理状态且停止重排", () => {
  const ui = fixture();
  const settings = ui.node("Settings");
  const popover = ui.node("ScalePopover");
  let rect = { left: 1100, top: 800, width: 200, height: 38 };
  settings.getBoundingClientRect = () => rect;
  settings.dispatch("click");
  const initial = { ...popover.style };
  const view = ui.document.defaultView;
  Object.assign(view, { innerWidth: 500, innerHeight: 400 });
  view.dispatch("resize");
  const resized = { ...popover.style };
  const inside = () => {
    const left = Number.parseFloat(popover.style.left);
    const top = Number.parseFloat(popover.style.top);
    const size = popover.getBoundingClientRect();
    assert.ok(left >= 0 && left + size.width <= view.innerWidth);
    assert.ok(top >= 0 && top + size.height <= view.innerHeight);
  };
  inside();
  assert.notEqual(resized.left, initial.left);
  assert.notEqual(resized.top, initial.top);
  rect = { ...rect, left: 40, top: 80 };
  settings.parentElement.dispatch("scroll");
  inside();
  assert.notEqual(popover.style.left, resized.left);
  assert.equal(Number.parseFloat(popover.style.left), 40);
  ui.binding.closeSettings();
  assert.equal(settings.getAttribute("aria-expanded"), "false");
  assert.equal(popover.hidden, true);
  const closed = { ...popover.style };
  rect = { ...rect, left: 100, top: 200 };
  view.dispatch("resize");
  settings.parentElement.dispatch("scroll");
  assert.deepEqual(popover.style, closed);
});

test("四角鼠标拖动连续预览固定对角，不冒泡为移动原图且目标分辨率不变", () => {
  for (const engine of ["comfyui", "qwenImageEdit2511", "gptImage25Sunburst"]) {
    for (const corner of ["nw", "ne", "sw", "se"]) {
    const ui = fixture();
    ui.root.querySelector(`[data-outpaint-engine="${engine}"]`).dispatch("click");
    const [width, height] = ui.node("OutputSize").textContent.split(" × ").map(Number);
    const before = opposite(imageRect(ui, width, height), corner);
    const handle = ui.handle(corner);
    const start = handle.dispatch("mousedown", { clientX: 500, clientY: 500 });
    assert.equal(start.defaultPrevented, true);
    assert.equal(start.cancelBubble, true);
    assert.equal(ui.canvas.classList.contains("dragging"), false);
    ui.document.dispatch("mousemove", { clientX: 500 + (corner.endsWith("w") ? -50 : 50), clientY: 500 + (corner.startsWith("n") ? -30 : 30) });
    ui.frames.step();
    const after = opposite(imageRect(ui, width, height), corner);
    assert.ok(Math.abs(after.x - before.x) <= 1, `${engine} ${corner} 水平锚点偏移 ${after.x - before.x}`);
    assert.ok(Math.abs(after.y - before.y) <= 1, `${engine} ${corner} 垂直锚点偏移 ${after.y - before.y}`);
    assert.ok(ui.request().items[0].input.outpaintCanvas.scale > 2 / 3);
    assert.equal(ui.node("OutputSize").textContent, `${width} × ${height}`);
    ui.document.dispatch("mouseup");
    assert.equal(handle.parentElement.classList.contains("resizing"), false);
    }
  }
});

test("角点放大到局部画布边缘就停止，保持对角锚点并提示最大值", () => {
  const ui = fixture();
  const before = opposite(imageRect(ui), "nw");
  const handle = ui.handle("nw");
  handle.dispatch("mousedown", { clientX: 500, clientY: 500 });
  ui.document.dispatch("mousemove", { clientX: -10000, clientY: -10000 });
  ui.frames.step();
  const rect = imageRect(ui);
  const after = opposite(rect, "nw");
  assert.ok(Math.abs(after.x - before.x) <= 1);
  assert.ok(Math.abs(after.y - before.y) <= 1);
  assert.ok(rect.left >= 0 && rect.top >= 0);
  assert.ok(rect.left <= 1 || rect.top <= 1);
  assert.ok(ui.request().items[0].input.outpaintCanvas.scale < 1);
  assert.equal(ui.node("ScaleStatus").textContent, "图片已达最大值");
  assert.equal(ui.node("ScaleStatus").classList.contains("is-visible"), true);
  ui.document.dispatch("mouseup");
  handle.dispatch("mouseenter");
  assert.match(handle.title, /最大值/);
});

test("角点缩小和放大被边界夹紧，hover/键盘焦点提供最小最大提示", () => {
  const ui = fixture();
  const handle = ui.handle("nw");
  ui.preset(3).dispatch("click");
  handle.dispatch("mouseenter");
  assert.equal(ui.node("ScaleStatus").textContent, "图片已达最小值");
  assert.equal(ui.node("ScaleStatus").classList.contains("is-visible"), true);
  assert.match(handle.title, /最小值/);
  handle.dispatch("mousedown", { clientX: 500, clientY: 500 });
  ui.document.dispatch("mousemove", { clientX: 10000, clientY: 10000 });
  ui.frames.step();
  assert.equal(ui.request().items[0].input.outpaintCanvas.scale, 1 / 3);
  ui.document.dispatch("mouseup");
  ui.node("ScaleRange").value = "1";
  ui.node("ScaleRange").dispatch("input");
  ui.frames.step();
  handle.dispatch("focus");
  assert.equal(ui.node("ScaleStatus").textContent, "图片已达最大值");
  assert.equal(ui.node("ScaleStatus").getAttribute("role"), "status");
  const event = handle.dispatch("keydown", { key: "+" });
  assert.equal(event.cancelBubble, true);
  assert.equal(ui.request().items[0].input.outpaintCanvas.scale, 1);
});

test("角点触摸与键盘缩放不移动画布，touchcancel停止后续变更", () => {
  const ui = fixture();
  const handle = ui.handle("se");
  const start = handle.dispatch("touchstart", { touches: [{ clientX: 500, clientY: 500 }] });
  assert.equal(start.cancelBubble, true);
  assert.equal(ui.canvas.classList.contains("dragging"), false);
  ui.document.dispatch("touchmove", { touches: [{ clientX: 530, clientY: 520 }] });
  ui.frames.step();
  const enlarged = ui.request().items[0].input.outpaintCanvas.scale;
  assert.ok(enlarged > 2 / 3);
  ui.document.dispatch("touchcancel");
  ui.document.dispatch("touchmove", { touches: [{ clientX: 1000, clientY: 1000 }] });
  assert.equal(ui.request().items[0].input.outpaintCanvas.scale, enlarged);
  const event = handle.dispatch("keydown", { key: "-", shiftKey: true });
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.cancelBubble, true);
  assert.ok(ui.request().items[0].input.outpaintCanvas.scale < enlarged);
  assert.equal(ui.node("OutputSize").textContent, "2048 × 1152");
});

test("居中只复位位置，模型/引擎/比例/分辨率与权限刷新保留缩放，换图恢复1.5倍", () => {
  const ui = fixture();
  ui.preset(2).dispatch("click");
  ui.canvas.dispatch("keydown", { key: "ArrowLeft", shiftKey: true });
  assert.equal(ui.request().items[0].input.outpaintCanvas.position.x, 0.4);
  ui.node("PositionReset").dispatch("click");
  assert.deepEqual(ui.request().items[0].input.outpaintCanvas.position, { x: 0.5, y: 0.5 });
  assert.equal(ui.request().items[0].input.outpaintCanvas.scale, 0.5);
  ui.node("ModelSelect").value = "fluxFillDev";
  ui.node("ModelSelect").dispatch("change");
  for (const [attribute, value] of [["engine", "qwenImageEdit2511"], ["ratio", "3:4"], ["resolution", "4K"], ["engine", "gptImage25Sunburst"]]) {
    ui.root.querySelector(`[data-outpaint-${attribute}="${value}"]`).dispatch("click");
    assert.equal(ui.request().items[0].input.outpaintCanvas.scale, 0.5);
  }
  ui.binding.configure({ ...configs[0], engines: [{ ...configs[0], key: "comfyui", label: "Flux Fill" }, ...configs.slice(1)] });
  assert.equal(ui.request().items[0].input.outpaintCanvas.scale, 0.5);
  ui.setSource({ ...source, name: "replacement.png" });
  assert.equal(ui.request().items[0].input.outpaintCanvas.scale, 2 / 3);
  assert.deepEqual(ui.request().items[0].input.outpaintCanvas.position, { x: 0.5, y: 0.5 });
});

test("窄图的动态下限禁用无效倍率，铺满同画幅时保留预览且阻断提交", () => {
  const ui = fixture({ ...source, width: 2048, height: 64 });
  ui.root.querySelector('[data-outpaint-engine="qwenImageEdit2511"]').dispatch("click");
  assert.equal(ui.preset(3).disabled, true);
  assert.equal(ui.preset(2).disabled, false);
  assert.equal(Number(ui.node("ScaleRange").min), 0.5);
  ui.setSource({ ...source, width: 768, height: 768 });
  ui.root.querySelector('[data-outpaint-ratio="1:1"]').dispatch("click");
  ui.node("ScaleRange").value = "1";
  ui.node("ScaleRange").dispatch("input");
  ui.frames.step();
  assert.equal(ui.canvas.classList.contains("hidden"), false);
  assert.match(ui.binding.validate().message, /缩小原图/);
  assert.throws(() => ui.request(), /缩小原图/);
});

test("没有原图时隐藏角点并停用图像设置，重新上传恢复默认倍率和控件", () => {
  const ui = fixture();
  ui.preset(3).dispatch("click");
  ui.setSource(null);
  assert.equal(ui.node("Settings").disabled, true);
  assert.equal(ui.node("ScaleRange").disabled, true);
  assert.equal(ui.handle("nw").parentElement.hidden, true);
  assert.equal(ui.node("ScaleValue").textContent, "上传后设置");
  ui.setSource({ ...source });
  assert.equal(ui.node("Settings").disabled, false);
  assert.equal(ui.handle("nw").parentElement.hidden, false);
  assert.equal(ui.request().items[0].input.outpaintCanvas.scale, 2 / 3);
});
