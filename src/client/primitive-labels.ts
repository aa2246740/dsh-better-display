import type {
  DiffBlockLabels,
  JsonTreeLabels,
  MarkdownLabels,
  ReadBlockLabels,
  SearchBlockLabels,
  TerminalBlockLabels,
  WebBlockLabels,
} from '@deepseek-ai/dsh-client-ui-primitives';

export const markdownLabels: MarkdownLabels = {
  code: { copyLabel: '复制', copiedLabel: '已复制' },
  footnotes: '脚注',
};

export const readBlockLabels: ReadBlockLabels = {
  window: (shown, total) => `显示 ${shown} / ${total} 行`,
  copy: '复制', copied: '已复制', collapseAria: '收起文件内容',
  expandAria: hidden => `展开其余 ${hidden} 行`, collapse: '收起', expand: hidden => `展开其余 ${hidden} 行`,
};

export const terminalBlockLabels: TerminalBlockLabels = {
  signal: signal => `信号 ${signal}`, exitCode: code => `退出码 ${code}`,
  running: '执行中', failed: '失败', done: '已完成', copy: '复制', copied: '已复制',
  noOutput: '没有输出', collapseAria: '收起命令输出', collapse: '收起',
  expandAria: hidden => `展开其余 ${hidden} 行`, expand: hidden => `展开其余 ${hidden} 行`,
};

export const diffBlockLabels: DiffBlockLabels = {
  copy: '复制', copied: '已复制', collapseAria: '收起差异', collapse: '收起',
  expandAria: hidden => `展开其余 ${hidden} 行`, expand: hidden => `展开其余 ${hidden} 行`,
  files: count => `${count} 个文件`,
};

export const searchBlockLabels: SearchBlockLabels = {
  pathsSummary: (shown, total, truncated) => `${shown} / ${total} 个路径${truncated ? '（结果已截断）' : ''}`,
  matchesSummary: (shown, total, files, truncated) => `${shown} / ${total} 处匹配 · ${files} 个文件${truncated ? '（结果已截断）' : ''}`,
  copy: '复制', copied: '已复制', noResults: '没有结果', collapseAria: '收起搜索结果', collapse: '收起',
  expandAria: hidden => `展开其余 ${hidden} 行`, expand: hidden => `展开其余 ${hidden} 行`,
};

export const webBlockLabels: WebBlockLabels = {
  noResults: '没有结果', sourcesTruncated: '来源已截断', http: 'HTTP', contentTruncated: '内容已截断',
  markdown: markdownLabels,
};

export const jsonTreeLabels: JsonTreeLabels = {
  copyValue: '复制值', copyJson: '复制 JSON', copyPath: '复制路径', copyPrettyJson: '复制格式化 JSON',
  copyCompactJson: '复制紧凑 JSON', copied: '已复制', copyFailed: '复制失败', collapseNode: '收起节点',
  expandNode: '展开节点', copyButtonTitle: action => action,
};

export const truncatedJsonLabel = (total: number): string => `内容过长，已截断（共 ${total} 个字符）`;
