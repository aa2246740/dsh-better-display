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

While a turn is still open, a new reasoning step may collapse earlier steps of the current chain into one expandable box. The summary is structural only (for example `思考×2 · 输出×1 · 工具×1`); it does not rewrite Think text. Body and tool steps alone never trigger this fold. A mid-turn user insert or steering message starts a fresh chain, so the next reasoning after that insert is what folds post-insert priors. Context-only prefixes before the first reasoning are not treated as a fold trigger.

Only a successful public turn-close boundary folds process and intermediate commentary, leaving the final answer in place. Failures, interruptions, unknown terminal states and approval requests remain visible. A live text selection defers folding until the selection is released. A historical turn can always be reopened.

## Long reasoning

A neutral card bounds the transcript without replacing it. The viewport mask is 28px. Follow advances by two actual line heights every 840ms, with a 500ms transform using `cubic-bezier(.22,1,.36,1)`; clamp only at the current real end. Never accelerate through a burst, clone the transcript or loop old text.

Expanding changes viewport size and preserves position and follow state. Wheel, touch, viewport focus or selection pause following. The explicit follow control resumes only when no text is selected. Completed history stays static. The full source text remains available.

## Text and status motion

Assign reveal times from source positions before rendering Markdown. Only newly appended text receives opacity/blur motion; existing paragraphs, page surfaces and text color do not animate. Unicode graphemes and punctuation keep their source order. Media and custom blocks do not enter the text queue.

Busy labels use a 2-second glyph-only shimmer and a short state swap. Initial, busy and elapsed labels all use the native font at 14px/24px, weight 400. The disclosure arrow sits 6px from the current label; no longest-state spacer. Elapsed time and attention states do not shimmer.

## Reading and accessibility

Manual reading, selection and keyboard access take precedence over automatic following. Reduced-motion preferences, disabled motion and background views settle to the received content. Errors stay local to their block. Do not turn user interaction into a permanent lock that prevents successful-turn folding.

## Extensions and safety

Trusted plugins may register `dsh-better-display.block`. Native content remains the fallback. This release does not execute arbitrary generated markup, embed an MCP App host or grant capabilities to generated UI.

## Verification

Use unit coverage for projection, lifecycle, source-ordered streaming, graphemes, Markdown, two-line stepping and live fold-on-next-reasoning. Verify live Host manifest, served bundle, native process details, literal reasoning, motion, successful folding, reopening, narrow layouts and reduced motion separately. Keep private session evidence outside this repository.
