import type { TurnLocation } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { MarkdownFileMentions } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ReaderFlowEntry } from './tool-activity.js';
import { inputFields, stringValue, toolIdentity } from './tool-activity.js';

interface ProducedEntry {
  readonly seq?: number;
  readonly path: string;
}

interface DeliverablesData {
  readonly produced: readonly ProducedEntry[];
}

/** Extract standard filename without directory components. */
export function basename(path: string): string {
  const normalized = path.replace(/[/\\]+$/, '');
  const at = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return at === -1 ? normalized : normalized.slice(at + 1);
}

/**
 * Extract all unique file paths produced/modified in one turn.
 * Respects official deliverables data when available, and falls back to
 * inspecting successful write/edit tool invocations in the turn flow.
 */
export function getTurnDeliverables(turn: TurnLocation | undefined, flow?: readonly ReaderFlowEntry[]): readonly string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  // 1. Check official deliverables turn data from @deepseek-ai/dsh-client-ui-deliverables
  const deliverables = turn?.data.get('deliverables') as DeliverablesData | undefined;
  if (deliverables?.produced && Array.isArray(deliverables.produced)) {
    for (const item of deliverables.produced) {
      if (typeof item?.path === 'string' && item.path.trim().length > 0) {
        const clean = item.path.trim();
        if (!seen.has(clean)) {
          seen.add(clean);
          paths.push(clean);
        }
      }
    }
  }

  if (paths.length > 0) return paths;

  // 2. Fallback: inspect successful file modification tool calls in the flow
  if (flow) {
    for (const item of flow) {
      if (item.kind !== 'tool' || !item.block) continue;
      // Skip failed tool results
      if ('isError' in item.block && item.block.isError) continue;
      const { name, raw } = toolIdentity(item);
      const toolName = name !== '工具调用' ? name : ((item.block as unknown as { name?: string }).name || (item.block as unknown as { call?: { name?: string } }).call?.name);
      const toolRaw = raw || ((item.block as unknown as { argsRaw?: string }).argsRaw || (item.block as unknown as { call?: { argsRaw?: string } }).call?.argsRaw || '');
      if (toolName === 'write' || toolName === 'edit' || toolName === 'apply_patch') {
        const args = inputFields(toolRaw);
        const target = stringValue(args, 'file_path', 'path', 'filename', 'filePath');
        if (target && !seen.has(target)) {
          seen.add(target);
          paths.push(target);
        }
      } else if (toolName === 'str_replace_editor') {
        const args = inputFields(toolRaw);
        const cmd = stringValue(args, 'command');
        if (cmd === 'create' || cmd === 'str_replace' || cmd === 'insert') {
          const target = stringValue(args, 'path');
          if (target && !seen.has(target)) {
            seen.add(target);
            paths.push(target);
          }
        }
      }
    }
  }

  return paths;
}

/** The single produced path whose basename is exactly value, or undefined. */
function onlyPathWithBasename(paths: readonly string[], value: string): string | undefined {
  const matches = paths.filter(path => basename(path) === value);
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * File-mention resolver: converts inline-code tokens matching produced paths
 * into clickable file references that open the corresponding file on the host.
 */
export function createProducedFileMentions(
  paths: readonly string[],
  openFile: (path: string) => void,
): MarkdownFileMentions {
  return {
    resolve(value: string) {
      if (!value || value.includes('\n')) return undefined;
      const clean = value.trim();
      const path = paths.includes(clean) ? clean : onlyPathWithBasename(paths, clean);
      if (path === undefined) return undefined;
      return {
        open: () => { openFile(path); },
        label: `打开 ${path}`,
        title: path,
      };
    },
  };
}
