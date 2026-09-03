# SEP-1865 JSON-RPC Communication Protocol

This reference defines the bidirectional communication protocol between the sandboxed UI iframe and the host AI client under the **SEP-1865 (`io.modelcontextprotocol/ui`)** specification.

---

## 1. Handshake & Lifecycle

When the host initializes the iframe containing the MCP App:

1. **Host Initialization (`ui/initialize`)**:
   The host sends an initialization message containing configuration, initial state, and active theme tokens.

   ```json
   {
     "jsonrpc": "2.0",
     "method": "ui/initialize",
     "params": {
       "theme": "dark",
       "locale": "zh-CN",
       "context": {
         "conversationId": "conv-12345",
         "readOnly": false
       }
     }
   }
   ```

2. **Iframe Readiness Notification (`ui/ready` or `ui/notifications/initialized`)**:
   The iframe notifies the host that scripts have mounted and the DOM is ready to accept events.

   ```json
   {
     "jsonrpc": "2.0",
     "method": "ui/ready",
     "params": {
       "version": "1.0.0"
     }
   }
   ```

3. **Live Theme Change Notification (`ui/notifications/host-context-changed`)**:
   When the host user switches light/dark mode, host broadcasts this event so the iframe updates its theme variables in real-time.

---

## 2. Client-to-Host Invocations (Iframe -> Host)

The iframe triggers actions in the host using `window.parent.postMessage`.

### 2.1 Triggering an MCP Tool (`tools/call`)
When a user clicks a button (e.g., "Run Regression Tests" or "Confirm Selection"):

```javascript
window.parent.postMessage({
  jsonrpc: "2.0",
  id: "req-001",
  method: "tools/call",
  params: {
    name: "execute_benchmark",
    arguments: {
      suite: "all",
      targetBranch: "main"
    }
  }
}, "*");
```

### 2.2 Submitting Form / State to Chat (`ui/submit` or `ui/update-model-context`)
When the user submits a form or completes an interactive quiz:

```javascript
window.parent.postMessage({
  jsonrpc: "2.0",
  id: "req-002",
  method: "ui/submit",
  params: {
    task: "quiz_completed",
    choice: "B",
    desc: "延迟消息队列"
  }
}, "*");
```

### 2.3 Resizing Request (`ui/resize`)
When dynamic content inside the card expands or contracts, request an iframe height adjustment (note: `dsh-better-display` also automatically auto-measures via ResizeObserver):

```javascript
window.parent.postMessage({
  jsonrpc: "2.0",
  method: "ui/resize",
  params: {
    height: document.body.scrollHeight
  }
}, "*");
```

---

## 3. Host-to-Client Invocations (Host -> Iframe)

Listen for messages inside the iframe via `window.addEventListener("message", ...)`:

```javascript
window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || message.jsonrpc !== "2.0") return;

  switch (message.method) {
    case "ui/initialize":
      applyTheme(message.params.theme);
      break;
    case "ui/notifications/host-context-changed":
      applyTheme(message.params.theme);
      break;
    case "ui/updateState":
      renderState(message.params.state);
      break;
  }
});
```
