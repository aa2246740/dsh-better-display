# dsh-better-display

[中文](./README.md)

## Install

### DSH Studio desktop app (recommended)

Open **Settings → Plugins → Add plugin** and enter this in “Package name or address”:

```text
github:aa2246740/dsh-better-display#v0.3.12
```

The desktop plugin manager owns the Desktop profile and its bundled package manager. `v0.3.12` is the latest tagged install target and targets Harness `0.2.1-rc.5`. The Host checks `engines.dsh` with prereleases included, so it also installs on 0.2.2 RCs, but tool-result images fail to load there. Harness 0.2.2 support is in 0.4.0, which is not tagged yet; until then, install from a local checkout on 0.2.2 as shown below. This tag includes built `lib/`; normal use needs no clone, build, or DSHX installation. Follow the app if it asks you to reload or reopen after installation.

### Web CLI

```sh
dsh plugin --profile web add github:aa2246740/dsh-better-display#v0.3.12
```

This official CLI command writes only the `web` profile; it cannot modify the Desktop App profile. **pnpm** must be on PATH. For an already-running Web Host, reopen that Host once and reload the page because bundles are read at boot.

Adds a **阅读** tab to DeepSeek Harness. While a turn runs you see steps, thinking, and progress. After a successful turn those collapse and the final answer stays. Native Chat / Trajectory, the composer, model picker, tools, and approvals stay. The reading column keeps ChatView's `data-chat-flow` hook so third-party skins that gate the composer on that mark still treat Reader as an interactive conversation. When another plugin replaces `assistant-step` at a priority below the official renderer (for example `dsh-raw-html-v2` drawing `<div id="vcp-root">` cards), Reader gives it the answer body and keeps reasoning, folding, and process motion. See the [official integration notes](docs/official-rendering-bridge.md).

Another plugin can rewrite reasoning and answer text for display only, for example to translate them. The reader still owns the reveal, follow-scroll, and fold. Copy uses the original text, and the session record is unchanged. The contract and a minimal plugin are in [extension points](docs/extension-points.md).

A ````mcp-app` fence in the final answer mounts as an interactive card in the reading view, inside `<iframe sandbox="allow-scripts allow-forms">` without `allow-same-origin`. The card can fill the next prompt via JSON-RPC. The skill pack is [`skills/generative-mcpapps/`](skills/generative-mcpapps/). Settings → **Better Display** can preview deliverables in the right Sidebar (system app remains the default), turn on translucent frosted glass (off by default), toggle process auto-folding (On is the default), and reports whether that skill is installed in a harness skill root.

Targets DeepSeek Harness **0.2.2-rc.5** (`dsh-v0.2.2-rc.5`, `9c2670d3bce5275e0d1610272958121af87787bb`) and keeps supporting the 0.2.1 line. Display only. It does not change Agent execution, the SDK, or credentials. Node.js `^22.19.0 || >=24`. New sessions default to reading. The `@deepseek-ai/dsh-*` peer range and `engines.dsh` are `>=0.2.1-rc.1 <0.2.2-0 || >=0.2.2-rc.5 <0.2.3-0`: they accept the 0.2.1 line from `0.2.1-rc.1` (stable `0.2.1` included) and the 0.2.2 line from `0.2.2-rc.5` (stable `0.2.2` included), and reject the untested `0.2.2-rc.1`–`rc.4`, `0.2.3` and its prereleases, `0.2.1` alphas, and the `0.2.0` series. Differences between the two lines, such as the `session.readAttachment` argument, are handled at runtime. Every peer is marked optional in `peerDependenciesMeta`, so the host packages do not have to resolve from the plugin's install directory (they do not on the asar Desktop build). `engines.dsh` is the version gate, and npm and pnpm still check a peer's range when it is present.

**0.3.0** keeps the existing reading layout, folding, and motion while using official feedback, tool details, file cards, and file links. It also fixes process content staying expanded after auto-folding is re-enabled. See the [official integration notes](docs/official-rendering-bridge.md) for coverage and upgrade checks.

From a local checkout or tarball (development/local testing):

```sh
dsh plugin --profile web add ./dsh-better-display
dsh plugin --profile web add ./dsh-better-display-0.4.0.tgz
```

`dsh.bundle` is captured at Host boot. Do not also insert the same row by hand in the profile `cordis.patch.yml`, or it will mount twice.

```sh
dsh plugin --profile web remove dsh-better-display
```

## Develop

From a clean clone:

```sh
npm ci
npm run build
npm test
npm run typecheck
```

The harness compat check inside `npm run build` needs ripgrep and a Harness checkout. Optional environment variables are listed in `.env.example` and [AGENTS.md](AGENTS.md). The interactive reading-view path, a blank reader, a missing stylesheet, and a stuck fold are in [docs/runbooks/blank-reader.md](docs/runbooks/blank-reader.md).

## License

Display and Markdown pieces come from DeepSeek Harness (MIT). Motion is based on [Transitions.dev](https://transitions.dev/). This repo is [MIT](LICENSE).
