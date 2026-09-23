import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const standaloneDirectory = resolve(".next/standalone");
const staticSource = resolve(".next/static");
const staticDestination = resolve(standaloneDirectory, ".next/static");
const publicSource = resolve("public");
const publicDestination = resolve(standaloneDirectory, "public");

if (!existsSync(resolve(standaloneDirectory, "server.js"))) {
  throw new Error("Next.js standalone output is missing; run next build first");
}

if (existsSync(staticSource)) {
  cpSync(staticSource, staticDestination, { recursive: true, force: true });
}
if (existsSync(publicSource)) {
  cpSync(publicSource, publicDestination, { recursive: true, force: true });
}

process.stdout.write("Standalone runtime assets prepared.\n");
