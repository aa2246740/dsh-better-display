# Extension points

Two seams. Both are display-only. Neither one writes the session, the transcript, or the fold input.

## `dsh-better-display.text-transform`

Cordis service, provided by this plugin's client when it applies. Another client plugin lists the name in `inject` and registers a transformer. With no registrant, the reader does not call `read` and does not subscribe.

Kinds:

| Kind | What it paints |
| --- | --- |
| `reasoning` | The thinking card (`ReadingReasoning`), before `useStreamingText`. |
| `body` | Assistant Markdown, and tool prose that uses the same reader (`ReadingMarkdown`). User bubbles are not passed through. |

Request:

```ts
interface DisplayTextRequest {
  text: string;
  streaming: boolean;
  blockKey: string;
  kind: 'reasoning' | 'body';
  source?: 'assistant' | 'user' | 'tool';
}
```

`blockKey` identifies one mounted block. It changes when that block unmounts. It is not a session message id.

`read` runs on each paint and returns one of:

- `{ text, final }`
- a string, which is treated as `{ text, final: !streaming }`
- `undefined`, which keeps the source text

`final: false` keeps the live reveal open. That includes the moment after the model has stopped while a translation batch is still outstanding. Return `final: !streaming` to leave the reveal flag as it is today.

`subscribe(listener)` is how an async batch tells the reader to call `read` again. It may be invoked once per kind, so it must keep every listener. Skip it for a pure sync transform.

Revisions:

- `transformRevision` increments when the displayed string or `final` changes. It is not the reveal clock. Do not pass it to the word timeline, and do not use it as a React key. Doing either one settles or remounts the paragraph and the fade starts over.
- The reveal continues when the new display string starts with the previous display string. Already shown characters keep their birth time. Only the new tail fades in.
- A string that does not extend the previous one is a replacement. The reader shows that string in place. It does not clear the card and type from the first character.

Register during `apply`, before the reading view paints. A transformer added mid-turn is picked up on the next reader render, and that first switch mounts the reveal on the current string.

Copy answer and copy message read the original blocks (`originalAnswerText` for the answer). The native 对话 view is untouched, because this seam only runs inside the reader.

Fold still uses the original block list and the public turn boundary.

A foreign `assistant-step` renderer receives original text. That is a `conversation.chat.node` replacement whose priority is below the official renderer. Reader hands it the segment's original blocks and does not run this transform on that path. Reader markdown, including this transform, is only the fallback when the foreign renderer returns null. Reasoning stays on the reading card either way.

Import the types from `dsh-better-display/client`:

```ts
import type { DisplayTextRequest, TextTransformRegistry } from 'dsh-better-display/client';
import { TEXT_TRANSFORM_SERVICE } from 'dsh-better-display/client';
```

`createTextTransformRegistry()` builds a private registry for a unit test. A plugin that wants the reader to paint its text must register on the service the reader provides, not on a registry it constructed itself.

### Minimal translation-shaped plugin

This one only uppercases. A real translator keeps the same `read` / `subscribe` shape, stores each batch on `blockKey`, and returns a string that extends the previous display string when it wants the fade to continue. It leaves `source === 'tool'` alone unless tool prose should change too.

`src/client/index.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis';

export const name = 'upper-reasoning-client';
export const inject = ['dsh-better-display.text-transform'];

interface Request {
  text: string;
  streaming: boolean;
  blockKey: string;
  kind: 'reasoning' | 'body';
  source?: 'assistant' | 'user' | 'tool';
}

export function apply(ctx: Context): () => void {
  const seam = ctx.get('dsh-better-display.text-transform') as {
    register(kind: 'reasoning' | 'body' | readonly ('reasoning' | 'body')[], transformer: {
      read(request: Request): { text: string; final: boolean } | undefined;
    }): () => void;
  } | undefined;
  if (!seam) return () => {};
  return seam.register(['reasoning', 'body'], {
    read(request) {
      if (request.source === 'tool') return undefined;
      return { text: request.text.toUpperCase(), final: !request.streaming };
    },
  });
}
```

`package.json`:

```json
{
  "name": "dsh-upper-reasoning",
  "private": true,
  "type": "module",
  "dsh": { "client": { "platform": "web" }, "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-upper-reasoning
      name: dsh-upper-reasoning
```

Install this plugin and the local `dsh-better-display` checkout into the same web profile, reopen the Web Host, and reload. The published npm package does not have this seam until a release that includes it.

ASCII letters in the thinking card and the final answer render in upper case. Chinese is unchanged by Unicode case, so ask the model to reason in English if you need a visible difference. The fade still grows at the end of the string while the turn streams. Copy answer pastes the original casing. The 对话 tab still shows the original casing. A successful turn still folds the process and leaves the answer.

An async batch looks like this:

```ts
const cache = new Map<string, { text: string; final: boolean }>();
const listeners = new Set<() => void>();

seam.register(['reasoning', 'body'], {
  read(request) {
    if (request.source === 'tool') return undefined;
    return cache.get(request.blockKey) ?? { text: request.text, final: !request.streaming };
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
});

function publish(blockKey: string, text: string, final: boolean) {
  cache.set(blockKey, { text, final });
  for (const listener of listeners) listener();
}
```

`publish` after each batch. Extend the previous cached string when the fade should continue.

### 接官方思考翻译（`cotTranslation`）

官方「思考过程机器翻译」组合包（`@deepseek-ai/dsh-experimental-cot-translation-bundle`）把译文注册在 `conversation.chat.reasoning.body` 插槽上，而阅读页用自己的卡片渲染思考，那个插槽不会渲染——装了翻译包，在阅读页看起来像没翻译。用这条缝接它：

```ts
const cot = ctx.get('cotTranslation') as {
  limits(signal: AbortSignal): Promise<{
    maxTextChars: number;
    preferences: { provider: string; targetLanguage: string };
  }>;
  translate(
    request: { text: string; targetLanguage: string; provider?: string },
    signal: AbortSignal,
  ): Promise<string>;
} | undefined;
```

先调 `limits()` 拿目标语言与单次上限（这一步不发送文本），再按 `maxTextChars` 切出**已完成**段落逐段 `translate()`。四个容易踩的点：

- `read` 必须同步：返回缓存或 `undefined`（保留原文），把请求排进 `queueMicrotask`，完成后用 `subscribe` 通知重绘；
- 流式中的末段不发，否则会把半句话送去翻译；
- 结果按 `blockKey` 缓存，源文本变长时只请求新增段落；
- 失败返回 `undefined`，阅读页保留原文；不要抛错，也不要写回 block。

组合包没挂载时 `ctx.get('cotTranslation')` 返回 `undefined`，此时直接返回 `undefined` 即可，界面与未安装插件完全一致。

完整可运行版本（分片、缓存、失败回退、卸载中止）见 [`examples/cot-translation-reader/`](../examples/cot-translation-reader/)。

## `dsh-better-display.block`

Chain slot, `scope: 'session'`. The reader calls `renderSlotChain` once per block. The first selector that returns non-null draws the block. All-null renders the reader fallback, which is the path that keeps reveal, follow-scroll, and fold.

Owner:

```ts
interface ReaderBlockOwner {
  block: AssistantBlock;
  streaming: boolean;
  source: 'assistant' | 'user' | 'tool';
  presentation?: {
    startedAt?: number;
    interrupted?: boolean;
    liveText?: boolean;
  };
  holdFormatting?: boolean;
  liveText?: boolean;
}
```

`presentation`, `holdFormatting`, and `liveText` are what the reader already computed. They used to stop at the fallback. A plugin that replaces the chain can read them. A plugin that only reads `block`, `streaming`, and `source` does not need to change.

Selectors stay pure. Logging the owner from a selector is a temporary check, not the contract.

Replacing the chain drops the reader fallback for that block, including the text transform above. A translation plugin that wants the reader's motion should use the text-transform service and leave this chain alone.
