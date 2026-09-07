# dsh-better-display

[English](./README.en.md)

给 DeepSeek Harness 加一个 **阅读** 页签：执行时能看到步骤、思考和进度；整轮成功结束后把过程收起来，留下最终回答。原版「对话 / 轨迹」、输入框、模型选择、工具和审批都还在。

最终回答里的 ````mcp-app` 代码块会在阅读视图里挂成交互卡片，跑在 `<iframe sandbox="allow-scripts allow-forms">` 里，没有 `allow-same-origin`。卡片可以通过 JSON-RPC 把下一轮 prompt 填进输入框。技能包在 [`skills/generative-mcpapps/`](skills/generative-mcpapps/)。

v0.2.0。只改展示，不改 Agent 执行、SDK 或模型凭据。Node.js `^22.19.0 || >=24`。

## 安装

需要能用的 DeepSeek Harness 和 [dshx](https://github.com/aa2246740/dsh-external-plugin-devkit)。

```sh
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

首次安装不用重启 DSH。刷新或重开 Web 页面后选「阅读」。新会话默认进阅读。

更新已有安装：

```sh
git pull
DSHX_HARNESS="$DSHX_HARNESS" npm run build
```

然后刷新浏览器。

## 开发

```sh
npm test
npm run typecheck
DSHX_HARNESS=/absolute/path/to/deepseek-harness npm run build
```

## 许可

展示与 Markdown 部分来自 DeepSeek Harness（MIT）。动效参考 [Transitions.dev](https://transitions.dev/)。本仓库代码 [MIT](LICENSE)。
