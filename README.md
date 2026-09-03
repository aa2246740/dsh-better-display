# dsh-better-display

[English](./README.en.md) | [中文](./README.md)

让 DeepSeek Harness 的长任务更好读，同时赋予 AI 模型动态呈现交互式 Web 应用的能力。

执行时看得到原生步骤、思考和进度；完成后把过程收起来，留下最终回答与活体交互卡片。独立的 **「阅读」** 页签，保留原版「对话 / 轨迹」、输入框、模型选择、工具和审批。

**v0.2.0 · 非官方 DSH 展示与交互增强插件。只改展示与交互视图，不改 Agent 核心执行逻辑、SDK 或模型凭据。**

---

## 🌟 核心特性

### 1. 原生支持生成式 MCP Apps（SEP-1865 协议）
无需侵入 DSH 核心 MCP 客户端，任何模型只要在最终回答中输出 ````mcp-app` 代码块，阅读视图就会自动将其挂载为活体交互组件：
- **场景丰富**：动态决策向导、方案双盲评测、实时天气看板、交互式敏捷看板、多变量计算器、可视化图表等；
- **自包含与免安装**：HTML/CSS/JS 全自包含，零外部网络强依赖；
- **沙箱隔离安全**：严格在 `<iframe sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer">` 中运行，严禁 `allow-same-origin`，彻底隔绝 DSH 宿主 Cookie、Token 与 DOM，确保环境绝对安全；
- **双向通信闭环**：基于标准 JSON-RPC 2.0 协议，用户在卡片内点击选择后，卡片自动生成通顺自然的中文 Prompt 并通过 React 18 原生 Setter **即刻填入输入框**，用户直接回车即可推进下一轮会话！

### 2. 极致自适应（深浅色 + 动态高度）
- **深浅色自适应联动**：内置 DOM 变动与媒体查询监听，DSH 界面切换浅色/深色或系统外观切换时，卡片及内部组件瞬间无感换肤，首帧零闪烁；
- **像素级无白边测高**：基于真实元素底沿包围盒测算算法结合 `ResizeObserver`，容器高度（60px - 2400px）随着内容增减实时平滑伸缩，彻底杜绝内层双重滚动条与多余空白。

### 3. 克制优雅的阅读体验
- **长思考跟随**：原生思考过程折叠进淡出卡片，平滑跟随两行，展开后滚屏暂停，点击恢复；
- **过程自动收起**：成功结束整轮任务才收起思考与中间日志，将宝贵阅读空间完全留给最终结论与交互卡片；
- **无损保留**：原生 Markdown、代码块高亮、数学公式、表格、图片及工具执行事实 100% 忠实呈现。

---

## 🎁 附赠资源：MCP Apps 提示词与开发技能包

本仓库附赠了一套开箱即用的 AI 智能体技能包，位于 [`skills/generative-mcpapps/`](skills/generative-mcpapps/)：
- **`SKILL.md`**：指导模型在合适的业务场景下自动生成自包含、高质量的 MCP App；
- **`references/sep1865_protocol.md`**：SEP-1865 双向通信握手与事件协议详解；
- **`references/html_boilerplate.md`**：开箱即用的深浅色主题 Tokens 模板；
- **`examples/interactive_quiz.html`**：双盲评测交互范例。

可以将该目录复制到你日常使用的 Agent Skill 目录中使用。

---

## 快速上手：如何输出一个 MCP App

任何模型在回答时，只需像写普通 Markdown 代码块一样包裹 HTML 即可：

````markdown
这里是为您生成的实时看板，请直接交互：

```mcp-app title="项目研发看板"
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>项目研发看板</title>
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
    <h3>任务 1</h3>
    <button onclick="submitChoice('A')">确认完成</button>
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

在「阅读」视图下，上述代码块将直接以原生交互卡片呈现。

---

## 安装与激活

需要已安装、可正常工作的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 和 [DSHX External](https://github.com/aa2246740/dsh-external-plugin-devkit)。

Node.js 需要 `^22.19.0 || >=24`。

```sh
# 替换为你的实际目录和正在运行的 Web 端口
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

首次安装不需要重启 DSH；**刷新或重新打开 Web 页面**后选择「阅读」即可。新会话默认进入阅读。

### 更新已有安装

对于已安装用户，更新只需拉取最新代码并构建：
```sh
git pull
DSHX_HARNESS="$DSHX_HARNESS" npm run build
```
刷新浏览器页面即可享受最新的 MCP Apps 交互体验，无需重启 DSH 服务端。

---

## 开发与验证

```sh
npm test
npm run typecheck
DSHX_HARNESS=/absolute/path/to/deepseek-harness npm run build
```

49 项单元测试覆盖消息投影、Markdown 管道、SEP-1865 协议解析、自适应高度预算、React 18 输入状态同步与思考流式两行跟随。

---

## 致谢与许可

- 原生展示与 Markdown 部分来自 DeepSeek Harness（MIT）。
- 动效设计参考 Jakub Antalik 的 [Transitions.dev](https://transitions.dev/)。
- 本项目原创代码采用 [MIT 许可证](LICENSE)。
