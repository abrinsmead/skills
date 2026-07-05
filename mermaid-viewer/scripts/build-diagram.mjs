#!/usr/bin/env node
// Build a self-contained mermaid viewer HTML file from a .mmd source file.
//
// Usage:
//   node build-diagram.mjs <input.mmd> [--title "My Title"] [--out <dir>] [--artifact]
//
// The output filename is derived from the input .mmd basename; --title only
// sets the displayed title (defaults to the basename with underscores as spaces).
//
// Default output: <cwd>/.diagrams/<basename>-<timestamp>.html (full standalone page)
// --artifact:     <out>/<slug>.artifact.html — body-content-only, no DOCTYPE/head,
//                 for hosts (Claude artifacts) that supply their own HTML skeleton.
//
// Prints the absolute output path on success.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = dirname(dirname(fileURLToPath(import.meta.url)));

function fail(msg) {
  process.stderr.write(msg + "\n");
  process.exit(1);
}

// --- Parse args ---------------------------------------------------------
const argv = process.argv.slice(2);
let input = null;
let title = null;
let outDir = null;
let artifact = false;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--title") title = argv[++i];
  else if (a === "--out") outDir = argv[++i];
  else if (a === "--artifact") artifact = true;
  else if (!input) input = a;
  else fail(`Unexpected argument: ${a}`);
}

if (!input) fail("Usage: build-diagram.mjs <input.mmd> [--title \"...\"] [--out <dir>] [--artifact]");

// --- Read inputs ----------------------------------------------------------
let source;
try {
  source = readFileSync(resolve(input), "utf8");
} catch (e) {
  fail(`Cannot read ${input}: ${e.message}`);
}

const inputBase = basename(input).replace(/\.[^.]*$/, "");
if (!title) title = inputBase.replace(/[_-]+/g, " ").trim() || "Diagram";
if (!source.trim()) fail("Diagram source is empty");

const template = readFileSync(join(skillDir, "assets", "template.html"), "utf8");
const lib = readFileSync(join(skillDir, "assets", "mermaid.min.js"), "utf8");

// --- Escape user content ----------------------------------------------------
// JSON string with `<` escaped as <: neutralizes </script>, <!--, etc.
const jsonEscape = (s) => JSON.stringify(s).replace(/</g, "\\u003c");
const diagramJson = jsonEscape(source);
const titleJson = jsonEscape(title);

// --- Splice -------------------------------------------------------------
// split/join, not String.replace: the 2.6MB lib contains `$`-patterns that
// a string replacement argument would mangle.
let html = template
  .split("/*@@MERMAID_LIB@@*/").join(lib)
  .split('"@@DIAGRAM_JSON@@"').join(diagramJson)
  .split('"@@TITLE_JSON@@"').join(titleJson);

// --- Emit --------------------------------------------------------------
const slug = inputBase.replace(/[^a-z0-9_-]/gi, "_").replace(/^_+|_+$/g, "") || "diagram";
const dest = resolve(outDir || join(process.cwd(), ".diagrams"));
mkdirSync(dest, { recursive: true });

let outPath;
if (artifact) {
  outPath = join(dest, `${slug}.artifact.html`);
} else {
  const htmlEscape = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = `<!DOCTYPE html>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${htmlEscape(title)}</title>\n${html}`;
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  outPath = join(dest, `${slug}-${ts}.html`);
}

writeFileSync(outPath, html);
process.stdout.write(outPath + "\n");
