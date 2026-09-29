// Build without dependencies: Node >= 22.13 strips TypeScript types natively (module.stripTypeScriptTypes).
// "npm run typecheck" (TypeScript installed) remains the full type check.
import { stripTypeScriptTypes } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
mkdirSync("dist", { recursive: true });
const js = stripTypeScriptTypes(readFileSync("src/index.ts", "utf8"), { mode: "strip" });
writeFileSync("dist/index.js", js);
try { chmodSync("dist/index.js", 0o755); } catch {}
console.log("dist/index.js", js.length, "bytes");
