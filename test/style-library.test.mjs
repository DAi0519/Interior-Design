/**
 * [INPUT]: 依赖 src/style-library.mjs 的飞书行解析与公开摘要构造
 * [OUTPUT]: 验证 Style DNA、上下架状态、同编码多版本选择及前端数据脱敏
 * [POS]: test 的风格库回归测试，不访问或修改真实飞书 Base
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  getPublishedStyle,
  listPublicStyles,
  parseStyleLibraryEnvelope,
  styleCodeForVersion,
} from "../src/style-library.mjs";

const fields = [
  "风格名称",
  "风格编码",
  "版本",
  "上架状态",
  "风格大类",
  "氛围标签",
  "适用空间",
  "Style DNA",
];

function envelope(rows, hasMore = false) {
  return {
    data: { data: rows, fields, has_more: hasMore },
    ok: true,
  };
}

test("风格库解析上下架状态并验证 Style DNA", () => {
  const [published, offline, invalid] = parseStyleLibraryEnvelope(
    envelope([
      ["奶油法式", "cream-french", 1, ["上架"], ["法式"], ["优雅"], ["全屋"], '{"style_dna":{"overall_style":"现代奶油法式"}}'],
      ["原木风", "natural-wood", 2, ["下架"], ["自然"], [], ["客厅"], '{"style_dna":{"overall_style":"温润原木"}}'],
      ["坏数据", "broken", 1, ["上架"], [], [], [], "not-json"],
    ]),
  );

  assert.equal(published.published, true);
  assert.equal(published.code, "cream-french@v1");
  assert.equal(published.familyCode, "cream-french");
  assert.equal(published.validDna, true);
  assert.equal(published.reason, null);
  assert.equal(offline.reason, "已在飞书下架");
  assert.equal(invalid.reason, "Style DNA 无效");
});

test("公开风格目录不向前端返回完整 Style DNA", async () => {
  const styles = await listPublicStyles({
    config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
    run: async () =>
      envelope([
        ["奶油法式", "cream-french", 1, ["上架"], ["法式"], ["优雅"], ["全屋"], '{"style_dna":{"overall_style":"现代奶油法式"}}'],
      ]),
  });

  assert.equal(styles[0].description, "现代奶油法式");
  assert.equal("styleDna" in styles[0], false);
});

test("同风格版本全部暴露为唯一编码并支持默认最新版与历史版本", async () => {
  const run = async () =>
    envelope([
      ["奶油法式", "cream-french", 1, ["上架"], ["法式"], [], ["全屋"], '{"style_dna":{"overall_style":"奶油法式 v1"}}'],
      ["奶油法式", "cream-french", 3, ["上架"], ["法式"], [], ["全屋"], "not-json"],
      ["奶油法式", "cream-french", 2, ["上架"], ["法式"], [], ["全屋"], '{"style_dna":{"overall_style":"奶油法式 v2"}}'],
    ]);
  const options = {
    config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
    run,
  };

  const styles = await listPublicStyles(options);
  const latest = await getPublishedStyle("cream-french", options);
  const historical = await getPublishedStyle("cream-french@v1", options);

  assert.deepEqual(styles.map((style) => style.version), [3, 2, 1]);
  assert.deepEqual(styles.map((style) => style.code), [
    "cream-french@v3",
    "cream-french@v2",
    "cream-french@v1",
  ]);
  assert.equal(latest.version, 2);
  assert.equal(historical.version, 1);
  assert.equal(historical.styleDna.style_dna.overall_style, "奶油法式 v1");
  await assert.rejects(
    () => getPublishedStyle("cream-french@v3", options),
    /Style DNA 无效/,
  );
});

test("版本化风格编码只接受合法基础编码与正整数版本", () => {
  assert.equal(styleCodeForVersion("cream-french", 2), "cream-french@v2");
  assert.equal(styleCodeForVersion("", 2), "");
  assert.equal(styleCodeForVersion("cream-french", 0), "");
});

test("超过单页范围时拒绝返回不完整风格目录", () => {
  assert.throws(
    () => parseStyleLibraryEnvelope(envelope([], true)),
    /超过 200 条/,
  );
});

test("服务端只返回精确匹配且已上架的完整 Style DNA", async () => {
  const run = async () =>
    envelope([
      ["奶油法式", "cream-french", 1, ["上架"], ["法式"], [], ["全屋"], '{"style_dna":{"overall_style":"奶油法式"}}'],
      ["原木风", "wood", 1, ["下架"], [], [], [], '{"style_dna":{"overall_style":"原木"}}'],
    ]);
  const options = {
    config: { baseToken: "base", cliPath: "lark-cli", tableId: "table" },
    run,
  };

  const style = await getPublishedStyle("cream-french", options);
  assert.equal(style.styleDna.style_dna.overall_style, "奶油法式");
  await assert.rejects(() => getPublishedStyle("wood", options), /已在飞书下架/);
});
