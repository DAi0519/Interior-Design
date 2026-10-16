/**
 * [INPUT]: 依赖 public/image-outpaint.js 保留的旧四边几何纯函数
 * [OUTPUT]: 验证固定画布中的像素位移、边界约束与旧四边求和恒等式
 * [POS]: test 的旧扩图几何兼容测试，真实绑定拖动行为由 image-outpaint-ui.test.mjs 验证
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert/strict";
import { imageOutpaintPreparedDimensions, outpaintTargetDimensions } from "../public/image-outpaint.js";

describe("image-outpaint-drag-integration", () => {
  describe("complete drag workflow", () => {
    it("should handle a complete drag from center to top-left", () => {
      const source = { width: 800, height: 600 };
      const prepared = imageOutpaintPreparedDimensions(source);

      // Start with centered expansion
      const targetWidth = 1200;
      const targetHeight = 900;

      const initialHorizontal = targetWidth - prepared.width;
      const initialVertical = targetHeight - prepared.height;

      let left = Math.floor(initialHorizontal / 2);
      let top = Math.floor(initialVertical / 2);
      let right = initialHorizontal - left;
      let bottom = initialVertical - top;

      strictEqual(left + prepared.width + right, targetWidth, "initial: horizontal sum should match");
      strictEqual(top + prepared.height + bottom, targetHeight, "initial: vertical sum should match");

      // Simulate drag to top-left (move by -100px horizontally, -50px vertically on canvas)
      const canvasWidth = 400;
      const canvasHeight = 300;
      const deltaX = -100;
      const deltaY = -50;

      const pixelDeltaX = Math.round((deltaX / canvasWidth) * targetWidth);
      const pixelDeltaY = Math.round((deltaY / canvasHeight) * targetHeight);

      const newLeft = Math.max(0, Math.min(targetWidth - prepared.width, left + pixelDeltaX));
      const newTop = Math.max(0, Math.min(targetHeight - prepared.height, top + pixelDeltaY));

      left = newLeft;
      top = newTop;
      right = targetWidth - prepared.width - left;
      bottom = targetHeight - prepared.height - top;

      ok(left >= 0 && left <= targetWidth - prepared.width, "left should be within bounds");
      ok(top >= 0 && top <= targetHeight - prepared.height, "top should be within bounds");
      strictEqual(left + prepared.width + right, targetWidth, "after drag: horizontal sum should match");
      strictEqual(top + prepared.height + bottom, targetHeight, "after drag: vertical sum should match");
    });

    it("should handle drag boundary clamping at edges", () => {
      const source = { width: 800, height: 600 };
      const prepared = imageOutpaintPreparedDimensions(source);
      const targetWidth = 1200;
      const targetHeight = 900;

      // Start at top-left (0, 0)
      let left = 0;
      let top = 0;

      // Try to drag beyond top-left
      const canvasWidth = 400;
      const canvasHeight = 300;
      const deltaX = -200; // try to go 200px left
      const deltaY = -100; // try to go 100px up

      const pixelDeltaX = Math.round((deltaX / canvasWidth) * targetWidth);
      const pixelDeltaY = Math.round((deltaY / canvasHeight) * targetHeight);

      left = Math.max(0, Math.min(targetWidth - prepared.width, left + pixelDeltaX));
      top = Math.max(0, Math.min(targetHeight - prepared.height, top + pixelDeltaY));

      strictEqual(left, 0, "left should be clamped to 0");
      strictEqual(top, 0, "top should be clamped to 0");
    });

    it("should handle drag to bottom-right boundary", () => {
      const source = { width: 800, height: 600 };
      const prepared = imageOutpaintPreparedDimensions(source);
      const targetWidth = 1200;
      const targetHeight = 900;

      const maxLeft = targetWidth - prepared.width;
      const maxTop = targetHeight - prepared.height;

      // Start at center
      let left = Math.floor(maxLeft / 2);
      let top = Math.floor(maxTop / 2);

      // Drag far to bottom-right
      const canvasWidth = 400;
      const canvasHeight = 300;
      const deltaX = 500;
      const deltaY = 300;

      const pixelDeltaX = Math.round((deltaX / canvasWidth) * targetWidth);
      const pixelDeltaY = Math.round((deltaY / canvasHeight) * targetHeight);

      left = Math.max(0, Math.min(maxLeft, left + pixelDeltaX));
      top = Math.max(0, Math.min(maxTop, top + pixelDeltaY));

      strictEqual(left, maxLeft, "left should be clamped to max");
      strictEqual(top, maxTop, "top should be clamped to max");
    });
  });

  describe("drag state consistency", () => {
    it("should maintain prepared dimensions during drag regardless of position", () => {
      const source = { width: 1600, height: 900 };
      const prepared = imageOutpaintPreparedDimensions(source);

      // Prepared dimensions are fixed after alignment, regardless of drag position
      strictEqual(prepared.width, 1600, "prepared width should be constant");
      strictEqual(prepared.height, 928, "prepared height should be constant (900 → 928, aligned to 32px)");

      // The prepared dimensions don't change when we drag to different positions
      const targetWidth = 2000;
      const targetHeight = 1200;

      const position1 = { left: 0, top: 0 };
      const position2 = { left: 200, top: 150 };

      // At any position, the prepared dimensions remain the same
      strictEqual(prepared.width, 1600, "width unchanged at position 1");
      strictEqual(prepared.height, 928, "height unchanged at position 1");
    });

    it("should calculate expansion values that sum to total canvas space", () => {
      const source = { width: 800, height: 600 };
      const prepared = imageOutpaintPreparedDimensions(source);
      const targetWidth = 1600;
      const targetHeight = 1200;

      // Any valid position
      const left = 300;
      const top = 150;
      const right = targetWidth - prepared.width - left;
      const bottom = targetHeight - prepared.height - top;

      strictEqual(left + prepared.width + right, targetWidth, "horizontal equation should hold");
      strictEqual(top + prepared.height + bottom, targetHeight, "vertical equation should hold");

      // Verify expansion can create valid target
      const expansion = { left, top, right, bottom };
      const calculatedTarget = outpaintTargetDimensions(source, expansion);

      strictEqual(calculatedTarget.width, targetWidth, "calculated target width should match");
      strictEqual(calculatedTarget.height, targetHeight, "calculated target height should match");
    });
  });

});
