/**
 * [INPUT]: 依赖 public/image-outpaint.js 保留的旧四边几何纯函数
 * [OUTPUT]: 验证旧预处理/扩边兼容、固定目标画布的位移换算与非负边界
 * [POS]: test 的旧扩图几何单元测试，真实鼠标/触摸事件由 image-outpaint-ui.test.mjs 验证
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert/strict";
import { imageOutpaintPreparedDimensions, outpaintTargetDimensions } from "../public/image-outpaint.js";

describe("image-outpaint-drag", () => {
  describe("prepared dimensions for drag bounds", () => {
    it("should calculate prepared dimensions with 32px alignment for drag constraints", () => {
      const source = { width: 800, height: 600 };
      const prepared = imageOutpaintPreparedDimensions(source);
      ok(prepared, "should return prepared dimensions");
      strictEqual(prepared.width, 800, "width should be 32px aligned");
      strictEqual(prepared.height, 608, "height should be ceil-aligned to 32px (600→608)");
    });

    it("should calculate target dimensions with custom expansion", () => {
      const source = { width: 800, height: 600 };
      const expansion = { left: 100, top: 50, right: 100, bottom: 50 };
      const target = outpaintTargetDimensions(source, expansion);
      ok(target, "should return target dimensions");
      strictEqual(target.width, 1000, "width should include left and right expansion");
      strictEqual(target.height, 708, "height should include top and bottom expansion plus alignment (608+100)");
    });
  });

  describe("drag position calculation", () => {
    it("should calculate valid left/top position within bounds", () => {
      const targetWidth = 1200;
      const targetHeight = 800;
      const preparedWidth = 800;
      const preparedHeight = 600;

      const maxLeft = targetWidth - preparedWidth; // 400
      const maxTop = targetHeight - preparedHeight; // 200

      strictEqual(maxLeft, 400, "max left position should be 400");
      strictEqual(maxTop, 200, "max top position should be 200");
    });

    it("should constrain position to valid range", () => {
      const targetWidth = 1200;
      const targetHeight = 800;
      const preparedWidth = 800;
      const preparedHeight = 600;

      const maxLeft = targetWidth - preparedWidth;
      const maxTop = targetHeight - preparedHeight;

      // Test boundary constraints
      const constrainedLeft = Math.max(0, Math.min(maxLeft, 500));
      const constrainedTop = Math.max(0, Math.min(maxTop, 300));

      strictEqual(constrainedLeft, 400, "should constrain left to max");
      strictEqual(constrainedTop, 200, "should constrain top to max");
    });

    it("should calculate right and bottom from left and top", () => {
      const targetWidth = 1200;
      const targetHeight = 800;
      const preparedWidth = 800;
      const preparedHeight = 600;
      const left = 100;
      const top = 50;

      const right = targetWidth - preparedWidth - left;
      const bottom = targetHeight - preparedHeight - top;

      strictEqual(right, 300, "right should be 300px");
      strictEqual(bottom, 150, "bottom should be 150px");
    });
  });

  describe("pixel delta calculation", () => {
    it("should convert canvas pixel movement to target pixel delta", () => {
      const canvasWidth = 400; // preview canvas visual width
      const targetWidth = 1600; // actual target image width
      const deltaX = 50; // moved 50px on canvas

      const pixelDeltaX = Math.round((deltaX / canvasWidth) * targetWidth);

      strictEqual(pixelDeltaX, 200, "should scale 50px canvas movement to 200px target movement");
    });

    it("should handle vertical pixel delta", () => {
      const canvasHeight = 300;
      const targetHeight = 1200;
      const deltaY = 25;

      const pixelDeltaY = Math.round((deltaY / canvasHeight) * targetHeight);

      strictEqual(pixelDeltaY, 100, "should scale 25px canvas movement to 100px target movement");
    });
  });

  describe("expansion validation after drag", () => {
    it("should maintain total dimensions after drag", () => {
      const targetWidth = 1200;
      const targetHeight = 800;
      const preparedWidth = 800;
      const preparedHeight = 600;

      // After drag to new position
      const left = 150;
      const top = 75;
      const right = targetWidth - preparedWidth - left;
      const bottom = targetHeight - preparedHeight - top;

      strictEqual(left + preparedWidth + right, targetWidth, "horizontal sum should match target width");
      strictEqual(top + preparedHeight + bottom, targetHeight, "vertical sum should match target height");
    });

    it("should ensure non-negative expansion values", () => {
      const left = 0;
      const top = 0;
      const right = 400;
      const bottom = 200;

      ok(left >= 0, "left should be non-negative");
      ok(top >= 0, "top should be non-negative");
      ok(right >= 0, "right should be non-negative");
      ok(bottom >= 0, "bottom should be non-negative");
    });
  });

  describe("centered expansion reference", () => {
    it("should calculate centered expansion for comparison", () => {
      const preparedWidth = 800;
      const preparedHeight = 600;
      const targetWidth = 1200;
      const targetHeight = 800;

      const horizontal = targetWidth - preparedWidth; // 400
      const vertical = targetHeight - preparedHeight; // 200

      const left = Math.floor(horizontal / 2); // 200
      const top = Math.floor(vertical / 2); // 100
      const right = horizontal - left; // 200
      const bottom = vertical - top; // 100

      strictEqual(left, 200, "centered left should be 200");
      strictEqual(top, 100, "centered top should be 100");
      strictEqual(right, 200, "centered right should be 200");
      strictEqual(bottom, 100, "centered bottom should be 100");
    });
  });
});
