/**
 * [INPUT]: 依赖 node:test/assert、参考图能力解释器、美化输入控制器及配置状态投影
 * [OUTPUT]: 对外提供六组合选择/归一化、跨功能单图约束、Prompt 可用/失败提示及隔离界面合同测试
 * [POS]: test 的效果图美化浏览器合同回归测试，不调用真实模型或飞书
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeEffectBeautification } from "../public/effect-beautification-controls.js";
import { effectBeautificationPromptStatus } from "../public/config-refresh.js";
import { referenceCapability, referenceSubject } from "../public/model-capabilities.js";

test("六种美化选择保持原值，恢复无效配置使用低强度自然调", () => {
  for (const intensity of ["low", "high"]) for (const tone of ["natural", "warm", "cool"]) {
    assert.deepEqual(normalizeEffectBeautification({ intensity, tone }), { intensity, tone });
  }
  for (const input of [undefined, null, {}, { intensity: "extreme", tone: "night" }]) {
    assert.deepEqual(normalizeEffectBeautification(input), { intensity: "low", tone: "natural" });
  }
});

test("美化与氛围转换上传均固定单图并明确当前主题", () => {
  for (const featureMode of ["effectBeautification", "effectEnhancement"]) {
    const result = referenceCapability({ featureMode, model: { maxReferenceImages: 4 }, policy: { maxCount: 4 } });
    assert.equal(result.limit, 1);
    assert.equal(result.multiple, false);
    assert.equal(result.optionalLabel, "必填 · 1张");
  }
  assert.equal(referenceSubject("effectBeautification"), "待美化效果图");
  assert.equal(referenceSubject("effectEnhancement"), "待转换效果图");
});

test("美化只展示脱敏版本状态，配置失败保留恢复原因", () => {
  const status = effectBeautificationPromptStatus({ available: true, version: 1 });
  assert.equal(status.availability, "Prompt v1 · 已上架");
  assert.match(status.note, /美化强度与画面色调/);
  assert.equal(status.ready, true);
  const unavailable = effectBeautificationPromptStatus({ available: false, reason: "请检查新表配置" });
  assert.equal(unavailable.ready, false);
  assert.match(unavailable.note, /请检查新表配置/);
});

test("美化控件与氛围天气时段分区隔离", async () => {
  const [html, controls] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/effect-beautification-controls.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /<section id="effectBeautificationSection"[^>]*><\/section>/);
  const section = controls.match(/const BEAUTIFICATION_SECTION_HTML = `([\s\S]*?)`;/)?.[1];
  assert.ok(section);
  assert.equal((section.match(/data-effect-intensity=/g) || []).length, 2);
  assert.equal((section.match(/data-effect-tone=/g) || []).length, 3);
  assert.match(section, /aria-live="polite"/);
  assert.doesNotMatch(section, /effectTimeSelect|effectWeatherSelect|textarea/);
});
