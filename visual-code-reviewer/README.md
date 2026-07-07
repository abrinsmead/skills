# visual-code-reviewer

An [agent skill](https://agentskills.io) that turns a PR, branch, or diff into an interactive review canvas: draggable cards — per-file diffs, mermaid diagrams, explainer notes, code snippets, screenshots, and P0/P1/P2 warnings — connected by labeled edges on a pan/zoom surface. Each generated file is fully self-contained — nothing to run or host, no network requests, works offline.

Forked from [mermaid-viewer](../mermaid-viewer/): same viewer shell and build pipeline, but the single diagram is replaced by a graph of heterogeneous nodes the agent composes from its analysis of the change.

![Review canvas rendered by visual-code-reviewer](../docs/screenshot-visual-code-reviewer.png)

## Install

Installs via [skills.sh](https://skills.sh), the open agent skills CLI:

```
npx skills add abrinsmead/skills/visual-code-reviewer
```

Update:

```
npx skills update visual-code-reviewer
```

`add` takes the full `owner/repo/skill` source path; `update` takes the installed skill's name.

Works with Claude Code and other agents that support the SKILL.md convention. Requires Node.js ≥ 18.

## Usage

Ask your agent for a visual review:

- "Review this PR visually: https://github.com/acme/api/pull/482"
- "Walk me through this diff on a review canvas"
- "Explain the changes on this branch visually"

The agent gathers the diff (`gh pr diff` / `git diff`), analyzes it, and composes a review: a diff card per changed file (status badge, ±stats, complete diff — key files open, the rest as click-to-expand chips), warnings ranked P0/P1/P2 linked to the code they concern, an ERD when the schema changed, a sequence diagram when a flow changed, flowchart shapes tracing entry points and decisions, and explainer notes. It writes the graph to `.review/<name>.json`, builds `.review/<name>-<timestamp>.html`, and opens it in your browser. The `.json` manifest is the editable source; each HTML file is standalone and can be shared, archived, or attached anywhere. The canvas title links to the PR.

## The viewer

- **Pan & zoom** — drag empty canvas to pan, wheel to zoom toward the cursor, fit-to-screen, background dot grid scaled to zoom level
- **Auto-layout + drag** — Sugiyama-style layered layout (cycle-tolerant, alternating barycenter sweeps for crossing reduction, neighbor-pull vertical alignment, connected components packed separately); drag any card from anywhere on it to rearrange and edges follow; `r` resets the layout. Text selection is disabled on the canvas — copy from the manifest panel
- **Minimap** — top-right overview showing node placement and the current viewport; click or drag it to jump around a large canvas
- **Node cards** — diffs carry the file's complete change with line numbers and +/− coloring; long unchanged runs fold GitHub-style behind a click-to-reveal row; every card collapses to its header via the chevron; tall bodies scroll internally; the wheel scrolls a scrollable card under the cursor and zooms the canvas everywhere else
- **Warnings** — severity-colored cards (P0 red, P1 orange, P2 yellow) with file:line references
- **Every file, linked** — every changed file is a diff card; secondary ones start as minimized chips that expand into their diff on click and stay edge-linked to what they support; the eye button (`h`) hides all minimized nodes for a focused view; file paths link to the file in the GitHub PR's Files tab (new tab), and the title pill shows an `owner/repo #N` subtitle
- **Themes** — follows the OS light/dark preference; manual toggle re-renders mermaid nodes in place
- **Manifest** — panel showing the review JSON, with copy
- Keyboard: `f` fit · `r` reset layout · `h` hide minimized · `m` minimap · `d` theme · `s` manifest · `+`/`−`/`0` zoom

No PNG/SVG export in v1 — heterogeneous HTML cards don't rasterize reliably; use the OS screenshot tool.

## Claude artifacts

In Claude Code, ask for the review "as an artifact": the skill builds with the `--artifact` flag and Claude publishes the result as a hosted artifact with a shareable URL. The artifact variant is body-only HTML with no external requests, as required by the artifact sandbox's CSP. Screenshots referenced by image nodes are inlined as data URIs at build time, so they work there too.

## How it works

```
your-agent ──analyzes diff, writes──> .review/name.json
                                        │
scripts/build-review.mjs                │  validates the manifest, inlines images,
                                        ▼  splices JSON + bundled mermaid.min.js
                                           into assets/template.html
                          .review/name-<timestamp>.html   (self-contained, ~3.6 MB)
```

No dependencies beyond Node.js. The `--artifact` flag emits a body-only variant for strict-CSP hosts.

## License

MIT © Alex Brinsmead

Bundles [Mermaid](https://github.com/mermaid-js/mermaid) (MIT) and icons from [Lucide](https://lucide.dev) (ISC).
