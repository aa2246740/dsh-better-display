/** Upgrade gate for the public composition adapter and remaining Markdown fork. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '..');
const harness = resolve(process.env.DSHX_HARNESS?.trim() || readFileSync(join(homedir(), '.config/dshx/harness'), 'utf8').trim());
const baselineFile = join(root, 'compat/harness-rc2.json');
const ts = createRequire(join(root, 'package.json'))('typescript');
const files = [
  'packages/client/ui-slots/src/index.ts',
  'packages/client/ui-slots/src/renderer.ts',
  'packages/client/ui-renderer/src/client/registry.ts',
  'packages/client/ui-renderer/src/client/scoped-slots.tsx',
  'packages/client/ui-chat/src/client/contract/slots.ts',
  'packages/client/ui-tool/src/client/contract/slots.ts',
  'packages/client/ui-deliverables/src/client/Deliverables.tsx',
  'packages/client/ui-chat/src/client/chat/AssistantMarkdown.tsx',
  'packages/client/ui-chat/src/client/chat/MessageItem.tsx',
  'packages/client/ui-chat/src/client/chat/AssistantNodeView.tsx',
  'packages/client/ui-chat/src/client/chat/TurnTailNodeView.tsx',
  'packages/client/ui-chat/src/client/chat/TurnProcessNodeView.tsx',
  'packages/client/ui-tool/src/client/tool/models/tool-call-model.ts',
  ...['MarkdownText.tsx', 'render.tsx', 'parse.ts', 'incremental.ts', 'katex.tsx'].map(name => `packages/client/ui-primitives/src/markdown/${name}`),
];
const hashes = Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(join(harness, file))).digest('hex')]));
const registrations = [];
for (const path of execFileSync('rg', ['--files', 'packages/client', '-g', '*.ts', '-g', '*.tsx'], { cwd: harness, encoding: 'utf8' }).trim().split('\n')) {
  if (!path.includes('/src/client/')) continue;
  const text = readFileSync(join(harness, path), 'utf8');
  if (!/conversation\.chat\.|tool\.call\.|conversation\.message\./u.test(text)) continue;
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'register') {
      const options = node.arguments[0];
      if (options && ts.isObjectLiteralExpression(options)) {
        const fields = {};
        for (const p of options.properties) {
          if (ts.isPropertyAssignment(p) && ts.isStringLiteral(p.initializer)) fields[p.name.getText(file).replaceAll("'", '').replaceAll('"', '')] = p.initializer.text;
        }
        if (/^(conversation\.chat\.|tool\.call\.|conversation\.message\.)/u.test(fields.name ?? '')) {
          registrations.push(`${fields.name} | ${fields.key ?? fields.id ?? '(chain/single)'} | ${path}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
}
registrations.sort();
const harnessCommit = execFileSync('git', ['-C', harness, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const current = {
  harnessVersion: JSON.parse(readFileSync(join(harness, 'packages/client/ui-chat/package.json'), 'utf8')).version,
  harnessCommit,
  hashes, registrations,
};
if (process.argv.includes('--record')) {
  writeFileSync(baselineFile, JSON.stringify(current, null, 2) + '\n');
  console.log(`Recorded candidate baseline: ${current.harnessVersion}; run build, fixtures and DSH acceptance before committing it.`);
} else {
  const baseline = JSON.parse(readFileSync(baselineFile, 'utf8'));
  const changed = files.filter(file => current.hashes[file] !== baseline.hashes[file]);
  const added = registrations.filter(row => !baseline.registrations.includes(row));
  const removed = baseline.registrations.filter(row => !registrations.includes(row));
  if (current.harnessVersion !== baseline.harnessVersion || current.harnessCommit !== baseline.harnessCommit || changed.length || added.length || removed.length) {
    console.error(JSON.stringify({ compatible: 'review-required', target: current.harnessVersion, commit: current.harnessCommit, baselineCommit: baseline.harnessCommit, changedContractsOrForkSources: changed, addedRegistrations: added, removedRegistrations: removed }, null, 2));
    console.error('Review the differences and run the official bridge/visual tests. --record alone is not compatibility proof.');
    process.exitCode = 1;
  } else console.log(`Harness compatibility baseline passed (${current.harnessVersion}; ${registrations.length} official registrations).`);
}
