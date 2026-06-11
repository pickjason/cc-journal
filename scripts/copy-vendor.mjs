// 把 echarts 从 node_modules 拷进 web/vendor/,Dashboard 不依赖任何 CDN
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules", "echarts", "dist", "echarts.min.js");
const dest = path.join(root, "web", "vendor", "echarts.min.js");

await mkdir(path.dirname(dest), { recursive: true });
await copyFile(src, dest);
console.log(`vendored echarts -> ${path.relative(root, dest)}`);
