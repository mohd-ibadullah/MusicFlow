import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Song from "../src/models/songModel.js";
import { getTrendingSongsList } from "../src/services/songService.js";

test("getTrendingSongsList returns top songs by playCount and honors limit", async () => {
  let memoryServer = null;

  try {
    memoryServer = await MongoMemoryServer.create();
    await mongoose.connect(memoryServer.getUri());

    await Song.insertMany([
      {
        name: "Song A",
        desc: "A",
        album: "Single",
        artist: "Artist A",
        image: "http://example.com/a.jpg",
        file: "http://example.com/a.mp3",
        duration: "2:00",
        playCount: 10,
      },
      {
        name: "Song B",
        desc: "B",
        album: "Single",
        artist: "Artist B",
        image: "http://example.com/b.jpg",
        file: "http://example.com/b.mp3",
        duration: "2:00",
        playCount: 42,
      },
      {
        name: "Song C",
        desc: "C",
        album: "Single",
        artist: "Artist C",
        image: "http://example.com/c.jpg",
        file: "http://example.com/c.mp3",
        duration: "2:00",
        playCount: 21,
      },
    ]);

    const topTwo = await getTrendingSongsList({ limit: 2 });

    assert.equal(topTwo.length, 2);
    assert.equal(topTwo[0].name, "Song B");
    assert.equal(topTwo[1].name, "Song C");
    assert.ok(topTwo[0].playCount >= topTwo[1].playCount);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }

    if (memoryServer) {
      await memoryServer.stop();
    }
  }
});
