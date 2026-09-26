/** Offline pixel regression for the shipped tool-summary CSS; no Host or model. */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const bundle = resolve(process.argv[2] ?? join(root, 'lib/client.js'));
const out = join(root, '.evidence/tool-shimmer');
await mkdir(out, { recursive: true });
const js = await readFile(bundle, 'utf8');
const line = js.split('\n').find(line => /const css\$\d+ = "\.\w+_root\{/.test(line));
assert.ok(line, 'Reader CSS must be present in the shipped bundle');
const css = JSON.parse(line.slice(line.indexOf('=') + 1).trim().replace(/;$/, ''));
const summary = css.match(/\.(\w+_nativeToolSummary)\[data-running\]/)?.[1];
assert.ok(summary);
const { launchPinnedChromium } = await import(pathToFileURL(join(homedir(), '.codex/playwright-runtime/runtime.mjs')).href);
const browser = await launchPinnedChromium();
const results = [];
try {
  for (const theme of ['dark', 'light']) for (const width of [180, 800]) {
    const page = await browser.newPage({ viewport: { width: 900, height: 120 }, deviceScaleFactor: 2 });
    await page.setContent(`<style>${css}body{margin:20px;background:${theme === 'dark' ? '#141414' : '#fff'};--dsw-alias-label-tertiary:${theme === 'dark' ? '#aaa' : '#666'};font:14px system-ui}.row{display:flex;width:${width}px}</style><div class="row" data-motion="on"><span data-running class="${summary}">Re-run acceptance criteria verification</span></div>`);
    const target = page.locator(`.${summary}`);
    const capture = async time => {
      await target.evaluate((el, time) => {
        const animations = el.getAnimations();
        if (animations.length !== 1) throw new Error(`Expected one animation, found ${animations.length}`);
        animations[0].pause(); animations[0].currentTime = time;
      }, time);
      return target.screenshot();
    };
    const timing = await target.evaluate(el => el.getAnimations()[0].effect.getTiming().duration);
    const first = await capture(0);
    const middle = await capture(timing * .25);
    const beforeWrap = await capture(timing - 1);
    const afterWrap = await capture(timing);
    assert.notDeepEqual(middle, first, 'The highlight must visibly travel across the text');
    assert.deepEqual(beforeWrap, first, 'The sweep must fully leave the text before wrapping');
    assert.deepEqual(afterWrap, first, 'The cycle boundary must preserve identical text pixels');
    await writeFile(join(out, `${theme}-${width}-start.png`), first);
    await writeFile(join(out, `${theme}-${width}-middle.png`), middle);
    await writeFile(join(out, `${theme}-${width}-end.png`), beforeWrap);
    const runningStyle = await target.evaluate(el => ({ repeat: getComputedStyle(el).backgroundRepeat, animationCount: el.getAnimations().length }));
    assert.equal(runningStyle.repeat, 'no-repeat');
    await page.locator('[data-motion]').evaluate(el => { el.dataset.motion = 'off'; });
    assert.equal(await target.evaluate(el => el.getAnimations().length), 0, 'Reader motion-off must stop shimmer');
    await page.locator('[data-motion]').evaluate(el => { el.dataset.motion = 'on'; });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await target.evaluate(el => ({ count: el.getAnimations().length, fill: getComputedStyle(el).webkitTextFillColor }));
    assert.equal(reduced.count, 0, 'System reduced motion must stop shimmer');
    assert.notEqual(reduced.fill, 'rgba(0, 0, 0, 0)', 'Stopped animation must keep text readable');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await target.evaluate(el => el.removeAttribute('data-running'));
    assert.equal(await target.evaluate(el => el.getAnimations().length), 0, 'Settled tools must not shimmer');
    results.push({ theme, width, loopPixelsContinuous: true, ...runningStyle, motionOff: true, reducedMotion: true, settled: true });
    await page.close();
  }
  await writeFile(join(out, 'result.json'), JSON.stringify({ bundle, results }, null, 2));
  console.log(JSON.stringify({ passed: true, results }));
} finally { await browser.close(); }
