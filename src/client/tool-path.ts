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

/** The argument keys a file-reading tool is known to use. */
const KEYS = [
  'path',
  'file_path',
  'filePath',
  'image_path',
  'imagePath',
  'source',
  'file',
  'target',
  'output'
] as const;

function fromObject(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of KEYS) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
  }
  return undefined;
}

/**
 * The path a call's arguments name.
 * @param call - the paired call's arguments, in parsed or raw form.
 * @returns the path, or undefined when the call names no file.
 */
export function pathFromToolArgs(
  call: { args?: unknown; argsRaw?: string } | undefined
): string | undefined {
  if (call === undefined) return undefined;
  const direct = fromObject(call.args);
  if (direct !== undefined) return direct;
  if (call.argsRaw === undefined) return undefined;
  try {
    return fromObject(JSON.parse(call.argsRaw));
  } catch {
    // A malformed raw payload must not throw: a broken call is not a crash.
    return undefined;
  }
}
