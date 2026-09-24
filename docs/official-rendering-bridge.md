# 官方能力接入说明

`0.3.0` 在 `v0.2.1` 的阅读布局上接入官方内容和控件，经过试用验收后发布。当前验收目标是 Harness `0.1.7-rc.1`。`conversation.chat.turnTail` 在这一版是 `list`，不再是 `chain`。后续仍需维护的自有展示逻辑和升级边界见下文。

## 一个具体例子

一条回答的持久化 `messageId` 进入 `OfficialActions`，随后进入 Reader 自己的回答操作插槽。里面的反馈组件、状态注入和弹窗控制器来自当前已加载的官方反馈插件。点击按钮后，由官方控制器打开原来的官方弹窗；Reader 不实现反馈请求、类别或状态管理。

工具详情同理：传递 `callId`、原始 `block`、工作目录、Host home、图片加载器、带行号的文件打开操作和轨迹入口，再由官方工具组件呈现。原来只取函数组件、手工传四个参数并模拟点击展开的路径已经移除。

## 代码归属

| 模块 | 负责什么 |
| --- | --- |
| `official-slots.tsx` | 用公开注册表 API 将官方注册信息映射到 Reader 的独立插槽；保留注入、locale、store、selector 和子插槽。监听贡献增删，逐条挂载和释放。 |
| `OfficialContent.tsx` | 将回答身份、工具、节点和产物上下文传给官方控件。这里只组合，不处理业务请求。 |
| `Reader.tsx`、`ToolActivity.tsx` | 原有阅读布局、过程组织、摘要和交互。工具详情里的控件采用官方形式。 |
| `platform-media.ts` | RC2 的本地媒体 URL 约定；读取授权仍由 Host 文件 API 负责。 |
| `compat/harness-rc2.json` | 已验收的官方接口、被自有展示覆盖的实现和注册清单基线。 |

## 为什么有插槽映射

RC2 的一个子插槽只能有一个声明者，只有声明它的组件能获得相应 `renderSlot` 权限。Reader 不能把官方插槽再声明一次，也不能从 `ctx.slots` 任意渲染子插槽。

本适配用 `spec`、`entriesOfSlot`、`register`、`inject`、`subscribe` 建立 Reader 自己的名字空间，交给同一个官方渲染器运行。组件声明的子插槽名称在一层薄包装中转换，其余属性原样传递。没有私有源码导入，没有修改官方注册对象或官方 DOM，没有复制官方渲染器。现有控件保持组件和注入身份；增加别的控件不会重挂它们。

这仍是 RC2 的受限适配方案。若官方将来提供可直接组合的共享渲染入口，应优先替换这层映射。

## 这版覆盖的能力

| 能力 | 处理方式 |
| --- | --- |
| 回答操作、反馈 | 官方 `conversation.chat.assistant-actions`，使用持久化 messageId；中断的临时片段不伪造身份。 |
| 工具详情 | 官方 `tool.call.toolview`，包括 memo、注入状态、翻译和递归子插槽；未注册的工具保留原有结果预览。 |
| 显式 `present` 产物 | 官方 turnTail 中的文件卡片和菜单，保留官方状态和打开操作。 |
| 已修改文件快捷操作 | 保持原 Reader 的复制、定位和打开模式；仅从 Reader 的官方 tail 展示参数中排除重复的 produced chips，不改变官方源数据。未知匹配结构原样呈现。 |
| 文件行号和正文文件链接 | 保留工具传来的行号；正文优先采用官方 file-mention 服务，现有路径匹配作为补充。 |
| 本地 Markdown 图片 | 和 RC2 相同的同源文件 API，加载失败保留替代文本，危险协议不直接渲染。 |
| 命令、新节点类型 | 接入官方节点渲染及其子插槽；无可用渲染器时保留记录并提供“在对话中查看”。 |

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

## 后续仍需完成

Markdown 定制仍保留逐字动效和 MCP 展示钩子，官方公共组件还没有对应的注入接口。上下文行、部分过程展示和工具摘要也仍有自有实现。本分支先建立官方能力的完整运行路径，后续按视觉基线逐模块收敛这些副本，并拆分 Reader 的阅读策略与动画执行。不能据此承诺所有未来版本零维护，也不承诺任意第三方插件兼容。

已有客户端通过 HMR 更新时，无需新增 Host 或改写会话数据；应先核对实际安装来源、构建产物和同页行为。正式版本保留 Git 标签及发布包，便于按版本安装和回退。
