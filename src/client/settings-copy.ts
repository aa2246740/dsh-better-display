export type SettingsCopyKey =
  | 'nav'
  | 'openTitle'
  | 'openDescription'
  | 'glassTitle'
  | 'glassDescription'
  | 'foldTitle'
  | 'foldDescription'
  | 'foldNone'
  | 'foldStandard'
  | 'foldSummary'
  | 'keepProseTitle'
  | 'keepProseDescription'
  | 'keepToolSemanticsTitle'
  | 'keepToolSemanticsDescription'
  | 'skillTitle'
  | 'skillInstalled'
  | 'skillMissing'
  | 'skillPurpose'
  | 'skillPluginNote'
  | 'skillInstall'
  | 'skillRecheck'
  | 'skillChecking'
  | 'skillUnavailable';

export type SettingsCopy = Record<SettingsCopyKey, string>;

export const en: SettingsCopy = {
  nav: 'Better Display',
  openTitle: 'Open deliverables in built-in panel',
  openDescription: 'Off by default: chips and inline file mentions open in the system app. Turn this on to preview them in the right Sidebar, matching official chat. Reveal and folder actions still use the system file manager.',
  glassTitle: 'Translucent frosted glass',
  glassDescription: 'Off by default: reading chrome stays opaque, matching the current Host look. Turn this on to let wallpaper and skins show through the panel; path and count chips stay clear until hover or focus.',
  foldTitle: 'Auto-fold process',
  foldDescription: 'Default on: collapses earlier steps when new thoughts appear. Turn off to keep all thinking and tools expanded in full.',
  foldNone: 'Off',
  foldStandard: 'On',
  foldSummary: 'Summary',
  keepToolSemanticsTitle: 'Name the tools inside a fold',
  keepToolSemanticsDescription: 'Off by default. A folded run lists the tools it actually ran and what each acted on — the same identity the tool card shows — instead of only a count. Independent of the switches above.',
  keepProseTitle: 'Keep model replies visible when folding',
  keepProseDescription: 'Off by default. When on, a fold collects only process steps — tool calls, their output and thinking — while the text the model writes to you always stays open. A run of a single step is left expanded, so a lone tool row keeps its name and target. Independent of the fold control above; works at every fold level.',
  skillTitle: 'generative-mcpapps skill',
  skillInstalled: 'Installed',
  skillMissing: 'Not detected',
  skillPurpose: 'This install is for model auto-selection of MCP Apps. Reader already renders mcp-app fences when the model emits them.',
  skillPluginNote: 'Shipping the pack inside this plugin repository does not install it into the harness skill catalog.',
  skillInstall: 'Copy the whole generative-mcpapps folder (including references and examples) into .dsh/skills or .agents/skills — in your home or the project, you choose — then Re-check. There is no one-click install that works on every host.',
  skillRecheck: 'Re-check',
  skillChecking: 'Checking…',
  skillUnavailable: 'Could not query the host skill catalog. Copy into .dsh/skills or .agents/skills (home or project), then Re-check.',
};

export const zh: SettingsCopy = {
  nav: 'Better Display',
  openTitle: '在内置面板中打开产物',
  openDescription: '默认关闭：产物芯片和正文中的文件提及会用系统应用打开。打开后与官方对话一致，在右侧栏预览。访达 / 资源管理器中的显示与打开所在文件夹不受此开关控制。',
  glassTitle: '半透明毛玻璃',
  glassDescription: '默认关闭：阅读栏保持不透明，和现在的 Host 观感一致。打开后透出宿主壁纸与皮肤；路径、行数等标签静止时透明，悬停或聚焦才显出轮廓。',
  foldTitle: '自动折叠过程',
  foldDescription: '默认开启：新思考产生时自动折叠此前步骤。关闭后全程展开，完整保留原始思考与工具流。',
  foldNone: '关闭',
  foldStandard: '开启',
  foldSummary: '摘要',
  keepToolSemanticsTitle: '摘要中写明工具语义',
  keepToolSemanticsDescription: '默认关闭。折叠的一段会列出它实际调用过的工具与作用对象——与工具卡片用的是同一套标识——而不只是一个数量。与上方开关相互独立。',
  keepProseTitle: '折叠时保留模型回复',
  keepProseDescription: '默认关闭。开启后，折叠只收纳过程步骤——工具调用、其输出与思维链——而模型写给读者的正文始终展开。只有一步的过程不会被折成摘要，单独一行工具仍保留名称与目标。与上方的折叠档位相互独立，各档位均可生效。',
  skillTitle: 'generative-mcpapps 技能',
  skillInstalled: '已安装',
  skillMissing: '未检测到',
  skillPurpose: '这项安装是为了让模型自动选用 MCP Apps。阅读页在模型写出 mcp-app 代码块时已经会渲染，不依赖该技能是否装进宿主。',
  skillPluginNote: '技能包只出现在本插件仓库里，并不等于当前 Agent 已经加载它。',
  skillInstall: '把完整的 generative-mcpapps 文件夹（含 references 与 examples）复制到 .dsh/skills 或 .agents/skills（家目录或项目目录，由你选），然后重新检测。没有在所有宿主上都可用的一键安装。',
  skillRecheck: '重新检测',
  skillChecking: '正在检测…',
  skillUnavailable: '无法查询宿主技能目录。请复制到 .dsh/skills 或 .agents/skills（家目录或项目），再重新检测。',
};

export function settingsLanguage(tag: string | undefined): 'zh' | 'en' {
  return (tag ?? '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function settingsCopyFor(tag: string | undefined): SettingsCopy {
  return settingsLanguage(tag) === 'zh' ? zh : en;
}
