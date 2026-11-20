import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  fileMediaUrlForBase,
  localImagePath,
  localPathMediaUrl,
  readerPathImagesFor,
  resolveImagePath
} from '../src/client/platform-media.js';

test('absolute local image paths use the authenticated Host file API, with authored escapes decoded once', () => {
  for (const path of ['/tmp/a.png', '/tmp/中文 图.png', '/tmp/a%20b.png']) {
    const url = localPathMediaUrl('http:', 'http://127.0.0.1:43127', path)!;
    assert.equal(new URL(url).pathname, '/api/file');
    // `%20` is authored escaping; the Host receives the decoded path.
    assert.equal(new URL(url).searchParams.get('path'), path.replace('%20', ' '));
  }
  // A query is not part of the filename. The host splits on `?` before decoding.
  assert.equal(
    new URL(
      localPathMediaUrl('http:', 'http://127.0.0.1:43127', '/tmp/a?x=1.png')!
    ).searchParams.get('path'),
    '/tmp/a'
  );
  // A literal `%` that is not valid escaping still names the file.
  assert.equal(localImagePath('/tmp/100%.png'), '/tmp/100%.png');
});

test('Windows drive paths reach the file API; UNC and protocol-relative URLs do not', () => {
  const drive = String.raw`C:\Users\HSG\ego\plan-10px.png`;
  const driveUrl = localPathMediaUrl('http:', 'http://127.0.0.1:43127', drive)!;
  assert.equal(driveUrl.startsWith('http://127.0.0.1:43127/api/file?path='), true);
  assert.equal(new URL(driveUrl).searchParams.get('path'), drive);
  // Forward slashes name the same file. Mixed separators on a drive path do too.
  assert.equal(localImagePath('C:/Users/HSG/ego/plan-10px.png'), 'C:/Users/HSG/ego/plan-10px.png');
  assert.equal(localImagePath(String.raw`C:/Users\HSG\a.png`), String.raw`C:/Users\HSG\a.png`);
  assert.equal(localImagePath(String.raw`\\server\share\a.png`), undefined);
  assert.equal(localImagePath('//cdn.example.com/a.png'), undefined);
});

test('the Reader never emits a file URL the host chat view would refuse', () => {
  const page = 'http://127.0.0.1:43127/';
  const resolve = readerPathImagesFor('/repo', page).resolve;
  const refused = [
    String.raw`\\attacker.example\share\x.png`,
    String.raw`/\attacker.example\share\x.png`,
    String.raw`\/attacker.example\share\x.png`,
    String.raw`\\?\UNC\attacker.example\share\x.png`,
    String.raw`\\.\pipe\x.png`,
    String.raw`\\attacker.example/share\x.png`,
    '%5C%5Cattacker.example%5Cshare%5Cx.png',
    '%255C%255Cattacker.example%255Cshare%255Cx.png',
    '%2F%2Fattacker.example/share/x.png',
    '%252F%252Fattacker.example/share/x.png'
  ];
  for (const destination of refused) {
    assert.equal(localImagePath(destination), undefined, destination);
    assert.equal(
      localPathMediaUrl('http:', 'http://127.0.0.1:43127', destination),
      undefined,
      destination
    );
    assert.equal(resolve(destination), undefined, destination);
  }
  // A relative path joined onto a UNC workspace is still a UNC path.
  assert.equal(resolveImagePath(String.raw`\\attacker.example\share`, 'x.png'), undefined);
  assert.equal(
    readerPathImagesFor(String.raw`\\attacker.example\share`, page).resolve('shots/a.png'),
    undefined
  );
  // Drive-relative forms are not opened as a drive. With no workspace they
  // name nothing; joined onto a UNC workspace they stay refused.
  assert.equal(localImagePath(String.raw`C:foo\bar.png`), undefined);
  assert.equal(resolveImagePath(undefined, String.raw`C:foo\bar.png`), undefined);
  assert.equal(
    resolveImagePath(String.raw`\\attacker.example\share`, String.raw`C:foo\bar.png`),
    undefined
  );
  assert.equal(
    resolveImagePath('/repo', String.raw`C:foo\bar.png`),
    String.raw`/repo/C:foo\bar.png`
  );
  // The gate holds even when a caller skips destination parsing.
  assert.equal(fileMediaUrlForBase(page, String.raw`\\attacker.example\share\x.png`), undefined);
  assert.equal(fileMediaUrlForBase(page, '/%5C%5Chost/share/x.png'), undefined);
});

test('line and fragment locators stay display metadata, not part of the filename', () => {
  assert.equal(localImagePath('/tmp/a.png#L12'), '/tmp/a.png');
  assert.equal(localImagePath('/tmp/a.png#L12-L20'), '/tmp/a.png');
  assert.equal(localImagePath(String.raw`C:\shots\a.png:12`), String.raw`C:\shots\a.png`);
  // An authored `%23` is the way to name a file that contains `#`.
  assert.equal(localImagePath('/tmp/a%23b.png'), '/tmp/a#b.png');
});

test('relative destinations resolve against the Session workspace, absolute ones do not need it', () => {
  // The host join keeps the relative tail's own separators. A Windows root
  // supplies the separator after the root and does not rewrite `/` inside the tail.
  assert.equal(
    resolveImagePath(String.raw`C:\repo`, 'shots/a.png'),
    String.raw`C:\repo\shots/a.png`
  );
  assert.equal(
    resolveImagePath(String.raw`C:\repo`, String.raw`shots\a.png`),
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
    'http://127.0.0.1:43127/api/file?path=' + encodeURIComponent(String.raw`C:\repo\shots/a.png`)
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
