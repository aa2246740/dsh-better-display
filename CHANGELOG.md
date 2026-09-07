# Changelog

## 0.2.0

Adds native generative MCP Apps (SEP-1865) support and rich interactive rendering.

- **Generative MCP Apps**: auto-detect ````mcp-app` code blocks (or `mcp-app` custom blocks / `render_ui`/`show_widget` tool results) and mount them as live, interactive cards.
- **Sandboxed iframe**: `sandbox="allow-scripts allow-forms"` without `allow-same-origin`, `referrerPolicy="no-referrer"` — full isolation from host cookies/tokens/DOM.
- **SEP-1865 JSON-RPC bridge**: `ui/initialize`, `ui/resize`, `ui/submit` / `ui/update-model-context`, plus live `host-context-changed` theme broadcasts.
- **Bidirectional feedback**: user interactions produce a natural-language prompt written straight into the composer via React 18 native setter (instant, no stale-DOM whitespace).
- **Live dark/light sync**: MutationObserver + matchMedia drive instant re-theming with zero first-frame flash.
- **Pixel-perfect auto height**: content-bottom bounding-box measurement + ResizeObserver; 60px–2400px smooth grow/shrink, no double scrollbars or wasted whitespace.
- **Redesigned minimal container**: removed protocol/status chrome, 14px-radius subtle card, icon-only reset.
- **Skill pack**: `skills/generative-mcpapps/` with SKILL.md, protocol reference, HTML boilerplate template, and interactive quiz example.
- **Docs**: bilingual `README.md` / `README.en.md`; DESIGN.md contract updated.
- **Fix**: the host's synthetic `turn-process` folding-control nodes no longer render as an "unhandled record type" card with raw JSON. They carry no session content (turn id, counters, anchors only) and the reading view has its own process folding, so they are now skipped like `context`/`turn-tail`.
- **System prompts rendered**: `system-prompt` nodes (one per model request, complete prompt text) previously fell into the unhandled-record fallback. They now render as a collapsed disclosure row outside the process group, matching the native view: monospace pre-wrap body in a scrollport, real line breaks preserved.
- **`/goal` command inputs rendered**: `command-input` nodes (registered by the host's goal UI, not a linked peer) previously hit the fallback card. They now render as the command text in the user-message seat with a "命令输入" label, mirroring the native right-aligned input bubble; line breaks preserved.
- **Back-to-bottom control aligned with the native chat view**: the same 34px floating chevron button, lifted above the sticky composer exactly like the native embedded rule (`bottom = composer height + 16px`), and it now appears at the same 25px near-bottom threshold the native view uses (previously 72px, which hid the button on small scrolls).
- **Scrolling performance**: turn-rail active tracking resolves by binary search over cached section offsets (rebuilt only on content resize), the anchor capture scan runs at most once per frame and only while detached, removing the per-scroll-event O(n) DOM scans that caused stutter on long transcripts.
- **Turn navigation rail**: a vertical tick rail on the right edge, ported from the native `TurnNavigator` — one tick per loaded turn, the active tick follows the reading line, hovering shows a preview card (turn's opening user text), clicking lands on that turn's section, and the rail scrolls itself with fade masks while keeping the active tick in view. Unloaded history appears as shortened ghost ticks; clicking one loads an older batch. Fewer than two marks hides the rail.
- 52 regression tests.

## 0.1.0

First public release of the accepted reading-view plugin, published as `dsh-better-display`.

- Native context and tool details with source-ordered, unmodified reasoning.
- Bounded long-reasoning cards with two-line following, expanded follow and manual pause/resume.
- Successful-turn process folding with a separate final answer.
- Source-ordered text reveal and quiet busy-state shimmer.
- Stable status typography and compact disclosure spacing.
- Native content fallbacks and a trusted-plugin block extension slot.
- 42 regression tests; no changes to DSH Agent, SDK, providers or core.
