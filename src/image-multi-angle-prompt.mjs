/**
 * [INPUT]: 接收水平角、俯仰角和三档景别，不依赖模型或传输实现
 * [OUTPUT]: 严格机位校验、共享英文镜头指令及独立指令版本
 * [POS]: src 多角度镜头语义真源，Qwen与OneAPI共同消费，统一反打/景别/空间保持约束
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export const MULTI_ANGLE_PROMPT_VERSION = "2026-10-26.en.1";

export function normalizeCameraPose(pose) {
  const ranges = { azimuth: [0, 360], elevation: [-30, 60], distance: [0, 100] };
  return Object.fromEntries(Object.entries(ranges).map(([key, [min, max]]) => {
    const value = pose?.[key];
    if (!Number.isInteger(value) || value < min || value > max) {
      throw Object.assign(new Error(`机位 ${key} 必须为 ${min}–${max} 的整数`), { statusCode: 400 });
    }
    if (key === "distance" && ![0, 50, 100].includes(value)) {
      throw Object.assign(new Error("景别请选择特写、标准或远景，请刷新旧版页面"), { statusCode: 400 });
    }
    return [key, key === "azimuth" ? value % 360 : value];
  }));
}

export function multiAnglePrompt(input) {
  const { azimuth, elevation, distance } = normalizeCameraPose(input);
  const direction = azimuth <= 180 ? "right" : "left";
  const degrees = azimuth <= 180 ? azimuth : 360 - azimuth;
  const reverse = azimuth > 90 && azimuth < 270;
  const position = azimuth === 90 || azimuth === 270 ? `the ${direction} side of the scene` : `a ${direction} oblique view`;
  return [
    "Edit the supplied photograph into one photorealistic view of the SAME scene.",
    "Use the ORIGINAL CAMERA position as 0 degrees and the center of the scene as the orbit center. Angles are camera positions, not the front or back of an object.",
    ...(reverse ? [
      "Create a REVERSE-ANGLE COUNTER-SHOT, looking back toward where the original photograph was taken.",
      "Call the original camera A, scene center B, and the opposite camera position C. Physically move the camera from A past B to C; at 180 degrees its viewing direction is C toward B toward A, opposite to the original A toward B direction.",
      azimuth === 180 ? "Use exactly this opposite-side camera position."
        : `Use the opposite-side position as the 180-degree reference, then move ${Math.abs(azimuth - 180)} degrees ${azimuth > 180 ? "further clockwise" : "back counterclockwise"} around B for the requested ${azimuth}-degree position, still looking back toward the original camera side.`,
      "Reveal the part of the room that was behind the ORIGINAL camera. The original distant background should be behind or to the rear-side of the NEW camera, not remain the dominant wall directly ahead.",
      "If the input looks toward windows, relocate the camera near that window wall with its back toward the windows and photograph INTO the room toward the original shooting position. Keep those windows behind or to the rear-side of the new camera.",
      "Keep the room and furniture fixed in world space. Do not rotate the room, swap doors and windows, or horizontally mirror the input.",
    ] : [azimuth ? `Move the camera ${degrees} degrees to the ${direction} around the scene, to ${position}. Keep the lens aimed at the scene center.`
      : "Keep the original horizontal viewing direction."]),
    elevation > 0 ? `Raise the camera for a ${elevation}-degree downward view.`
      : elevation < 0 ? `Lower the camera for a ${-elevation}-degree upward view.` : "Use an eye-level view.",
    distance === 0 ? "Move closer for a close-up; the subject should occupy more of the frame."
      : distance === 100 ? "Move substantially farther away for a wide establishing view; make the subject smaller and reveal more surrounding space."
      : "Keep a standard framing and similar camera-to-subject distance.",
    "Preserve the identity, materials, lighting and relative spatial arrangement of furniture, walls, doors and windows. Infer unseen areas consistently with the visible scene.",
    "Produce a single photograph, without a camera icon, diagram, labels, collage or mirrored copy.",
  ].join(" ");
}

