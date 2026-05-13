import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const next = args[idx + 1];
  if (!next) return fallback;
  const value = Number(next);
  return Number.isFinite(value) ? value : fallback;
};

const EMBEDDING_DIM = getArg("dim", 32);
const SEED = getArg("seed", 42);

const ROOT_DATA_PATH = path.resolve(__dirname, "../../data/data.json");
const AI_DIR = path.resolve(__dirname, "../src/ai");
const USER_EMB_PATH = path.join(AI_DIR, "user_emb.npy");
const ITEM_EMB_PATH = path.join(AI_DIR, "item_emb.npy");

const mulberry32 = (seed) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const uniqueByFirstAppearance = (values) => {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

const loadInteractionIds = async () => {
  const raw = await fs.readFile(ROOT_DATA_PATH, "utf8");
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) {
    throw new Error("data.json must be an array of interactions");
  }

  const users = [];
  const songs = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (row.user) users.push(String(row.user));
    if (row.song) songs.push(String(row.song));
  }

  const userIds = uniqueByFirstAppearance(users);
  const songIds = uniqueByFirstAppearance(songs);

  if (userIds.length === 0 || songIds.length === 0) {
    throw new Error("data.json did not contain any user or song IDs");
  }

  return { userIds, songIds };
};

const normalizeRows = (data, rows, cols) => {
  for (let i = 0; i < rows; i += 1) {
    let sum = 0;
    const offset = i * cols;
    for (let j = 0; j < cols; j += 1) {
      const value = data[offset + j];
      sum += value * value;
    }
    const norm = Math.sqrt(sum) || 1;
    for (let j = 0; j < cols; j += 1) {
      data[offset + j] = data[offset + j] / norm;
    }
  }
};

const createEmbeddingMatrix = (rows, cols, rng) => {
  const data = new Float32Array(rows * cols);
  for (let i = 0; i < rows * cols; i += 1) {
    data[i] = (rng() - 0.5) * 2;
  }
  normalizeRows(data, rows, cols);
  return data;
};

const writeNpy = async (filePath, data, shape) => {
  const magic = Buffer.from([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]);
  const version = Buffer.from([0x01, 0x00]);
  const shapeText = shape.length === 1 ? `${shape[0]},` : shape.join(", ");
  const header = `{'descr': '<f4', 'fortran_order': False, 'shape': (${shapeText}), }`;

  let headerWithNewline = `${header}\n`;
  const headerLen = headerWithNewline.length;
  const padLen = (16 - ((10 + headerLen) % 16)) % 16;
  headerWithNewline = `${header}${" ".repeat(padLen)}\n`;

  const headerBuf = Buffer.from(headerWithNewline, "latin1");
  const headerLenBuf = Buffer.alloc(2);
  headerLenBuf.writeUInt16LE(headerBuf.length, 0);

  const dataBuf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);

  const out = Buffer.concat([magic, version, headerLenBuf, headerBuf, dataBuf]);
  await fs.writeFile(filePath, out);
};

const run = async () => {
  const { userIds, songIds } = await loadInteractionIds();
  const rng = mulberry32(SEED);

  const userEmbedding = createEmbeddingMatrix(userIds.length, EMBEDDING_DIM, rng);
  const itemEmbedding = createEmbeddingMatrix(songIds.length, EMBEDDING_DIM, rng);

  await writeNpy(USER_EMB_PATH, userEmbedding, [userIds.length, EMBEDDING_DIM]);
  await writeNpy(ITEM_EMB_PATH, itemEmbedding, [songIds.length, EMBEDDING_DIM]);

  console.log(
    `Generated embeddings: users=${userIds.length}, items=${songIds.length}, dim=${EMBEDDING_DIM}`
  );
  console.log(`Wrote: ${USER_EMB_PATH}`);
  console.log(`Wrote: ${ITEM_EMB_PATH}`);
};

run().catch((error) => {
  console.error("Embedding generation failed:", error.message);
  process.exit(1);
});
