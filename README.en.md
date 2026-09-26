# dsh-better-display

[中文](./README.md)

## Install

### DSH Studio desktop app (recommended)

Open **Settings → Plugins → Add plugin** and enter this in “Package name or address”:

```text
github:aa2246740/dsh-better-display#v0.3.3
```

The desktop plugin manager owns the Desktop profile and its bundled package manager. This release includes built `lib/`; normal use needs no clone, build, or DSHX installation. Follow the app if it asks you to reload or reopen after installation.

### Web CLI

```sh
dsh plugin --profile web add github:aa2246740/dsh-better-display#v0.3.3
```

This official CLI command writes only the `web` profile; it cannot modify the Desktop App profile. For an already-running Web Host, reopen that Host once and reload the page because bundles are read at boot.

Adds a **阅读** tab to DeepSeek Harness. While a turn runs you see steps, thinking, and progress. After a successful turn those collapse and the final answer stays. Native Chat / Trajectory, the composer, model picker, tools, and approvals stay. The reading column keeps ChatView's `data-chat-flow` hook so third-party skins that gate the composer on that mark still treat Reader as an interactive conversation.

A ````mcp-app` fence in the final answer mounts as an interactive card in the reading view, inside `<iframe sandbox="allow-scripts allow-forms">` without `allow-same-origin`. The card can fill the next prompt via JSON-RPC. The skill pack is [`skills/generative-mcpapps/`](skills/generative-mcpapps/). Settings → **Better Display** can preview deliverables in the right Sidebar (system app remains the default), turn on translucent frosted glass (off by default), toggle process auto-folding (On is the default), and reports whether that skill is installed in a harness skill root.

Targets DeepSeek Harness **0.1.7-rc.2**. Display only. It does not change Agent execution, the SDK, or credentials. Node.js `^22.19.0 || >=24`. New sessions default to reading.

**0.3.0** keeps the existing reading layout, folding, and motion while using official feedback, tool details, file cards, and file links. It also fixes process content staying expanded after auto-folding is re-enabled. See the [official integration notes](docs/official-rendering-bridge.md) for coverage and upgrade checks.

From a local checkout or tarball (development/local testing):

```sh
dsh plugin --profile web add ./dsh-better-display
dsh plugin --profile web add ./dsh-better-display-0.3.3.tgz
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
