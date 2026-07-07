---
name: visual-code-reviewer
description: Turn a PR, branch, or diff into an interactive visual review canvas — draggable cards for per-file diffs, mermaid diagrams, explainer notes, code snippets, screenshots, and P0/P1/P2 warnings, connected by labeled edges on a pan/zoom canvas. Use when the user asks to "review this PR visually", wants a "visual review" or "review canvas", says "walk me through this diff/PR", or asks to explain a change/branch/PR visually.
---

# Visual Code Reviewer

Analyzes a change and renders the review as a single self-contained HTML canvas (mermaid.js inlined, no network needed): heterogeneous node cards connected by labeled edges, auto-laid-out left-to-right, draggable, with pan/zoom and light/dark themes. The output also works as a Claude artifact.

## 1. Gather the change

- PR: `gh pr diff <n>` for the diff, `gh pr view <n> --json title,url,files` for the title, URL, and per-file additions/deletions.
- Branch: `git diff <base>...HEAD` plus `git diff --stat <base>...HEAD` for per-file stats.
- Uncommitted work: `git diff HEAD` (and `git status` for added/deleted files).

Read enough surrounding source to actually review the change — risky spots, data-model changes, altered flows — not just reformat the diff.

## 2. Choose the artifacts (nodes)

Aim for 5–15 nodes. Pick by what the change is:

| Situation | Node(s) to create |
|---|---|
| Always | A `diff` node for **every** changed file, each carrying that file's **complete diff** (don't hand-trim hunks — the viewer folds long unchanged runs GitHub-style and clamps tall cards with internal scroll). The 2–5 most important files render open; every other file gets `"minimized": true` — a compact chip (status badge, path, ±stats) that expands into its full diff on click. Edge-link ALL of them — chips too — to whatever they support: tests → the code they test, wiring/registry files → what they register, docs → what they document, UI plumbing → the feature component. A floating unconnected file tells the reader nothing. Add `warning` nodes for anything risky |
| Schema / migration change | `mermaid` node with `erDiagram` |
| API or cross-service flow change | `mermaid` node with `sequenceDiagram` |
| Change alters a runtime flow | `shape` chain tracing entry → steps → decision → completion at the canvas top level, with diffs/warnings edge-linked to the step they affect. Prefer this over an embedded mermaid flowchart when steps need rich artifacts attached |
| Complex or subtle logic | `markdown` explainer |
| New public surface (API, exported types) | `code` node with the signature(s) |
| UI change with a screenshot on disk | `image` node |

Rules of composition:
- Every `warning` is edge-linked to the diff (or file) it concerns.
- Label nearly every edge with an **active verb naming the real relationship**: "changes", "adds", "updates", "inserts orders", "calls", "reads from", "validates against", "emits", "finding", "explained by". An unlabeled edge is the exception.
- Set the manifest `title` to a one-line description of the change (not "PR #482"), and `url` to the PR link when there is one — the title pill becomes a link.

## 3. Write the manifest

Write JSON to `.review/<descriptive_name>.json` in the current working directory (create the directory if needed). The filename becomes the output filename. **Multi-line `content` must be a JSON string with `\n` escapes** — this is the most common authoring mistake.

```json
{
  "title": "Add token-bucket rate limiting to the orders API",
  "url": "https://github.com/acme/api/pull/482",
  "nodes": [
    { "id": "d_limiter", "type": "diff", "title": "Token bucket core", "file": "src/limiter.ts",
      "status": "added", "additions": 120, "deletions": 0,
      "content": "--- a/src/limiter.ts\n+++ b/src/limiter.ts\n@@ -10,6 +10,9 @@\n context line\n+added line\n-removed line" },
    { "id": "d_tests", "type": "diff", "file": "src/limiter.test.ts", "minimized": true,
      "status": "added", "additions": 55, "deletions": 0,
      "content": "--- a/src/limiter.test.ts\n+++ b/src/limiter.test.ts\n@@ -0,0 +1,2 @@\n+it(\"acquires\", () => {\n+})" },
    { "id": "w_race", "type": "warning", "severity": "P0", "title": "Race on bucket refill",
      "file": "src/limiter.ts", "line": 24,
      "content": "Two concurrent requests can both pass the check. Use a **Lua script** so the decrement is atomic." },
    { "id": "notes", "type": "markdown", "title": "How it works",
      "content": "## Summary\nUses a **token bucket** per client.\n- 100 tokens\n- refills 10/sec" },
    { "id": "api", "type": "code", "title": "New public API", "file": "src/limiter.ts",
      "content": "export class Limiter {\n  acquire(clientId: string): Promise<boolean>;\n}" },
    { "id": "erd", "type": "mermaid", "title": "Schema", "content": "erDiagram\n  ORDERS ||--o{ RATE_EVENTS : logs" },
    { "id": "entry", "type": "shape", "shape": "start", "label": "POST /orders", "color": "ocean" },
    { "id": "check", "type": "shape", "shape": "decision", "label": "tokens ≥ 1?" },
    { "id": "ui", "type": "image", "title": "New banner", "src": "banner.png" }
  ],
  "edges": [
    { "from": "d_limiter", "to": "d_tests", "label": "tested by", "style": "dashed" },
    { "from": "d_limiter", "to": "w_race", "label": "finding", "style": "dashed" },
    { "from": "entry", "to": "check", "label": "each request" }
  ]
}
```

Schema:

- Top-level: `title` (string), optional `url` (the PR link), `nodes` (non-empty array), `edges` (array, optional).
- Every node: unique `id` of `[a-zA-Z0-9_-]+`, a `type`, optional `title`, optional `width` (px, overrides the type default — diffs 720, code 560, markdown 440, warning 380, image 480).
- `mermaid` — `content` is mermaid source (rules below).
- `diff` — one node per changed file. `content` is that file's complete unified diff (keep the `---`/`+++`/`@@` lines; don't trim hunks). Generate it with maximal context so the whole file is present and the viewer folds the unchanged parts GitHub-style: `git diff -U999999 <base>...HEAD -- <file>` (use `-U20` for files over ~1000 lines; plain `gh pr diff` 3-line context is an acceptable fallback when there is no local checkout — absent regions simply don't render). Rendered with line numbers and +/− coloring; runs of more than ~8 unchanged lines fold behind a click-to-reveal "⋯ N unchanged lines" row; malformed content degrades to plain text. Other fields: `file` (full repo path — required when minimized), optional `title`, `status` (`added`/`modified`/`deleted`/`renamed`, shown as a colored badge), `additions`, `deletions`, and `minimized: true` (start as a compact chip; viewers click to expand into the diff, chevron folds it back).
- `markdown` — `content` supports `#`–`###` headings, `**bold**`, `*italic*`, `` `code` ``, fenced code blocks, `-`/`1.` lists, and `[text](https://...)` links.
- `code` — `content` rendered verbatim in monospace; optional `file`.
- `warning` — required `severity` `"P0"|"P1"|"P2"` (P0 red = must fix, P1 orange = should fix, P2 yellow = nice to fix); `content` is markdown; optional `file` and `line`.
- `shape` — required `shape` (`start`, `end`, `process`, `decision`, `io`) and `label`; optional `color` from the palette names below.
- `image` — required `src`: a local file path (resolved relative to the manifest and inlined as a data URI at build time) or an existing `data:` URI; optional `alt`.
- Any node: optional `href` (http/https) — makes the header file reference a link.
- Edges: `from`/`to` node ids, optional `label`, optional `style` (`"solid"` default or `"dashed"` — use dashed for findings and secondary relationships).

File references link out automatically: when the top-level `url` is a GitHub PR link, `diff`/`code`/`warning` header refs and chip paths whose `file` is a full repo-relative path (contains a `/`) open that file in the PR's Files tab in a new tab. Prefer full repo paths in `file` fields so this works; set `href` explicitly for non-GitHub hosts.

### Mermaid content rules

Vendored mermaid is 11.16.0. Inside `mermaid` node `content`:

1. Start with a diagram type (`erDiagram`, `sequenceDiagram`, `flowchart LR`, `stateDiagram-v2`, `classDiagram`, ...). `zenuml` is NOT bundled.
2. Node IDs alphanumeric without spaces; labels with special characters wrapped in quotes: `A["Label (step 1)"]`.
3. In labels use `&quot;` for quotes, `&lt;`/`&gt;` for angle brackets, `&#91;`/`&#93;` for square brackets. Close all brackets and quotes; avoid forward slashes in labels.
4. For flowcharts, color key nodes with these classDefs (include the lines you use, apply with `class nodeId coral`). Other diagram types style themselves. The same 16 names are valid as `shape` node `color` values:

```
classDef coral fill:#ff6b6b,stroke:#c92a2a,color:#fff
classDef ocean fill:#4c6ef5,stroke:#364fc7,color:#fff
classDef forest fill:#51cf66,stroke:#2f9e44,color:#fff
classDef sunshine fill:#ffd43b,stroke:#fab005,color:#000
classDef grape fill:#845ef7,stroke:#5f3dc4,color:#fff
classDef amber fill:#ff922b,stroke:#e8590c,color:#fff
classDef teal fill:#20c997,stroke:#12b886,color:#fff
classDef pink fill:#ff8cc8,stroke:#e64980,color:#fff
classDef tangerine fill:#fd7e14,stroke:#e8590c,color:#fff
classDef sky fill:#74c0fc,stroke:#339af0,color:#000
classDef lavender fill:#d0bfff,stroke:#9775fa,color:#000
classDef mint fill:#8ce99a,stroke:#51cf66,color:#000
classDef rose fill:#ffa8a8,stroke:#ff6b6b,color:#000
classDef lemon fill:#ffe066,stroke:#ffd43b,color:#000
classDef violet fill:#a78bfa,stroke:#8b5cf6,color:#fff
classDef peach fill:#ffc9c9,stroke:#ffa8a8,color:#000
```

## 4. Build the HTML

Run the build script that ships with this skill (`scripts/build-review.mjs`, resolved relative to the directory containing this SKILL.md):

```
node <this-skill-directory>/scripts/build-review.mjs .review/<descriptive_name>.json
```

The script validates the manifest (clear error messages on bad ids, types, severities, or dangling edges — fix the JSON and rerun), inlines any image files, and prints the absolute path of the generated HTML (`<name>-<timestamp>.html`). Options: `--title` overrides the displayed title (defaults to `manifest.title`), `--out <dir>`, `--artifact` (see below).

**Never Read the generated .html files or the skill's assets/mermaid.min.js — each contains a 2.6 MB inlined library.** The `.json` manifest is the editable source of truth.

If the opened page shows a "Diagram error" strip inside a mermaid card, fix that node's `content` per the rules above and rerun the script.

## 5. Open it

Open the printed path in the default browser: `open <path>` on macOS, `xdg-open <path>` on Linux, `start "" <path>` on Windows. In environments without a browser (headless/remote), send or attach the file instead.

The viewer: pan (drag empty canvas), zoom (wheel, +/− buttons), fit (`f`), reset layout (`r`), theme toggle (`d`, follows system by default), manifest panel (`s`) with copy, a minimap (top-right) — click or drag it to jump around a large canvas, `m` hides it — and an eye button (`h`) that hides all minimized file chips for a focused view. A GitHub PR `url` also renders an `owner/repo #N` subtitle under the title. Cards drag from anywhere on the card; edges follow; text selection is disabled on the canvas (copy from the manifest panel instead). Every card collapses to its header bar via the chevron (and back); tall diff/code bodies scroll internally; folded unchanged diff lines reveal on click; the mouse wheel scrolls a scrollable card under the cursor and zooms the canvas everywhere else.

## 6. Artifact mode

The DEFAULT output is the local HTML file opened in the browser (step 5). Build with `--artifact` ONLY when (a) the user explicitly asks for an artifact or a shareable link, or (b) there is no local browser to open (headless or remote session) — in that case say why you chose an artifact. Do not ask the user which mode they want; use the default.

The emitted `<name>.artifact.html` is body-content-only (no DOCTYPE/head/body — the artifact host supplies its skeleton) and makes zero network requests, satisfying the artifact CSP. Pass the file to the Artifact tool by path; never pull its contents into context.

## 7. Iterate

To revise, edit the `.json` manifest and rerun the build script. Never hand-edit generated HTML. Old timestamped HTML files in `.review/` serve as history; it's fine to leave them.
