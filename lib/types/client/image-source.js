/**
 * Durable-image byte reads across Harness 0.2.1 (rc.1-rc.5) and 0.2.2.
 *
 * 0.2.1 took the opaque attachment id (`readAttachment(attachmentId)`); 0.2.2
 * takes the complete reference (`readAttachment(attachment)`) so the Host can
 * verify every field of it. The plugin runs on both, and the wrong form fails
 * at the wire boundary, which surfaced as "image failed to load" in the
 * Reader's tool results. Try the form this build prefers, fall back to the
 * other, and remember whichever form the running Host actually accepted.
 *
 * @module
 */
// Module-scoped because every Reader image shares the Host version in this tab.
let preferred = 'reference';
/** Forget the learned form (tests, or a Host reconnect that swapped versions). */
export function resetAttachmentForm() {
    preferred = 'reference';
}
/**
 * Bind a session lookup to an image loader. The returned function is async so
 * a closed session rejects the promise. A synchronous throw inside ImageBlock's
 * effect would hit the block boundary, skip the image retry state, and leave
 * the 20s timer set.
 * @param session - returns the live session, or throws when that session is gone.
 * @returns the loader the Reader passes to image blocks.
 */
export function sessionImageLoader(session) {
    return async (attachment) => readImageAttachment(session(), attachment);
}
/** Which call shape the next read tries first. */
export function preferredAttachmentForm() {
    return preferred;
}
function describe(error) {
    if (error === undefined || error === null)
        return 'unknown error';
    if (typeof error === 'string')
        return error;
    const candidate = error;
    const message = typeof candidate.message === 'string' ? candidate.message : String(error);
    return typeof candidate.code === 'string' ? `${candidate.code}: ${message}` : message;
}
/**
 * Read one durable image through whichever call shape this Host accepts.
 * @param reader - the Session's `readAttachment`, structurally typed.
 * @param attachment - complete image reference from the folded session log.
 * @returns decoded bytes plus the media type the Host verified.
 */
export async function readImageAttachment(reader, attachment) {
    const order = preferred === 'reference' ? ['reference', 'id'] : ['id', 'reference'];
    const failures = [];
    for (const form of order) {
        const argument = form === 'reference' ? attachment : attachment.attachmentId;
        let receipt;
        try {
            receipt = await reader.readAttachment(argument);
        }
        catch (error) {
            failures.push(`${form}: ${describe(error)}`);
            continue;
        }
        if (receipt?.ok !== true) {
            failures.push(`${form}: ${describe(receipt?.error)}`);
            continue;
        }
        const value = receipt.value;
        if (value === undefined || value.data === undefined) {
            failures.push(`${form}: empty attachment receipt`);
            continue;
        }
        // Only a confirmed read teaches the preferred form, so one genuinely
        // missing image cannot flip the plugin onto the wrong call shape.
        preferred = form;
        return {
            data: Uint8Array.from(value.data),
            mediaType: value.attachment?.mediaType ?? attachment.mediaType ?? 'application/octet-stream'
        };
    }
    throw new Error(`无法读取会话图片（${failures.join('; ')}）`);
}
/**
 * Blob for an image block. The read above already copied the Host bytes, so
 * this must not copy them again.
 * @param data - bytes from {@link readImageAttachment}.
 * @param mediaType - blob type.
 * @returns a blob of exactly those bytes.
 */
export function imageBlob(data, mediaType) {
    const end = data.byteOffset + data.byteLength;
    // An exact buffer is the copy readImageAttachment already made. A view has
    // to be sliced so the blob does not include the bytes around it.
    const bytes = data.byteOffset === 0 && end === data.buffer.byteLength
        ? data.buffer
        : data.buffer.slice(data.byteOffset, end);
    return new Blob([bytes], { type: mediaType });
}
//# sourceMappingURL=image-source.js.map