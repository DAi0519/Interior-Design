/**
 * [INPUT]: 依赖 node:test/assert、参考图安全边界与浏览器上传控制器，以及轻量 DOM/FileReader/Image 替身
 * [OUTPUT]: 对外提供图片策略/字节尺寸、最新有效单图并发优先/非法取消不打断、替换失败保留、多图追加及禁用/clear异步取消与通知回归
 * [POS]: test 的参考图能力与上传交互契约测试，不上传文件或调用公司 API
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { bindReferenceUpload } from "../public/reference-upload.js";

import {
  REFERENCE_IMAGE_POLICY,
  normalizeReferenceImage,
  normalizeReferenceImages,
} from "../src/reference-image.mjs";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7JkAAAAASUVORK5CYII=";
const PNG_BYTES = Buffer.from(PNG_DATA_URL.split(",")[1], "base64").length;

test("参考图策略限制为最多四张、单张 8MB、合计 20MB", () => {
  assert.deepEqual(REFERENCE_IMAGE_POLICY.accept, [
    "image/png",
    "image/jpeg",
    "image/webp",
  ]);
  assert.equal(
    REFERENCE_IMAGE_POLICY.maxBytesPerImage,
    8 * 1024 * 1024,
  );
  assert.equal(REFERENCE_IMAGE_POLICY.maxCount, 4);
  assert.equal(REFERENCE_IMAGE_POLICY.maxTotalBytes, 20 * 1024 * 1024);
});

test("多张图片保留顺序并拒绝超过四张", () => {
  const image = {
    dataUrl: PNG_DATA_URL,
    name: "reference.png",
    size: PNG_BYTES,
    type: "image/png",
  };
  assert.deepEqual(
    normalizeReferenceImages([
      { ...image, name: "a.png" },
      { ...image, name: "b.png" },
    ]).map((entry) => entry.fileName),
    ["a.png", "b.png"],
  );
  assert.throws(
    () => normalizeReferenceImages([image, image, image, image, image]),
    /最多上传 4 张/,
  );
});

test("调用方可以开放接口支持的格式并取消人为数量上限", () => {
  const gif = {
    dataUrl: "data:image/gif;base64,aA==",
    name: "reference.gif",
    size: 1,
    type: "image/gif",
  };
  const images = normalizeReferenceImages(
    Array.from({ length: 8 }, () => gif),
    {
      accept: ["image/png", "image/jpeg", "image/webp", "image/gif"],
      maxCount: null,
    },
  );

  assert.equal(images.length, 8);
  assert.equal(images[0].mimeType, "image/gif");
});

test("合法 PNG 被归一化并清理文件名", () => {
  const image = normalizeReferenceImage({
    dataUrl: PNG_DATA_URL,
    name: "../客厅<>.png",
    size: PNG_BYTES,
    type: "image/png",
  });
  assert.equal(image.fileName, "..客厅.png");
  assert.equal(image.mimeType, "image/png");
  assert.equal(image.size, PNG_BYTES);
  assert.equal(image.width, 1);
  assert.equal(image.height, 1);
  assert.equal(image.imageUrl, PNG_DATA_URL);
});

test("拒绝 SVG、伪造 MIME 和错误字节数", () => {
  assert.throws(
    () =>
      normalizeReferenceImage({
        dataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
        type: "image/svg+xml",
      }),
    /仅支持 PNG、JPEG、WebP/,
  );
  assert.throws(
    () =>
      normalizeReferenceImage({
        dataUrl: PNG_DATA_URL,
        type: "image/jpeg",
      }),
    /MIME 类型不一致/,
  );
  assert.throws(
    () =>
      normalizeReferenceImage({
        dataUrl: PNG_DATA_URL,
        size: PNG_BYTES + 1,
        type: "image/png",
      }),
    /字节数校验失败/,
  );
});

// -------- 用可等待的文件选择事件覆盖真实控制器，不读取本地文件 --------
function uploadFixture(t, { limit = 1, policy = {}, isEnabled = () => true } = {}) {
  const original = Object.fromEntries(["document", "FileReader", "Image"].map((key) => [key, globalThis[key]]));
  const sources = new Map();
  const reads = [], pendingReads = [];
  const element = () => {
    const listeners = new Map(), classes = new Set();
    return {
      children: [], value: "", textContent: "",
      classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name),
        toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } },
      addEventListener(name, callback) { listeners.set(name, [...(listeners.get(name) || []), callback]); },
      async emit(name, properties = {}) {
        for (const callback of listeners.get(name) || []) await callback({ target: this, preventDefault() {}, ...properties });
      },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      contains(child) { return child === this || this.children.some((node) => node.contains(child)); },
    };
  };
  globalThis.document = { createElement: element };
  globalThis.FileReader = class {
    addEventListener(name, callback) { this[name] = callback; }
    readAsDataURL(file) {
      reads.push(file.name);
      this.result = `data:${file.type};base64,${Buffer.from(file.name).toString("base64")}`;
      sources.set(this.result, file);
      const finish = () => this[file.readError ? "error" : "load"]();
      if (file.deferRead) pendingReads.push(finish); else queueMicrotask(finish);
    }
  };
  globalThis.Image = class {
    addEventListener(name, callback) { this[name] = callback; }
    set src(value) {
      const file = sources.get(value);
      this.naturalWidth = file.width || 1600; this.naturalHeight = file.height || 900;
      queueMicrotask(() => this[file.decodeError ? "error" : "load"]());
    }
  };
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  const ui = Object.fromEntries(["count", "dropZone", "input", "list"].map((key) => [key, element()]));
  const changes = [], messages = [];
  const controller = bindReferenceUpload({ ...ui, getLimit: () => limit,
    getPolicy: () => ({ ...REFERENCE_IMAGE_POLICY, ...policy }), getSubject: () => "原图",
    isEnabled,
    onChange: (change) => changes.push(change), showToast: (message) => messages.push(message) });
  return { ...ui, controller, changes, messages, reads,
    finishRead(index = 0) { assert.ok(pendingReads[index], "应有尚未完成的文件读取"); pendingReads.splice(index, 1)[0](); },
    async select(files) {
      ui.input.files = files; ui.input.value = files.length ? `C:\\fakepath\\${files[0].name}` : "";
      await ui.input.emit("change");
    } };
}

const uploadFile = (name, options = {}) => ({ name, type: "image/png", size: 6 * 1024 * 1024, ...options });

test("单图先选择A再选择B原位替换，同文件重选、取消和拖入共用替换语义", async (t) => {
  const ui = uploadFixture(t, { policy: { maxTotalBytes: 8 * 1024 * 1024 } });
  const a = uploadFile("A.png"), b = uploadFile("B.png");
  await ui.select([a]);
  const original = ui.controller.images()[0];
  assert.equal(original.name, "A.png");
  assert.deepEqual(ui.changes[0].previousImages, []);
  await ui.select([b]);
  const replacement = ui.controller.images()[0];
  assert.equal(ui.count.textContent, "1 / 1");
  assert.equal(replacement.name, "B.png");
  assert.deepEqual(ui.changes[1].previousImages, [original]);
  assert.equal(ui.list.children[0].children[0].src, replacement.dataUrl);
  assert.equal(ui.input.value, "");
  await ui.select([b]);
  const sameFile = ui.controller.images()[0];
  assert.equal(sameFile.dataUrl, replacement.dataUrl);
  assert.notEqual(sameFile.id, replacement.id);
  await ui.select([]);
  assert.deepEqual(ui.controller.images(), [sameFile]);
  assert.equal(ui.changes.length, 3);
  await ui.list.emit("drop", { dataTransfer: { files: [a] } });
  assert.equal(ui.controller.images()[0].name, "A.png");
  assert.deepEqual(ui.changes[3].previousImages, [sameFile]);
  assert.deepEqual(ui.messages, []);
});

for (const oldFinishesFirst of [true, false]) {
  test(`有效单图读取重叠时最后选择B获胜，${oldFinishesFirst ? "A先读完" : "B先读完"}也不追加或覆盖`, async (t) => {
    const ui = uploadFixture(t);
    const pendingA = ui.select([uploadFile("A.png", { deferRead: true })]);
    const pendingB = ui.select([uploadFile("B.png", { deferRead: true })]);
    assert.deepEqual(ui.reads, ["A.png", "B.png"]);
    ui.finishRead(oldFinishesFirst ? 0 : 1);
    await (oldFinishesFirst ? pendingA : pendingB);
    assert.deepEqual(ui.controller.images().map(image => image.name), oldFinishesFirst ? [] : ["B.png"]);
    ui.finishRead();
    await (oldFinishesFirst ? pendingB : pendingA);
    assert.deepEqual(ui.controller.images().map(image => image.name), ["B.png"]);
    assert.equal(ui.count.textContent, "1 / 1");
    assert.equal(ui.changes.length, 1);
    assert.deepEqual(ui.changes[0].previousImages, []);
    assert.deepEqual(ui.messages, []);
  });
}

test("单图后续格式/大小校验失败或取消不打断已开始的有效读取", async (t) => {
  const ui = uploadFixture(t, { policy: { maxBytesPerImage: 16 * 1024 * 1024, maxTotalBytes: 8 * 1024 * 1024 } });
  const pending = ui.select([uploadFile("valid.png", { deferRead: true })]);
  await ui.select([uploadFile("invalid.svg", { type: "image/svg+xml" })]);
  await ui.select([uploadFile("too-large.png", { size: 17 * 1024 * 1024 })]);
  await ui.select([uploadFile("too-large-total.png", { size: 9 * 1024 * 1024 })]);
  await ui.select([]);
  assert.deepEqual(ui.reads, ["valid.png"]);
  assert.deepEqual(ui.controller.images(), []);
  assert.deepEqual(ui.changes, []);
  ui.finishRead();
  await pending;
  assert.deepEqual(ui.controller.images().map(image => image.name), ["valid.png"]);
  assert.equal(ui.changes.length, 1);
  assert.equal(ui.messages.length, 3);
});

test("替换的格式、单图容量、读取或解码校验失败均保留旧图", async (t) => {
  const ui = uploadFixture(t);
  await ui.select([uploadFile("A.png")]);
  const original = ui.controller.images();
  for (const [file, message] of [
    [uploadFile("bad.svg", { type: "image/svg+xml" }), /不是 PNG、JPEG 或 WebP/],
    [uploadFile("large.png", { size: 9 * 1024 * 1024 }), /超过单张 8MB/],
    [uploadFile("unreadable.png", { readError: true }), /无法读取 unreadable.png/],
    [uploadFile("broken.png", { decodeError: true }), /无法读取 broken.png 的图片尺寸/],
  ]) {
    await ui.select([file]);
    assert.deepEqual(ui.controller.images(), original);
    assert.equal(ui.changes.length, 1);
    assert.equal(ui.input.value, "");
    assert.match(ui.messages.at(-1), message);
  }
});

test("单图替换仍校验新图合计容量，失败保留旧图", async (t) => {
  const ui = uploadFixture(t, { policy: { maxBytesPerImage: 16 * 1024 * 1024, maxTotalBytes: 8 * 1024 * 1024 } });
  await ui.select([uploadFile("A.png")]);
  const before = ui.controller.images();
  await ui.select([uploadFile("large-total.png", { size: 9 * 1024 * 1024 })]);
  assert.deepEqual(ui.controller.images(), before);
  assert.equal(ui.changes.length, 1);
  assert.match(ui.messages.at(-1), /合计不能超过 8MB/);
});

test("多图文件选择继续追加，达到合计容量时保留全部旧图", async (t) => {
  const ui = uploadFixture(t, { limit: 4, policy: { maxTotalBytes: 8 * 1024 * 1024 } });
  await ui.select([uploadFile("A.png", { size: 3 * 1024 * 1024 })]);
  const original = ui.controller.images()[0];
  await ui.select([uploadFile("B.png", { size: 3 * 1024 * 1024 })]);
  assert.deepEqual(ui.controller.images().map((image) => image.name), ["A.png", "B.png"]);
  assert.equal(ui.controller.images()[0], original);
  assert.equal(ui.count.textContent, "2 / 4");
  const before = ui.controller.images();
  await ui.select([uploadFile("C.png", { size: 4 * 1024 * 1024 })]);
  assert.deepEqual(ui.controller.images(), before);
  assert.equal(ui.changes.length, 2);
  assert.match(ui.messages.at(-1), /合计不能超过 8MB/);
});

test("互斥禁用同时阻断文件选择、空位拖放及旧图替换，解锁后可以继续上传", async (t) => {
  let enabled = false;
  const ui = uploadFixture(t, { isEnabled: () => enabled });
  ui.controller.render();
  assert.equal(ui.input.disabled, true);
  await ui.select([uploadFile("blocked-input.png")]);
  await ui.dropZone.emit("drop", { dataTransfer: { files: [uploadFile("blocked-drop.png")] } });
  assert.deepEqual(ui.reads, []);
  assert.deepEqual(ui.controller.images(), []);
  assert.deepEqual(ui.changes, []);
  enabled = true; ui.controller.render();
  assert.equal(ui.input.disabled, false);
  await ui.select([uploadFile("A.png")]);
  const previous = ui.controller.images();
  enabled = false; ui.controller.render();
  await ui.select([uploadFile("blocked-replace-input.png")]);
  await ui.list.emit("drop", { dataTransfer: { files: [uploadFile("blocked-replace-drop.png")] } });
  assert.deepEqual(ui.controller.images(), previous);
  assert.deepEqual(ui.reads, ["A.png"]);
  assert.equal(ui.changes.length, 1);
  assert.deepEqual(ui.messages, []);
  enabled = true; ui.controller.render();
  await ui.select([uploadFile("B.png")]);
  assert.equal(ui.controller.images()[0].name, "B.png");
});

test("文件读取途中切换互斥选项不会回写旧上传，快速解锁也不恢复过期读取", async (t) => {
  let enabled = true;
  const ui = uploadFixture(t, { isEnabled: () => enabled });
  await ui.select([uploadFile("A.png")]);
  const previous = ui.controller.images();
  const pending = ui.select([uploadFile("late.png", { deferRead: true })]);
  enabled = false; ui.controller.render();
  enabled = true; ui.controller.render();
  ui.finishRead(); await pending;
  assert.deepEqual(ui.controller.images(), previous);
  assert.equal(ui.changes.length, 1);
  assert.deepEqual(ui.messages, []);
  const locked = ui.select([uploadFile("still-locked.png", { deferRead: true })]);
  enabled = false;
  ui.finishRead(); await locked;
  assert.deepEqual(ui.controller.images(), previous, "未重新渲染时也检查当前启用状态");
  assert.equal(ui.changes.length, 1);
});

test("clear清空内存和文件栏并中断在途读取，静默恢复不通知，默认清除保留previousImages", async (t) => {
  const ui = uploadFixture(t);
  await ui.select([uploadFile("A.png")]);
  const silentPending = ui.select([uploadFile("late-A.png", { deferRead: true })]);
  ui.controller.clear({ notify: false });
  assert.deepEqual(ui.controller.images(), []);
  assert.equal(ui.input.value, "");
  assert.equal(ui.count.textContent, "0 / 1");
  assert.equal(ui.changes.length, 1);
  ui.finishRead(); await silentPending;
  assert.deepEqual(ui.controller.images(), []);
  assert.equal(ui.changes.length, 1);
  await ui.select([uploadFile("B.png")]);
  const previous = ui.controller.images();
  const pending = ui.select([uploadFile("late-B.png", { deferRead: true })]);
  ui.controller.clear();
  assert.deepEqual(ui.changes.at(-1), { images: [], previousImages: previous });
  ui.finishRead(); await pending;
  assert.deepEqual(ui.controller.images(), []);
  assert.equal(ui.changes.length, 3);
  assert.deepEqual(ui.messages, []);
});
