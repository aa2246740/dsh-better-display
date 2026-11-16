/**
 * Reading the source path out of a tool call's arguments.
 *
 * `ImageAttachmentRef.name` is documented as "stripped of local path information", so
 * an attachment can never say where its picture came from. The call's arguments can: a
 * tool result keeps both the parsed view (`args`) and the raw JSON (`call.argsRaw`).
 *
 * Kept in its own module so it can be tested without pulling in the React tree, which
 * imports CSS.
 *
 * @module
 */
/**
 * The path a call's arguments name.
 * @param call - the paired call's arguments, in parsed or raw form.
 * @returns the path, or undefined when the call names no file.
 */
export declare function pathFromToolArgs(call: {
    args?: unknown;
    argsRaw?: string;
} | undefined): string | undefined;
//# sourceMappingURL=tool-path.d.ts.map