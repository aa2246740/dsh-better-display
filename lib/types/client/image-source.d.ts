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
/** Structural face of one resolved image, independent of Harness version. */
export interface ResolvedImage {
    /** Decoded bytes, exactly as the Host returned them. */
    data: Uint8Array;
    /** Media type of those bytes. */
    mediaType: string;
}
/** Attachment reference fields this module reads; the rest pass through untouched. */
export interface AttachmentRefLike {
    attachmentId: string;
    mediaType?: string;
    width?: number;
    height?: number;
    bytes?: number;
    name?: string;
}
/** One `readAttachment` receipt, structurally (the value is version-specific). */
export interface AttachmentReceipt {
    ok: boolean;
    error?: {
        code?: string;
        message?: string;
    };
    value?: {
        attachment?: {
            mediaType?: string;
        };
        data: Uint8Array;
    };
}
/** The one method this module needs from a Session. */
export interface AttachmentReader {
    readAttachment: (argument: unknown) => Promise<AttachmentReceipt>;
}
/** The two call shapes a Harness Client may expose. */
type Form = 'reference' | 'id';
/** Forget the learned form (tests, or a Host reconnect that swapped versions). */
export declare function resetAttachmentForm(): void;
/** Which call shape the next read tries first. */
export declare function preferredAttachmentForm(): Form;
/**
 * Read one durable image through whichever call shape this Host accepts.
 * @param reader - the Session's `readAttachment`, structurally typed.
 * @param attachment - complete image reference from the folded session log.
 * @returns decoded bytes plus the media type the Host verified.
 */
export declare function readImageAttachment(reader: AttachmentReader, attachment: AttachmentRefLike): Promise<ResolvedImage>;
export {};
//# sourceMappingURL=image-source.d.ts.map