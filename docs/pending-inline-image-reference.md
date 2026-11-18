# 待实现：正文里图片引用的三段式渲染

状态：**方案已确认，暂缓实现**（先做「用户发送的图片支持全屏查看」）。

## 需求

模型回答里出现 `![alt](path)` 这类图片引用时，当前实现把引用文字替换成图片块，
导致原版的行内引用消失、句子被打断。

目标是把这一小段渲染成**三个块级行**：

```
方案已经做好，对比图见：          ← 引用前的文字，行尾自然断开
积分弹窗-三方案对比.png           ← 引用文件名，单独一行
┌──────────────┐
│    图片      │                  ← 图片，单独一行
└──────────────┘
，关键数据显示方案 C 更紧凑。       ← 引用后的文字，另起一行
```

关键点：引用文件名本身**保持原版的渲染样式**（行内可点、蓝色等宽小字），
只是它外面套了一个块级容器，从而把行断开。

## 效果图

- `artifacts/inline-ref/three-line.png` —— 五种情形（基准 / 目标 / 竖长图 / 非图片 / 一句多图）
- 生成脚本：`C:/Users/HSG/ego/inline-ref/build3.mjs`

## 实现要点

`markdown/render.tsx` 的 `renderImage` 改为：

```tsx
function renderImage(url, alt, key, context) {
  const isImage = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(url)
  const src = isImage ? context.pathImages?.resolve(url) : undefined

  // 非图片：完全按原版渲染，一行内不动
  if (src === undefined) return <FileReference value={url} key={key} />

  return <Fragment key={key}>
    <span className={css.refLine}><FileReference value={url} /></span>
    <span className={css.shotLine}><ImageThumb src={src} ... /></span>
  </Fragment>
}
```

`renderImage` 只替换 Markdown 里 `![...](...)` 那一小段，前后文字仍由段落自然输出，
所以「引用前 / 引用 → 图片 / 引用后」天然分成三段，不需要改动文本节点。

CSS：

```css
.refLine { display: block; margin: 2px 0; }
.shotLine { display: block; margin: 8px 0; }
.shotLine img { max-width: 100%; max-height: 200px; height: auto; width: auto; }
```

## 已确认的取舍

| 项 | 决定 |
|---|---|
| 非图片文件（.yaml / .md / .ts） | **不换行**，保持原版一行 |
| 图片最大高度 | `200px`（用户已确认「可以」） |
| 图片可点击 | **要**，点开全屏查看器 |
| 图片参与分组 | **要**，能左右切换 |
| 一句多张图 | 依次展开成「文件名 + 图片」，后半句接在最后 |

## 影响范围

| 文件 | 改动 |
|---|---|
| `src/client/markdown/render.tsx` | `renderImage` 改为块级三段 |
| `src/client/markdown/MarkdownText.module.css` | 新增 `.refLine` / `.shotLine` |
| `tests/markdown-image.test.ts` | 断言引用仍在、图片在独立块级容器内 |

其余路径不动：工具调用图片、正文里独占一段的图片块、用户发送的图片。
