import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadDotEnv(paths = [".env", "tools/video-use/.env"]) {
  for (const path of paths) {
    const absolute = resolve(path);
    if (!existsSync(absolute)) {
      continue;
    }

    const lines = readFileSync(absolute, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const [key, ...rest] = trimmed.split("=");
      if (!process.env[key]) {
        process.env[key] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
      }
    }
  }
}

export function requireEnv(name, hint) {
  const value = process.env[name];
  if (!value) {
    const suffix = hint ? ` ${hint}` : "";
    throw new Error(`${name} is not set.${suffix}`);
  }
  return value;
}
