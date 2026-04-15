import test from "node:test";
import assert from "node:assert/strict";

import {
  createPlaylist,
  generatePlaylist,
} from "../src/controllers/playlistController.js";

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("createPlaylist returns 401 when user is missing", async () => {
  const req = { body: { name: "Focus Mix", description: "My playlist" } };
  const res = createMockRes();

  await createPlaylist(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.message, "User not authenticated");
});

test("generatePlaylist returns 401 when user is missing", async () => {
  const req = { body: { prompt: "workout upbeat" } };
  const res = createMockRes();

  await generatePlaylist(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.success, false);
  assert.equal(res.body?.message, "User not authenticated");
});

test("generatePlaylist returns 400 for empty prompt", async () => {
  const req = {
    user: { userId: "507f191e810c19729de860ea" },
    body: { prompt: "   " },
  };
  const res = createMockRes();

  await generatePlaylist(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.success, false);
  assert.equal(
    res.body?.message,
    "Prompt is required and must be a non-empty string"
  );
});
