import test from 'node:test';
import assert from 'node:assert/strict';
import { localPathMediaUrl } from '../src/client/platform-media.js';

test('absolute local image paths use the authenticated Host file API without losing authored bytes', () => {
  for (const path of ['/tmp/a.png', '/tmp/中文 图 #1.png', '/tmp/a%20b.png', '/tmp/a?x=1&y=2.png']) {
    const url = localPathMediaUrl('http:', 'http://127.0.0.1:43127', path)!;
    assert.equal(new URL(url).pathname, '/api/file');
    assert.equal(new URL(url).searchParams.get('path'), path);
  }
});
test('relative, protocol-relative and non-HTTP page paths are not sent to the Host file API', () => {
  for (const path of ['', 'relative.png', '//host/image.png', 'https://host/image.png', 'data:image/png,x', 'javascript:alert(1)']) {
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
