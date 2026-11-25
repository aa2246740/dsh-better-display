import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  imageBlob,
  preferredAttachmentForm,
  readImageAttachment,
  resetAttachmentForm,
  sessionImageLoader,
  type AttachmentReceipt
} from '../src/client/image-source.js';

const REF = {
  attachmentId: 'sha256:abc',
  mediaType: 'image/png',
  width: 4,
  height: 3,
  bytes: 12,
  name: 'plan-10px.png'
};

function receipt(argument: unknown): AttachmentReceipt {
  // Harness 0.2.2 hard-fails the id form, like the Host does: only a complete
  // reference reaches the attachment store.
  return typeof argument === 'object' && argument !== null
    ? { ok: true, value: { attachment: { mediaType: 'image/png' }, data: Uint8Array.of(1, 2, 3) } }
    : {
        ok: false,
        error: { code: 'session/attachment-invalid', message: 'Invalid attachment reference' }
      };
}

test('an image block uses the host bytes without copying them again', () => {
  const source = Uint8Array.of(9, 8, 7, 6);
  const view = source.subarray(1, 3);
  const copy = Uint8Array.from;
  let copies = 0;
  Uint8Array.from = ((...args: Parameters<typeof Uint8Array.from>) => {
    copies += 1;
    return copy(...(args as [ArrayLike<number>]));
  }) as typeof Uint8Array.from;
  try {
    const blob = imageBlob(view, 'image/png');
    assert.equal(copies, 0);
    assert.equal(blob.size, 2);
    assert.equal(blob.type, 'image/png');
  } finally {
    Uint8Array.from = copy;
  }
  const blocks = readFileSync(new URL('../src/client/Blocks.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(blocks, /Uint8Array\.from\(result\.data\)/);
  assert.match(blocks, /imageBlob\(result\.data, result\.mediaType\)/);
});

test('a closed session rejects the image load instead of throwing into the effect', async () => {
  const loadImage = sessionImageLoader(() => {
    throw new Error('阅读页对应的会话已关闭。');
  });
  let thrown: unknown;
  let pending: Promise<unknown> | undefined;
  try {
    pending = loadImage(REF);
  } catch (error) {
    thrown = error;
  }
  assert.equal(thrown, undefined);
  assert.ok(pending instanceof Promise);
  await assert.rejects(pending, /阅读页对应的会话已关闭/);
});

test('0.2.2 Hosts read the complete reference, which is what the plugin tries first', async () => {
  resetAttachmentForm();
  const calls: unknown[] = [];
  const image = await readImageAttachment(
    {
      readAttachment: async argument => {
        calls.push(argument);
        return receipt(argument);
      }
    },
    REF
  );
  assert.deepEqual(calls, [REF]);
  assert.equal(image.mediaType, 'image/png');
  assert.deepEqual([...image.data], [1, 2, 3]);
  assert.equal(preferredAttachmentForm(), 'reference');
});

test('0.2.1 Hosts that still take the attachment id keep working', async () => {
  resetAttachmentForm();
  const calls: unknown[] = [];
  const image = await readImageAttachment(
    {
      readAttachment: async argument => {
        calls.push(argument);
        // Only the legacy form answers here.
        return argument === REF.attachmentId
          ? { ok: true, value: { attachment: { mediaType: 'image/png' }, data: Uint8Array.of(9) } }
          : { ok: false, error: { code: 'session/attachment-invalid', message: 'bad reference' } };
      }
    },
    REF
  );
  assert.deepEqual(calls, [REF, REF.attachmentId]);
  assert.deepEqual([...image.data], [9]);
  // The accepted form is remembered, so the next read skips the failing one.
  assert.equal(preferredAttachmentForm(), 'id');
  const again: unknown[] = [];
  await readImageAttachment(
    {
      readAttachment: async argument => {
        again.push(argument);
        return receipt(
          argument === REF.attachmentId
            ? { ok: true, value: { data: Uint8Array.of(7) } }
            : (undefined as never)
        );
      }
    },
    REF
  );
  assert.deepEqual(again, [REF.attachmentId]);
});

test('the media type falls back to the reference when the receipt omits it', async () => {
  resetAttachmentForm();
  const image = await readImageAttachment(
    {
      readAttachment: async () => ({ ok: true, value: { data: Uint8Array.of(1) } })
    },
    REF
  );
  assert.equal(image.mediaType, 'image/png');
});

test('a read that fails in both forms names every reason instead of staying silent', async () => {
  resetAttachmentForm();
  await assert.rejects(
    readImageAttachment(
      {
        readAttachment: async () => ({
          ok: false,
          error: { code: 'session/attachment-invalid', message: 'gone' }
        })
      },
      REF
    ),
    /无法读取会话图片：宿主 readAttachment 契约可能与当前插件版本不匹配，请升级 dsh-better-display 或核对 Harness 版本（reference: session\/attachment-invalid: gone; id: session\/attachment-invalid: gone）/u
  );
  // A rejected read teaches nothing: the preferred form is unchanged.
  assert.equal(preferredAttachmentForm(), 'reference');
});

test('a thrown read is retried in the other form instead of aborting', async () => {
  resetAttachmentForm();
  const image = await readImageAttachment(
    {
      readAttachment: async argument => {
        if (typeof argument === 'object') throw new Error('boom');
        return {
          ok: true,
          value: { attachment: { mediaType: 'image/png' }, data: Uint8Array.of(5) }
        };
      }
    },
    REF
  );
  assert.deepEqual([...image.data], [5]);
  assert.equal(preferredAttachmentForm(), 'id');
});

test('a Host that swaps the contract mid-session is re-probed after the reset', async () => {
  resetAttachmentForm();
  // A 0.2.1 Host answers only the legacy id form, so the plugin learns 'id'.
  await readImageAttachment(
    {
      readAttachment: async argument =>
        argument === REF.attachmentId
          ? { ok: true, value: { attachment: { mediaType: 'image/png' }, data: Uint8Array.of(4) } }
          : { ok: false, error: { code: 'session/attachment-invalid', message: 'bad reference' } }
    },
    REF
  );
  assert.equal(preferredAttachmentForm(), 'id');
  // The same tab upgraded to a 0.2.2 Host: after the reset the learned form is
  // gone, so the first read of the new Host is the complete reference.
  resetAttachmentForm();
  const upgraded: unknown[] = [];
  const image = await readImageAttachment(
    {
      readAttachment: async argument => {
        upgraded.push(argument);
        return receipt(argument);
      }
    },
    REF
  );
  assert.deepEqual(upgraded, [REF]);
  assert.deepEqual([...image.data], [1, 2, 3]);
});

test('the client forgets the learned form when the Host connection resets', () => {
  // The form is module scope, so it outlives every mounted Reader; the reset
  // subscription is the only thing that clears it without a page reload.
  const index = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8');
  assert.match(index, /ctx\.on\('connection\/reset', resetAttachmentForm\)/u);
});
