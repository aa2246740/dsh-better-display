# 官方能力接入说明

`0.3.0` 在阅读布局上接入官方内容和控件。当前验收目标是 Harness `0.2.1-rc.5`（`dsh-v0.2.1-rc.5`，`b830ec950faba0a46dda564be3e2d854afed94f1`）。`conversation.chat.turnTail` 仍是 `list`。`conversation.message.images` 已拆成 `conversation.chat.message.images` 与 `conversation.chat.user.images`，Reader 分别镜像这两条 single/session 槽。`ChatNodeOwnerProps` 不再带 `openSkill` / `renderMessageImages`；`conversation.chat.node` 的 `hookContext` 需要 `useGroupAction`。`schedule-created` 和 `schedule_update` 继续走已有镜像座位，Reader 不另写这两张卡片。图标仍使用 `*Regular` 名称。开发者消息里的工具增减行用官方标题和计数，本地 Markdown 图片接受 Desktop 文件路由 `dsh-app://app/api/file`。阅读页自己呈现模型重试和进行中的过程行，所以这两处官方视图变化不改阅读布局。后续仍需维护的自有展示逻辑和升级边界见下文。

## 一个具体例子

一条回答的持久化 `messageId` 进入 `OfficialActions`，随后进入 Reader 自己的回答操作插槽。里面的反馈组件、状态注入和弹窗控制器来自当前已加载的官方反馈插件。点击按钮后，由官方控制器打开原来的官方弹窗；Reader 不实现反馈请求、类别或状态管理。

工具详情同理：传递 `callId`、原始 `block`、工作目录、Host home、图片加载器、带行号的文件打开操作和轨迹入口，再由官方工具组件呈现。原来只取函数组件、手工传四个参数并模拟点击展开的路径已经移除。

## 代码归属

| 模块                             | 负责什么                                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `official-slots.tsx`             | 用公开注册表 API 将官方注册信息映射到 Reader 的独立插槽；保留注入、locale、store、selector 和子插槽。监听贡献增删，逐条挂载和释放。 |
| `OfficialContent.tsx`            | 将回答身份、工具、节点和产物上下文传给官方控件。这里只组合，不处理业务请求。                                                        |
| `Reader.tsx`、`ToolActivity.tsx` | 原有阅读布局、过程组织、摘要和交互。工具详情里的控件采用官方形式。                                                                  |
| `platform-media.ts`              | RC2 的本地媒体 URL 约定；读取授权仍由 Host 文件 API 负责。                                                                          |
| `compat/harness-rc2.json`        | 已验收的官方接口、被自有展示覆盖的实现和注册清单基线。                                                                              |

## 为什么有插槽映射

RC2 的一个子插槽只能有一个声明者，只有声明它的组件能获得相应 `renderSlot` 权限。Reader 不能把官方插槽再声明一次，也不能从 `ctx.slots` 任意渲染子插槽。

本适配用 `spec`、`entriesOfSlot`、`register`、`inject`、`subscribe` 建立 Reader 自己的名字空间，交给同一个官方渲染器运行。组件声明的子插槽名称在一层薄包装中转换，其余属性原样传递。没有私有源码导入，没有修改官方注册对象或官方 DOM，没有复制官方渲染器。现有控件保持组件和注入身份；增加别的控件不会重挂它们。

这仍是 RC2 的受限适配方案。若官方将来提供可直接组合的共享渲染入口，应优先替换这层映射。

## 这版覆盖的能力

| 能力                         | 处理方式                                                                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 回答操作、反馈               | 官方 `conversation.chat.assistant-actions`，使用持久化 messageId；中断的临时片段不伪造身份。                                                                                                                          |
| 工具详情                     | 官方 `tool.call.toolview`，包括 memo、注入状态、翻译和递归子插槽；未注册的工具保留原有结果预览。                                                                                                                      |
| 显式 `present` 产物          | 官方 turnTail 中的文件卡片和菜单，保留官方状态和打开操作。                                                                                                                                                            |
| 已修改文件快捷操作           | 保持原 Reader 的复制、定位和打开模式；仅从 Reader 的官方 tail 展示参数中排除重复的 produced chips，不改变官方源数据。未知匹配结构原样呈现。                                                                           |
| 文件行号和正文文件链接       | 保留工具传来的行号；正文优先采用官方 file-mention 服务，现有路径匹配作为补充。                                                                                                                                        |
| 本地 Markdown 图片           | 和 RC2 相同的同源文件 API，加载失败保留替代文本，危险协议不直接渲染。                                                                                                                                                 |
| 用户与 steering 消息         | 镜像 `conversation.chat.node` 的 keyed renderer，保留 `sessionId`、turn hook 和 Reader 跳转属性；未注册对应 key 时通过插槽 `fallback` 呈现 Reader 气泡。renderer 主动返回 `null` 时不补画气泡。                       |
| 回答正文上的第三方替换渲染器 | 只镜像 priority 低于官方 `assistant-step`（priority 0）的注册。正文段交给该渲染器，`groupPart` 为 `response`，blocks 只有这一段。思考、折叠、动效和回答外框仍由 Reader 绘制。没有这类注册时正文仍走 Reader Markdown。 |
| 命令、新节点类型             | 接入官方节点渲染及其子插槽；无可用渲染器时保留记录并提供“在对话中查看”。                                                                                                                                              |

阅读布局、折叠、逐字动效、阅读速度、默认设置保持现版。移除了未被使用的全局 `body.dataset.readerFolding` 写入。

## 验证与升级

在选定 Harness 运行时上执行：

```sh
node scripts/link-harness-dependencies.mjs "$DSHX_HARNESS"
npm run build
npm test
npm run test:official
npm run test:auto-fold
```

`test:official` 使用测试目标里的真实官方 SlotRegistry、React renderer、反馈插件、ReadRow 和 Deliverables，只有远程业务服务使用内存替身。测试私有源码仅用于验证，不进入交付 bundle。浏览器验证使用本机固定的 Codex Playwright runtime，不附着用户会话。

`test:auto-fold` 使用真实 Reader 和独立的全局、会话 store，验证关闭后阅读再开启、此前步骤、设置同步、文本选择及连续切换；分别覆盖普通动画和减少动态效果。

`build` 先检查兼容基线。Harness 版本、敏感接口、尚未收敛的官方实现或相关注册清单改变时，构建明确要求审查。审查差异并通过功能与视觉测试后，才可运行 `check-harness-compat.mjs --record` 记录新基线。记录本身不构成兼容证明。

## rewind 座位兼容

Reader 的 user 与 steering 行会同时发布 `data-chat-anchor-key`、`data-chat-flow-key`、`data-chat-node-key` 和 `data-chat-flow-kind`，这些属性是 rewind 用来定位 durable 回退操作的官方 chat 座位契约。排队中的 inbox steering 也会渲染为 `data-pending-steering` 行，并按非文本内容块数量发布附件计数；本地 pending submission 与已落 durable 节点通过 source.rpcId 去重。

座位属性只解决「回退按钮出现在哪一行」，不解决「回退之后屏幕上还剩什么」。`dsh-rewind-plugin` 是 DOM 层实现：它从命令节点算出被遮蔽的 anchor seq，再对每个带 `data-chat-anchor-key` 的元素设 `display:none`。Reader 自渲染转录（turn 区块、answer、工具行），除 user/steering 外不发这个属性，所以 DOM 隐藏只够遮住气泡，被撤回的回答、工具行和 `/rewind` 命令行本身仍留在屏幕上——回退看起来只是被记录成一条命令，而不是把对话滚回发送该消息之前。

因此 Reader 自己执行同一份契约，见 `src/client/rewind-cut.ts`：从命令名属于 `{'rewind-plugin', 'rewind'}`（插件注册的命令 id 是前者，会话日志记录的是后者）且 `outcome.kind === 'success'` 的命令节点取 `outcome.sourceEventSeq`（替换型标记的日志 seq）与 `args` 里的 `@<seq>` 目标，合成闭区间 `[target, marker]`，落在区间内的 chat 行（含命令行自身）一律不渲染。三个要点：

- 回退的替换型标记 `user/message` 不是 append 事件，因此**不会**成为 chat 节点；命令节点的 `outcome.sourceEventSeq` 是客户端唯一的遮蔽信号。不要解析 `outcome.text`。
- 区间按「真正重叠/相接才合并」处理，不做 `[min,max]` 塌缩，否则两次回退之间的新内容会被一并吞掉。目标消息自身也在区间内：回退恢复的是发送该消息**之前**的状态。
- 行位置不是整数：官方 ChatView 会把合成行锚定在真实 seq 的分数偏移上（`CHAT_SYNTHETIC_SEQ_OFFSETS`：`turn-process` 在 `controlAnchorSeq - 0.1`、`turn-tail` 在 `seq + 0.1`、被中断的回答在 `seq - 0.9`）。判定用这个真实位置（`anchorSeqOf` 接受有限非负数），区间是闭区间 `[target, marker]`，**不要**放到下一个整数。下一回合的 `turn-process` 就锚在 `startSeq - 0.1`，落在 `[marker, marker + 1)` 里。
- `preview` 和 `__candidates` 不产生区间，哪怕 outcome 带了 marker。目标晚于 marker 的命令也不产生区间。失败或尚未成功的命令不产生区间，所以流式输出、重连、单纯重绘都不会被当成回退。
- 合成行故意锚在所属 turn 的事件区间之外。只有该 turn 的内容行全部落入区间（或已被宿主标成 hidden）时，才撤掉它的 `turn-process` 和 `turn-tail`。目标之前、同一 turn 里的用户消息和回答留着，过程摘要也留着。

最后一条也是订阅面：回退只是就地更新既有 command 节点，`snapshot.order` 与 `snapshot.nodes` 的引用都不变，针对其一的 selector 永不触发。Reader 因此订阅 `visibleChatSignature`（可见 key 拼成的字符串），让 chat hook 的 `Object.is` 比较能够发现变化。被撤回的行随即进入 `RetiringTurns`（`src/client/motion.tsx`）的退场通道：它按原索引保留该 turn，用 220ms 的 height/opacity 收起动画播完再卸载，行下方的内容是滑上去而不是瞬移。

纯图片目标现在也能撤回：这条路径只依赖命令节点的 seq，不再依赖插件对消息文本的匹配。收起动画在减少动态效果或页面隐藏时直接落到回退后的内容。`tests/rewind-cut.test.ts` 固定了上述规则、Reader 的接线和「流式 / 重绘 / 重连不误伤」；`tests/reader-official-users.test.ts` 仍覆盖座位与 easyrewrite 集成。

`dsh-easyrewrite@2.6.0` 在 `conversation.chat.node` 注册 `key: 'user', priority: -1` 的 `UserBubbleView`；撤回按钮是该组件内的 `data-dsh-easyrewrite="recall-key"`。chat 座位属性本身不会创建这个按钮，Reader 还需镜像此注册。它的快捷键使用 `data-chat-flow-kind="user"`，待定撤回的后续行隐藏使用 `data-chat-flow` 和 `data-chat-anchor-key`。

`tests/reader-official-users.test.ts` 在固定的 headless Chromium 中运行真实 Reader 与官方 registry/renderer，覆盖 user/steering 镜像、唯一气泡与锚点、session/turn 注入、替换、卸载、空 key 回退和 renderer 主动隐藏。可将已下载的 npm 包传入，额外验证 easyrewrite 的真实气泡、撤回按钮和点击后的确认胶囊：

```sh
DSH_EASYREWRITE_CLIENT=/path/to/package/lib/client.js \
  node --import tsx/esm --test tests/reader-official-users.test.ts
```

该 fixture 不执行撤回提交。完整验收仍需在独立测试会话中打开 Reader，确认每条 user 消息只有一个气泡与撤回按钮；点击撤回并确认后检查输入框回填、取消恢复、发送后的真实历史回退，再切换到原对话检查一致性。另需用 steering 消息和历史跳转检查补充消息与锚点。

## 第三方 assistant-step 替换渲染器

Reader 自己画 `assistant-step`。思考卡片、过程折叠、逐字动效和回答栏留在阅读页，所以官方 priority 0 的 `AssistantNodeView` 不会再挂进阅读座位。挂进去的话，正文会被官方组件整段换掉。

Keyed 槽位里 priority 更小的注册胜出。priority 小于 0 的 `assistant-step` 注册就是在替换官方渲染器。`dsh-raw-html-v2@0.8.0` 用 priority `-10` 注册 `VcpSlotGuard`，遍历 `node.data.blocks`，把 text 块切成 Markdown 和 `<div id="vcp-root">` 卡片。阅读页只镜像这种替换，座位仍是 `dsh-better-display.official.nodes/conversation.chat.node`。`tool-call`、`turn-tail`、`turn-process` 继续不镜像。

每个正文段单独交给胜出的替换渲染器。传过去的 node 保留原来的身份、`status` 和 `step`，`data.blocks` 只有这一段的正文块，并带 `groupPart: 'response'`，和宿主把思考与回答拆开的方式一致。思考段仍走阅读页的 `ReasoningCard`。折叠、吸顶、复制和回答外框也不交给替换渲染器。

没有这类注册时，`renderSlot` 的 fallback 仍是阅读页自己的 Markdown。替换渲染器返回 `null` 时不补画第二份正文。它卸下之后，下一次 reconcile 回到 Markdown。

这里不解析某一种卡片协议，也不改会话数据。原始 HTML、代码围栏和流式切段仍由那个插件自己的渲染器处理。阅读页保证的是：这个渲染器能在回答正文里运行。启用替换渲染器时，正文不再走阅读页的逐字动效；思考和折叠动效保持不变。替换渲染器若自己再画一份「已中断」，会和阅读页的「已停止」叠在一起，这是该渲染器的展示，不另做裁剪。

`tests/official-slots.test.ts` 锁定「priority 低于 0 才镜像，官方 priority 与 tool-call 不镜像」。`tests/fixtures/reader-official-users.tsx` 在真实 Reader 里渲染一条带思考和 `<div id="vcp-root">` 的 assistant-step：替换渲染器收到 `groupPart: 'response'` 和正文块，思考文本留在 `data-reader-text-kind="reasoning"`，回答栏里不再出现 Markdown 代码块。

## 后续仍需完成

Markdown 定制仍保留逐字动效和 MCP 展示钩子，官方公共组件还没有对应的注入接口。上下文行、部分过程展示和工具摘要也仍有自有实现。本分支先建立官方能力的完整运行路径，后续按视觉基线逐模块收敛这些副本，并拆分 Reader 的阅读策略与动画执行。不能据此承诺所有未来版本零维护。上面的 assistant-step 替换渲染器是已承诺的共存方式；除此之外不承诺任意第三方插件的视觉兼容。

已有客户端通过 HMR 更新时，无需新增 Host 或改写会话数据；应先核对实际安装来源、构建产物和同页行为。正式版本保留 Git 标签及发布包，便于按版本安装和回退。
