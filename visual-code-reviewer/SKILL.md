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

**The canvas is a map, not the review.** Your written reply carries the argument — findings, reasoning, verdict, everything that needs sentences. The canvas carries what sentences are bad at: what changed, how the pieces connect, what shape the change has. Keep the two separate and both get better. Merge them and you get an essay in boxes, which charges the reader canvas navigation *on top of* reading and returns the benefit of neither.

Apply this test before you build: **at fit zoom, the canvas must convey the shape of the change without reading any body text.** Titles, badges, colors, position and edges do that work; body text is evidence consulted *after* the map has oriented you. If a card is meaningless until you zoom in and read it, the map failed — cut words, not cards.

**The unit of the map is the semantic changeset, not the file.** Decompose the diff into the distinct things it does — "extracted retry logic into a helper" (behavioral), "renamed `userId` across 47 sites" (mechanical), "regenerated lockfile" (generated) — one `changeset` node each, spanning however many files it touches. This decomposition IS the review: you did it by reading the code; the canvas renders it. A hunk that fits no changeset is scope creep — say so in your reply.

| Node | Role | Budget |
|---|---|---|
| One `changeset` per semantic unit (2–8) | `kind`: `behavioral` / `mechanical` / `generated` / `test` / `docs` / `config`. `risk`: `high` / `medium` / `low` — behavioral changes to shared state, concurrency, auth, or migrations are high; mechanical sweeps are low even when huge. `note`: **one claim** — the thing a reviewer must believe to trust this changeset. `slices`: the hunks that prove it (`{file, line, content}` with `@@` lines, under ~40 lines each) | `note` ≤ **25 words** |
| `warning` — only findings that change the merge decision | The claim and the fix, with `file` / `line`. The *argument* for it goes in your reply, not on the card | `content` ≤ **40 words** |
| `mermaid` — the flow, and before/after pairs | One flowchart when a runtime flow changed. When the change alters something with formal shape, render **both** states: two `erDiagram`s for a migration, two state machines for a lifecycle change. Edge-link the pair "was" → "becomes" | diagram only |
| Appendix: one `files` tray, or `diff` chips (`minimized: true`) | Every changed file's complete diff, one click away (`git diff -U999999 <base>...HEAD -- <file>`; `-U20` for files over ~1000 lines) | — |
| Optional: a title `slide` and a verdict `slide` | Only for large or presentation-worthy reviews | ≤ **40 words** each |

**Whole canvas: ≤ 300 visible words, 10–14 nodes.** Prose is what makes these canvases unreadable and it is never what makes them useful.

**Do not use `shape` nodes in review mode.** A chain of flowchart chips mixed among prose cards reads as neither one thing nor the other, and shapes are excluded from the explorer rail, so they cannot participate in the reading order at all. Use a single `mermaid` flowchart instead. (Shapes remain available in explain mode.)

**Composition**
- **Manifest order is the narrative** — the rail presents it top to bottom: changesets (highest risk first), each warning immediately after the changeset it concerns, appendix last.
- Label nearly every edge with an **active verb naming the real relationship**: "implements", "proves", "tested by", "was/becomes", "finding". An unlabeled edge is the exception.
- Set the manifest `title` to a one-line description of the change (not "PR #482"), and `url` to the PR link when there is one — the title pill becomes a link.
- Set `risk` honestly: it drives the coverage meter and the `j`/`k` walk order, so it is how you allocate the reviewer's attention.

**Omission** — a map earns its clarity by leaving things out.
- Skip findings the author already acknowledged in a code comment, a `TODO`, or the PR description.
- No praise, no filler. A changeset that is simply fine needs a title and a `kind` badge, not a paragraph.
- Never restate in a `note` what its own slice already shows. The slice *is* the evidence.
- Mechanical and generated changesets: one representative slice, or none.
- Fold P2 findings into a single card, or leave them to your reply entirely.
- If a `markdown` card would only resummarize what your reply already says, drop it. At most one, ≤ 80 words.

**Layout** — the auto-layout is driven purely by edge topology, so these are correctness rules, not style preferences:
- **One connected component.** Disconnected subgraphs are stacked vertically, producing a tall, mostly-empty canvas.
- **Every node needs at least one edge.** Orphans are exiled to a grid below everything else, far from whatever they annotate.
- **Keep a node's incoming edges within 1–2 ranks of each other.** There are no virtual nodes for long edges, so an edge spanning 3+ ranks gets zero crossing optimization and is drawn straight through whatever sits between.
- **Avoid back edges** (pointing to a node earlier in the manifest). They are still drawn but ignored for ranking, so they fly backward across the whole canvas.
- **≤ 4–5 nodes per rank.** A rank is as wide as its widest card, so mixing a 720px `diff` with 380px `warning`s wastes ~340px on every short card in that rank.
- `mermaid` cards have **no width or height cap** — keep the diagram small or it will dominate the canvas.

## 2b. Explain mode — a tour of existing code

When the user wants existing code explained (no diff), set top-level `"mode": "explain"`. Gather with Read/Glob — the manifest carries *current source*, not diffs. The semantics shift from triage to comprehension:

- **Composition**: a title `slide` first (name of the thing, one-line thesis, a colored accent) → an orientation `markdown` card or agenda slide (what this code is, how to read the tour) → an architecture `mermaid` (flowchart/class/ER) → a `shape` chain for the main runtime flow if one matters → `code` cards for the definitions worth reading (set `line` to the real starting line number — renders with a line-number gutter and syntax highlighting; add a `note` saying why this matters) → `callout` nodes for the things a newcomer would trip on → a takeaways `slide` near the end (the 3–5 things to remember) → optionally one `files` tray of the key files (full source as `content`, `lines` count instead of ±stats).
- **Slides frame, cards prove**: use 2–4 slides per tour (title, optional section dividers, takeaways) — big claims and framing on slides, evidence in code/mermaid/callout cards. `←`/`→` steps through the tour like a deck.
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
    { "id": "w_race", "type": "warning", "severity": "P0", "title": "Race on bucket refill",
      "file": "src/limiter.ts", "line": 24,
      "content": "Two concurrent requests can both pass the check. Use a **Lua script** so the decrement is atomic." },
    { "id": "cs_tests", "type": "changeset", "title": "Limiter unit tests", "kind": "test", "risk": "low",
      "note": "Covers acquire/refill; **no concurrency test** — consistent with the race above going uncaught." },
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
    { "from": "cs_limiter", "to": "d_limiter", "label": "full diff", "style": "dashed" },
    { "from": "cs_tests", "to": "d_tests", "label": "full diff", "style": "dashed" }
  ]
}
```

Schema:

- Top-level: `title` (string), optional `url` (PR or repo link), optional `mode` (`"review"` default, or `"explain"`), `nodes` (non-empty array), `edges` (array, optional).
- Every node: unique `id` of `[a-zA-Z0-9_-]+`, a `type`, optional `title`, optional `width` (px, overrides the type default — diffs 720, changesets 620, excerpts/code 560, files tray 520, markdown 440, warning 380, image 480). Note a `warning` defaults *narrower* than a `changeset`, so a P0 renders physically smaller than a mechanical changeset; set `width: 620` on high-severity warnings when you want the visual weight to match the severity.
- `mermaid` — `content` is mermaid source (rules below).
- `changeset` — a semantic unit of change. Optional `kind` (`behavioral`/`mechanical`/`generated`/`test`/`docs`/`config`, shown as a badge), optional `risk` (`high`/`medium`/`low`, sets the accent color and drives the attention meter and `j`/`k` walk order), `note` (markdown), `slices` (array of `{ file?, line?, content }` diff slices rendered with per-slice file headers). Needs `note`, `slices`, or both.
- Any node may carry `risk` — it marks the node as a review target for the coverage meter — and `group` (string), a named explorer section.
- `callout` — an annotation that isn't a defect. Required `tone` (`"gotcha"`/`"tip"`/`"info"` — amber/green/blue accent + badge) and markdown `content`; optional `title`, `file`, `line`.
- `slide` — a presentation-style card: chromeless 16:9-ish surface with large type and a palette accent bar, theme-aware. `content` is markdown; optional `title` (rendered as the slide heading) and `color` (palette name for the accent). Multi-slide decks show an "n / N" chip. Slides count as review/tour steps for the walk and the meter.
- `code` — `content` rendered in monospace with syntax highlighting; optional `file`, `note` (markdown above the code), and `line` (number — renders a line-number gutter starting there).
- `files` entries may carry `lines` (number) instead of `additions`/`deletions`; in explain mode tray contents render as numbered source, not diffs.
- `excerpt` — a focused slice of diff. `content` is the hunk(s) with their `@@` lines (rendered with line numbers and +/− coloring; without `@@` lines it degrades to plain monospace). Optional `note` (markdown, rendered above the code), `file`, `line`, `title`, `status`.
- `files` — the changed-files tray. Required `files`: non-empty array of `{ file, content, status?, additions?, deletions? }` where `content` is that file's complete unified diff (keep `---`/`+++`/`@@` lines). Rows render as accordion chips; clicking expands the diff inline. Optional `title` (defaults to "Changed files (N)").
- `diff` — a changed file. Usually `minimized: true` (a chip that expands on click, relayouting the canvas). `content` is that file's complete unified diff (keep the `---`/`+++`/`@@` lines; don't trim hunks). Generate it with maximal context so the whole file is present and the viewer folds the unchanged parts GitHub-style: `git diff -U999999 <base>...HEAD -- <file>` (use `-U20` for files over ~1000 lines; plain `gh pr diff` 3-line context is an acceptable fallback when there is no local checkout — absent regions simply don't render). Rendered with line numbers and +/− coloring; runs of more than ~8 unchanged lines fold behind a click-to-reveal "⋯ N unchanged lines" row; malformed content degrades to plain text. Other fields: `file` (full repo path — required when minimized), optional `title`, `status` (`added`/`modified`/`deleted`/`renamed`, shown as a colored badge), `additions`, `deletions`, and `minimized: true` (start as a compact chip; viewers click to expand into the diff, chevron folds it back).
- `markdown` — `content` supports `#`–`###` headings, `**bold**`, `*italic*`, `` `code` ``, fenced code blocks, `-`/`1.` lists, and `[text](https://...)` links.
- `code` — `content` rendered verbatim in monospace; optional `file`.
- `warning` — required `severity` `"P0"|"P1"|"P2"` (P0 red = must fix, P1 orange = should fix, P2 yellow = nice to fix); `content` is markdown; optional `file` and `line`.
- `shape` — **explain mode only** (see the review-mode rule above). Required `shape` (`start`, `end`, `process`, `decision`, `io`) and `label`; optional `color` from the palette names below.
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

It also prints a **budget report** to stderr — visible word count, node count, over-cap prose fields, and layout-topology problems (back edges, long-span edges, orphans, disconnected components). These are warnings, not errors: the canvas still builds. **Treat them as a rebuild trigger, not as noise** — a canvas that overran its word budget is the exact failure this skill is prone to, so tighten the manifest and rerun before handing it over.

**Never Read the generated .html files or the skill's assets/mermaid.min.js — each contains a 2.6 MB inlined library.** The `.json` manifest is the editable source of truth.

If the opened page shows a "Diagram error" strip inside a mermaid card, fix that node's `content` per the rules above and rerun the script.

## 5. Open it

Open the printed path in the default browser: `open <path>` on macOS, `xdg-open <path>` on Linux, `start "" <path>` on Windows. In environments without a browser (headless/remote), send or attach the file instead.

The viewer: an **explorer** on the left with Review and Files tabs (the review in reading order with risk badges, read checkmarks (click one to un-mark), and an attention meter, plus a changed-files list — click any entry to fly to its node; pin/close buttons top-left, hover the left edge to peek when unpinned, `n` toggles), `j`/`k` or `←`/`→` to walk review targets by descending risk — forward/backward like a deck (marks them read; progress persists in localStorage per manifest), pan (drag empty canvas), zoom (wheel, +/− buttons), fit (`f`), layout direction toggle (`r` or the layout button — layered → (default) / layered ↓), theme toggle (`d`, follows system by default), and a minimap (top-right) — click or drag it to jump around a large canvas, `m` hides it. A GitHub PR `url` also renders an `owner/repo #N` subtitle under the title (plain repo urls show `owner/repo`). Cards drag from anywhere on the card; edges follow; text selection is disabled on the canvas — markdown, warning, and callout cards have a hover copy button (upper-right of the card) that copies their raw content. Clicking a card's header bar collapses/expands it. Every card collapses to its header bar via the chevron (and back); tall diff/code bodies scroll internally; folded unchanged diff lines reveal on click; the mouse wheel scrolls a scrollable card under the cursor and zooms the canvas everywhere else.

## 6. Artifact mode

The DEFAULT output is the local HTML file opened in the browser (step 5). Build with `--artifact` ONLY when (a) the user explicitly asks for an artifact or a shareable link, or (b) there is no local browser to open (headless or remote session) — in that case say why you chose an artifact. Do not ask the user which mode they want; use the default.

The emitted `<name>.artifact.html` is body-content-only (no DOCTYPE/head/body — the artifact host supplies its skeleton) and makes zero network requests, satisfying the artifact CSP. Pass the file to the Artifact tool by path; never pull its contents into context.

## 7. Iterate

To revise, edit the `.json` manifest and rerun the build script. Never hand-edit generated HTML. Old timestamped HTML files in `.review/` serve as history; it's fine to leave them.

## Format rules (review mode)

Restated because this is the failure mode: a canvas can satisfy every node-count rule above and still be unreadable, because the prose inside the nodes has no natural limit.

- `changeset.note` ≤ **25 words** — one claim, never a restatement of its own slice.
- `warning.content` ≤ **40 words** — the claim and the fix; the argument belongs in your reply.
- `markdown` ≤ **80 words**, at most one card, usually zero.
- `slide` ≤ **40 words**.
- **Whole canvas ≤ 300 visible words, 10–14 nodes.**
- No `shape` nodes. One `mermaid` flowchart carries a runtime flow.
- One connected component; every node edged; no back edges; no edge spanning 3+ ranks.
- The build script prints a budget report. **If it warns, fix the manifest and rebuild** — do not hand the user a canvas that overran its budget.

The test that governs all of them: at fit zoom, the canvas conveys the shape of the change without reading any body text. If it doesn't, cut words — not cards.
