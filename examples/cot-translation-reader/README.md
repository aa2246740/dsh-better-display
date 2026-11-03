# COT translation adapter (reference)

把一个**官方**翻译能力接到阅读页的示例：官方「思考过程机器翻译」组合包
（`@deepseek-ai/dsh-experimental-cot-translation-bundle`）把译文注册在
`conversation.chat.reasoning.body` 插槽上，而阅读页用自己的卡片渲染思考，那个
插槽不会渲染。这个示例改用 `dsh-better-display.text-transform` 缝，把译文交给
阅读页绘制。

它是**示例**，不是发布物：没有对应 npm 包，也不参与本仓库的 `npm run build`。
复制到自己的插件里，或用 `dsh plugin --profile web add ./examples/cot-translation-reader`
在本地试。

## 前提

- `dsh-better-display` ≥ **0.3.9**（`dsh-better-display.text-transform` 缝从这版开始提供）
- 官方 COT 翻译组合包已启用，并在插件面板选好翻译服务与目标语言

任一个缺失时插件安静地不生效：不报错，也不改界面。

## 关键点

| 点 | 为什么 |
| --- | --- |
| `read` 保持同步 | 每次绘制都会调用；请求排进微任务，结果通过 `subscribe` 通知重绘 |
| 只翻已完成段落 | 流式中的最后一段是半句话，发出去既浪费也不准 |
| 按 `maxTextChars` 切分 | 上限来自 `ctx.cotTranslation.limits()`，不是猜的 |
| 按 `blockKey` 缓存 | 源文本变长时只请求新增段落，已翻好的不重复发 |
| 失败返回 `undefined` | 阅读页保留原文；抛错会被缝捕获并回退原文，但日志更难读 |
| 卸载时停止 | 插件撤下后不再有绘制，继续请求只是浪费 |

## 文件

- [`src/client/index.ts`](src/client/index.ts)：缝注册、分片、异步批次、缓存
- [`cordis.patch.yml`](cordis.patch.yml)：把示例挂进 profile
- [`tsconfig.json`](tsconfig.json)：单独类型检查用（`npx tsc -p examples/cot-translation-reader`）

完整说明见 [`docs/extension-points.md`](../../docs/extension-points.md)。
