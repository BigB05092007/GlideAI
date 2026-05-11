import { rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const includeDeps = process.argv.includes("--deps");
const targets = [
  ".next",
  "out",
  "dist-electron",
  "release",
  ".tools",
  ...(includeDeps ? ["node_modules"] : []),
];

for (const target of targets) {
  const resolved = path.resolve(root, target);
  const relative = path.relative(root, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to remove outside the project: ${resolved}`);
  }

  await rm(resolved, { recursive: true, force: true });
  console.log(`Removed ${target}`);
}
