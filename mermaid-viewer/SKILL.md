---
name: mermaid-viewer
description: Render Mermaid diagrams into a self-contained interactive HTML viewer with pan/zoom, light/dark theme, PNG/SVG export, and source view. Use when the user asks to "diagram this", "visualize", "show the architecture", asks for a flowchart, swimlane, sequence diagram, state machine, ERD, mindmap, sankey, gantt, timeline, class diagram, or any other diagram, or provides Mermaid source to render.
---

# Mermaid Viewer

Renders a Mermaid diagram into a single self-contained HTML file (mermaid.js inlined, no network needed) and opens it in the browser. The output also works as a Claude artifact.

## Choosing a diagram type

Vendored mermaid is **11.16.0** — all of these are available and verified:

| Ask looks like | Use | Notes |
|---|---|---|
| Process, logic, dependencies, architecture/system overviews | `flowchart LR` | Use `subgraph`s for components/layers. Color palette below applies |
| Process across roles/teams/systems | `swimlane-beta LR` | Top-level `subgraph`s become lanes; otherwise flowchart syntax. Palette applies. Do NOT fake swimlanes with flowchart subgraphs |
| Interactions over time, protocols, APIs | `sequenceDiagram` | `actor`, `autonumber`, `activate`, `alt`/`loop` blocks all work |
| Lifecycle, statuses, transitions | `stateDiagram-v2` | Composite states work; takes theme colors, ignores palette |
| Data model, schema | `erDiagram` | Typed attributes + PK/FK annotations work |
| Brainstorm, topic breakdown | `mindmap` | Auto-colors branches itself; ignores palette |
| Flows/quantities between nodes | `sankey-beta` | CSV-like `source,target,value` lines; no palette |
| Class structures | `classDiagram` | |
| Schedules | `gantt` | |
| Also available | `pie`, `timeline`, `quadrantChart`, `gitGraph`, `journey`, `xychart-beta`, `block-beta`, `kanban`, `packet-beta`, `radar-beta`, `treemap-beta`, C4, `requirementDiagram` | `zenuml` is NOT bundled — do not use it |

## 1. Compose the Mermaid source

Write valid Mermaid. CRITICAL RULES:

1. The source MUST start with a diagram type from the table above.
2. Prefer left-to-right orientation (`flowchart LR`, `swimlane-beta LR`) — diagrams are viewed on landscape monitors. Use TD only when the flow is genuinely deep-and-narrow.
3. Node IDs must be alphanumeric without spaces (use `A1`, `nodeA`, `start_node`).
4. For node labels with special characters, wrap in quotes: `A["Label with spaces"]` or `A["Process (step 1)"]`.
5. For quotes in labels use `&quot;`, for `<` use `&lt;`, for `>` use `&gt;`.
6. For square brackets in labels use `A["Array&#91;0&#93;"]`.
7. Always close all brackets and quotes. Avoid forward slashes in labels.
8. Use consistent arrow styles (either `-->` or `->`).

Example:
```
graph LR
  A["Complex Label"] --> B{Decision?}
  B -->|Yes| C["Result &quot;OK&quot;"]
```

For flowcharts and swimlanes, color key nodes using these classDefs, which work well in both light and dark mode (include the classDef lines you use, then apply with `class nodeId coral`). Other diagram types style themselves — skip the palette there:

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

## 2. Build the HTML

Write the source to `.diagrams/<descriptive_name>.mmd` in the current working directory (create the directory if needed) — the `.mmd` filename becomes the output filename, so name it after what the diagram shows. Then run the build script that ships with this skill (`scripts/build-diagram.mjs`, resolved relative to the directory containing this SKILL.md):

```
node <this-skill-directory>/scripts/build-diagram.mjs .diagrams/<descriptive_name>.mmd --title "Short Title"
```

The script prints the absolute path of the generated HTML file (`<descriptive_name>-<timestamp>.html`). `--title` sets the displayed title only and defaults to the filename with underscores as spaces; other options: `--out <dir>` to change the output directory, `--artifact` for artifact mode (see below).

**Never Read the generated .html files or the skill's assets/mermaid.min.js — each contains a 2.6 MB inlined library.** The `.mmd` file is the editable source of truth.

If the diagram fails to render (the opened page shows a "Diagram error" message), fix the `.mmd` source per the rules above and rerun the script.

## 3. Open it

Open the printed path in the default browser: `open <path>` on macOS, `xdg-open <path>` on Linux, `start "" <path>` on Windows. In environments without a browser (headless/remote), send or attach the file instead. The viewer has pan (drag), zoom (wheel, +/− buttons), fit (`f`), theme toggle (`d`, follows system by default), PNG/SVG download, and a source panel (`s`) with copy.

## 4. Artifact mode

The DEFAULT output is the local HTML file opened in the browser (step 3). Build with `--artifact` ONLY when (a) the user explicitly asks for an artifact or a shareable link, or (b) there is no local browser to open (headless or remote session) — in that case say why you chose an artifact. Do not ask the user which mode they want; use the default.

The emitted `<slug>.artifact.html` is body-content-only (no DOCTYPE/head/body — the artifact host supplies its skeleton) and makes zero network requests, satisfying the artifact CSP. Pass the file to the Artifact tool by path; never pull its contents into context.

## 5. Iterate

To revise a diagram, edit the `.mmd` file and rerun the build script. Never hand-edit generated HTML. Old timestamped HTML files in `.diagrams/` serve as history; it's fine to leave them.
