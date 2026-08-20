/**
 * [INPUT]: 依赖 node:test/assert 与白模/空房设计方式选项和选择归一化纯函数
 * [OUTPUT]: 对外提供可切换智能默认说明、平台风格扩展/版本去重、禁用态及失效选择回退的回归保障
 * [POS]: test 的设计风格前端路由选择单元测试，不创建 DOM 或发送真实请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  SMART_DEFAULT_RENDER_MODE,
  STYLE_DNA_RENDER_MODE,
  normalizeWhiteModelRenderModeSelection,
  whiteModelRenderModeOptions,
} from "../public/white-model-render-mode.js";

const styles = [
  {
    code: "cream-french@v4",
    description: "现代奶油法式",
    familyCode: "cream-french",
    name: "奶油法式",
    published: true,
    validDna: true,
    version: 4,
  },
  {
    code: "cream-french@v3",
    familyCode: "cream-french",
    name: "奶油法式",
    published: false,
    validDna: true,
    version: 3,
  },
];

test("智能默认始终是首个风格选择", () => {
  const options = whiteModelRenderModeOptions(styles, {
    smartDefaultAvailable: true,
    smartDefaultVersion: 1,
  });
  assert.equal(options[0].mode, SMART_DEFAULT_RENDER_MODE);
  assert.equal(options[0].label, "智能默认");
  assert.equal(options[0].available, true);
  assert.equal(options[0].agentVersion, 1);
  assert.equal(options[1].styleCode, "cream-french@v4");
  assert.equal(options.length, 2);
});

test("空房设计可以替换智能默认说明而不复制风格路由", () => {
  const [smartDefault] = whiteModelRenderModeOptions(styles, {
    smartDefaultAvailable: true,
    smartDefaultDescription: "自动完成布局、家具、材质与光线",
    smartDefaultVersion: 1,
  });
  assert.equal(smartDefault.description, "自动完成布局、家具、材质与光线");
  assert.equal(smartDefault.agentVersion, 1);
});

test("新增平台风格继续进入两列选项且同风格只保留最高发布版本", () => {
  const options = whiteModelRenderModeOptions([
    ...styles,
    { ...styles[0], code: "cream-french@v5", version: 5 },
    {
      code: "modern-minimal@v1",
      familyCode: "modern-minimal",
      name: "现代简约",
      published: true,
      validDna: true,
      version: 1,
    },
    {
      code: "wabi-sabi@v2",
      familyCode: "wabi-sabi",
      name: "现代侘寂",
      published: true,
      validDna: true,
      version: 2,
    },
  ]);
  assert.equal(options[0].styleCode, null);
  assert.deepEqual(
    options.slice(1).map((option) => option.styleCode).sort(),
    ["cream-french@v5", "modern-minimal@v1", "wabi-sabi@v2"],
  );
});

test("已上架且合法的 Style DNA 映射为紧凑固定风格选项", () => {
  const choice = normalizeWhiteModelRenderModeSelection(
    { mode: STYLE_DNA_RENDER_MODE, styleCode: "cream-french@v4" },
    styles,
  );
  assert.equal(choice.label, "奶油法式");
  assert.equal(choice.style.version, 4);
  assert.equal(choice.available, true);
});

test("失效或下架的固定风格选择回退到智能默认", () => {
  const choice = normalizeWhiteModelRenderModeSelection(
    { mode: STYLE_DNA_RENDER_MODE, styleCode: "cream-french@v3" },
    styles,
  );
  assert.equal(choice.mode, SMART_DEFAULT_RENDER_MODE);
  assert.equal(choice.style, null);
});

test("空房上传风格参考图后保留平台风格展示但禁选并回退智能默认", () => {
  const options = whiteModelRenderModeOptions(styles, {
    platformStylesAvailable: false,
    platformStylesReason: "已上传风格参考图，固定使用智能默认",
    smartDefaultAvailable: true,
  });
  assert.equal(options[1].available, false);
  assert.match(options[1].reason, /固定使用智能默认/);
  const choice = normalizeWhiteModelRenderModeSelection(
    { mode: STYLE_DNA_RENDER_MODE, styleCode: "cream-french@v4" },
    styles,
    {
      platformStylesAvailable: false,
      smartDefaultAvailable: true,
    },
  );
  assert.equal(choice.mode, SMART_DEFAULT_RENDER_MODE);
});
