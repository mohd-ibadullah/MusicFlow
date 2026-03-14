import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import Song from "../src/models/songModel.js";
import { incrementPlayCount } from "../src/controllers/songController.js";

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

test("POST /api/song/play/:songId increments playCount", async (t) => {
  const uri = process.env.MONGODB_URI_TEST || process.env.MONGODB_URI;
  if (!uri) {
    t.skip("MONGODB_URI_TEST (or MONGODB_URI) not set; skipping DB test");
    return;
  }

  await mongoose.connect(uri, { dbName: process.env.MONGODB_TEST_DB || undefined });

  const song = await Song.create({
    name: "Test Song",
    desc: "Test Desc",
    album: "Single",
    artist: "Test Artist",
    genre: "Test Genre",
    image: "http://example.com/img.jpg",
    file: "http://example.com/audio.mp3",
    duration: "0:01",
  });

  const before = await Song.findById(song._id).lean();
  assert.equal(before.playCount ?? 0, 0);

  const req = { params: { songId: song._id.toString() }, body: {}, app: { get: () => null } };
  const res = createMockRes();
  await incrementPlayCount(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.success, true);
  assert.equal(res.body?.songId?.toString(), song._id.toString());

  const after = await Song.findById(song._id).lean();
  assert.equal(after.playCount, 1);

  await Song.deleteOne({ _id: song._id });
  await mongoose.disconnect();
});

