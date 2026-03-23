import { createRequire } from "node:module";
import path from "node:path";

/**
 * Require a CJS module from scripts/lib/ using Node's native require.
 * Uses createRequire with a file:// URL to bypass bundler interference.
 */
export function requireScript(filename: string) {
  const anchor = path.join(process.cwd(), "scripts", "lib", "package.json");
  const nodeRequire = createRequire(anchor);
  return nodeRequire(`./${filename}`);
}
