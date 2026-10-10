import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import type { TsdownPlugin, UserConfig } from 'tsdown';

const vendored = fileURLToPath(new URL('./tools/client-build.js', import.meta.url));

function resolveHarnessAdapter(): string {
  const configured = process.env.DSHX_HARNESS?.trim();
  if (configured) return join(resolve(configured), 'tools/dshx/src/client-build.js');
  const configPath = join(homedir(), '.config/dshx/harness');
  const recorded = existsSync(configPath) ? readFileSync(configPath, 'utf8').trim() : undefined;
  if (!recorded) {
    throw new Error('client rebuild requires a Harness root from DSHX_HARNESS or ~/.config/dshx/harness');
  }
  return join(resolve(recorded), 'tools/dshx/src/client-build.js');
}

const adapter = existsSync(vendored) ? vendored : resolveHarnessAdapter();
if (!existsSync(adapter)) throw new Error('externalClientBundle adapter is missing.');
const { externalClientBundle } = await import(pathToFileURL(adapter).href);

const bundle = externalClientBundle('dsh-better-display', ['src/dsh-better-display.ts'], {
  clientEntry: 'src/client/index.tsx',
}) as UserConfig[];

const portableOutput: TsdownPlugin = {
  name: 'dsh-better-display-portable-output',
  generateBundle(_options, output) {
    const client = output['client.js'];
    if (client?.type !== 'chunk') this.error('client.js was not emitted');
    client.code = client.code.replace(
      /^([ \t]*\/\/#region \\0dshx-css-module:).*[\\/]([^/\\\r\n]+\.module\.css\.mjs)(\r?)$/gmu,
      '$1$2$3',
    );
    if (/^.*\/\/#region \\0dshx-css-module:.*[\\/].*$/mu.test(client.code)) {
      this.error('client.js contains a non-portable CSS module path');
    }
  },
};

/**
 * Guard against the 0.3.7 regression class: the host entry must not ship a
 * relative specifier that cannot resolve inside the published tarball.
 *
 * The specific failure was `import ... from "./skill-roots.ts"` — a path to the
 * TypeScript source that is never emitted next to the entry, so the host died
 * with ERR_MODULE_NOT_FOUND on every start while the market still reported the
 * plugin as installed. A build-time assertion turns that silent publish-time
 * mistake into a red build.
 */
const hostPortableOutput: TsdownPlugin = {
  name: 'dsh-better-display-host-portable-output',
  generateBundle(_options, output) {
    for (const [fileName, chunk] of Object.entries(output)) {
      if (chunk.type !== 'chunk') continue;
      const offenders = [
        // Relative specifiers that still point at TS sources.
        ...chunk.code.matchAll(/from\s*["'](\.[^"']*\.ts)["']/g),
        // Relative specifiers reaching into node_modules-written shapes.
        ...chunk.code.matchAll(/from\s*["'](\.\.?\/[^"']*node_modules\/[^"']*)["']/g),
      ].map((match) => match[1]);
      if (offenders.length > 0) {
        this.error(
          `${fileName} contains relative specifiers that will not resolve in the published package: ` +
            `${[...new Set(offenders)].join(', ')}. Relative imports must be bundled, not externalised ` +
            `(see the neverBundle note above).`,
        );
      }
    }
  },
};

export default bundle.map((config) => {
  if (config.name === 'dsh-better-display') {
    const { external: _external, ...hostConfig } = config;
    return {
      ...hostConfig,
      plugins: [
        ...(Array.isArray(hostConfig.plugins)
          ? hostConfig.plugins
          : hostConfig.plugins === undefined
            ? []
            : [hostConfig.plugins]),
        hostPortableOutput,
      ],
      // NEVER re-introduce a resolved-id predicate here. tsdown may hand this
      // callback an already-resolved absolute path, in which case a
      // `!specifier.startsWith('.')` test is true for EVERY module and the
      // relative source imports get externalised instead of bundled — the
      // host entry then ships as `import ... from "./skill-roots.ts"`, which
      // no longer exists in the package (0.3.7 regression, ERR_MODULE_NOT_FOUND).
      // `true` keeps the documented semantics: bare npm specifiers stay
      // external "as written", relative imports keep being bundled.
      deps: { ...hostConfig.deps, neverBundle: true },
    };
  }
  if (config.name !== 'dsh-better-display/client') return config;
  const plugins = Array.isArray(config.plugins)
    ? config.plugins
    : config.plugins === undefined
      ? []
      : [config.plugins];
  return { ...config, plugins: [...plugins, portableOutput] };
});
