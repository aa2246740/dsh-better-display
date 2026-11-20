import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
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
    /Unable to read the session image \(reference: session\/attachment-invalid: gone; id: session\/attachment-invalid: gone\)/u
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
