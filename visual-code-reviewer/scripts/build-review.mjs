#!/usr/bin/env node
// Build a self-contained review canvas HTML file from a .json manifest.
//
// Usage:
//   node build-review.mjs <manifest.json> [--title "My Title"] [--out <dir>] [--artifact]
//
// The output filename is derived from the input .json basename; --title only
// overrides the displayed title (defaults to manifest.title, then the basename).
//
// Default output: <cwd>/.review/<basename>-<timestamp>.html (full standalone page)
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

if (!input) fail("Usage: build-review.mjs <manifest.json> [--title \"...\"] [--out <dir>] [--artifact]");

// --- Read + parse manifest ------------------------------------------------
const inputPath = resolve(input);
let raw;
try {
  raw = readFileSync(inputPath, "utf8");
} catch (e) {
  fail(`Cannot read ${input}: ${e.message}`);
}

let manifest;
try {
  manifest = JSON.parse(raw);
} catch (e) {
  fail(`Manifest is not valid JSON: ${e.message}`);
}

// --- Validate -------------------------------------------------------------
const NODE_TYPES = ["mermaid", "diff", "excerpt", "changeset", "files", "markdown", "code", "warning", "callout", "shape", "image"];
const CHANGESET_KINDS = ["behavioral", "mechanical", "generated", "test", "docs", "config"];
const RISKS = ["high", "medium", "low"];
const TONES = ["info", "tip", "gotcha"];
const MODES = ["review", "explain"];
const SEVERITIES = ["P0", "P1", "P2"];
const SHAPES = ["start", "end", "process", "decision", "io"];
const FILE_STATUSES = ["added", "modified", "deleted", "renamed"];
const PALETTE = [
  "coral", "ocean", "forest", "sunshine", "grape", "amber", "teal", "pink",
  "tangerine", "sky", "lavender", "mint", "rose", "lemon", "violet", "peach",
];
const errors = [];

if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
  fail("Manifest must be a JSON object with a `nodes` array");
}
if (manifest.title !== undefined && typeof manifest.title !== "string") {
  errors.push("`title` must be a string");
}
if (manifest.url !== undefined && !/^https?:\/\//.test(String(manifest.url))) {
  errors.push("`url` must start with http:// or https://");
}
if (manifest.mode !== undefined && !MODES.includes(manifest.mode)) {
  errors.push(`\`mode\` must be one of ${MODES.join(", ")}`);
}
if (!Array.isArray(manifest.nodes) || manifest.nodes.length === 0) {
  fail("Manifest needs a non-empty `nodes` array");
}

const ids = new Set();
manifest.nodes.forEach((n, i) => {
  const where = `nodes[${i}]`;
  if (n === null || typeof n !== "object") { errors.push(`${where} must be an object`); return; }
  const label = n.id ? `${where} (id "${n.id}")` : where;
  if (typeof n.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(n.id)) {
    errors.push(`${where}: \`id\` must be a non-empty string of [a-zA-Z0-9_-]`);
  } else if (ids.has(n.id)) {
    errors.push(`${where}: duplicate id "${n.id}"`);
  } else {
    ids.add(n.id);
  }
  if (!NODE_TYPES.includes(n.type)) {
    errors.push(`${label}: unknown type "${n.type}" (expected ${NODE_TYPES.join(", ")})`);
    return; // type-specific checks would be noise
  }
  const needsContent = ["mermaid", "diff", "excerpt", "markdown", "code", "warning", "callout"];
  if (needsContent.includes(n.type) && typeof n.content !== "string") {
    errors.push(`${label}: type "${n.type}" requires a string \`content\``);
  }
  if (n.note !== undefined && typeof n.note !== "string") {
    errors.push(`${label}: \`note\` must be a string (markdown)`);
  }
  if (n.risk !== undefined && !RISKS.includes(n.risk)) {
    errors.push(`${label}: \`risk\` must be one of ${RISKS.join(", ")}`);
  }
  if (n.group !== undefined && typeof n.group !== "string") {
    errors.push(`${label}: \`group\` must be a string`);
  }
  if (n.line !== undefined && typeof n.line !== "number") {
    errors.push(`${label}: \`line\` must be a number`);
  }
  if (n.type === "callout" && !TONES.includes(n.tone)) {
    errors.push(`${label}: callout requires \`tone\` of ${TONES.join("/")}`);
  }
  if (n.type === "changeset") {
    if (n.kind !== undefined && !CHANGESET_KINDS.includes(n.kind)) {
      errors.push(`${label}: \`kind\` must be one of ${CHANGESET_KINDS.join(", ")}`);
    }
    if (typeof n.note !== "string" && !Array.isArray(n.slices)) {
      errors.push(`${label}: changeset needs a \`note\`, \`slices\`, or both`);
    }
    if (n.slices !== undefined) {
      if (!Array.isArray(n.slices)) {
        errors.push(`${label}: \`slices\` must be an array`);
      } else {
        n.slices.forEach((s, j) => {
          const swhere = `${label}.slices[${j}]`;
          if (s === null || typeof s !== "object") { errors.push(`${swhere} must be an object`); return; }
          if (typeof s.content !== "string") errors.push(`${swhere}: requires a string \`content\` (diff slice)`);
          if (s.file !== undefined && typeof s.file !== "string") errors.push(`${swhere}: \`file\` must be a string`);
        });
      }
    }
  }
  if (n.type === "files") {
    if (!Array.isArray(n.files) || n.files.length === 0) {
      errors.push(`${label}: type "files" requires a non-empty \`files\` array`);
    } else {
      n.files.forEach((f, j) => {
        const fwhere = `${label}.files[${j}]`;
        if (f === null || typeof f !== "object") { errors.push(`${fwhere} must be an object`); return; }
        if (typeof f.file !== "string" || !f.file.trim()) {
          errors.push(`${fwhere}: requires a string \`file\``);
        }
        if (typeof f.content !== "string") {
          errors.push(`${fwhere}: requires a string \`content\` (the file's unified diff)`);
        }
        if (f.status !== undefined && !FILE_STATUSES.includes(f.status)) {
          errors.push(`${fwhere}: \`status\` must be one of ${FILE_STATUSES.join(", ")}`);
        }
        for (const k of ["additions", "deletions", "lines"]) {
          if (f[k] !== undefined && typeof f[k] !== "number") {
            errors.push(`${fwhere}: \`${k}\` must be a number`);
          }
        }
      });
    }
  }
  if (n.type === "warning" && !SEVERITIES.includes(n.severity)) {
    errors.push(`${label}: warning requires \`severity\` of ${SEVERITIES.join("/")}`);
  }
  if (n.type === "shape") {
    if (!SHAPES.includes(n.shape)) errors.push(`${label}: \`shape\` must be one of ${SHAPES.join(", ")}`);
    if (typeof n.label !== "string" || !n.label.trim()) errors.push(`${label}: shape requires a string \`label\``);
    if (n.color !== undefined && !PALETTE.includes(n.color)) {
      errors.push(`${label}: unknown color "${n.color}" (palette: ${PALETTE.join(", ")})`);
    }
  }
  if (n.type === "diff" || n.type === "excerpt") {
    if (n.status !== undefined && !FILE_STATUSES.includes(n.status)) {
      errors.push(`${label}: \`status\` must be one of ${FILE_STATUSES.join(", ")}`);
    }
  }
  if (n.type === "diff") {
    if (n.minimized !== undefined && typeof n.minimized !== "boolean") {
      errors.push(`${label}: \`minimized\` must be a boolean`);
    }
    if (n.minimized && typeof n.file !== "string") {
      errors.push(`${label}: a minimized diff needs \`file\` (shown on the chip)`);
    }
  }
  if (n.href !== undefined && !/^https?:\/\//.test(String(n.href))) {
    errors.push(`${label}: \`href\` must start with http:// or https://`);
  }
  if (n.type === "image" && (typeof n.src !== "string" || !n.src.trim())) {
    errors.push(`${label}: image requires a string \`src\` (file path or data: URI)`);
  }
});

const edges = manifest.edges === undefined ? [] : manifest.edges;
if (!Array.isArray(edges)) {
  errors.push("`edges` must be an array");
} else {
  edges.forEach((e, i) => {
    const where = `edges[${i}]`;
    if (e === null || typeof e !== "object") { errors.push(`${where} must be an object`); return; }
    for (const end of ["from", "to"]) {
      if (typeof e[end] !== "string" || !ids.has(e[end])) {
        errors.push(`${where}: \`${end}\` "${e[end]}" does not match any node id`);
      }
    }
    if (e.style !== undefined && !["solid", "dashed"].includes(e.style)) {
      errors.push(`${where}: \`style\` must be "solid" or "dashed"`);
    }
  });
}

if (errors.length) fail("Manifest validation failed:\n  - " + errors.join("\n  - "));

// --- Inline image nodes ----------------------------------------------------
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };
for (const n of manifest.nodes) {
  if (n.type !== "image" || n.src.startsWith("data:")) continue;
  const ext = n.src.split(".").pop().toLowerCase();
  const mime = MIME[ext];
  if (!mime) fail(`image node "${n.id}": unsupported extension ".${ext}" (use ${Object.keys(MIME).join("/")} or a data: URI)`);
  const imgPath = resolve(dirname(inputPath), n.src);
  try {
    n.src = `data:${mime};base64,` + readFileSync(imgPath).toString("base64");
  } catch (e) {
    fail(`image node "${n.id}": cannot read ${imgPath}: ${e.message}`);
  }
}

// --- Escape + splice --------------------------------------------------------
const inputBase = basename(input).replace(/\.[^.]*$/, "");
if (!title) title = manifest.title || inputBase.replace(/[_-]+/g, " ").trim() || "Review";

const template = readFileSync(join(skillDir, "assets", "template.html"), "utf8");
const lib = readFileSync(join(skillDir, "assets", "mermaid.min.js"), "utf8");

// JSON with `<` escaped (neutralizes </script>) and U+2028/U+2029 escaped
// (valid in JSON, illegal in a JS source literal)
const jsonEscape = (v) =>
  JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

// split/join, not String.replace: the 2.6MB lib contains `$`-patterns that
// a string replacement argument would mangle.
let html = template
  .split("/*@@MERMAID_LIB@@*/").join(lib)
  .split('"@@REVIEW_JSON@@"').join(jsonEscape(manifest))
  .split('"@@TITLE_JSON@@"').join(jsonEscape(title));

// --- Emit --------------------------------------------------------------
const slug = inputBase.replace(/[^a-z0-9_-]/gi, "_").replace(/^_+|_+$/g, "") || "review";
const dest = resolve(outDir || join(process.cwd(), ".review"));
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
