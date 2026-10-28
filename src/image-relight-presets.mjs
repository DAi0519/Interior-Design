/**
 * [INPUT]: 依赖服务端已验证的飞书打光JSON bundle、模板/幅度选择与整体原灯/局部typed动作优先级
 * [OUTPUT]: 对外提供显式bundle的照明重建/局部场景及摄影段落编译，原灯处理与新增贡献分离；不包含运营Prompt正文或本地回退
 * [POS]: src 的打光Prompt纯编译层，运行时正文只来自image-relight-prompt独立表资产
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { normalizeRelightSettings } from "../public/image-relight-presets.js";

const REBUILT_TEMPLATES = new Set(["naturalFill", "warmAmbient", "windowDaylight", "accentWash", "softStudio"]);
// -------- 动作冲突优先级是代码安全合同，几何与用户数值继续由服务端严格准入 --------
const ACTION_PRIORITY = "ACTION PRIORITY, from highest to lowest: PRESERVE > TURN OFF > DARKEN > BRIGHTEN > LIGHTING TEMPLATE. In overlapping protected content or conflicting requests about the same original emitter, honor the higher-priority action. Preserve entries retain the marked object's appearance and original illumination even when nearby lights change. Off and darken actions override a template, source-preservation defaults and prose that would reactivate that original emitter or cancel its requested emission reduction; they do not prohibit a separate new light from illuminating a switched-off fixture body. No adjustment strength may override this priority. These priorities address the same identified original emitter or protected content, not a blanket ban on new illumination. PRESERVE also overrides whole-scene original-light handling. An original-emitter TURN OFF, whether whole-scene or marked, overrides DARKEN and any request to relight that original emitter; a marked off therefore overrides whole-scene dim. For the same original emitter, a marked dim amount replaces the whole-scene dim amount rather than compounding the reductions. Whole-scene keep retains original emission as a baseline and may be overridden by explicit marked dim or off. Whole-scene original-light handling never suppresses a separately requested new light or new fixture contribution.";
function requireBundle(bundle) {
  if (!bundle || bundle.SCHEMA_VERSION !== 1) throw Object.assign(new Error("打光 Prompt 资产未加载或结构无效"), { statusCode: 409 });
  return bundle;
}
export function relightRebuildsLighting(input = {}) {
  return REBUILT_TEMPLATES.has(normalizeRelightSettings(input).templateKey);
}
export function relightSceneInstructions(input = {}, promptBundle) {
  const bundle = requireBundle(promptBundle);
  const { templateKey, blendMode } = normalizeRelightSettings(input);
  const rebuild = relightRebuildsLighting(input);
  if (rebuild) return [
    bundle.SCENE.REBUILD.RESET,
    bundle.STRENGTH.REBUILD[blendMode],
    bundle.TEMPLATES[templateKey],
    bundle.SCENE.REBUILD.PRESERVE,
    bundle.SCENE.REBUILD.HARDWARE,
    ACTION_PRIORITY,
    bundle.SCENE.REBUILD.MANUAL,
  ].join("\n\n");
  return [
    bundle.SCENE.LOCAL.BASELINE,
    ACTION_PRIORITY,
    bundle.STRENGTH.LOCAL[blendMode],
    bundle.TEMPLATES[templateKey],
    bundle.SCENE.LOCAL.HARDWARE,
    bundle.SCENE.LOCAL.RECONCILE,
  ].join("\n\n");
}
export function relightPhotographicInstructions(input = {}, promptBundle) {
  const photo = requireBundle(promptBundle).PHOTOGRAPHY;
  const mode = relightRebuildsLighting(input) ? "REBUILD" : "LOCAL";
  return [photo.SCOPE[mode], photo.LIGHTING_QUALITY, photo.MATERIAL_TONAL,
    photo.CAMERA_OPTICS, photo.WHITE_BALANCE[mode], photo.CAMERA_PROFILE].join("\n\n");
}
