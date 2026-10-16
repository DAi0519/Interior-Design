/**
 * [INPUT]: 依赖扩图控制器、三引擎公开合同，以及由测试显式推进的浏览器动画帧
 * [OUTPUT]: 对外提供三引擎构图内存 DOM fixture、source/configs、可控 RAF 与合成变换后的浮点图像矩形，用于真实绑定连续交互及每帧绘制/全页写入计数
 * [POS]: test 的扩图交互共享测试替身，不访问浏览器、网络或 GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { bindImageOutpaint } from "../public/image-outpaint.js";
import { publicImageOutpaintConfig } from "../src/image-outpaint-service.mjs";
import { publicQwenOutpaintConfig } from "../src/image-outpaint-qwen.mjs";
import { publicOneApiOutpaintConfig } from "../src/image-outpaint-oneapi.mjs";

export function createAnimationFrames(view) {
  let sequence = 0;
  let time = 0;
  let callbacks = 0;
  const pending = new Map();
  const canceled = [];
  view.requestAnimationFrame = (callback) => { const id = ++sequence; pending.set(id, callback); return id; };
  view.cancelAnimationFrame = (id) => { if (pending.has(id)) canceled.push(pending.get(id)); pending.delete(id); };
  return {
    pending: () => pending.size,
    callbacks: () => callbacks,
    step(milliseconds = 1000 / 60) {
      time += milliseconds;
      const current = [...pending.values()];
      pending.clear();
      for (const callback of current) { callbacks += 1; callback(time); }
    },
    fireCanceled() { const old = canceled.splice(0); for (const callback of old) callback(time); },
  };
}

class Element {
  constructor(tagName = "div", document = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = document;
    this.dataset = {};
    this.children = [];
    const element = this;
    this.style = new Proxy({ setProperty(name, value) { this[name] = value; } }, {
      set(target, name, value) { target[name] = value; element.ownerDocument?.writes?.push({ kind: "style", node: element, name, value }); return true; },
    });
    this.attributes = new Map();
    this.listeners = new Map();
    this.captureListeners = new Map();
    this.textContent = "";
    this.value = "";
    const classes = new Set();
    Object.defineProperty(this, "className", { get: () => [...classes].join(" "), set: (value) => { classes.clear(); value.split(/\s+/).filter(Boolean).forEach((name) => classes.add(name)); } });
    this.classList = { contains: (name) => classes.has(name), toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } };
  }
  append(...children) {
    for (const child of children) {
      if (child.parentElement) child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
      child.parentElement = this;
      child.ownerDocument ||= this.ownerDocument;
      this.children.push(child);
    }
  }
  replaceChildren(...children) { this.children.forEach((child) => { child.parentElement = null; }); this.children = []; this.append(...children); this.options = this.children; }
  addEventListener(name, listener, options = false) {
    const registry = options === true || options.capture ? this.captureListeners : this.listeners;
    registry.set(name, [...(registry.get(name) || []), listener]);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); this.ownerDocument?.writes?.push({ kind: "attribute", node: this, name, value }); }
  getAttribute(name) { return name === "src" ? this.src || null : this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); if (name === "src") this.src = undefined; }
  getBoundingClientRect() { return { left: 100, top: 300, width: 280, height: 160 }; }
  focus() {
    if (this.ownerDocument.activeElement === this) return;
    this.ownerDocument.activeElement?.dispatch("blur");
    this.ownerDocument.activeElement = this;
    this.dispatch("focus");
  }
  matches(selector) {
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    const match = selector.match(/^\[data-([\w-]+)(?:="([^"]+)")?\]$/);
    if (!match) return false;
    const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return Object.hasOwn(this.dataset, key) && (match[2] === undefined || this.dataset[key] === match[2]);
  }
  querySelectorAll(selector) { return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  dispatch(name, values = {}) {
    const event = { type: name, target: this, button: 0, defaultPrevented: false, cancelBubble: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.cancelBubble = true; }, ...values };
    const ancestors = [];
    for (let ancestor = this; ancestor; ancestor = ancestor.parentElement) ancestors.unshift(ancestor);
    for (const ancestor of ancestors) for (const listener of ancestor.captureListeners.get(name) || []) listener(event);
    let node = this;
    do {
      for (const listener of node.listeners.get(name) || []) listener(event);
      node = event.cancelBubble || ["mouseenter", "mouseleave", "focus", "blur", "scroll"].includes(name) ? null : node.parentElement;
    } while (node);
    return event;
  }
}

export const source = { width: 1000, height: 751, dataUrl: "data:image/png;base64,AAAA", name: "room.png", type: "image/png", size: 3 };
export const configs = [publicImageOutpaintConfig({ available: true }), publicQwenOutpaintConfig({ available: true }), publicOneApiOutpaintConfig({ available: true })];

// -------- 按 CSS 的百分比基准还原原图实际可见矩形，避免只验证变换字符串 --------
export function renderedImageRect(image, target = { width: 2048, height: 1152 }) {
  const base = Object.fromEntries(["left", "top", "width", "height"].map((key) => [key,
    (Number.parseFloat(image.style[key]) || 0) / 100 * (["left", "width"].includes(key) ? target.width : target.height)]));
  const translation = image.style.transform?.match(/translate3d\(([-\d.e+]+)%,\s*([-\d.e+]+)%,\s*0(?:px)?\)/);
  const scale = Number(image.style.transform?.match(/scale\(([-\d.e+]+)\)/)?.[1] ?? 1);
  return { left: base.left + (translation ? Number(translation[1]) / 100 * base.width : 0),
    top: base.top + (translation ? Number(translation[2]) / 100 * base.height : 0),
    width: base.width * scale, height: base.height * scale };
}

export function fixture(nextSource = source) {
  const document = new Element("document");
  document.ownerDocument = document;
  document.writes = [];
  document.defaultView = new Element("window");
  Object.assign(document.defaultView, { innerWidth: 1400, innerHeight: 900 });
  const frames = createAnimationFrames(document.defaultView);
  document.createElement = (tagName) => new Element(tagName, document);
  const root = document.createElement("section");
  document.append(root);
  const add = (tag, id, parent = root) => { const node = document.createElement(tag); node.id = id; parent.append(node); return node; };
  for (const id of ["Availability", "Note", "OutputSize", "Error", "CanvasHint", "PreviewEmpty", "ModelField", "ModelStatus"]) add("div", `imageOutpaint${id}`);
  add("select", "imageOutpaintModelSelect");
  const canvas = add("div", "imageOutpaintCanvas");
  canvas.getBoundingClientRect = () => ({ width: 2048, height: 1152, left: 0, top: 0 });
  const image = add("img", "imageOutpaintSourceImage", canvas);
  const positionRoot = add("div", "");
  positionRoot.className = "image-outpaint-position";
  add("button", "imageOutpaintPositionReset", positionRoot);
  for (const [key, values] of Object.entries({ outpaintRatio: ["1:1", "4:3", "16:9", "3:4", "9:16"], outpaintResolution: ["1K", "2K", "4K"], outpaintEngine: ["comfyui", "qwenImageEdit2511", "gptImage25Sunburst"] })) {
    for (const value of values) { const button = add("button", ""); button.dataset[key] = value; }
  }
  let current = nextSource;
  let changes = 0;
  const binding = bindImageOutpaint({ root, getSourceImage: () => current,
    emptyModel: document.createElement("span"), emptySize: document.createElement("span"), exactSize: document.createElement("span"), onChange() { changes += 1; } });
  binding.configure({ ...configs[0], engines: [{ ...configs[0], key: "comfyui", label: "Flux Fill" }, ...configs.slice(1)] });
  return { root, document, canvas, image, binding, frames, node: (id) => root.querySelector(`#imageOutpaint${id}`),
    handle: (corner) => root.querySelector(`[data-outpaint-corner="${corner}"]`),
    preset: (multiple) => root.querySelector(`[data-outpaint-scale="${multiple}"]`),
    request: () => binding.jobRequest({ image: current, jobId: "transform-test" }),
    changes: () => changes,
    paints: () => document.writes.filter((write) => write.kind === "style" && write.node === image && write.name === "transform").length,
    clearWrites() { document.writes.length = 0; },
    setSource(next, { render = true } = {}) { current = next; if (render) binding.renderSummary(); },
  };
}

