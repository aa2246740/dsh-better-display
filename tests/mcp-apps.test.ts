import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Code } from 'mdast';
import {
  isMcpAppCodeBlock,
  extractMcpAppTitle,
  extractMcpAppHeight,
  ensureHtmlDocument,
  extractHtmlTitle,
  formatReceiptPrompt,
} from '../src/client/mcp-app.js';
import { parseGfmWithMath } from '../src/client/markdown/parse.js';

test('isMcpAppCodeBlock detects all valid MCP App code block formats', () => {
  // Direct lang tags
  assert.equal(isMcpAppCodeBlock('mcp-app', null, '<div>test</div>'), true);
  assert.equal(isMcpAppCodeBlock('mcpapp', null, '<div>test</div>'), true);
  assert.equal(isMcpAppCodeBlock('mcp-ui', null, '<div>test</div>'), true);
  assert.equal(isMcpAppCodeBlock('mcp', null, '<div>test</div>'), true);
  assert.equal(isMcpAppCodeBlock('mcp-app:html', null, '<div>test</div>'), true);
  assert.equal(isMcpAppCodeBlock('html:mcp-app', null, '<div>test</div>'), true);

  // Meta indicators
  assert.equal(isMcpAppCodeBlock('html', 'mcp-app title="测试"', '<div>test</div>'), true);
  assert.equal(isMcpAppCodeBlock(null, 'sep-1865', '<div>test</div>'), true);

  // Content heuristic for SEP-1865 JSON-RPC
  const quizSnippet = `
    window.parent.postMessage({
      jsonrpc: "2.0",
      method: "ui/submit",
      params: { choice: "A" }
    }, "*");
  `;
  assert.equal(isMcpAppCodeBlock('html', null, quizSnippet), true);

  // Negative cases
  assert.equal(isMcpAppCodeBlock('typescript', null, 'const x = 1;'), false);
  assert.equal(isMcpAppCodeBlock('json', null, '{"a": 1}'), false);
  assert.equal(isMcpAppCodeBlock('html', null, '<h1>Hello World</h1>'), false);
  assert.equal(isMcpAppCodeBlock(null, null, ''), false);
});

test('extractMcpAppTitle extracts title from meta or html content', () => {
  assert.equal(extractMcpAppTitle('title="双盲方案盲选评测器"', '<div>test</div>'), '双盲方案盲选评测器');
  assert.equal(extractMcpAppTitle("title='架构方案对比'", '<div>test</div>'), '架构方案对比');
  assert.equal(extractMcpAppTitle(null, '<!DOCTYPE html><html><head><title>网页标题评测</title></head></html>'), '网页标题评测');
  assert.equal(extractMcpAppTitle(null, '<div>无标题内容</div>'), undefined);
});

test('extractMcpAppHeight parses explicit height budget from meta', () => {
  assert.equal(extractMcpAppHeight('title="看板" height=600'), 600);
  assert.equal(extractMcpAppHeight('height="550px"'), 550);
  assert.equal(extractMcpAppHeight('height=50'), undefined); // too small
  assert.equal(extractMcpAppHeight('title="普通"'), undefined);
});

test('extractHtmlTitle extracts document title accurately', () => {
  assert.equal(extractHtmlTitle('<title>我的测试 App</title>'), '我的测试 App');
  assert.equal(extractHtmlTitle('<title  class="main" > 性能看板 </title>'), '性能看板');
  assert.equal(extractHtmlTitle('<div>没有标题</div>'), undefined);
});

test('ensureHtmlDocument wraps bare fragments and preserves complete documents with theme bridge', () => {
  const completeHtml = '<!DOCTYPE html>\n<html><head><title>Test</title></head><body>Content</body></html>';
  const processed = ensureHtmlDocument(completeHtml, 'dark');
  assert.ok(processed.includes('<title>Test</title>'));
  assert.ok(processed.includes('<body>Content</body>'));
  assert.ok(processed.includes('applyTheme'));

  const fragment = '<div class="quiz"><h2>Question</h2></div>';
  const wrapped = ensureHtmlDocument(fragment, 'dark');
  assert.ok(wrapped.startsWith('<!DOCTYPE html>'));
  assert.ok(wrapped.includes('<html lang="zh-CN" data-theme="dark" class="dark"'));
  assert.ok(wrapped.includes(fragment));
});

test('markdown parsing correctly extracts MCP App code fence and prepares for McpAppFrame mounting', () => {
  const markdown = `
这里是为您生成的方案评测器，请在下方直接点击交互：

\`\`\`mcp-app title="双盲方案盲选评测器"
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>双盲方案盲选评测器</title>
</head>
<body>
  <div class="quiz-card">
    <h3>题目</h3>
    <button onclick="submitChoice('B')">B: 延迟消息队列</button>
  </div>
</body>
</html>
\`\`\`

如有其他疑问，请随时告诉我。
  `.trim();

  const root = parseGfmWithMath(markdown);
  const codeNode = root.children.find((child): child is Code => child.type === 'code');
  assert.ok(codeNode, 'Must contain a code block node');
  assert.equal(codeNode.lang, 'mcp-app');
  assert.equal(codeNode.meta, 'title="双盲方案盲选评测器"');
  assert.equal(isMcpAppCodeBlock(codeNode.lang, codeNode.meta, codeNode.value), true);
  assert.equal(extractMcpAppTitle(codeNode.meta, codeNode.value), '双盲方案盲选评测器');
  assert.ok(ensureHtmlDocument(codeNode.value).includes('延迟消息队列'));
});

test('formatReceiptPrompt formats clean, natural conversational text without extra whitespace or raw JSON dump', () => {
  const quizParams = {
    task: 'architecture_quiz_completed',
    choice: 'B',
    desc: '延迟消息队列',
  };
  const prompt = formatReceiptPrompt(quizParams, '双盲方案盲选评测器');
  assert.equal(prompt, '我在「双盲方案盲选评测器」中选择了：B（延迟消息队列）。请根据我的选择继续。');
  assert.ok(!prompt.includes('\n'), 'Must not contain multiline newlines');
  assert.ok(!prompt.includes('{'), 'Must not dump raw JSON braces');

  const variantParams = {
    selectedVariant: 'Skill_v2',
    score: 95,
  };
  assert.equal(formatReceiptPrompt(variantParams), '我在方案评测中选择了：Skill_v2，得分：95。请根据该方案继续分析。');

  const actionParams = {
    action: 'reset_counter',
    payload: { count: 0 },
  };
  assert.equal(formatReceiptPrompt(actionParams, '计数器'), '[计数器] 已完成 reset_counter: {"count":0}');
});
