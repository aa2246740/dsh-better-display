---
name: generative-mcpapps
description: "Render interactive HTML/JS widgets, product UI mockups, and clickable prototypes inside the chat (MCP Apps / SEP-1865). Use whenever the user asks to see, preview, compare, or interact with a design (mockup, prototype, 画出来看看): data visualizations, calculators, stateful forms, config wizards, or any UI richer than plain Markdown."
---

# Generative MCP Apps

Create self-contained interactive HTML/JS widgets, UI mockups, and clickable prototypes in chat. This is an Agent Skill with YAML metadata and Markdown instructions; it has no Gemini-specific syntax or model requirement.

## Select the delivery surface

- In DSH with Better Display enabled, emit an `mcp-app` fenced code block. The reading view renders it in an iframe with `sandbox="allow-scripts allow-forms"`.
- In another harness, use only its available, documented UI tool and actual input schema. The Better Display fence and message aliases below are not a universal MCP Apps transport.
- If no inline renderer is available, save a standalone HTML artifact and explain how to open it. Do not claim that a plain code block was rendered.

The harness must discover this skill before automatic selection can work. Keep the whole `generative-mcpapps/` folder together, including references and examples, in a skill directory supported by that harness. Merely placing it inside a plugin repository does not prove that the current agent has loaded it.

## Build the widget

1. Choose local interaction (tabs, filters, calculations) or an explicit submission back to chat. For Better Display, submission fills the composer; the user still sends the message. It does not execute tools or commands automatically.
2. Inline critical CSS and JavaScript. Use semantic theme variables with readable fallbacks, a transparent body, and layouts that fit widths from 320px to 1200px. Avoid `100vh` and `min-h-screen`: Better Display measures content height and clamps it to 60–2400px.
3. Read [HTML boilerplate and theme tokens](references/html_boilerplate.md) when assembling a card. Read [Better Display host messages](references/sep1865_protocol.md) only when using host communication. The latter documents this plugin's implementation, not a full MCP Apps specification.
4. For a selectable local-state example, inspect [interactive_quiz.html](examples/interactive_quiz.html). Adapt its content and controls to the user's request.

## Deliver in Better Display

Output the complete HTML document directly in the answer:

````markdown
```mcp-app title="交互原型"
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>交互原型</title>
</head>
<body>
  <!-- Include the widget's inline styles, content, and script here. -->
</body>
</html>
```
````

## Verify the result

Check the complete document, narrow-width layout, readable theme contrast, and the requested interaction. For a submission widget, verify that the chosen data reaches the chat composer; distinguish that from a sent message or completed agent action. A local-only widget needs no host submission. Report only the rendering and interaction actually observed in the available harness.
