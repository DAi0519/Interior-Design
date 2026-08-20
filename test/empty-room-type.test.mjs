/**
 * [INPUT]: 依赖 node:test/assert、服务端空房房间类型/详情真源与浏览器选择归一化/条件校验函数
 * [OUTPUT]: 对外提供十个客户选项、无默认值、“其他”详情条件必填/40 字上限及非法值拒绝的前后端合同回归保障
 * [POS]: test 的空房房间类型合同测试，不创建 DOM 或调用外部服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeOtherRoomTypeDetail,
  normalizeRoomTypeSelection,
  roomTypeSelectionValidation,
} from "../public/empty-room-type.js";
import {
  EMPTY_ROOM_TYPES,
  EMPTY_ROOM_TYPE_DETAIL_MAX_LENGTH,
  normalizeEmptyRoomType,
  normalizeEmptyRoomTypeDetail,
} from "../src/empty-room-type.mjs";

test("空房房间类型目录与客户选择保持同一十项合同", () => {
  assert.deepEqual(EMPTY_ROOM_TYPES, [
    "客厅", "厨房", "卧室", "书房", "餐厅",
    "儿童房", "卫生间", "阳台", "玄关", "其他",
  ]);
  assert.equal(normalizeRoomTypeSelection("", EMPTY_ROOM_TYPES), "");
  assert.equal(normalizeRoomTypeSelection(" 卧室 ", EMPTY_ROOM_TYPES), "卧室");
});

test("服务端只接受目录内房间类型", () => {
  assert.equal(normalizeEmptyRoomType("儿童房"), "儿童房");
  assert.equal(normalizeEmptyRoomType(" 客厅 "), "客厅");
  assert.equal(normalizeEmptyRoomType("客餐厅一体"), null);
  assert.equal(normalizeEmptyRoomType(""), null);
});

test("选择其他时具体空间类型条件必填并归一化空白", () => {
  const base = {
    detailMaxLength: EMPTY_ROOM_TYPE_DETAIL_MAX_LENGTH,
    roomTypes: EMPTY_ROOM_TYPES,
    selection: "其他",
  };
  assert.deepEqual(roomTypeSelectionValidation({ ...base, detail: "  " }), {
    field: "roomTypeDetail",
    message: "请填写具体空间类型",
  });
  assert.deepEqual(roomTypeSelectionValidation({
    ...base,
    detail: "  衣帽间  ",
  }), { field: null, message: null });
  assert.equal(normalizeOtherRoomTypeDetail("  家庭   影音室  "), "家庭 影音室");
  assert.equal(normalizeEmptyRoomTypeDetail("  家庭   影音室  "), "家庭 影音室");
});

test("非其他类型不要求详情且详情受四十字符上限保护", () => {
  assert.deepEqual(roomTypeSelectionValidation({
    detail: "",
    detailMaxLength: EMPTY_ROOM_TYPE_DETAIL_MAX_LENGTH,
    roomTypes: EMPTY_ROOM_TYPES,
    selection: "卧室",
  }), { field: null, message: null });
  assert.match(roomTypeSelectionValidation({
    detail: "影".repeat(EMPTY_ROOM_TYPE_DETAIL_MAX_LENGTH + 1),
    detailMaxLength: EMPTY_ROOM_TYPE_DETAIL_MAX_LENGTH,
    roomTypes: EMPTY_ROOM_TYPES,
    selection: "其他",
  }).message, /不能超过 40 个字符/);
});
