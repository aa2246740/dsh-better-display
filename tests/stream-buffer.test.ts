import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StreamBuffer, STREAM_TIMING } from '../src/client/stream-buffer.js';

test('a transport burst becomes multiple bounded, monotonically growing frames', () => {
  const buffer = new StreamBuffer();
  const text = '让新到的文字柔和显现，已经读过的内容保持稳定。'.repeat(6);
  buffer.update(text, 0);
  const frames: string[] = [];
  for (let time = 16; time <= 256; time += 16) {
    const previous = buffer.visible;
    if (buffer.advance(time)) frames.push(buffer.visible);
    assert.ok(buffer.visible.startsWith(previous));
    assert.ok(text.startsWith(buffer.visible));
  }
  assert.ok(frames.length > 8);
  assert.ok(frames[0]!.length < text.length / 4);
  assert.equal(buffer.visible, text);
  assert.equal(buffer.pending, false);
});

test('each received batch has a hard queue-age ceiling during continuing input', () => {
  const buffer = new StreamBuffer();
  const deliveries: { at: number; end: number }[] = [];
  let text = '';
  for (let time = 0; time <= 1200; time += 16) {
    if (time % 64 === 0) {
      text += '中文 English 输出片段，'.repeat(3);
      buffer.update(text, time);
      deliveries.push({ at: time, end: text.length });
    }
    buffer.advance(time);
    for (const item of deliveries) if (time - item.at >= STREAM_TIMING.maxQueuedMs) assert.ok(buffer.visible.length >= item.end);
  }
});

test('grapheme-safe updates do not split combined emoji, flags or accents', () => {
  const buffer = new StreamBuffer();
  const text = '你好👩🏽‍💻e\u0301🇨🇳👨‍👩‍👧‍👦完整。'.repeat(4);
  const boundaries = new Set([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(part => part.index));
  boundaries.add(text.length);
  buffer.update(text, 0);
  for (let time = 8; time <= 256; time += 8) {
    buffer.advance(time);
    assert.ok(boundaries.has(buffer.visible.length), `split at ${buffer.visible.length}`);
  }
  assert.equal(buffer.visible, text);
});

test('a surrogate pair split across transport deliveries is never exposed half-written', () => {
  const buffer = new StreamBuffer();
  buffer.update('你好\uD83D', 0);
  buffer.advance(250);
  assert.equal(buffer.visible, '你好');
  buffer.update('你好\uD83D\uDE00继续', 260);
  buffer.advance(520);
  assert.equal(buffer.visible, '你好😀继续');
});

test('completion drains the last bytes within the short finish budget', () => {
  const buffer = new StreamBuffer();
  const text = '最终文本'.repeat(40);
  buffer.update(text, 0);
  buffer.advance(16);
  buffer.update(text, 20, { finished: true });
  buffer.advance(20 + STREAM_TIMING.finishMs);
  assert.equal(buffer.visible, text);
});

test('cancel, reduced motion, selected text and hidden views share an immediate flush path', () => {
  const buffer = new StreamBuffer();
  buffer.update('所有已经收到的文字必须保留。'.repeat(20), 0);
  buffer.advance(16);
  buffer.update(buffer.target, 17, { immediate: true });
  assert.equal(buffer.visible, buffer.target);
  assert.equal(buffer.pending, false);
});

test('history is immediate and replacement/shrink does not replay an old answer', () => {
  const buffer = new StreamBuffer('这是已完成的历史文本。');
  assert.equal(buffer.visible, buffer.target);
  buffer.update('修正后的权威文本。', 0);
  assert.equal(buffer.visible, '修正后的权威文本。');
  assert.equal(buffer.revision, 1);
  buffer.update('修正。', 1);
  assert.equal(buffer.visible, '修正。');
});

test('large payloads and delayed background frames do not create a typing backlog', () => {
  const large = new StreamBuffer();
  large.update('x'.repeat(12000), 0);
  assert.equal(large.visible, large.target);
  const delayed = new StreamBuffer();
  delayed.update('一次长时间暂停后应立刻赶上全部已收到的内容。'.repeat(20), 0);
  delayed.advance(10000);
  assert.equal(delayed.visible, delayed.target);
});
