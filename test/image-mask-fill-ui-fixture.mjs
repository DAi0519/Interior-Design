/**
 * [INPUT]: 依赖二次编辑控制器、原生交互API形状及固定主图/参考图/遮罩数据
 * [OUTPUT]: 对外提供fixture、image、reference、mask，复用三模式按钮与DOM/Canvas/上传替身及原图切换/绘制助手
 * [POS]: test 的二次编辑UI共享夹具，被原功能与局部消除合同测试消费，不访问网络或GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { bindImageMaskFill } from "../public/image-mask-fill.js";

export const image = { id: "source-1", dataUrl: "data:image/png;base64,c291cmNl", name: "source.png", type: "image/png", size: 6, width: 2048, height: 1024 };
export const reference = { ...image, id: "ref-1", dataUrl: "data:image/png;base64,cmVm", name: "ref.png" };
export const mask = { dataUrl: "data:image/png;base64,bWFzaw==", name: "mask.png", type: "image/png", size: 4 };


export function fixture({ prefillInstruction = true } = {}) {
  const nodes = new Map(), draws = [], exports = [];
  const make = () => {
    const listeners = new Map(), classes = new Set(), attributes = new Map();
    return { value: "", hidden: false, disabled: false, title: "", dataset: {}, textContent: "", attributes,
      style: { setProperty() {} },
      classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }, contains: name => classes.has(name) },
      setAttribute: (name, value) => attributes.set(name, value), removeAttribute: name => attributes.delete(name),
      addEventListener(name, callback) { listeners.set(name, callback); },
      dispatchEvent(event) { listeners.get(event.type)?.(event); return true; },
      fire(name, event = {}) { return listeners.get(name)?.({ preventDefault() {}, ...event }); },
      querySelector: selector => node(selector), querySelectorAll: selector => selector === "[data-mask-tool]" ? tools : [],
      append() {}, replaceChildren() {}, contains() { return false; }, focus() {},
    };
  };
  const node = selector => { if (!nodes.has(selector)) nodes.set(selector, make()); return nodes.get(selector); };
  const modes = ["prompt", "reference", "remove"].map(mode => { const element = make(); element.dataset.maskMode = mode; return element; });
  const purposes = ["object", "material"].map(key => { const element = make(); element.dataset.maskReferencePurpose = key; return element; });
  const tools = ["brush", "erase", "box", "lasso"].map(tool => { const element = make(); element.dataset.maskTool = tool; return element; });
  const canvas = node("[data-mask-canvas]");
  let painted = false;
  const context = { globalCompositeOperation: "source-over", clearRect() { painted = false; },
    beginPath() {}, moveTo(x, y) { draws.push(["move", x, y]); }, lineTo(x, y) { draws.push(["line", x, y]); },
    arc(x, y, radius) { draws.push(["arc", x, y, radius]); },
    closePath() { draws.push(["close"]); },
    strokeRect(...args) { draws.push(["box", ...args, this.strokeStyle]); },
    fill() { painted = this.globalCompositeOperation !== "destination-out"; },
    stroke() { painted = this.globalCompositeOperation !== "destination-out"; draws.push(["stroke", this.strokeStyle]); },
    getImageData() { return { data: new Uint8ClampedArray([255, 255, 255, painted ? 255 : 0]) }; },
  };
  canvas.getContext = () => context;
  canvas.getBoundingClientRect = () => ({ left: 100, top: 40, width: 512, height: 256 });
  let capture = null;
  canvas.setPointerCapture = id => { capture = id; };
  canvas.hasPointerCapture = id => capture === id;
  canvas.releasePointerCapture = () => { capture = null; };
  canvas.ownerDocument = { createElement() {
    const result = { getContext: () => ({ set fillStyle(value) { exports.push(["fill", value]); },
      fillRect(...args) { exports.push(["background", ...args]); }, drawImage(input) { exports.push(["mask", input.width, input.height]); } }),
    toDataURL: () => mask.dataUrl };
    exports.push(result); return result;
  } };
  node("[data-mask-brush]").value = "32";
  node("[data-mask-expand]").value = "10";
  node("[data-mask-inference]").value = "2k";
  const root = { innerHTML: "", querySelector: node, querySelectorAll: selector => selector === "[data-mask-reference-purpose]" ? purposes : modes };
  let source = image;
  const emptySize = make(), exactSize = make();
  const controller = bindImageMaskFill({ root, getSourceImage: () => source, onChange() {},
    emptyModel: make(), emptySize, exactSize });
  if (prefillInstruction) node("[data-mask-prompt]").value = "Remove the selected object.";
  controller.configure({ available: true, modes: [{ key: "prompt", available: true }, { key: "reference", available: true }] });
  controller.activate();
  return { root, controller, node, modes, purposes, tools, canvas, draws, exports, emptySize, exactSize,
    source(next) { source = next; controller.renderSummary(); },
    paint(type = "touch") { canvas.fire("pointerdown", { pointerId: 3, pointerType: type, button: 0, clientX: 356, clientY: 168 });
      canvas.fire("pointermove", { pointerId: 3, clientX: 612, clientY: 296 });
      canvas.fire("pointerup", { pointerId: 3 }); },
  };
}

