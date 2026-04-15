import fs from "fs/promises";

const NUMPY_MAGIC = "\u0093NUMPY";

const parseShape = (shapeText) =>
  shapeText
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);

export async function loadNpyFloat32(filePath) {
  const buffer = await fs.readFile(filePath);

  if (buffer.length < 10) {
    throw new Error(`Invalid .npy file (too small): ${filePath}`);
  }

  const magic = buffer.subarray(0, 6).toString("latin1");
  if (magic !== NUMPY_MAGIC) {
    throw new Error(`Invalid .npy magic header: ${filePath}`);
  }

  const major = buffer[6];
  const minor = buffer[7];

  let headerLength = 0;
  let headerOffset = 0;

  if (major === 1) {
    headerLength = buffer.readUInt16LE(8);
    headerOffset = 10;
  } else if (major === 2 || major === 3) {
    headerLength = buffer.readUInt32LE(8);
    headerOffset = 12;
  } else {
    throw new Error(`Unsupported .npy version ${major}.${minor}: ${filePath}`);
  }

  const headerEnd = headerOffset + headerLength;
  if (headerEnd >= buffer.length) {
    throw new Error(`Corrupt .npy header length: ${filePath}`);
  }

  const header = buffer.subarray(headerOffset, headerEnd).toString("latin1").trim();

  const descrMatch = header.match(/'descr'\s*:\s*'([^']+)'/);
  const fortranMatch = header.match(/'fortran_order'\s*:\s*(True|False)/);
  const shapeMatch = header.match(/'shape'\s*:\s*\(([^)]*)\)/);

  if (!descrMatch || !fortranMatch || !shapeMatch) {
    throw new Error(`Unable to parse .npy header fields: ${filePath}`);
  }

  const dtype = descrMatch[1];
  const fortranOrder = fortranMatch[1] === "True";
  const shape = parseShape(shapeMatch[1]);

  if (fortranOrder) {
    throw new Error(`Fortran-order arrays are not supported: ${filePath}`);
  }

  if (dtype !== "<f4" && dtype !== "|f4") {
    throw new Error(`Only float32 .npy arrays are supported, got ${dtype}: ${filePath}`);
  }

  if (shape.length === 0) {
    throw new Error(`Invalid .npy shape: ${filePath}`);
  }

  const elementCount = shape.reduce((acc, value) => acc * value, 1);
  const bytesNeeded = elementCount * 4;
  const dataOffset = headerEnd;

  if (buffer.length < dataOffset + bytesNeeded) {
    throw new Error(`.npy payload is truncated: ${filePath}`);
  }

  // Copy bytes into an aligned ArrayBuffer so Float32Array reads safely.
  const rawBytes = buffer.subarray(dataOffset, dataOffset + bytesNeeded);
  const data = new Float32Array(elementCount);
  new Uint8Array(data.buffer).set(rawBytes);

  return {
    data,
    shape,
    dtype,
    fortranOrder,
    version: `${major}.${minor}`,
  };
}
