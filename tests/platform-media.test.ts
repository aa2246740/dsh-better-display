import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  localImagePath,
  localPathMediaUrl,
  readerPathImagesFor,
  resolveImagePath
} from '../src/client/platform-media.js';

test('absolute local image paths use the authenticated Host file API without losing authored bytes', () => {
  for (const path of ['/tmp/a.png', '/tmp/中文 图.png', '/tmp/a%20b.png', '/tmp/a?x=1.png']) {
    const url = localPathMediaUrl('http:', 'http://127.0.0.1:43127', path)!;
    assert.equal(new URL(url).pathname, '/api/file');
    // `%20` is authored escaping; the Host receives the decoded path.
    assert.equal(new URL(url).searchParams.get('path'), path.replace('%20', ' '));
  }
});

test('Windows drive and UNC paths reach the file API instead of falling back to alt text', () => {
  const drive = String.raw`C:\Users\HSG\ego\plan-10px.png`;
  const driveUrl = localPathMediaUrl('http:', 'http://127.0.0.1:43127', drive)!;
  assert.equal(driveUrl.startsWith('http://127.0.0.1:43127/api/file?path='), true);
  assert.equal(new URL(driveUrl).searchParams.get('path'), drive);
  // Forward slashes name the same file.
  assert.equal(localImagePath('C:/Users/HSG/ego/plan-10px.png'), 'C:/Users/HSG/ego/plan-10px.png');
  // A UNC path keeps its double backslash; a protocol-relative URL never does.
  assert.equal(localImagePath(String.raw`\\server\share\a.png`), String.raw`\\server\share\a.png`);
  assert.equal(localImagePath('//cdn.example.com/a.png'), undefined);
});

test('line and fragment locators stay display metadata, not part of the filename', () => {
  assert.equal(localImagePath('/tmp/a.png#L12'), '/tmp/a.png');
  assert.equal(localImagePath('/tmp/a.png#L12-L20'), '/tmp/a.png');
  assert.equal(localImagePath(String.raw`C:\shots\a.png:12`), String.raw`C:\shots\a.png`);
  // An authored `%23` is the way to name a file that contains `#`.
  assert.equal(localImagePath('/tmp/a%23b.png'), '/tmp/a#b.png');
});

test('relative destinations resolve against the Session workspace, absolute ones do not need it', () => {
  assert.equal(
    resolveImagePath(String.raw`C:\repo`, 'shots/a.png'),
    String.raw`C:\repo\shots\a.png`
  );
  assert.equal(resolveImagePath('/repo', './shots/a.png'), '/repo/shots/a.png');
  assert.equal(resolveImagePath('/repo', '/abs/a.png'), '/abs/a.png');
  // Nothing with a scheme, a root, or a traversal-free absolute form is relative.
  assert.equal(resolveImagePath('/repo', 'data:image/png;base64,AAAA'), undefined);
  assert.equal(resolveImagePath('/repo', 'https://host/a.png'), undefined);
  assert.equal(resolveImagePath(undefined, 'shots/a.png'), undefined);
});

test('relative, protocol-relative and non-HTTP page paths are not sent to the Host file API', () => {
  for (const path of [
    '',
    'relative.png',
    '//host/image.png',
    'https://host/image.png',
    'data:image/png,x',
    'javascript:alert(1)'
  ]) {
    assert.equal(localPathMediaUrl('http:', 'http://local', path), undefined);
  }
  assert.equal(localPathMediaUrl('file:', 'null', '/tmp/image.png'), undefined);
  assert.equal(localPathMediaUrl('dsh-app:', 'dsh-app://other', '/tmp/image.png'), undefined);
});

test('Desktop file routes use the application file API', () => {
  const url = localPathMediaUrl('dsh-app:', 'dsh-app://app', '/tmp/a.png')!;
  assert.equal(url.startsWith('dsh-app://app/api/file?'), true);
  assert.equal(new URL(url).searchParams.get('path'), '/tmp/a.png');
});

test('the Reader resolver applies the workspace and keeps a stable identity per cwd', () => {
  const page = 'http://127.0.0.1:43127/';
  const withCwd = readerPathImagesFor(String.raw`C:\repo`, page);
  assert.equal(
    withCwd.resolve('shots/a.png'),
    'http://127.0.0.1:43127/api/file?path=' + encodeURIComponent(String.raw`C:\repo\shots\a.png`)
  );
  // The renderer asks the resolver only for destinations that failed the
  // remote-URL allowlist, so a remote URL is never rewritten here.
  assert.equal(withCwd.resolve('https://host/remote.png'), undefined);
  assert.equal(withCwd.resolve('data:image/png;base64,AAAA'), undefined);
  assert.equal(
    readerPathImagesFor('/repo', page).resolve('/abs/a.png'),
    'http://127.0.0.1:43127/api/file?path=' + encodeURIComponent('/abs/a.png')
  );
});

test('a deployment prefix and the desktop origin both keep the file route reachable', () => {
  // document.baseURI normally carries the prefix; the official renderer joins
  // `api/file` against it, and so does this resolver.
  const prefixed = readerPathImagesFor(undefined, 'http://127.0.0.1:43127/dsh/');
  assert.equal(
    prefixed.resolve('/tmp/a.png'),
    'http://127.0.0.1:43127/dsh/api/file?path=' + encodeURIComponent('/tmp/a.png')
  );
  const desktop = readerPathImagesFor(undefined, 'dsh-app://app/');
  assert.equal(
    desktop.resolve('/tmp/a.png'),
    'dsh-app://app/api/file?path=' + encodeURIComponent('/tmp/a.png')
  );
});
