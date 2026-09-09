# Better Display host messages

This documents the adapter in `src/client/McpAppFrame.tsx`, not the full SEP-1865 specification. Use these messages for Better Display's `mcp-app` iframe. Other hosts require their own documented transport and capabilities.

## Initialization and theme

The iframe can send `ui/initialize` with a JSON-RPC request ID. Better Display responds with `result.protocolVersion` and `result.hostContext`, including `theme`, `locale`, and `styles.variables`.

For compatibility, Better Display also sends an initial `ui/initialize` notification with those theme fields in `params`. Later theme changes arrive as `ui/notifications/host-context-changed`. The plugin injects a theme and height helper into HTML documents.

When handling parent messages, verify the source:

```javascript
window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const msg = event.data;
  if (!msg || msg.jsonrpc !== "2.0") return;
  const context = msg.result?.hostContext || msg.params;
  if (context?.theme) {
    document.documentElement.dataset.theme = context.theme;
  }
});
```

The sandbox has an opaque origin, so messages to the parent use `"*"`. The host checks that incoming messages originate from this iframe's content window.

## Submit a choice to the composer

```javascript
window.parent.postMessage({
  jsonrpc: "2.0",
  id: "choice-" + Date.now(),
  method: "ui/submit",
  params: { task: "quiz_completed", choice: "B", desc: "Selected option B" }
}, "*");
```

The host displays a receipt and fills the chat composer with a prompt derived from the parameters. The user must send it. `ui/update-model-context` is handled as the same composer action in this adapter; do not assume a silent model-context update. These submit handlers do not send a JSON-RPC success response, so do not wait indefinitely for one.

There is no `tools/call` handler in this adapter. Use submission for a requested follow-up instead of claiming that a click executed a tool.

## Readiness and sizing

`ui/ready` and `ui/notifications/initialized` mark the iframe ready. The injected ResizeObserver normally handles height automatically. A widget may also send:

```javascript
window.parent.postMessage({
  jsonrpc: "2.0",
  method: "ui/resize",
  params: { height: document.body.scrollHeight }
}, "*");
```

The host accepts positive finite heights and clamps them to 60–2400px. No `ui/updateState` handler is provided by this adapter.
