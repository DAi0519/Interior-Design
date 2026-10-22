/**
 * [INPUT]: 依赖 node:test/assert、Beta 样本库控制器及最小 DOM/图片读取/飞书 API 替身
 * [OUTPUT]: 验证跨图像功能复用原样本ID及free类型隔离、保存选择优先与异步防串目标、按本次功能元数据校验/缺图缺词整集阻断、新建功能归属、仅本次房型补选，以及逐张上传/稳定ID续传/回读就绪和零原图读取
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
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name), remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle(name, force = !classes.has(name)) { if (force) classes.add(name); else classes.delete(name); },
    };
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

function imageSet(sampleSetId, featureMode, dimensions = { width: 1024, height: 768 }) {
  return { sampleSetId, featureMode, name: sampleSetId, sampleCount: 1,
    samples: [{ sampleId: `${sampleSetId}-sample`, image: {
      name: `${sampleSetId}.jpg`, type: "image/jpeg", size: 1024,
      previewUrl: `/api/beta/preview/${sampleSetId}`, ...dimensions,
    } }] };
}

function existingFixture(context, sampleSets, overrides = {}) {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => new Element() };
  context.after(() => { globalThis.document = previousDocument; });
  const elements = createElements();
  const calls = [];
  const errors = [];
  const selections = [];
  const validations = [];
  const library = createBetaSampleLibrary({
    elements, onChange() {},
    onError: (error) => errors.push(error),
    onSelectionChange: (...selection) => selections.push(selection),
    readImage: overrides.readImage || (() => assert.fail("已有样本不能读取或重新上传原图")),
    validateSourceImage(featureMode, image) {
      validations.push({ featureMode, image });
      overrides.validateSourceImage?.(featureMode, image);
    },
    async api(path, options) {
      calls.push({ path, options });
      if (overrides.api) return overrides.api(path, options);
      assert.equal(options, undefined);
      if (path === "/api/beta/sample-sets") return { sampleSets };
      return { sampleSet: sampleSets.find((entry) => path.endsWith(`/${entry.sampleSetId}`)) };
    },
  });
  library.bind();
  return { calls, elements, errors, library, selections, validations };
}

async function until(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail("样本库状态未按预期完成");
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

test("图像功能可选全部已有图像集，加载保留原ID且不读取或复制原件", async (context) => {
  const white = imageSet("white-set", "whiteModel");
  const effect = imageSet("effect-set", "effectBeautification");
  const free = { sampleSetId: "free-set", featureMode: "free", name: "提示词", sampleCount: 1,
    samples: [{ sampleId: "prompt-1", prompt: "客厅" }] };
  const { library, calls, elements, selections, validations } = existingFixture(context, [white, free, effect]);
  await library.load("imageOutpaint");
  assert.deepEqual(elements.sampleSetSelect.options.map((option) => option.value), ["white-set", "effect-set"]);
  assert.equal(elements.sampleSetCreatePanel.classList.contains("hidden"), true);
  assert.equal(library.activeSampleSetId(), "white-set");
  assert.equal(library.currentCases()[0].caseId, "white-set-sample");
  assert.equal(library.sourceImages()[0].previewUrl, white.samples[0].image.previewUrl);
  assert.equal(library.sourceImages()[0].dataUrl, undefined);
  assert.equal(validations[0].featureMode, "imageOutpaint");
  assert.deepEqual(selections[0], ["imageOutpaint", "white-set"]);
  await library.setFeatureMode("imageOutpaint", "effect-set");
  assert.equal(library.currentCases()[0].caseId, "effect-set-sample");
  assert.equal(effect.featureMode, "effectBeautification");
  assert.ok(calls.every((call) => call.options === undefined));
});

test("默认按已保存选择、同功能来源、其他图像集恢复，功能间各自记忆选择", async (context) => {
  const white = imageSet("white-set", "whiteModel");
  const effect = imageSet("effect-set", "effectBeautification");
  const own = imageSet("outpaint-set", "imageOutpaint");
  const { library } = existingFixture(context, [white, effect, own]);
  await library.load("imageOutpaint", "effect-set");
  assert.equal(library.activeSampleSetId(), "effect-set");
  await library.setFeatureMode("whiteModel");
  assert.equal(library.activeSampleSetId(), "white-set");
  await library.setFeatureMode("imageOutpaint");
  assert.equal(library.activeSampleSetId(), "effect-set");
  await library.setFeatureMode("imageOutpaint", "removed-set");
  assert.equal(library.activeSampleSetId(), "outpaint-set");
  await library.setFeatureMode("refinedModel");
  assert.equal(library.activeSampleSetId(), "white-set");
});

test("free仅复用提示词集，图像集与提示词集均不会跨类型加载", async (context) => {
  const image = imageSet("image-set", "whiteModel");
  const free = { sampleSetId: "free-set", featureMode: "free", name: "提示词", sampleCount: 1,
    samples: [{ sampleId: "prompt-1", prompt: "暖色卧室" }] };
  const { library, elements } = existingFixture(context, [image, free]);
  await library.load("free", "image-set");
  assert.deepEqual(elements.sampleSetSelect.options.map((option) => option.value), ["free-set"]);
  assert.deepEqual(library.currentCases()[0], {
    caseId: "prompt-1", label: "暖色卧室", prompt: "暖色卧室", referenceImages: [],
  });
  await library.setFeatureMode("imageOutpaint", "free-set");
  assert.equal(library.activeSampleSetId(), "image-set");
  assert.deepEqual(elements.sampleSetSelect.options.map((option) => option.value), ["image-set"]);
});

test("只有无兼容集才自动新建，新增样本仍归属当前目标功能", async (context) => {
  const free = { sampleSetId: "free-set", featureMode: "free", name: "提示词", sampleCount: 1,
    samples: [{ sampleId: "prompt-1", prompt: "客厅" }] };
  let uploaded;
  const sampleSet = { sampleSetId: "new-outpaint", featureMode: "imageOutpaint", name: "扩图样本", sampleCount: 1 };
  const { library, elements, calls } = existingFixture(context, [free], {
    async readImage(file, { previewOnly = false } = {}) {
      return previewOnly ? { ...file, file, previewUrl: "blob:sample", width: 800, height: 600 }
        : { ...file, width: 800, height: 600, dataUrl: "data:image/png;base64,AA==" };
    },
    async api(path, options) {
      if (!options) return { sampleSets: [free] };
      const body = JSON.parse(options.body);
      if (path === "/api/beta/sample-sets") {
        assert.deepEqual(body, { featureMode: "imageOutpaint", name: "扩图样本" });
        return { sampleSet };
      }
      if (path.endsWith("/samples")) {
        uploaded = { sampleId: body.sampleId, image: { ...body.image, dataUrl: undefined, previewUrl: "/preview/new" } };
        return { sample: uploaded };
      }
      assert.ok(path.endsWith("/complete"));
      return { sampleSet: { ...sampleSet, samples: [uploaded] } };
    },
  });
  await library.load("imageOutpaint");
  assert.equal(elements.sampleSetCreatePanel.classList.contains("hidden"), false);
  elements.sampleSetNameInput.value = "扩图样本";
  elements.sourceFilesInput.files = [{ name: "new.png", type: "image/png", size: 100 }];
  await elements.sourceFilesInput.dispatch("change");
  const draftId = library.sourceImages()[0].sampleId;
  await elements.saveSampleSetButton.dispatch("click");
  await until(() => library.isReady());
  assert.equal(library.activeSampleSetId(), "new-outpaint");
  assert.equal(library.currentCases()[0].caseId, draftId);
  assert.equal(calls.filter((call) => call.options?.method === "POST").length, 3);
});

test("跨功能加载按目标全景校验已有元数据，缺尺寸旧集不下载原件并留给执行期校验", async (context) => {
  const square = imageSet("square", "whiteModel", { width: 1024, height: 1024 });
  const old = imageSet("old", "effectBeautification", {});
  const { library, errors, validations } = existingFixture(context, [square, old], {
    validateSourceImage: assertBetaPanoramaSource,
  });
  await library.load("panoramaEnhancement", "square");
  assert.equal(library.isReady(), false);
  assert.match(errors[0].message, /square.jpg 必须是 2:1/);
  assert.equal(validations[0].featureMode, "panoramaEnhancement");
  await library.setFeatureMode("panoramaEnhancement", "old");
  assert.equal(library.isReady(), true);
  assert.equal(library.currentCases()[0].caseId, "old-sample");
});

test("空房可复用其他图像集并只在本次补房型，不修改来源元信息", async (context) => {
  const source = imageSet("shared", "whiteModel");
  const { library, elements, calls } = existingFixture(context, [source]);
  await library.load("emptyRoom");
  assert.throws(() => library.assertRoomTypes(), /房间类型/);
  const field = elements.sampleList.children[0].children.at(-1);
  field.children[1].value = "卧室";
  await field.children[1].dispatch("change");
  library.assertRoomTypes();
  assert.equal(library.currentCases()[0].roomType, "卧室");
  assert.equal(source.samples[0].roomType, undefined);
  assert.equal(source.featureMode, "whiteModel");
  assert.ok(calls.every((call) => call.options === undefined));
});

test("重复选择同一目标与选集保留本次空房补选，显式目录刷新重新读取元数据", async (context) => {
  const source = imageSet("shared", "whiteModel");
  const { library, elements, calls } = existingFixture(context, [source]);
  await library.load("emptyRoom");
  const field = elements.sampleList.children[0].children.at(-1);
  field.children[1].value = "卧室";
  await field.children[1].dispatch("change");
  const callsBefore = calls.length;
  await library.setFeatureMode("emptyRoom", "shared");
  assert.equal(calls.length, callsBefore);
  assert.equal(library.currentCases()[0].roomType, "卧室");
  await library.load("emptyRoom", "shared");
  assert.equal(calls.length, callsBefore + 2);
  assert.equal(library.currentCases()[0].roomType, undefined);
  assert.throws(() => library.assertRoomTypes(), /房间类型/);
});

test("功能切换后旧详情响应不会覆盖新目标和选集", async (context) => {
  const white = imageSet("white", "whiteModel");
  const effect = imageSet("effect", "effectBeautification");
  let releaseWhite;
  const { library, calls, selections } = existingFixture(context, [white, effect], {
    async api(path) {
      if (path === "/api/beta/sample-sets") return { sampleSets: [white, effect] };
      if (path.endsWith("/white")) return new Promise((resolve) => { releaseWhite = resolve; });
      return { sampleSet: effect };
    },
  });
  const firstLoad = library.load("whiteModel");
  await until(() => calls.some((call) => call.path.endsWith("/white")));
  await library.setFeatureMode("imageOutpaint", "effect");
  releaseWhite({ sampleSet: white });
  await firstLoad;
  assert.equal(library.activeSampleSetId(), "effect");
  assert.equal(library.currentCases()[0].caseId, "effect-sample");
  assert.deepEqual(selections, [["imageOutpaint", "effect"]]);
});

test("目录读取时切换功能沿最新目标与保存ID加载，不退回初始功能", async (context) => {
  const white = imageSet("white", "whiteModel");
  const effect = imageSet("effect", "effectBeautification");
  let releaseCatalog;
  const { library, selections } = existingFixture(context, [white, effect], {
    async api(path) {
      if (path === "/api/beta/sample-sets") return new Promise((resolve) => { releaseCatalog = resolve; });
      return { sampleSet: effect };
    },
  });
  const firstLoad = library.load("whiteModel");
  await until(() => Boolean(releaseCatalog));
  await library.setFeatureMode("imageOutpaint", "effect");
  releaseCatalog({ sampleSets: [white, effect] });
  await firstLoad;
  assert.equal(library.activeSampleSetId(), "effect");
  assert.deepEqual(selections, [["imageOutpaint", "effect"]]);
});

test("复用集任何一行缺图片或提示词均整集阻断，不静默跳过部分样本", async (context) => {
  const image = imageSet("broken-image", "whiteModel");
  image.samples.push({ sampleId: "missing-image" });
  image.sampleCount = 2;
  const free = { sampleSetId: "broken-free", featureMode: "free", name: "提示词", sampleCount: 2,
    samples: [{ sampleId: "prompt-1", prompt: "客厅" }, { sampleId: "prompt-2", prompt: " " }] };
  const { library, errors } = existingFixture(context, [image, free]);
  await library.load("imageOutpaint");
  assert.equal(library.isReady(), false);
  assert.equal(library.sampleCount(), 0);
  assert.match(errors[0].message, /第 2 条样本缺少图片/);
  image.samples[1].image = {};
  await library.setFeatureMode("imageOutpaint");
  assert.equal(library.isReady(), false);
  assert.equal(library.sampleCount(), 0);
  assert.match(errors[1].message, /图片类型无效/);
  await library.setFeatureMode("free");
  assert.equal(library.isReady(), false);
  assert.equal(library.sampleCount(), 0);
  assert.match(errors[2].message, /第 2 条样本缺少提示词/);
});
