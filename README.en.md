# dsh-better-display

[English](./README.en.md) | [中文](./README.md)

Make DeepSeek Harness long tasks easier to read, and give the model the ability to dynamically render interactive web applications in its replies.

Watch native steps, thinking, and progress during execution; after completion the process folds away, leaving the final answer and live interactive cards. An independent **「Reading」** tab that keeps the original Chat / Trajectory views, input box, model selector, tools, and approvals intact.

**v0.2.0 · An unofficial DSH display & interaction enhancement plugin. It only changes presentation and interaction views — never the Agent's core execution, SDK, or model credentials.**

---

## 🌟 Key Features

### 1. Native Generative MCP Apps (SEP-1865 protocol)
No need to touch the DSH core MCP client. Any model that outputs a ````mcp-app` code block in its final answer gets it auto-mounted as a live, interactive component in the reading view:
- **Rich scenarios**: dynamic decision wizards, double-blind A/B evaluations, live weather boards, interactive agile kanban, multi-variable calculators, visual charts, and more;
- **Self-contained & dependency-free**: fully inline HTML/CSS/JS, no hard external network dependency;
- **Sandboxed & safe**: runs strictly inside `<iframe sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer">` — explicitly **without** `allow-same-origin` — fully isolating the DSH host's cookies, tokens, and DOM for absolute safety;
- **Bidirectional feedback loop**: built on standard JSON-RPC 2.0. After the user interacts inside the card, it auto-generates a natural-language prompt and writes it into the input box **instantly** via React 18's native setter — press Enter and keep the conversation going.

### 2. Extreme Adaptability (dark/light + dynamic height)
- **Dark/light live sync**: built-in DOM mutation + media-query listeners mean the card and its inner components re-theme instantly when the DSH UI or OS appearance switches — zero first-frame flash;
- **Pixel-perfect height**: a content-bottom bounding-box measurement algorithm combined with `ResizeObserver` keeps the container (60px–2400px) smoothly growing and shrinking with the content — no nested double scrollbars, no wasted whitespace.

### 3. Restrained, comfortable reading experience
- **Long-thinking follow**: native thinking folds into a fading card that smoothly follows two lines; expanding pauses following; resume anytime;
- **Process auto-fold**: only on successful turn completion does thinking and intermediate logs fold, leaving reading space to the final answer and interactive cards;
- **Lossless fidelity**: native Markdown, syntax-highlighted code, math, tables, images, and tool facts all render faithfully.

---

## 🎁 Bonus: MCP Apps skill pack

The repo ships a ready-to-use AI skill pack at [`skills/generative-mcpapps/`](skills/generative-mcpapps/):
- **`SKILL.md`** — teaches the model to generate high-quality, self-contained MCP Apps on demand;
- **`references/sep1865_protocol.md`** — SEP-1865 bidirectional handshake & event protocol;
- **`references/html_boilerplate.md`** — ready-to-use dark/light theme token template;
- **`examples/interactive_quiz.html`** — a double-blind evaluation example.

Copy the folder into your everyday Agent skill directory to use it.

---

## Quick Start: How to output an MCP App

Any model just wraps its HTML inside a normal Markdown fence, exactly like a code block:

````markdown
Here is a live board for you, interact directly:

```mcp-app title="Project Kanban"
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Project Kanban</title>
  <style>
    :root {
      --bg: var(--background, #ffffff);
      --card: var(--card, #f8fafc);
      --text: var(--foreground, #0f172a);
      --primary: var(--primary, #2563eb);
    }
    body { background: transparent; color: var(--text); padding: 12px; font-family: sans-serif; }
    .box { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  </style>
</head>
<body>
  <div class="box">
    <h3>Task 1</h3>
    <button onclick="submitChoice('A')">Confirm</button>
  </div>
  <script>
    function submitChoice(opt) {
      window.parent.postMessage({
        jsonrpc: "2.0",
        method: "ui/submit",
        params: { task: "task_done", choice: opt }
      }, "*");
    }
  </script>
</body>
</html>
```
````

In the Reading view, that code block is rendered directly as a native interactive card.

---

## Installation & Activation

Requires a working [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and [DSHX External](https://github.com/aa2246740/dsh-external-plugin-devkit).

Node.js `^22.19.0 || >=24` is required.

```sh
# Replace with your real paths and the running Web port
export DSHX_HARNESS=/absolute/path/to/deepseek-harness
export DSH_HOME=/absolute/path/to/your/dsh-home
export DSH_WEB_PORT=3080

git clone https://github.com/aa2246740/dsh-better-display.git "$DSHX_HARNESS/my-plugins/dsh-better-display"
cd "$DSHX_HARNESS/my-plugins/dsh-better-display"

node scripts/link-harness-dependencies.mjs "$DSHX_HARNESS"
npm test
DSHX_HARNESS="$DSHX_HARNESS" npm run build

dshx check dsh-better-display --harness "$DSHX_HARNESS"
dshx activation-plan dsh-better-display --change new-client --harness "$DSHX_HARNESS"
dshx activate-new-client dsh-better-display --profile web --port "$DSH_WEB_PORT" --harness "$DSHX_HARNESS"
```

First-time install needs no DSH restart; **refresh or reopen the Web page** and select the Reading tab. New sessions default to Reading.

### Updating an existing install

```sh
git pull
DSHX_HARNESS="$DSHX_HARNESS" npm run build
```
Refresh the browser to enjoy the latest MCP Apps experience — no DSH server restart needed.

---

## Development & Verification

```sh
npm test
npm run typecheck
DSHX_HARNESS=/absolute/path/to/deepseek-harness npm run build
```

49 unit tests cover message projection, the Markdown pipeline, SEP-1865 protocol parsing, adaptive height budgeting, React 18 input-state sync, and two-line thinking-follow motion.

---

## Acknowledgements & License

- Native rendering and Markdown parts are derived from DeepSeek Harness (MIT).
- Motion design draws on Jakub Antalik's [Transitions.dev](https://transitions.dev/).
- Original code in this project is licensed under the [MIT License](LICENSE).