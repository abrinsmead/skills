---
name: visual-code-reviewer
description: Turn a PR, branch, or diff into an interactive visual review canvas — or existing code into a guided visual tour. Draggable cards for changesets, diffs, source excerpts, mermaid diagrams, explainer notes, callouts, screenshots, and P0/P1/P2 warnings, connected by labeled edges on a pan/zoom canvas with a review explorer. Use when the user asks to "review this PR visually", wants a "visual review" or "review canvas", says "walk me through this diff/PR", asks to explain a change/branch/PR visually — or asks to "explain this codebase/module visually", "give me a code tour", or "show me how this code works".
---

# Visual Code Reviewer

Analyzes a change and renders the review as a single self-contained HTML canvas (mermaid.js inlined, no network needed): heterogeneous node cards connected by labeled edges, auto-laid-out left-to-right, draggable, with pan/zoom and light/dark themes. The output also works as a Claude artifact.

## 1. Gather the change

- PR: `gh pr diff <n>` for the diff, `gh pr view <n> --json title,url,files` for the title, URL, and per-file additions/deletions.
- Branch: `git diff <base>...HEAD` plus `git diff --stat <base>...HEAD` for per-file stats.
- Uncommitted work: `git diff HEAD` (and `git status` for added/deleted files).

Read enough surrounding source to actually review the change — risky spots, data-model changes, altered flows — not just reformat the diff.

## 2. Choose the artifacts (nodes)

**The unit of review is the semantic changeset, not the file.** Decompose the diff into the distinct things it does — "extracted retry logic into a helper" (behavioral), "renamed `userId` across 47 sites" (mechanical), "regenerated lockfile" (generated) — one `changeset` node each, spanning however many files it touches. This decomposition IS the review: you did it by reading the code; the canvas renders it. A hunk that fits no changeset is scope creep — say so.

| Node | Role |
|---|---|
| One `markdown` summary card, first in the manifest | What the change claims to do, whether the changesets support that claim, your verdict |
| One `changeset` node per semantic unit (usually 2–8) | `kind`: `behavioral` / `mechanical` / `generated` / `test` / `docs` / `config`. `risk`: `high` / `medium` / `low` — behavioral changes to shared state, concurrency, auth, or migrations are high; mechanical sweeps are low even when huge. `note`: what this changeset does and why the reviewer should trust it. `slices`: the hunks that prove it (each `{file, line, content}` — copy the hunk(s) with `@@` lines, a few context lines, under ~40 lines per slice; mechanical/generated changesets often need one representative slice or none) |
| `warning` nodes (P0/P1/P2) | Every finding, edge-linked to the changeset it concerns |
| 3–8 `shape` nodes — only when the change alters a runtime flow | Entry points (`start`), steps (`process`), branches (`decision`), artifacts read/written (`io`), completion (`end`) — with changesets edge-linked to the steps they alter |
| `mermaid` — before/after pairs | When the change alters something with formal shape, render **both** states: two `erDiagram`s ("was" / "becomes") for a migration, two state machines for a lifecycle change, a `sequenceDiagram` for a new cross-service flow. Edge-link the pair with "was" → "becomes" |
| Appendix: `diff` chips (all `minimized: true`) or one `files` tray | Every changed file's **complete diff**, one click away (`git diff -U999999 <base>...HEAD -- <file>`, `-U20` for files over ~1000 lines). Chips when files dock naturally onto shapes/changesets; the tray when they don't |

Rules of composition:
- **Manifest order is the narrative** — the rail presents it top to bottom: summary, changesets (highest risk first), warnings near their changeset, appendix last.
- Every `warning` edge-links to the changeset (or slice's chip) it concerns; every chip edge-links to the changeset or step it belongs to.
- Label nearly every edge with an **active verb naming the real relationship**: "implements", "proves", "tested by", "was/becomes", "finding". An unlabeled edge is the exception.
- Set the manifest `title` to a one-line description of the change (not "PR #482"), and `url` to the PR link when there is one — the title pill becomes a link.
- The viewer tracks reviewer attention: nodes with `risk` (and warnings) count toward the coverage meter, `j`/`k` walks them by descending risk. Set `risk` honestly — it allocates the reviewer's attention.

## 2b. Explain mode — a tour of existing code

When the user wants existing code explained (no diff), set top-level `"mode": "explain"`. Gather with Read/Glob — the manifest carries *current source*, not diffs. The semantics shift from triage to comprehension:

- **Composition**: an orientation `markdown` card first (what this code is, how to read the tour) → an architecture `mermaid` (flowchart/class/ER) → a `shape` chain for the main runtime flow if one matters → `code` cards for the definitions worth reading (set `line` to the real starting line number — renders with a line-number gutter and syntax highlighting; add a `note` saying why this matters) → `callout` nodes for the things a newcomer would trip on → optionally one `files` tray of the key files (full source as `content`, `lines` count instead of ±stats).
- **Manifest order is the tour.** The explorer tab reads "Tour", the meter counts nodes "visited", and `j`/`k` walks manifest order.
- **Group by subsystem**: give nodes a `group` string ("Parser", "Layout", "Persistence") — the explorer renders those as sections in first-appearance order. (Works in review mode too, where it overrides the risk tiers.)
- **Callouts, not warnings**: `tone: "gotcha"` (this will bite you), `"tip"` (do it this way), `"info"` (context). Edge-link each to the code card it annotates.
- Set `url` to the repo (`https://github.com/owner/repo`) — file refs then link to blob pages, with `#L<line>` anchors where a `line` is set.

## 3. Write the manifest

Write JSON to `.review/<descriptive_name>.json` in the current working directory (create the directory if needed). The filename becomes the output filename. **Multi-line `content` must be a JSON string with `\n` escapes** — this is the most common authoring mistake.

```json
{
  "title": "Add token-bucket rate limiting to the orders API",
  "url": "https://github.com/acme/api/pull/482",
  "nodes": [
    { "id": "summary", "type": "markdown", "title": "Review summary",
      "content": "## What this does\nAdds a **token bucket** per client: 100 tokens, refills 10/sec.\n\n## Verdict\nSolid, one P0 on the refill path." },
    { "id": "cs_limiter", "type": "changeset", "title": "Token-bucket check on the order path",
      "kind": "behavioral", "risk": "high",
      "note": "New rate-limit gate on every `POST /orders`. The check-then-decrement is **two Redis round-trips** — see the finding.",
      "slices": [
        { "file": "src/limiter.ts", "line": 24,
          "content": "@@ -20,6 +20,12 @@\n context line\n+  const tokens = await redis.get(key);\n+  if (tokens >= 1) await redis.decr(key);" }
      ] },
    { "id": "cs_tests", "type": "changeset", "title": "Limiter unit tests", "kind": "test", "risk": "low",
      "note": "Covers acquire/refill; **no concurrency test** — consistent with the race below going uncaught." },
    { "id": "w_race", "type": "warning", "severity": "P0", "title": "Race on bucket refill",
      "file": "src/limiter.ts", "line": 24,
      "content": "Two concurrent requests can both pass the check. Use a **Lua script** so the decrement is atomic." },
    { "id": "d_limiter", "type": "diff", "file": "src/limiter.ts", "minimized": true,
      "status": "added", "additions": 120, "deletions": 0,
      "content": "--- a/src/limiter.ts\n+++ b/src/limiter.ts\n@@ -0,0 +1,120 @@\n+..." },
    { "id": "d_tests", "type": "diff", "file": "src/limiter.test.ts", "minimized": true,
      "status": "added", "additions": 55, "deletions": 0,
      "content": "--- a/src/limiter.test.ts\n+++ b/src/limiter.test.ts\n@@ -0,0 +1,55 @@\n+it(\"acquires\", () => {\n+})" }
  ],
  "edges": [
    { "from": "summary", "to": "cs_limiter", "label": "core change" },
    { "from": "cs_limiter", "to": "w_race", "label": "finding", "style": "dashed" },
    { "from": "cs_limiter", "to": "cs_tests", "label": "tested by", "style": "dashed" },
    { "from": "d_limiter", "to": "cs_limiter", "label": "full diff", "style": "dashed" },
    { "from": "d_tests", "to": "cs_tests", "label": "full diff", "style": "dashed" }
  ]
}
```

Schema:

- Top-level: `title` (string), optional `url` (PR or repo link), optional `mode` (`"review"` default, or `"explain"`), `nodes` (non-empty array), `edges` (array, optional).
- Every node: unique `id` of `[a-zA-Z0-9_-]+`, a `type`, optional `title`, optional `width` (px, overrides the type default — diffs 720, excerpts/code 560, files tray 520, markdown 440, warning 380, image 480).
- `mermaid` — `content` is mermaid source (rules below).
- `changeset` — a semantic unit of change. Optional `kind` (`behavioral`/`mechanical`/`generated`/`test`/`docs`/`config`, shown as a badge), optional `risk` (`high`/`medium`/`low`, sets the accent color and drives the attention meter and `j`/`k` walk order), `note` (markdown), `slices` (array of `{ file?, line?, content }` diff slices rendered with per-slice file headers). Needs `note`, `slices`, or both.
- Any node may carry `risk` — it marks the node as a review target for the coverage meter — and `group` (string), a named explorer section.
- `callout` — an annotation that isn't a defect. Required `tone` (`"gotcha"`/`"tip"`/`"info"` — amber/green/blue accent + badge) and markdown `content`; optional `title`, `file`, `line`.
- `code` — `content` rendered in monospace with syntax highlighting; optional `file`, `note` (markdown above the code), and `line` (number — renders a line-number gutter starting there).
- `files` entries may carry `lines` (number) instead of `additions`/`deletions`; in explain mode tray contents render as numbered source, not diffs.
- `excerpt` — a focused slice of diff. `content` is the hunk(s) with their `@@` lines (rendered with line numbers and +/− coloring; without `@@` lines it degrades to plain monospace). Optional `note` (markdown, rendered above the code), `file`, `line`, `title`, `status`.
- `files` — the changed-files tray. Required `files`: non-empty array of `{ file, content, status?, additions?, deletions? }` where `content` is that file's complete unified diff (keep `---`/`+++`/`@@` lines). Rows render as accordion chips; clicking expands the diff inline. Optional `title` (defaults to "Changed files (N)").
- `diff` — a changed file. Usually `minimized: true` (a chip that expands on click, relayouting the canvas). `content` is that file's complete unified diff (keep the `---`/`+++`/`@@` lines; don't trim hunks). Generate it with maximal context so the whole file is present and the viewer folds the unchanged parts GitHub-style: `git diff -U999999 <base>...HEAD -- <file>` (use `-U20` for files over ~1000 lines; plain `gh pr diff` 3-line context is an acceptable fallback when there is no local checkout — absent regions simply don't render). Rendered with line numbers and +/− coloring; runs of more than ~8 unchanged lines fold behind a click-to-reveal "⋯ N unchanged lines" row; malformed content degrades to plain text. Other fields: `file` (full repo path — required when minimized), optional `title`, `status` (`added`/`modified`/`deleted`/`renamed`, shown as a colored badge), `additions`, `deletions`, and `minimized: true` (start as a compact chip; viewers click to expand into the diff, chevron folds it back).
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

The viewer: an **explorer** on the left with Review and Files tabs (the review in reading order with risk badges, read checkmarks (click one to un-mark), and an attention meter, plus a changed-files list — click any entry to fly to its node; pin/close buttons top-left, hover the left edge to peek when unpinned, `n` toggles), `j`/`k` to walk review targets by descending risk (marks them read; progress persists in localStorage per manifest), pan (drag empty canvas), zoom (wheel, +/− buttons), fit (`f`), layout direction toggle (`r` or the layout button — layered → (default) / layered ↓), theme toggle (`d`, follows system by default), and a minimap (top-right) — click or drag it to jump around a large canvas, `m` hides it. A GitHub PR `url` also renders an `owner/repo #N` subtitle under the title (plain repo urls show `owner/repo`). Cards drag from anywhere on the card; edges follow; text selection is disabled on the canvas — markdown, warning, and callout cards have a hover copy button (upper-right of the card) that copies their raw content. Clicking a card's header bar collapses/expands it. Every card collapses to its header bar via the chevron (and back); tall diff/code bodies scroll internally; folded unchanged diff lines reveal on click; the mouse wheel scrolls a scrollable card under the cursor and zooms the canvas everywhere else.

## 6. Artifact mode

The DEFAULT output is the local HTML file opened in the browser (step 5). Build with `--artifact` ONLY when (a) the user explicitly asks for an artifact or a shareable link, or (b) there is no local browser to open (headless or remote session) — in that case say why you chose an artifact. Do not ask the user which mode they want; use the default.

The emitted `<name>.artifact.html` is body-content-only (no DOCTYPE/head/body — the artifact host supplies its skeleton) and makes zero network requests, satisfying the artifact CSP. Pass the file to the Artifact tool by path; never pull its contents into context.

## 7. Iterate

To revise, edit the `.json` manifest and rerun the build script. Never hand-edit generated HTML. Old timestamped HTML files in `.review/` serve as history; it's fine to leave them.
