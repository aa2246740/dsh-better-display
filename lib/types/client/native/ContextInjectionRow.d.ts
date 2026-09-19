import type { ContextMessageNode } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
/**
 * Role and producer name projected from the durable source. Host generations
 * disagree on the field name: alpha generations project `producer`
 * (ContextProducerView), newer ones `provenance`; the reader spreads the host
 * node, so either — or neither — may arrive. Structural on purpose: an
 * indexed access on ContextMessageNode would not compile against every
 * generation.
 */
interface ContextProvenanceView {
    role?: string;
    label?: string | null;
}
/** Props for the logged non-user message presentation. */
export interface ContextInjectionRowProps {
    content: ContextMessageNode['content'];
    source: ContextMessageNode['source'];
    /** Role and producer name projected from the durable source (newer hosts). */
    provenance?: ContextProvenanceView;
    /** Role and producer name projected from the durable source (alpha hosts). */
    producer?: ContextProvenanceView;
    /** Producer-declared information form; null renders the opaque body. */
    form: ContextMessageNode['form'];
    /** The owning view's locale seat, passed down as a plain prop. */
    t: TranslateNS<'chat'>;
}
/**
 * Render logged context with the Tool calls disclosure chrome from Figma.
 *
 * The header names the role the context plays and, beside it, the producer the
 * durable source identifies, so a reader can tell an injected skill catalog
 * from a workspace instruction file or a recalled session without expanding.
 * The expanded body follows the producer-declared form; an absent or unknown
 * form renders the opaque body.
 * @param props - Durable content, its projected producer role/name and form, and the locale seat.
 * @returns A collapsed context row with a bounded, form-specific body.
 */
export declare function ContextInjectionRow({ content, source, provenance, producer, form, t }: ContextInjectionRowProps): import("react").JSX.Element;
//# sourceMappingURL=ContextInjectionRow.d.ts.map
