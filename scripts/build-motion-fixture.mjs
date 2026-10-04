import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const deps = createRequire(require.resolve('tsdown'));
const { rolldown } = await import(pathToFileURL(deps.resolve('rolldown')).href);
const { transform } = deps('lightningcss');
const build = await rolldown({ input: process.argv[2] ?? 'tests/browser-motion.tsx', platform: 'browser', transform: { jsx: { runtime: 'automatic' }, define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, plugins: [{
  name: 'fixture-css',
  resolveId(source, importer) { if (source.endsWith('.module.css')) return resolve(importer ? resolve(importer,'..') : '.',source) + '.mjs'; },
  async load(id) {
    if (!id.endsWith('.module.css.mjs')) return;
    const path = id.slice(0, -4);
    const {code,exports} = transform({filename:path,code:await readFile(path),cssModules:{pattern:'[hash]_[local]'}});
    const map=Object.fromEntries(Object.entries(exports).map(([key,value])=>[key,value.name]));
    return `const style=document.createElement('style');style.textContent=${JSON.stringify(code.toString())};document.head.append(style);export default ${JSON.stringify(map)};`;
  },
}, {
  name: 'fixture-plain-css',
  async resolveId(source, importer) {
    if (!source.endsWith('.css') || source.endsWith('.module.css')) return null;
    const resolved = await this.resolve(source, importer, { skipSelf: true });
    return resolved ? resolved.id + '.mjs' : null;
  },
  async load(id) {
    if (!id.endsWith('.css.mjs') || id.endsWith('.module.css.mjs')) return;
    const text = await readFile(id.slice(0, -4), 'utf8');
    return `const style=document.createElement('style');style.textContent=${JSON.stringify(text)};document.head.append(style);export default {};`;
  },
}] });
await mkdir('.delivery',{recursive:true});
const result = await build.generate({ format:'iife', name:'ReaderMotionFixture' });
const js=result.output.find(x=>x.type==='chunk').code;
await writeFile('.delivery/motion-fixture.js',js);
await writeFile('.delivery/motion-fixture.html',`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reader transition verification</title><style>body{margin:0;font:16px/1.75 system-ui;background:#fff;color:#242424;--dsw-alias-label-primary:#242424;--dsw-alias-label-secondary:#666;--dsw-alias-label-tertiary:#888;--dsw-alias-bg-base:#fff;--dsw-alias-bg-module-platform:#f6f7f8;--dsw-alias-border-l2:#dedede}button{cursor:pointer}</style><div id="app"></div><script>${js.replaceAll('</script','<\\/script')}</script>`);
await build.close();
console.log('Built .delivery/motion-fixture.html using actual plugin components');
