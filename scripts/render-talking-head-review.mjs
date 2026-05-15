#!/usr/bin/env node
process.argv.splice(2, 0, "--stage", "review");
await import("./render-talking-head-final.mjs");
