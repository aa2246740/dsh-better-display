# dsh-better-display

[![npm version](https://img.shields.io/npm/v/dsh-better-display)](https://www.npmjs.com/package/dsh-better-display)

[中文](./README.md)

## Install / Update

### Install on DeepSeek Harness web or desktop

Fill `dsh-better-display` in the **Add plugin** wizard's search box, and click **Install**:

![Add plugin wizard](https://raw.githubusercontent.com/aa2246740/dsh-better-display/main/docs/add-plugin-wizard.png)

### Install with `dsh` cli

Install [`dsh-better-display`](https://www.npmjs.com/package/dsh-better-display) plugin from [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh):

```sh
dsh plugin --profile web add dsh-better-display
```

Or update the `dsh-better-display` plugin:

```sh
dsh plugin --profile web update dsh-better-display@latest
```

Then start the web UI with `dsh web`. No build step, no restart.

This official CLI command writes only the `web` profile; it cannot modify the Desktop App profile — use the in-app **Add plugin** wizard above for desktop. This release includes built `lib/`; normal use needs no clone, build, or DSHX installation.

Adds a **阅读** tab to DeepSeek Harness. While a turn runs you see steps, thinking, and progress. After a successful turn those collapse and the final answer stays. Native Chat / Trajectory, the composer, model picker, tools, and approvals stay. The reading column keeps ChatView's `data-chat-flow` hook so third-party skins that gate the composer on that mark still treat Reader as an interactive conversation.

A ````mcp-app` fence in the final answer mounts as an interactive card in the reading view, inside `<iframe sandbox="allow-scripts allow-forms">` without `allow-same-origin`. The card can fill the next prompt via JSON-RPC. The skill pack is [`skills/generative-mcpapps/`](skills/generative-mcpapps/). Settings → **Better Display** can preview deliverables in the right Sidebar (system app remains the default), turn on translucent frosted glass (off by default), toggle process auto-folding (On is the default), and reports whether that skill is installed in a harness skill root.

Targets DeepSeek Harness **0.2.0-rc.2** (`dsh-v0.2.0-rc.2`). Display only. It does not change Agent execution, the SDK, or credentials. Node.js `^22.19.0 || >=24`. New sessions default to reading. The `@deepseek-ai/dsh-*` peer range is `>=0.2.0-rc.1 <0.2.1`: it accepts `0.2.0-rc.2` and stable `0.2.0`, rejects `0.2.0` alphas, and rejects `0.1.7-rc.2`.

**0.3.0** keeps the existing reading layout, folding, and motion while using official feedback, tool details, file cards, and file links. It also fixes process content staying expanded after auto-folding is re-enabled. See the [official integration notes](docs/official-rendering-bridge.md) for coverage and upgrade checks.

### Advanced installs

Pin to a GitHub tag:

```sh
dsh plugin --profile web add github:aa2246740/dsh-better-display#v0.3.4
```

From a local checkout or tarball (development/local testing):

```sh
dsh plugin --profile web add ./dsh-better-display
dsh plugin --profile web add ./dsh-better-display-0.3.4.tgz
```

`dsh.bundle` is captured at Host boot. Do not also insert the same row by hand in the profile `cordis.patch.yml`, or it will mount twice.

```sh
dsh plugin --profile web remove dsh-better-display
```

## Develop

```sh
npm test
npm run typecheck
```

## License

Display and Markdown pieces come from DeepSeek Harness (MIT). Motion is based on [Transitions.dev](https://transitions.dev/). This repo is [MIT](LICENSE).
