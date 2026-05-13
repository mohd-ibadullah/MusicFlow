import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const testsRoot = path.join(serverRoot, "tests");
const subdir = process.argv[2] || null;

async function collectTestFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await collectTestFiles(p)));
    } else if (ent.isFile() && ent.name.endsWith(".test.js")) {
      out.push(p);
    }
  }
  return out;
}

let files = await collectTestFiles(testsRoot);
if (subdir) {
  const prefix = path.join(testsRoot, subdir) + path.sep;
  files = files.filter((f) => f.startsWith(prefix));
}
if (files.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

const child = spawn(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  cwd: serverRoot,
  shell: false,
});

child.on("exit", (code) => process.exit(code ?? 1));
