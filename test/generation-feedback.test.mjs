/**
 * [INPUT]: 依赖 node:test 与生图结果揭示函数，使用可控的图像加载和动画替身
 * [OUTPUT]: 验证解码前隐藏清晰图、首帧模糊层的定位与动画、清理及减少动态效果
 * [POS]: test 的生图反馈回归测试，不访问模型、网络或真实浏览器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { cancelGenerationReveal, revealGenerationImage } from "../public/generation-feedback.js";

function imageFixture() {
  const image = new EventTarget();
  const motions = [];
  const preference = { matches: false };
  const classes = new Set();
  const imageClasses = new Set();
  const drawn = [];
  const preview = { getContext: () => ({ drawImage: (...args) => drawn.push(args) }) };
  const host = {
    classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
  };
  const veil = {
    style: {},
    attributes: {},
    removed: false,
    append(node) { this.child = node; },
    setAttribute(name, value) { this.attributes[name] = value; },
    remove() { this.removed = true; },
    animate(frames, options) {
      const { promise, resolve } = Promise.withResolvers();
      const motion = {
        frames, options, finished: promise, complete: resolve, cancelled: false,
        cancel() { this.cancelled = true; resolve(); },
      };
      motions.push(motion);
      return motion;
    },
  };
  Object.assign(image, {
    src: "https://images.example.test/first.png",
    complete: false,
    naturalWidth: 0,
    naturalHeight: 0,
    isConnected: true,
    offsetWidth: 500,
    offsetHeight: 300,
    offsetLeft: 10,
    offsetTop: 20,
    parentElement: host,
    classList: { add: value => imageClasses.add(value), remove: value => imageClasses.delete(value) },
    ownerDocument: {
      createElement: tag => tag === "canvas" ? preview : veil,
      defaultView: {
        matchMedia: () => preference,
        getComputedStyle: node => node === host
          ? { position: "static" }
          : { objectFit: "contain", borderRadius: "8px" },
      },
    },
    after(node) { this.nextSibling = node; },
    animate() { assert.fail("磨砂层单独动画"); },
  });
  const load = () => Object.assign(image, { naturalWidth: 640, naturalHeight: 640 });
  return { image, motions, preference, veil, classes, imageClasses, drawn, preview, load };
}

test("解码前隐藏原图，解码后贴合实际可见像素铺一层模糊预览并揭示", async () => {
  const { image, motions, veil, classes, imageClasses, load, drawn, preview } = imageFixture();
  const decode = Promise.withResolvers();
  image.decode = () => decode.promise;
  revealGenerationImage(image);
  revealGenerationImage(image);
  assert.equal(motions.length, 0);
  assert.equal(image.nextSibling, undefined);
  load();
  await Promise.resolve();
  assert.equal(imageClasses.has("generation-feedback-decoding"), true);
  assert.equal(motions.length, 0);
  decode.resolve();
  await decode.promise;
  assert.equal(motions.length, 1);
  assert.equal(image.nextSibling, veil);
  assert.equal(imageClasses.size, 0);
  assert.equal(veil.attributes["aria-hidden"], "true");
  assert.equal(veil.child, preview);
  assert.deepEqual(drawn, [[image, 0, 0, 128, 128]]);
  assert.deepEqual(veil.style, { left: "110px", top: "20px", width: "300px", height: "300px", borderRadius: "8px" });
  assert.deepEqual(motions[0].frames.map(({ maskPosition }) => maskPosition), ["50% 90%", "50% 90%", "50% 10%"]);
  assert.equal(motions[0].frames[1].offset, 0.14);
  assert.equal(motions[0].options.duration, 1100);
  assert.equal(classes.has("generation-feedback-veil-host"), true);
  motions[0].complete();
  await motions[0].finished;
  assert.equal(veil.removed, true);
  assert.equal(classes.size, 0);
});

test("替换或取消旧地址后，晚到的加载事件不会揭示旧图", () => {
  const { image, motions, imageClasses, load } = imageFixture();
  revealGenerationImage(image);
  image.src = "https://images.example.test/replaced.png";
  load();
  image.dispatchEvent(new Event("load"));
  assert.equal(motions.length, 0);
  assert.equal(imageClasses.size, 0);
  revealGenerationImage(image);
  cancelGenerationReveal(image);
  image.dispatchEvent(new Event("load"));
  assert.equal(motions.length, 0);
  assert.equal(imageClasses.size, 0);
});

test("缓存图允许当前渲染轮次插入，失败与减少动态效果时直接跳过动画", async () => {
  const { image, motions, preference, veil, load } = imageFixture();
  image.complete = true;
  revealGenerationImage(image);
  await Promise.resolve();
  assert.equal(motions.length, 0);
  load();
  preference.matches = true;
  revealGenerationImage(image);
  await Promise.resolve();
  assert.equal(motions.length, 0);
  preference.matches = false;
  image.isConnected = false;
  revealGenerationImage(image);
  image.isConnected = true;
  await Promise.resolve();
  assert.equal(motions.length, 1);
  cancelGenerationReveal(image);
  assert.equal(motions[0].cancelled, true);
  assert.equal(veil.removed, true);
});
