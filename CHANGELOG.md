# Changelog

## 0.1.1

Experimental live fold on the reading tab: a new reasoning step collapses prior steps of the current chain into one expandable box. Structural count summary only; literal Think text is unchanged. Mid-turn user inserts reset the chain. Successful turn-close, errors, interrupts and approvals keep the existing DESIGN.md rules. 51 unit tests.

## 0.1.0

First public release of the accepted reading-view plugin, published as `dsh-better-display`.

- Native context and tool details with source-ordered, unmodified reasoning.
- Bounded long-reasoning cards with two-line following, expanded follow and manual pause/resume.
- Successful-turn process folding with a separate final answer.
- Source-ordered text reveal and quiet busy-state shimmer.
- Stable status typography and compact disclosure spacing.
- Native content fallbacks and a trusted-plugin block extension slot.
- 42 regression tests; no changes to DSH Agent, SDK, providers or core.
