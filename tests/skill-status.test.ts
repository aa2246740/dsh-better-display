import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONVENTIONAL_SKILL_ROOTS,
  GENERATIVE_MCPAPPS_SKILL,
  SKILL_PACK_RELATIVE,
  skillListIncludes,
  skillNameMatches,
  skillRootEntryMatches,
  skillsFromListResult,
  toPublicSkillStatus,
} from '../src/skill-status.ts';
import {
  projectSkillRoots,
  rootHasGenerativeMcpapps,
  scanGenerativeMcpappsStatus,
  userSkillRoots,
} from '../src/skill-roots.ts';
import { detectGenerativeMcpappsSkill, firstSessionId, shortestInstallCommand } from '../src/client/skill-status.ts';

test('only the kebab-case skill name counts as installed', () => {
  assert.equal(skillNameMatches(GENERATIVE_MCPAPPS_SKILL), true);
  assert.equal(skillNameMatches('other'), false);
  assert.equal(skillRootEntryMatches('generative-mcpapps'), true);
  assert.equal(skillRootEntryMatches('generative-mcpapps.md'), true);
  assert.equal(skillRootEntryMatches('skills'), false);
  assert.equal(skillListIncludes([{ name: 'generative-mcpapps' }]), true);
  assert.equal(skillListIncludes(skillsFromListResult({ ok: true, value: { skills: [{ name: 'generative-mcpapps' }] } })), true);
});

test('plugin-tree skills/ is not a harness skill root', () => {
  const roots = [
    ...projectSkillRoots('/plugin/dsh-better-display'),
    ...userSkillRoots({ DSH_HOME: '/home/me/.dsh', DSH_AGENTS_HOME: '/home/me/.agents' }, '/home/me'),
  ];
  // join()/resolve() use platform separators (and resolve() adds a drive letter on Windows) —
  // normalize before comparing so the assertion describes structure, not the host OS.
  const norm = (path: string): string => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '');
  assert.deepEqual(roots.map(root => norm(root.path)), [
    '/plugin/dsh-better-display/.dsh/skills',
    '/plugin/dsh-better-display/.agents/skills',
    '/home/me/.dsh/skills',
    '/home/me/.agents/skills',
  ]);
  assert.equal(roots.some(root => norm(root.path).endsWith('/dsh-better-display/skills')), false);
});

test('a real user skill root with the pack is installed; the plugin pack path is not', async () => {
  const emptyHome = await mkdtemp(join(tmpdir(), 'dsh-bd-empty-'));
  const skillHome = await mkdtemp(join(tmpdir(), 'dsh-bd-skill-'));
  const userRoot = join(skillHome, '.dsh', 'skills', 'generative-mcpapps');
  await mkdir(userRoot, { recursive: true });
  await writeFile(join(userRoot, 'SKILL.md'), '---\nname: generative-mcpapps\ndescription: x\n---\n');

  const missing = await scanGenerativeMcpappsStatus({
    home: emptyHome,
    env: {},
    packPath: '/plugin/dsh-better-display/skills/generative-mcpapps',
  });
  const found = await scanGenerativeMcpappsStatus({
    home: skillHome,
    env: { DSH_HOME: join(skillHome, '.dsh') },
    packPath: '/plugin/dsh-better-display/skills/generative-mcpapps',
  });

  assert.equal(await rootHasGenerativeMcpapps('/plugin/dsh-better-display/skills'), false);
  assert.equal(missing.installed, false);
  assert.equal(found.installed, true);
  assert.equal(found.via, 'skill-root');
  assert.equal(found.packPath, '/plugin/dsh-better-display/skills/generative-mcpapps');
});

test('client detect snapshot never carries host packPath or home roots', async () => {
  const status = await detectGenerativeMcpappsSkill({
    fetchHostStatus: async () => ({
      name: 'generative-mcpapps',
      installed: false,
      via: null,
      packPath: '/Users/cola/plugin/skills/generative-mcpapps',
      roots: [{ source: 'user-dsh', path: '/Users/cola/.dsh/skills', present: false }],
    }),
  });
  assert.equal(status.packPath, undefined);
  assert.deepEqual(status.roots.map(root => root.path), [...CONVENTIONAL_SKILL_ROOTS]);
  assert.equal(status.roots.some(root => /\/Users\/|[A-Za-z]:\\/.test(root.path)), false);
});

test('skills/list wins when the registry can see the skill', async () => {
  const status = await detectGenerativeMcpappsSkill({
    fetchHostStatus: async () => ({
      name: 'generative-mcpapps',
      installed: false,
      via: null,
      roots: [{ source: 'user-dsh', path: '/tmp/.dsh/skills', present: false }],
    }),
    listRemoteSkills: async () => [{ name: 'generative-mcpapps' }],
  });
  assert.equal(status.installed, true);
  assert.equal(status.via, 'skills.list');
});

test('public skill status strips packPath and host home absolutes', () => {
  const published = toPublicSkillStatus({
    name: 'generative-mcpapps',
    installed: false,
    via: null,
    packPath: '/Users/cola/.dsh/plugins/skills/generative-mcpapps',
    roots: [
      { source: 'user-dsh', path: '/Users/cola/.dsh/skills', present: false },
      { source: 'user-agents', path: 'C:\\Users\\cola\\.agents\\skills', present: false },
    ],
  });
  assert.equal(published.packPath, undefined);
  assert.deepEqual(published.roots.map(root => root.path), [...CONVENTIONAL_SKILL_ROOTS]);
  assert.equal(published.roots.some(root => /\/Users\/|[A-Za-z]:\\/.test(root.path)), false);
});

test('install command uses conventional relative roots only', () => {
  const command = shortestInstallCommand({
    packPath: '/opt/plugin/skills/generative-mcpapps',
    roots: [{ source: 'user-dsh', path: '/home/me/.dsh/skills' }],
  });
  assert.match(command, /mkdir -p \.dsh\/skills/);
  assert.match(command, new RegExp(`cp -R ${SKILL_PACK_RELATIVE.replace('/', '\\/')}`));
  assert.match(command, /generative-mcpapps/);
  assert.doesNotMatch(command, /\/Users\//);
  assert.doesNotMatch(command, /[A-Za-z]:\\/);
  assert.doesNotMatch(command, /\/home\//);
  assert.doesNotMatch(command, /\$HOME|\$DSH_HOME/);
  assert.doesNotMatch(command, /\/opt\//);
});

test('firstSessionId reads ids or byId keys', () => {
  assert.equal(firstSessionId({ ids: ['a', 'b'] }), 'a');
  assert.equal(firstSessionId({ byId: { z: {} } }), 'z');
  assert.equal(firstSessionId(undefined), undefined);
});
