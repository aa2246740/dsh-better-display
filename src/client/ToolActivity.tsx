import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client';
import { DiffBlock, DisclosureRow, JsonTree, ReadBlock, SearchBlock, TerminalBlock, WebBlock,
  IconApiOutline14, IconBrowseOutline16, IconEditOutline16, IconSearchOutline16, IconSkillOutline16, IconSparkle16 } from '@deepseek-ai/dsh-client-ui-primitives';
import { Blocks, contentBlocks } from './Blocks.js';
import { ProcessFragment } from './motion.js';
import { activityPhase, activitySummary, executionFacts, toolIdentity } from './tool-activity.js';
import type { ToolActivityEntry, ToolCategory, ToolPhase } from './tool-activity.js';
import type { BlockRenderProps } from './types.js';
import { classifyTool, toolRowModel, VARIANT_TITLES } from './native/tool-call-model.js';
import css from './Reader.module.css';

const LABEL: Record<ToolPhase, string> = { preparing: '输入生成中', running: '执行中', returned: '已返回', succeeded: '已完成', failed: '失败', interrupted: '已中断' };
const ICONS = { write: IconEditOutline16, read: IconBrowseOutline16, terminal: IconApiOutline14, search: IconSearchOutline16, web: IconSearchOutline16, other: IconSparkle16 } satisfies Record<ToolCategory, unknown>;
const number = new Intl.NumberFormat('zh-CN');
const language = (path: string | undefined) => path?.split('.').at(-1);
const duration = (ms: number) => ms < 1000 ? `${Math.round(ms)} 毫秒` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} 秒`;

function generatedInput(content: string, target: string | undefined, preparing: boolean) {
  const lines = content.split('\n').map((text, index) => ({ number: index + 1, text }));
  const visible = preparing ? lines.slice(-12) : lines.slice(0, 1600);
  return <div data-reader-tool-file><p className={css.toolDetailNote}>{preparing ? '正在生成的输入 · 尚未执行 · 末尾 12 行' : '工具输入中的文件内容'}{!preparing && lines.length > visible.length ? ' · 预览前 1,600 行，完整内容在原始数据中' : ''}</p>
    <ReadBlock label={target ?? '文件内容'} lang={language(target)} lines={visible} totalLines={lines.length} maxLines={16} />
  </div>;
}

function InputView({ model, preparing }: { model: ReturnType<typeof activitySummary>; preparing: boolean }) {
  if (model.content) return generatedInput(model.content, model.target, preparing);
  if (model.command) return <div data-reader-tool-terminal><p className={css.toolDetailNote}>{preparing ? '正在生成命令 · 尚未执行' : '提交的命令'}</p><TerminalBlock command={model.command} cwd={model.cwd} /></div>;
  return <JsonTree data={model.args} label={preparing ? '已收到的输入字段' : '工具输入'} />;
}

function ResultView({ entry, model, phase, ...render }: BlockRenderProps & { entry: ToolActivityEntry; model: ReturnType<typeof activitySummary>; phase: ToolPhase }) {
  const block = entry.block;
  if (!block || !('kind' in block)) return <>
    <p className={css.toolDetailNote}>{phase === 'interrupted' ? '已中断，没有工具结果。已生成的输入仍可查看。' : phase === 'preparing' ? '模型正在生成工具输入，工具还未开始执行。' : '工具已开始执行，正在等待结果。'}</p>
    <InputView model={model} preparing={phase === 'preparing'} />
  </>;
  const view = block.resultView;
  const text = block.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
  if (view?.card === 'terminal' || model.category === 'terminal') {
    const facts = executionFacts(block);
    return <div data-reader-tool-terminal><TerminalBlock command={model.command ?? view?.title ?? model.name} cwd={model.cwd}
      output={view?.card === 'terminal' ? view.output ?? text : text} exitCode={facts.exitCode} signal={facts.signal} maxLines={18} /></div>;
  }
  if (view?.card === 'read') return <div data-reader-tool-file><ReadBlock label={view.path} lang={view.lang} lines={view.lines} totalLines={view.totalLines} maxLines={18} /></div>;
  if (view?.card === 'diff' && view.diffs.length) return <div data-reader-tool-diff><DiffBlock diffs={view.diffs} maxLines={18} /></div>;
  if (view?.card === 'search') return <div data-reader-tool-search>{view.shape === 'paths'
    ? <SearchBlock kind="paths" paths={view.paths} total={view.total} truncated={view.truncated} maxLines={18} />
    : <SearchBlock kind="matches" files={view.files} total={view.total} truncated={view.truncated} maxLines={18} />}</div>;
  if (view?.card === 'web') return <div data-reader-tool-web>{view.kind === 'search'
    ? <WebBlock kind="search" sources={view.sources} answer={view.answer} truncated={view.truncated} />
    : <WebBlock kind="fetch" url={view.url} statusCode={view.statusCode} truncated={view.truncated} />}</div>;
  // A trace/export may omit wire presentation. Keep the generated input clearly
  // labelled; it is not proof of an applied diff or a successful file mutation.
  if (model.category === 'write' && model.content && !block.isError) return <>
    <p className={css.toolDetailNote}>文件工具已返回。以下为提交的内容；完整返回记录可在「原始数据」查看。</p>
    {generatedInput(model.content, model.target, false)}
  </>;
  const content: ToolResultNode['content'] = view?.card === 'generic' && view.content ? view.content : block.content;
  if (content.some(item => item.type === 'text')) return <div className={css.toolDocument}><Blocks {...render} blocks={contentBlocks(content).filter(item => item.kind === 'text')} source="tool" /></div>;
  if (content.length) return <p className={css.toolDetailNote}>图片或扩展内容已在对话中单独展示。</p>;
  return <p className={css.toolDetailNote}>工具没有返回可展示的内容。</p>;
}

/** One occurrence, keyed by call id all the way from generation to result. */
export const ToolActivity = memo(function ToolActivityView({ entry, motion, turnClosed, onRead, depth = 0, ...render }: BlockRenderProps & {
  entry: ToolActivityEntry; motion: boolean; turnClosed: boolean; onRead: () => void; depth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'result' | 'input' | 'raw'>('result');
  const control = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(false);
  const detailId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const model = useMemo(() => activitySummary(entry), [entry.block, entry.draft]);
  const phase = activityPhase(entry, turnClosed);
  const heldPreview = useRef({ entry, model, phase });
  if (!selected) heldPreview.current = { entry, model, phase };
  const preview = heldPreview.current;
  useEffect(() => {
    const track = () => {
      const selection = document.getSelection();
      setSelected(!!selection && !selection.isCollapsed && !!selection.anchorNode && !!panel.current?.contains(selection.anchorNode));
    };
    document.addEventListener('selectionchange', track);
    return () => document.removeEventListener('selectionchange', track);
  }, []);
  const facts = executionFacts(entry.block);
  const Icon = model.name === 'skill' ? IconSkillOutline16 : ICONS[model.category];
  const block = entry.block;
  const native = block ? toolRowModel(model.name, block) : null;
  const skillName = typeof model.args?.name === 'string' ? model.args.name.split('\n')[0] : model.raw.split('\n')[0];
  const rowTitle = model.name === 'skill' ? 'Skill' : native?.title ?? VARIANT_TITLES[classifyTool(model.name)];
  const rowSummary = model.name === 'skill' ? skillName : native?.errorSummary ?? native?.summary
    ?? (classifyTool(model.name) === 'others' ? `${model.name} · ${model.target ?? model.title}` : model.target ?? model.title);
  const showState = phase === 'preparing' || phase === 'running' || phase === 'failed' || phase === 'interrupted';
  const elapsed = block && 'kind' in block && block.callTime != null ? Math.max(0, block.time - block.callTime) : null;
  const rawResult = useMemo(() => {
    const value = preview.entry.block;
    return value && 'kind' in value ? JSON.stringify({ content: value.content, isError: value.isError, meta: value.meta, resultView: value.resultView }, null, 2) : '';
  }, [preview.entry.block]);
  const tabs = [['result', phase === 'preparing' ? '生成预览' : '结果'], ['input', '输入'], ['raw', '原始数据']] as const;
  const activate = (index: number) => { const item = tabs[(index + tabs.length) % tabs.length]!; setTab(item[0]); tabRefs.current[(index + tabs.length) % tabs.length]?.focus(); };
  if (depth > 6) return <p className={css.meta}>更深的嵌套调用可在原对话查看。</p>;
  return <div ref={element => { control.current = element?.querySelector<HTMLElement>('[data-disclosure-row]') ?? null; }} className={css.toolActivity} data-reader-tool-call={entry.callId} data-tool-phase={phase} data-tool-args-length={model.raw.length} data-tool-category={model.category} data-expanded={open} data-ud-check="reader-tool-activity">
    <DisclosureRow icon={<Icon size={14} />} title={rowTitle} open={open} expandable expandOnRowClick keepContentWhenOpen
      onToggle={() => { onRead(); setOpen(value => !value); }} rowClassName={css.nativeToolRow}
      collapsedContent={<><span className={css.rowSeparator} aria-hidden /><span className={css.nativeToolSummary} title={rowSummary} data-reader-tool-summary>{rowSummary}</span>
        {showState && <span className={css.toolState} data-phase={phase}>{LABEL[phase]}</span>}</>} />
    <ProcessFragment open={open} motion={motion} onRead={onRead} returnFocusTo={control} nodeKey={`${entry.key}:detail`} framed>
      <div id={detailId} className={css.toolDetails}>
        <div className={css.toolLedger} aria-live="off">
          <span>工具 · <span className={css.toolEngine}>{model.name}</span></span>
          <span data-reader-tool-progress>{phase === 'preparing' ? `已接收 ${number.format(model.raw.length)} 字符输入` : phase === 'running' ? '已提交 · 等待工具返回' : phase === 'interrupted' ? '已停止 · 输入记录保留' : elapsed !== null ? `执行 ${duration(elapsed)}` : '结果已记录'}</span>
          {facts.exitCode !== undefined && <span>退出码 {facts.exitCode}</span>}
          {facts.signal && <span>信号 {facts.signal}</span>}
        </div>
        <div className={css.toolTabs} role="tablist" aria-label={`${model.title}的执行数据`} onKeyDown={event => {
          const index = tabs.findIndex(item => item[0] === tab);
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); activate(index + (event.key === 'ArrowRight' ? 1 : -1)); }
          else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); activate(event.key === 'Home' ? 0 : tabs.length - 1); }
        }}>{tabs.map(([id, title], index) => <button key={id} ref={element => { tabRefs.current[index] = element; }} type="button" role="tab" id={`${detailId}-${id}`} aria-selected={tab === id} aria-controls={`${detailId}-panel`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}>{title}</button>)}</div>
        <div ref={panel} id={`${detailId}-panel`} className={css.toolPanel} role="tabpanel" aria-labelledby={`${detailId}-${tab}`} tabIndex={0}>
          {selected && <p className={css.toolDetailNote}>为保留选区，预览暂停更新；当前状态见卡片标题。</p>}
          {tab === 'result' && <ResultView {...render} {...preview} />}
          {tab === 'input' && <><InputView model={preview.model} preparing={preview.phase === 'preparing'} /><details className={css.detail}><summary>全部输入字段</summary><JsonTree data={preview.model.args} label="输入字段" /></details></>}
          {tab === 'raw' && <><p className={css.toolDetailNote}>完整记录 · 只读 · 不执行其中的代码</p><h4 className={css.toolRawLabel}>工具输入</h4><pre className={css.toolRaw}>{preview.model.raw || '输入尚未到达'}</pre>{rawResult && <><h4 className={css.toolRawLabel}>工具结果</h4><pre className={css.toolRaw}>{rawResult}</pre></>}</>}
        </div>
      </div>
    </ProcessFragment>
    {!!block?.subCalls.length && <div className={css.toolChildren} aria-label="子调用">{block.subCalls.map((child, index) => <ToolActivity key={child.callId} {...render}
      entry={{ kind: 'tool', key: `reader-tool:${child.callId}`, callId: child.callId, step: entry.step, order: index, block: child }}
      motion={motion} turnClosed={turnClosed} onRead={onRead} depth={depth + 1} />)}</div>}
  </div>;
}, (previous, next) => previous.entry.callId === next.entry.callId && previous.entry.block === next.entry.block
  && previous.entry.draft === next.entry.draft && previous.entry.step === next.entry.step
  && previous.motion === next.motion && previous.turnClosed === next.turnClosed && previous.depth === next.depth
  && previous.onRead === next.onRead && previous.renderSlotChain === next.renderSlotChain && previous.loadImage === next.loadImage);

/** Media and failures never disappear inside a folded execution record. */
export function ToolMedia({ block, depth = 0, ...render }: BlockRenderProps & { block: ToolCallBlock; depth?: number }) {
  if (depth > 6) return null;
  const settled = 'kind' in block;
  const failed = activityPhase({ block }) === 'failed';
  const visible = settled ? contentBlocks(block.content).filter(item => block.isError || item.kind === 'image' || item.kind === 'other') : [];
  return <>
    {failed && <div className={css.error} role="alert">{toolIdentity({ block }).name} 执行未成功{executionFacts(block).exitCode !== undefined ? ` · 退出码 ${executionFacts(block).exitCode}` : ''}，详情保留在执行记录中。</div>}
    {visible.length > 0 && <Blocks {...render} blocks={visible} source="tool" />}
    {block.subCalls.map(child => <ToolMedia key={child.callId} {...render} block={child} depth={depth + 1} />)}
  </>;
}
