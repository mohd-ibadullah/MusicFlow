import test from "node:test";
import assert from "node:assert/strict";

import { mixPopularAndRandom } from "../../src/ai/coldStart.js";

const song = (id) => ({ _id: id, name: `Song ${id}` });

test("mixPopularAndRandom prioritizes popular block and fills to limit", () => {
  const input = [song("1"), song("2"), song("3"), song("4"), song("5"), song("6")];
  const result = mixPopularAndRandom(input, 5);

  assert.equal(result.length, 5);
  assert.equal(result[0]._id, "1");
  assert.equal(result[1]._id, "2");
  assert.equal(result[2]._id, "3");
  assert.equal(result[3]._id, "4");
});

test("mixPopularAndRandom handles short pools", () => {
  const input = [song("1"), song("2")];
  const result = mixPopularAndRandom(input, 5);
  assert.equal(result.length, 2);
});
