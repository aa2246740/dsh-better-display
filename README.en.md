# dsh-better-display

[中文](./README.md)

```sh
dsh plugin --profile web add github:aa2246740/dsh-better-display
```

You need official `dsh` (or `npx @deepseek-ai/dsh`) and **pnpm** on PATH. `dsh plugin add` runs pnpm in `$DSH_HOME/profiles/web`. This repo commits built `lib/`, so a git install does not need `prepare` or a profile `allowBuilds` entry.

Then restart that Host and reload the page. `dsh plugin add` writes the profile. It does not hot-load a running process.

Adds a **阅读** tab to DeepSeek Harness. While a turn runs you see steps, thinking, and progress. After a successful turn those collapse and the final answer stays. Native Chat / Trajectory, the composer, model picker, tools, and approvals stay.

A ````mcp-app` fence in the final answer mounts as an interactive card in the reading view, inside `<iframe sandbox="allow-scripts allow-forms">` without `allow-same-origin`. The card can fill the next prompt via JSON-RPC. The skill pack is [`skills/generative-mcpapps/`](skills/generative-mcpapps/).

Targets DeepSeek Harness **0.1.5-rc.2**. Display only. It does not change Agent execution, the SDK, or credentials. Node.js `^22.19.0 || >=24`. New sessions default to reading.

From a local checkout or tarball:

```sh
dsh plugin --profile web add ./dsh-better-display
dsh plugin --profile web add ./dsh-better-display-0.1.0.tgz
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
