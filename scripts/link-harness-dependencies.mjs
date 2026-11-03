import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const root = resolve(process.argv[2] || process.env.DSH_REPO || '');
if (!root || !existsSync(join(root, 'tools/dshx/src/client-build.js'))) throw new Error('Pass a prepared Harness checkout, or set DSH_REPO.');
const local = resolve('node_modules');
mkdirSync(local, { recursive: true });
const shared = {
  '@deepseek-ai/cordis': 'vendor/cordis',
  '@deepseek-ai/dsh-api-remotes': 'packages/api/remotes',
  '@deepseek-ai/dsh-api-session-controller': 'packages/api/session-controller',
  '@deepseek-ai/dsh-client-connection': 'packages/client/connection',
  '@deepseek-ai/dsh-session-turn-outline': 'packages/session/session-turn-outline',
  '@deepseek-ai/dsh-client-store': 'packages/client/store',
  '@deepseek-ai/dsh-client-ui-chat': 'packages/client/ui-chat',
  '@deepseek-ai/dsh-client-ui-conversation': 'packages/client/ui-conversation',
  '@deepseek-ai/dsh-client-ui-primitives': 'packages/client/ui-primitives',
  '@deepseek-ai/dsh-client-ui-renderer': 'packages/client/ui-renderer',
  '@deepseek-ai/dsh-client-ui-session': 'packages/client/ui-session',
  '@deepseek-ai/dsh-client-ui-slots': 'packages/client/ui-slots',
  '@deepseek-ai/dsh-client-ui-tool': 'packages/client/ui-tool',
  '@deepseek-ai/dsh-attachment': 'packages/attachment/attachment',
  '@deepseek-ai/dsh-session': 'packages/core/session',
  '@deepseek-ai/dsh-util-workspace-path': 'packages/util/workspace-path',
};
function link(name, target, replace = false) {
  if (!existsSync(target)) throw new Error(`Missing Harness dependency target: ${name} (${target})`);
  const destination = join(local, name);
  mkdirSync(dirname(destination), { recursive: true });
  const stat = lstatSync(destination, { throwIfNoEntry: false });
  if (stat) {
    if (!replace && !stat.isSymbolicLink() && existsSync(destination)) return;
    if (existsSync(destination) && realpathSync(destination) === realpathSync(target)) return;
    rmSync(destination, { recursive: true, force: true });
  }
  symlinkSync(target, destination);
}
function packageDir(resolver, name) {
  try { return dirname(resolver.resolve(`${name}/package.json`)); }
  catch { /* pnpm may leave the package only in the store. */ }
  const store = join(root, 'node_modules/.pnpm');
  const prefix = name.startsWith('@') ? `${name.slice(1).replace('/', '+')}@` : `${name}@`;
  const scoped = name.startsWith('@');
  const match = existsSync(store) ? readdirSync(store).find(entry => entry.startsWith(prefix) || (scoped && entry.startsWith(name.replace('/', '+') + '@'))) : undefined;
  if (!match) throw new Error(`Missing Harness dependency: ${name}`);
  const nested = join(store, match, 'node_modules', name);
  if (!existsSync(join(nested, 'package.json'))) throw new Error(`Missing Harness dependency: ${name} (${nested})`);
  return nested;
}
function declaredTypesExist(pkgDir) {
  const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const types = typeof manifest.types === 'string'
    ? manifest.types
    : manifest.exports?.['.']?.types;
  return typeof types !== 'string' || existsSync(join(pkgDir, types));
}
function builtPackage(name) {
  const runtime = process.env.DSH_RUNTIME || join(dirname(root), 'runtime-rc5');
  const store = join(runtime, 'node_modules/.pnpm');
  if (!existsSync(store)) return undefined;
  const slug = `${name.replace('/', '+')}@`;
  const match = readdirSync(store).find(entry => entry.startsWith(slug));
  if (!match) return undefined;
  const pkgDir = join(store, match, 'node_modules', name);
  return existsSync(join(pkgDir, 'package.json')) && declaredTypesExist(pkgDir) ? pkgDir : undefined;
}
for (const [name, path] of Object.entries(shared)) {
  const source = join(root, path);
  const target = (name === '@deepseek-ai/cordis' || !declaredTypesExist(source)) ? (builtPackage(name) ?? source) : source;
  link(name, target, true);
}
const require = createRequire(join(root, 'packages/client/ui-conversation/package.json'));
const rootRequire = createRequire(join(root, 'package.json'));
for (const name of ['react', '@types/react']) link(name, packageDir(require, name));
for (const name of ['@types/node', 'typescript', 'tsdown', 'tsx']) link(name, packageDir(rootRequire, name));
for (const name of ['@types/mdast', 'clsx', 'katex', 'mdast-util-from-markdown', 'mdast-util-gfm', 'mdast-util-math', 'micromark-core-commonmark', 'micromark-extension-gfm', 'micromark-extension-math', 'micromark-factory-space', 'micromark-util-character', 'micromark-util-classify-character', 'micromark-util-sanitize-uri', 'micromark-util-symbol', 'micromark-util-types']) {
  const target = join(root, 'packages/client/ui-primitives/node_modules', name);
  if (!existsSync(target)) continue;
  link(name, target);
}
mkdirSync(join(local, '.bin'), { recursive: true });
for (const name of ['typescript', 'tsdown']) {
  const pkg = JSON.parse(readFileSync(join(local, name, 'package.json'), 'utf8'));
  const bins = typeof pkg.bin === 'string' ? { [name]: pkg.bin } : pkg.bin;
  for (const [command, path] of Object.entries(bins)) {
    const target = join(local, '.bin', command);
    if (!existsSync(target)) symlinkSync(join(local, name, path), target);
  }
}
console.log('Development dependencies linked to the selected Harness; no package download or Harness mutation.');
