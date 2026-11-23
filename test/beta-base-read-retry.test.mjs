/**
 * [INPUT]: 依赖Beta Base与Node测试，使用只读EOF/TLS错误和写入未知结果的CLI替身
 * [OUTPUT]: 验证短暂读取失败可恢复、持续失败有界且任何记录写入不自动重试
 * [POS]: Beta只读连接恢复回归，不访问真实飞书或提交GPU
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createBetaBaseStore } from "../src/beta-base.mjs";
const empty = { ok: true, data: { fields: ["样本集 ID", "名称", "功能", "状态", "样本数量", "说明"],
  data: [], record_id_list: [], has_more: false } };

test("Beta只读EOF/TLS短暂失败按原查询恢复，持续失败最多三次", async () => {
  for (const message of ["API call failed: EOF", "API call failed: TLS handshake timeout"]) {
    let calls = 0;
    const store = createBetaBaseStore({ async run(_config, args) {
      assert.equal(args[1], "+record-list");
      if (++calls === 1) throw new Error(message);
      return empty;
    } });
    assert.deepEqual(await store.listSampleSets(), []); assert.equal(calls, 2);
  }
  let calls = 0;
  const store = createBetaBaseStore({ async run() { calls += 1; throw new Error("unexpected EOF"); } });
  await assert.rejects(store.listSampleSets(), /EOF/); assert.equal(calls, 3);
});

test("Beta创建记录即使EOF也只发一次，业务读取错误不重试", async () => {
  let writes = 0;
  const store = createBetaBaseStore({ async run(_config, args) {
    assert.equal(args[1], "+record-batch-create"); writes += 1; throw new Error("API call failed: EOF");
  } });
  await assert.rejects(store.createSampleSet({ featureMode: "free", name: "未受理结果未知" }), /EOF/);
  assert.equal(writes, 1);
  let reads = 0;
  const invalid = createBetaBaseStore({ async run() { reads += 1; throw new Error("permission denied"); } });
  await assert.rejects(invalid.listSampleSets(), /permission denied/); assert.equal(reads, 1);
});
