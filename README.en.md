# dsh-better-display

[中文](./README.md)

Adds a **阅读** tab to DeepSeek Harness. While a turn runs you see steps, thinking, and progress. After a successful turn those collapse and the final answer stays. Native Chat / Trajectory, the composer, model picker, tools, and approvals stay.

A ````mcp-app` fence in the final answer mounts as an interactive card in the reading view, inside `<iframe sandbox="allow-scripts allow-forms">` without `allow-same-origin`. The card can fill the next prompt via JSON-RPC. The skill pack is [`skills/generative-mcpapps/`](skills/generative-mcpapps/).

v0.2.0. Display only. It does not change Agent execution, the SDK, or credentials. Node.js `^22.19.0 || >=24`.

## Install

Needs a working DeepSeek Harness and [dshx](https://github.com/aa2246740/dsh-external-plugin-devkit).

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

First install does not restart DSH. Reload the Web page and pick 阅读. New sessions default to reading.

To update:

```sh
git pull
DSHX_HARNESS="$DSHX_HARNESS" npm run build
```

Then reload the browser.

## Develop

```sh
npm test
npm run typecheck
DSHX_HARNESS=/absolute/path/to/deepseek-harness npm run build
```

## License

Display and Markdown pieces come from DeepSeek Harness (MIT). Motion is based on [Transitions.dev](https://transitions.dev/). This repo is [MIT](LICENSE).
