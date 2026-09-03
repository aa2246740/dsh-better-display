---
name: generative-mcpapps
description: >-
  Render interactive, dynamic HTML/JS components and widgets inside any AI harness
  supporting the MCP Apps standard (SEP-1865 / io.modelcontextprotocol/ui), such as
  DeepSeek Harness with dsh-better-display. Use this skill whenever presenting interactive
  data visualizations, multi-variant double-blind evaluations, dynamic calculators, stateful
  forms, configuration wizards, or rich controls that exceed plain Markdown capabilities.
---

# Generative MCP Apps

Guide for generating and delivering interactive HTML/JS user interfaces inside AI harnesses compliant with the Model Context Protocol Apps extension (**SEP-1865 / `io.modelcontextprotocol/ui`**).

Instead of relying on platform-exclusive proprietary tags, this skill produces self-contained, theme-adaptive web components that render inside standard sandboxed iframes (`sandbox="allow-scripts allow-forms"`) and communicate bidirectionally with the host agent via JSON-RPC `window.postMessage`.

---

## Information Hierarchy & Reference Pointers

- **Protocol & Communication**: Consult [references/sep1865_protocol.md](references/sep1865_protocol.md) for bidirectional JSON-RPC message schemas (`ui/initialize`, `ui/resize`, `ui/submit`, and event passing).
- **Template & Theme Tokens**: Consult [references/html_boilerplate.md](references/html_boilerplate.md) for CSS theme variable mappings, Tailwind integration, and responsive card containers.
- **Reference Implementation**: Inspect [examples/interactive_quiz.html](examples/interactive_quiz.html) for a complete working implementation featuring local state, reactive DOM updates, and host dispatch.

---

## Execution Workflow

Execute these 4 sequential steps to produce and render an interactive component.

### Step 1: Interface & Scope Assessment

Before generating code, determine the presentation boundary:

1. **Height Budget**: Content height is automatically measured and adapted by the host runtime (from 60px to 2400px). Avoid setting `min-h-screen`, `100vh`, or fixed full-height containers on body.
2. **Interaction Mode**:
   - **Display-Only / Local Interactive**: Calculations, tab switching, and visual filtering that run purely client-side without modifying backend agent state.
   - **Bidirectional Tool Dispatch**: Actions requiring the agent to perform follow-up work (submitting choices, parameter tuning, triggering commands).
3. **Asset Self-Containment**: Assume strict Content Security Policy (CSP). Inline all critical CSS and JavaScript; avoid relying on unrestricted external third-party script CDNs unless explicitly permitted.

### Step 2: Assemble the Self-Contained HTML Document

Compose the HTML document following the structure in [references/html_boilerplate.md](references/html_boilerplate.md):

1. **Root Transparency**: Set `<body style="background: transparent;">` so the widget container seamlessly inherits the host background.
2. **Theme Adaptability**: Apply semantic CSS variables (`var(--card-bg, #ffffff)`, `var(--text-main, #0f172a)`, `var(--border-color, #e2e8f0)`) or Tailwind theme classes (`dark:`) with fallback values to ensure legibility across both dark and light modes.
3. **Host Communication Hook**: Include the MCP Apps `postMessage` transport helper if the UI allows triggering host tools or dispatching state:
   ```javascript
   function sendToHost(method, params = {}) {
     window.parent.postMessage({
       jsonrpc: "2.0",
       id: "req-" + Date.now(),
       method: method,
       params: params
     }, "*");
   }
   ```

### Step 3: Deliver via MCP Apps Channel

Deliver the assembled HTML to the host through one of the available dynamic pathways:

- **Path A (Markdown Code Block — Direct & Universal in dsh-better-display)**:
  Directly output the HTML within a ````mcp-app` code fence. The reading view will automatically mount it inside an isolated, theme-aware sandbox:
  ````markdown
  ```mcp-app title="双盲方案盲选评测器"
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <title>双盲方案盲选评测器</title>
  </head>
  <body>
    ...
  </body>
  </html>
  ```
  ````

- **Path B (Dedicated Dynamic UI Tool)**:
  If the harness provides an MCP tool for dynamic rendering (e.g., `render_ui`, `show_canvas`, or `create_view`):
  Invoke the tool directly with the HTML string and metadata:
  ```json
  {
    "tool": "render_ui",
    "parameters": {
      "title": "Interactive Benchmark Panel",
      "html": "<!DOCTYPE html><html>...</html>"
    }
  }
  ```

### Step 4: Verification & Completion Criteria

The generation task is complete when all of the following criteria are satisfied:

1. **DOM Structure**: Document is complete with valid `<!DOCTYPE html>`, `<html>`, `<head>`, and `<body>` tags.
2. **Theme Contrast**: All text elements use semantic theme variables or high-contrast fallback tokens; no hardcoded white-on-white or dark-on-dark text combinations.
3. **Responsiveness**: The root container fits cleanly within variable host widths (320px to 1200px) without horizontal clipping.
4. **Interactive Feedback**: Interactive options update reactive state, and the submit button dispatches a clean `ui/submit` or `ui/update-model-context` payload.
