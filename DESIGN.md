# Display contract

## Purpose

Keep native DeepSeek Harness process information readable while separating the final answer after a successful turn. The reading view is a presentation of the public session projection, never a second Agent pipeline.

## Content fidelity

- Preserve literal reasoning text, whitespace, source order and block identity.
- Do not infer reasoning from wording, parse private provider logs, rewrite prompts or alter model settings.
- Preserve native context sources, tool types, summaries, filenames, details and results.
- Preserve the native conversation, input, model selector and approval system.
- Leave nontext and unknown content available through native renderers or a safe fallback.

## Lifecycle

During a turn, show its real process in chronological order. Starting body output, preparing tool input, finishing one tool, or entering another step is not whole-turn completion.

Only a successful public turn-close boundary folds process, leaving the final answer in place. Failures, interruptions, unknown terminal states and approval requests remain visible. A live text selection defers folding until the selection is released. A historical turn can always be reopened.

## Narration is never folded (2026-10-20)

Assistant narration — the body segments a step emits between reasoning and tool calls, including text, images and future block kinds — is display content, not process detail. It is ordinary body prose, never annotation chrome. It is always rendered in source order:

- Collapsing process hides reasoning cards, tool calls, context rows and other process records; it never hides, truncates or dims narration.
- Expanding process inserts those records back between the narration segments exactly where they occurred. Narration does not move, duplicate or become an answer card.
- Narration uses the normal body typography and keeps no left rule of its own. When collapsed process sat between two narration blocks, a compact process-chain summary (1px rail on the shared `--reader-rail` edge + `思考×N · 工具×K` label + chevron, 12px tertiary) occupies the gap; it counts only the rows folded between those blocks and expands them in place when clicked.
- A step that carries body blocks no longer advertises process content on that basis; only literal reasoning does.
- Fold summaries count thinking, tools and records; narration is not counted as `输出×N` and never appears inside a fold box.
- During a live turn, narration is a fold-chain boundary: a new reasoning step may collapse the reasoning/tool run on its side of the narration, never the narration itself.
- Auto-fold off, failure, interruption, unknown terminals and selection protection keep their existing behavior.

While a turn is still open, a later reasoning step may collapse earlier steps of the same chain into one disclosure (`思考×N`). Body or tool alone never triggers that live fold. A mid-turn user insert or steering message resets the chain. This is presentation-only and does not change the successful-turn final-answer fold.

## Long reasoning

A neutral card bounds the transcript without replacing it. The viewport mask is 28px. Follow advances by two actual line heights every 840ms, with a 500ms transform using `cubic-bezier(.22,1,.36,1)`; clamp only at the current real end. Never accelerate through a burst, clone the transcript or loop old text.

Expanding changes viewport size and preserves position and follow state. Wheel, touch, viewport focus or selection pause following. The explicit follow control resumes only when no text is selected. Completed history stays static. The full source text remains available.

## Text and status motion

Assign reveal times from source positions before rendering Markdown. Only newly appended text receives opacity/blur motion; existing paragraphs, page surfaces and text color do not animate. Unicode graphemes and punctuation keep their source order. Media and custom blocks do not enter the text queue.

Busy labels use a 2-second glyph-only shimmer and a short state swap. Initial, busy and elapsed labels all use the native font at 14px/24px, weight 400. The disclosure arrow sits 6px from the current label; no longest-state spacer. Elapsed time and attention states do not shimmer.

## Sticky reading lanes (2026-09-16)

Keep the existing in-flow positions. The auto-fold control receives a full-column, 40px-minimum lane from initial render, native page background and seamless spacing, without divider lines or replacement shadows (user preference). The status retains its source position and shares the top lane's left side only when it reaches the scrollport top. The original summary row (never a duplicate) sticks below the greater measured toolbar/status height. Expanded and collapsed live summaries remain discoverable; completed summaries obey the same sticky offset. Scope is the current flow/turn, so subsequent turns replace earlier statistics rather than displaying unrelated counts forever.

Taste checkpoint: native reading chrome, not floating badges; one column, no new card family, no shadows or rounded background tiles; existing typography. Active responsive-interaction binding: real ResizeObserver lane geometry → StickyLane + CSS offsets → verify desktop/320px, wrapped statistics, no overlap, and return to original position on reverse scroll. Preserve prior measured fold choreography and zero-height empty wrappers.

## Reading and accessibility

Manual reading, selection and keyboard access take precedence over automatic following. Reduced-motion preferences, disabled motion and background views settle to the received content. Errors stay local to their block. Do not turn user interaction into a permanent lock that prevents successful-turn folding.

## Extensions and safety

Trusted plugins may register `dsh-better-display.block`. Native content remains the fallback. Generative MCP Apps (SEP-1865 / `io.modelcontextprotocol/ui`) are supported via an isolated, sandboxed iframe (`sandbox="allow-scripts allow-forms"`, strictly without `allow-same-origin`) communicating via bidirectional JSON-RPC `postMessage` (`ui/initialize`, `ui/resize`, `ui/update-model-context`, `ui/submit`).

## Host DOM hooks

Reader replaces ChatView's message list, not the native conversation chrome. The enclosing `[data-conversation-scroll]` and sticky `[data-composer-seat]` stay host-owned. ChatView marks its column with `data-chat-flow=""`. Third-party skins (maid-atelier, phoebe-atelier, and others) treat a scrollport without that hook as inspect-only and hide the composer. Reader keeps the same empty `data-chat-flow` attribute on its column so those skins still see an interactive conversation. Turns stay on `[data-reader-turn]`; Reader does not emit native `[data-chat-flow-kind]` rows.

## Fold choreography contract (2026-09-16)

Single-agent implementation; preserve existing type, colors, source order and one-column reading layout. The memory cue is causality, not ornament: shrink → count → pause → continue. No bouncing capsule, scale-squashed text or parallel entrance spectacle.

| Active reference | Decision | Target | Verification |
| --- | --- | --- | --- |
| motion-language | One attention owner; bounded coalescing instead of replaying every arrival | ChoreographedFlow | fast/slow/burst frame samples |
| motion-contract | Preserve step parents/keys until shrink completes; freeze a materialized public snapshot | fold-choreography + ChoreographedFlow | DOM identity, intermediate heights, ordered phases |
| responsive-interaction | Controls stay usable; labels receive available width, not an arbitrary narrow box | Reader.module.css | wide/narrow/200% text checks |
| typography-system | Keep native 14/24 status type; full short labels; wrap exceptional long labels | StatusText CSS | actual range vs container bounds |

Motion id: `fold-choreography`. Trigger: newly received reasoning folds a previously visible chain. Historical mount is static. Native WAAPI animates measured layout height for 320ms (deliberate layout exception needed for real flow continuity), then counters roll for 160ms, then 80ms stillness, then 180ms content reveal. New data coalesces into one latest frame; it never restarts the active shrink. Newly released text uses the existing grapheme-safe bounded catch-up buffer. Counter values belong to committed presentation frames, not the transport clock.

A selected passage, new user message, approval, error, stop, reduced motion or hidden page bypasses the waiting queue. Manual fold controls remain interruptible. Only the reader scroll coordinator writes the outer scroll position; during measured size animation it tracks geometry rather than layering another scroll easing. Authoritative session data is never rewritten.

Rollback baseline: `.delivery/before-choreography-20260916.tgz` plus original commit `56a87bb2531e5ccb9db5d4c8a347c2f91d7e449a`; existing uncommitted fixes are included in the archive. Changed surface: existing client only, no Host restart or core edits.

## Verification

Use unit coverage for projection, lifecycle, source-ordered streaming, graphemes, Markdown and two-line stepping. Verify live Host manifest, served bundle, native process details, literal reasoning, motion, successful folding, reopening, narrow layouts and reduced motion separately. Keep private session evidence outside this repository.
