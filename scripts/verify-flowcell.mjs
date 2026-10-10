/** Actual FlowCell browser regression. Use --baseline for the v0.3.4 A/B reproduction. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
const { launchPinnedChromium } = await import(pathToFileURL(join(homedir(), '.codex/playwright-runtime/runtime.mjs')).href);

const root = resolve(import.meta.dirname, '..');
const out = join(root, '.evidence/flowcell');
const require = createRequire(join(root, 'package.json'));
const harness = process.env.DSHX_HARNESS;
if (!harness) throw new Error('Set DSHX_HARNESS to the target checkout.');
const webRequire = createRequire(join(harness, 'packages/client/web/package.json'));
const variants = process.argv.includes('--baseline') ? ['baseline', 'fixed'] : ['fixed'];
const { build } = await import(pathToFileURL(createRequire(require.resolve('tsx')).resolve('esbuild')).href);
await mkdir(out, { recursive: true });
const fixture = `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ReviewFlowCell} from './src/client/ChoreographedFlow.tsx';
function Demo(){
  const [config,setConfig]=useState({hidden:true,instant:false,motion:true,height:160});
  window.review={set:patch=>setConfig(previous=>({...previous,...patch}))};
  return <ReviewFlowCell {...config} rowKey="probe"><div data-review-content style={{height:config.height,background:'#dae7f5'}}>FlowCell content</div></ReviewFlowCell>;
}
createRoot(document.getElementById('app')).render(<Demo/>);`;
for (const variant of variants) {
  const source = variant === 'baseline'
    ? execFileSync('git', ['show', 'v0.3.4:src/client/ChoreographedFlow.tsx'], { cwd: root, encoding: 'utf8' })
    : await readFile(join(root, 'src/client/ChoreographedFlow.tsx'), 'utf8');
  await build({
    stdin: { contents: fixture, resolveDir: root, loader: 'tsx' },
    outfile: join(out, `${variant}.js`), bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: { react: dirname(require.resolve('react/package.json')), 'react-dom': dirname(webRequire.resolve('react-dom/package.json')) },
    loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl' },
    plugins: [{ name: 'expose-exact-flowcell-for-regression', setup(builder) {
      builder.onLoad({ filter: /ChoreographedFlow\.tsx$/ }, () => ({ contents: source + '\nexport {FlowCell as ReviewFlowCell};', loader: 'tsx', resolveDir: join(root, 'src/client') }));
    }}],
  });
}
const server = createServer(async (req, res) => {
  const match = /^\/(baseline|fixed)\.(js|css)$/.exec(req.url);
  if (match) {res.setHeader('Content-Type', match[2] === 'js' ? 'text/javascript' : 'text/css');res.end(await readFile(join(out, match[0].slice(1))));return;}
  const variant = req.url === '/baseline' ? 'baseline' : 'fixed';
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/${variant}.css"><style>body{margin:24px;font:16px system-ui}#app{width:600px}</style><div id="app"></div><script type="module" src="/${variant}.js"></script>`);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await launchPinnedChromium();
const results = [];
try {
  for (const variant of variants) {
    const page = await browser.newPage({viewport:{width:800,height:650}});
    const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/${variant}`);
    await page.waitForFunction(()=>!!window.review);
    const set = async patch => {await page.evaluate(patch=>window.review.set(patch),patch);await page.waitForTimeout(600);};
    const probe = () => page.locator('[data-flow-key="probe"]').evaluate(el=>({height:el.getBoundingClientRect().height,inner:el.firstElementChild?.getBoundingClientRect().height??0,animations:el.getAnimations().length,hidden:el.hidden}));
    const checkpoints=[];
    await set({hidden:false}); checkpoints.push({step:'expand',...await probe()});
    await set({height:40}); checkpoints.push({step:'content-shrink',...await probe()});
    await page.screenshot({path:join(out,`${variant}-shrink.png`)});
    await set({height:300}); checkpoints.push({step:'content-grow',...await probe()});
    await set({hidden:true}); checkpoints.push({step:'collapse',...await probe()});
    for(let i=0;i<3;i++){await set({hidden:false});checkpoints.push({step:`expand-cycle-${i+1}`,...await probe()});await set({hidden:true});checkpoints.push({step:`collapse-cycle-${i+1}`,...await probe()});}
    await set({hidden:false});await set({instant:true,hidden:true});checkpoints.push({step:'instant-collapse',...await probe()});
    await set({instant:false,motion:false,hidden:false});await set({height:80});checkpoints.push({step:'motion-disabled',...await probe()});
    await set({motion:true,hidden:true});
    await page.evaluate(()=>{window.review.set({hidden:false});setTimeout(()=>window.review.set({hidden:true}),40);setTimeout(()=>window.review.set({hidden:false}),80);});
    await page.waitForTimeout(800);checkpoints.push({step:'rapid-reversal',...await probe()});
    assert.deepEqual(errors,[]);
    if(variant==='baseline'){
      const shrunk=checkpoints.find(x=>x.step==='content-shrink');
      assert.ok(shrunk.animations>0&&shrunk.height-shrunk.inner>100,'Baseline must reproduce stale fill and blank region');
    }else{
      for(const x of checkpoints){assert.equal(x.animations,0,`${x.step}: animation retained`);assert.ok(Math.abs(x.height-x.inner)<1,`${x.step}: incorrect geometry ${JSON.stringify(x)}`);}
    }
    results.push({variant,checkpoints,errors});await page.close();
  }
  const result={passed:true,baseline:variants.includes('baseline')?'v0.3.4':null,scope:'Actual FlowCell component, synthetic content; isolated pinned Chromium',results};
  await writeFile(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(done=>server.close(done));}
