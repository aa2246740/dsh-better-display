import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

/**
 * The fold digest prints one rolling number per bucket — `思考×43 · 工具×111`.
 *
 * Reported defect: with a three-digit count the last digit was cut in half, and
 * a two-digit count was just about to be. The cause is a sizing conflict, not a
 * width that is simply too small:
 *
 *  - `.numberRollRoot` is `position: relative; overflow: hidden` and its digits
 *    are `position: absolute; inset: 0`, so the digit layer contributes NOTHING
 *    to the box width — only the hidden `.numberRollSizer` in flow does.
 *  - `min-width: 1.45em` was written for a single tabular digit.
 *  - Before the fix the box had no `width`, so an over-wide value sat centred
 *    inside it and `overflow: hidden` cropped it on BOTH sides. That is why the
 *    last digit lost roughly half its width instead of the value wrapping.
 *
 * These assertions pin the sizing contract so the clip cannot come back.
 */
const css = readFileSync(resolve(import.meta.dirname, '../src/client/Reader.module.css'), 'utf8')
  .replace(/\r\n/g, '\n');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'u').exec(css);
  assert.ok(match, `expected a rule for ${selector}`);
  return match[1]!;
}

test('the number roll box follows its value instead of a one-digit width', () => {
  const root = rule('.numberRollRoot');
  // The box must be able to grow past the single-digit floor.
  assert.match(root, /width:\s*max-content/u);
  // `overflow: hidden` is what makes a wrong width clip instead of overflow.
  assert.match(root, /overflow:\s*hidden/u);
  // The floor covers exactly one tabular digit. `1.45em` reserved 20.3px at the
  // reader's 14px while a digit needs 8.2px; the digest carries several numbers,
  // so that slack pushed the line past the width its button can give it
  // (measured in the running app: 190px wanted, 183.7px available) and the last
  // number was cut in half. `1ch` is one digit of this font, not 2.5.
  assert.match(root, /min-width:\s*1ch/u);
  assert.doesNotMatch(root, /min-width:\s*1\.45em/u);
});

test('the sizer stays in flow, because it is the only thing that sizes the box', () => {
  const sizer = rule('.numberRollSizer');
  // Hiding it visually must not remove it from layout.
  assert.match(sizer, /visibility:\s*hidden/u);
  assert.doesNotMatch(sizer, /display:\s*none/u);
  assert.doesNotMatch(sizer, /position:\s*absolute/u);
});

test('the animated digits are positioned inside the box the sizer sized', () => {
  const digit = rule('.numberRollDigit');
  assert.match(digit, /position:\s*absolute/u);
  assert.match(digit, /inset:\s*0/u);
});

test('the digest still clips with an ellipsis only when the column is genuinely too narrow', () => {
  // Two `.foldSummary` rules exist; the earlier one owns the clipping. Running
  // the box at max-content means the clip engages on real overflow, not on a
  // value that already fitted.
  assert.match(css, /\.foldSummary \{[^}]*max-width:\s*100%/u);
  assert.match(css, /\.foldSummary \{[^}]*overflow:\s*hidden/u);
  // Each part keeps its own intrinsic width, so a number never gets squeezed.
  assert.match(rule('.foldSummaryPart'), /flex:\s*none/u);
});

test('the digest text itself is produced per bucket and joined with a middle dot', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/client/live-turn.ts'), 'utf8');
  assert.match(source, /reasoning\)\s*parts\.push\(`思考×\$\{reasoning\}`\)/u);
  assert.match(source, /body\)\s*parts\.push\(`输出×\$\{body\}`\)/u);
  assert.match(source, /tool\)\s*parts\.push\(`工具×\$\{tool\}`\)/u);
  assert.match(source, /parts\.join\(' · '\)/u);
});
