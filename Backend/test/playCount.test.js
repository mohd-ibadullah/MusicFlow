import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

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
  let memoryServer = null;
  let connected = false;

  try {
    const configuredUri = process.env.MONGODB_URI_TEST || process.env.MONGODB_URI;
    let connectionUri = configuredUri;
    let dbOptions = {};

    if (connectionUri) {
      if (process.env.MONGODB_TEST_DB) {
        dbOptions = { dbName: process.env.MONGODB_TEST_DB };
      }
    } else {
      memoryServer = await MongoMemoryServer.create();
      connectionUri = memoryServer.getUri();
    }

    await mongoose.connect(connectionUri, dbOptions);
    connected = true;

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
    assert.equal(res.body?.message, "Play count updated");

    const after = await Song.findById(song._id).lean();
    assert.equal(after.playCount, 1);
  } finally {
    if (connected) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }

    if (memoryServer) {
      await memoryServer.stop();
    }
  }
});

