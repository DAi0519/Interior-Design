/**
 * [INPUT]: 依赖 node:test/assert、Beta 样本库控制器及最小 DOM/图片读取/飞书 API 替身
 * [OUTPUT]: 验证超过 20MB 的样本集只保留 File 草稿并逐张上传、全景源图 2:1 准入与拒绝后预览释放、失败后稳定 ID 续传、保存中功能切换阻断、完成回读才就绪及已有样本不携带原图
 * [POS]: test 的 Beta 浏览器样本生命周期行为测试，不读写真实飞书或调用生成服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createBetaSampleLibrary } from "../public/beta-sample-library.js";
import { assertBetaPanoramaSource } from "../public/beta-model-rules.js";

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.value = "";
    this.replaceCount = 0;
  }
  get options() { return this.children; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; this.replaceCount += 1; }
  setAttribute() {}
  focus() {}
  cloneNode() { return Object.assign(new Element(), { value: this.value, textContent: this.textContent }); }
  addEventListener(name, callback) {
    this.listeners.set(name, [...this.listeners.get(name) || [], callback]);
  }
  async dispatch(name) {
    await Promise.all((this.listeners.get(name) || []).map((callback) => callback({ target: this })));
  }
}

function createElements() {
  return Object.fromEntries([
    "sampleSetSyncStatus", "sampleSetSelect", "sampleCount", "sampleList", "freePromptList",
    "roomTypeSelect", "sampleSetLibraryPanel", "sampleSetCreatePanel", "sourceFilesField",
    "freePromptsField", "saveSampleSetButton", "cancelSampleSetButton", "newSampleSetButton",
    "sourceFilesInput", "sourceFilesDropZone", "sampleSetNameInput", "freePromptsInput",
  ].map((name) => [name, new Element()]));
}

test("24MB 样本草稿逐张上传且第二张失败后只续传剩余项", async (context) => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => new Element() };
  context.after(() => { globalThis.document = previousDocument; });
  const elements = createElements();
  const calls = [];
  const fullReads = [];
  const previews = [];
  const errors = [];
  const stored = new Map();
  let apiActive = 0;
  let apiPeak = 0;
  let uploadFailure = true;
  let resolveSettled;
  let library;
  library = createBetaSampleLibrary({
    elements,
    onSelectionChange() {},
    onError: (error) => errors.push(error),
    onChange() {
      if (resolveSettled && !elements.saveSampleSetButton.disabled
        && ["success", "error"].includes(elements.sampleSetSyncStatus.dataset.state)) {
        resolveSettled();
        resolveSettled = null;
      }
    },
    async readImage(file, { previewOnly = false } = {}) {
      if (previewOnly) {
        previews.push(file.name);
        return { file, name: file.name, size: file.size, type: file.type, previewUrl: `blob:${file.name}` };
      }
      fullReads.push(file.name);
      return { name: file.name, size: file.size, type: file.type, dataUrl: `data:image/png;base64,${file.name}` };
    },
    async api(path, options = {}) {
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ path, body });
      apiActive += 1;
      apiPeak = Math.max(apiPeak, apiActive);
      try {
        await new Promise((resolve) => setImmediate(resolve));
        if (!options.method) return { sampleSets: [] };
        if (path === "/api/beta/sample-sets") {
          assert.deepEqual(body, { featureMode: "whiteModel", name: "大样本集" });
          return { sampleSet: { sampleSetId: "set-1", name: body.name, featureMode: body.featureMode } };
        }
        if (path.endsWith("/samples")) {
          assert.ok(body.image);
          assert.equal(body.samples, undefined);
          assert.equal(body.image.size, 8 * 1024 * 1024);
          assert.equal(library.isReady(), false);
          assert.equal(library.isBusy(), true);
          await library.setFeatureMode("free");
          assert.equal(library.sampleCount(), 3);
          if (body.image.name === "2.png" && uploadFailure) {
            uploadFailure = false;
            throw new Error("临时上传失败");
          }
          stored.set(body.sampleId, { sampleId: body.sampleId, image: {
            name: body.image.name, size: body.image.size, type: body.image.type,
            previewUrl: `/api/beta/sample-sets/set-1/samples/${body.sampleId}/preview`,
          } });
          return { sample: stored.get(body.sampleId) };
        }
        assert.ok(path.endsWith("/complete"));
        assert.deepEqual(new Set(body.sampleIds), new Set(stored.keys()));
        assert.equal(library.isReady(), false);
        return { sampleSet: {
          sampleSetId: "set-1", name: "大样本集", featureMode: "whiteModel", sampleCount: 3,
          samples: [...stored.values()],
        } };
      } finally {
        apiActive -= 1;
      }
    },
  });
  library.bind();
  await library.load("whiteModel");
  elements.sampleSetNameInput.value = "大样本集";
  elements.sourceFilesInput.files = [1, 2, 3].map((number) => ({
    name: `${number}.png`, type: "image/png", size: 8 * 1024 * 1024, lastModified: number,
  }));
  await elements.sourceFilesInput.dispatch("change");
  assert.equal(library.sampleCount(), 3);
  assert.deepEqual(previews, ["1.png", "2.png", "3.png"]);
  assert.deepEqual(fullReads, []);
  assert.ok(library.sourceImages().every((image) => image.file && !image.dataUrl));
  const draftIds = library.sourceImages().map((image) => image.sampleId);

  const save = async () => {
    const settled = new Promise((resolve) => { resolveSettled = resolve; });
    await elements.saveSampleSetButton.dispatch("click");
    await settled;
  };
  const previousRenderCount = elements.sampleList.replaceCount;
  await save();
  assert.equal(elements.sampleList.replaceCount - previousRenderCount, 2);
  assert.equal(library.isReady(), false);
  assert.equal(elements.sampleSetSyncStatus.textContent, "同步失败 · 1 / 3");
  assert.equal(elements.saveSampleSetButton.textContent, "继续保存");
  assert.equal(errors.length, 1);
  assert.deepEqual(fullReads, ["1.png", "2.png"]);
  assert.equal(elements.sourceFilesInput.disabled, true);
  elements.sourceFilesInput.files = [{
    name: "4.png", type: "image/png", size: 8 * 1024 * 1024, lastModified: 4,
  }];
  await elements.sourceFilesInput.dispatch("change");
  assert.equal(library.sampleCount(), 3);
  assert.deepEqual(previews, ["1.png", "2.png", "3.png"]);
  assert.deepEqual(library.sourceImages().map((image) => image.sampleId), draftIds);
  await save();

  assert.equal(apiPeak, 1);
  assert.equal(calls.filter((call) => call.path === "/api/beta/sample-sets" && call.body).length, 1);
  const uploads = calls.filter((call) => call.path.endsWith("/samples"));
  assert.deepEqual(uploads.map((call) => call.body.image.name), ["1.png", "2.png", "2.png", "3.png"]);
  assert.equal(uploads[1].body.sampleId, uploads[2].body.sampleId);
  assert.deepEqual(fullReads, ["1.png", "2.png", "2.png", "3.png"]);
  assert.equal(library.isReady(), true);
  assert.equal(library.activeSampleSetId(), "set-1");
  assert.deepEqual(library.currentCases().map((sample) => sample.caseId), draftIds);
  assert.ok(library.currentCases().every((sample) => sample.referenceImages.length === 0));
  assert.ok(library.sourceImages().every((image) => !image.file && !image.dataUrl && image.previewUrl));
  assert.equal(elements.sampleSetSyncStatus.textContent, "已同步飞书");
});

test("已有空房样本只读元信息，旧样本缺房型可在本次补选", async (context) => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => new Element() };
  context.after(() => { globalThis.document = previousDocument; });
  const elements = createElements();
  const calls = [];
  const sampleSet = {
    sampleSetId: "existing", featureMode: "emptyRoom", name: "原样本", sampleCount: 1,
    samples: [{ sampleId: "existing-1", image: {
      name: "space.jpg", size: 7 * 1024 * 1024, type: "image/jpeg", previewUrl: "/api/beta/preview/existing-1",
    } }],
  };
  const library = createBetaSampleLibrary({
    elements, onChange() {}, onError: assert.fail,
    readImage() { assert.fail("已有样本不应在浏览器读取原图"); },
    async api(path) {
      calls.push(path);
      return path === "/api/beta/sample-sets" ? { sampleSets: [sampleSet] } : { sampleSet };
    },
  });
  await library.load("emptyRoom");
  assert.deepEqual(calls, ["/api/beta/sample-sets", "/api/beta/sample-sets/existing"]);
  const preview = elements.sampleList.children[0].children[0];
  assert.equal(preview.src, "/api/beta/preview/existing-1");
  assert.equal(preview.loading, "lazy");
  assert.throws(() => library.assertRoomTypes(), /第 1 张样本选择房间类型/);
  const roomField = elements.sampleList.children[0].children.at(-1);
  const select = roomField.children[1];
  const detail = roomField.children[2];
  select.value = "其他";
  await select.dispatch("change");
  assert.throws(() => library.assertRoomTypes(), /具体空间类型/);
  detail.value = "衣帽间";
  await detail.dispatch("input");
  library.assertRoomTypes();
  assert.deepEqual(library.currentCases({ commonPrompt: "暖色" }), [{
    caseId: "existing-1", label: "space.jpg", roomType: "其他", roomTypeDetail: "衣帽间",
    prompt: "暖色", referenceImages: [],
  }]);
});

test("新全景样本拒绝非 2:1 且释放预览，正确图片仍可加入逐张上传草稿", async (context) => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => new Element() };
  context.after(() => { globalThis.document = previousDocument; });
  const elements = createElements();
  const errors = [];
  const revoked = [];
  context.mock.method(URL, "revokeObjectURL", (url) => revoked.push(url));
  const library = createBetaSampleLibrary({
    elements, onChange() {}, onError: (error) => errors.push(error),
    validateSourceImage: assertBetaPanoramaSource,
    async api(path, options) {
      assert.equal(path, "/api/beta/sample-sets");
      assert.equal(options, undefined);
      return { sampleSets: [] };
    },
    async readImage(file, { previewOnly }) {
      assert.equal(previewOnly, true);
      return { ...file, file, previewUrl: `blob:${file.name}` };
    },
  });
  library.bind();
  await library.load("panoramaEnhancement");
  elements.sourceFilesInput.files = [{ name: "square.png", width: 1024, height: 1024, size: 100 }];
  await elements.sourceFilesInput.dispatch("change");
  assert.equal(library.sampleCount(), 0);
  assert.match(errors[0].message, /square.png 必须是 2:1/);
  assert.deepEqual(revoked, ["blob:square.png"]);
  elements.sourceFilesInput.files = [{ name: "panorama.png", width: 2048, height: 1024, size: 100 }];
  await elements.sourceFilesInput.dispatch("change");
  assert.equal(library.sampleCount(), 1);
  assert.equal(library.sourceImages()[0].name, "panorama.png");
  assert.equal(library.isReady(), false);
});
