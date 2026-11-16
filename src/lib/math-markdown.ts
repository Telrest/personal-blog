import katex from 'katex';
import { Marked, type TokenizerAndRendererExtension, type Tokens } from 'marked';

type Equation = { source: string; display: boolean };

const multiline = /^ {0,3}\$\$[ \t]*\n([\s\S]*?)\n {0,3}\$\$[ \t]*(?:\n|$)/;
const singleLine = /^ {0,3}\$\$(?![$\n])([^\n]+?)\$\$[ \t]*(?:\n|$)/;
// Backslash-escaped characters belong to the formula. Avoid interpreting currency as math.
const inline = /^\$(?![$\s])((?:\\[^\n]|[^\\$\n])+?)\$(?!\d)/;
const escapeHtml = (text: string) => text.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]!);

function typeset({ source, display }: Equation) {
  let html: string;
  try {
    if (source.length > 12_000) throw new Error('Formula too long');
    html = katex.renderToString(source, {
      displayMode: display, trust: false, maxExpand: 500, maxSize: 20,
      strict: 'ignore', output: 'htmlAndMathml',
    });
  } catch {
    html = '<span class="math-invalid">公式有误：<code>' + escapeHtml(source) + '</code></span>';
  }
  return display
    ? '<div class="math-display" role="group" aria-label="独立公式" tabindex="0">' + html + '</div>'
    : '<span class="math-inline">' + html + '</span>';
}

export function renderMarkdownWithMath(markdown: string, sanitize: (html: string) => string) {
  if (!markdown.includes('$')) return sanitize(new Marked().parse(markdown, { async: false, gfm: true }));

  const equations: Equation[] = [];
  const prefix = 'BLOGMATH' + crypto.randomUUID().replaceAll('-', '') + 'X';
  const renderToken = (token: Tokens.Generic) => {
    if (equations.length >= 250) return escapeHtml(token.raw);
    const index = equations.push({ source: token.source, display: token.display }) - 1;
    return '<span>' + prefix + index + 'Z</span>';
  };
  const blockMath: TokenizerAndRendererExtension = {
    name: 'blogBlockMath', level: 'block',
    start(src) { return src.search(/^ {0,3}\$\$/m); },
    tokenizer(src) {
      if (!/^ {0,3}\$\$/.test(src)) return;
      const match = (/\n/.test(src) ? multiline.exec(src) : null) ?? singleLine.exec(src);
      if (!match?.[1].trim()) return;
      return { type: 'blogBlockMath', raw: match[0], source: match[1].trim(), display: true };
    },
    renderer: renderToken,
  };
  const inlineMath: TokenizerAndRendererExtension = {
    name: 'blogInlineMath', level: 'inline',
    start(src) {
      const match = /(^|[^$])\$(?![$\s])/.exec(src);
      if (match) return match.index + match[1].length;
    },
    tokenizer(src) {
      const match = inline.exec(src);
      if (!match || /\s$/.test(match[1])) return;
      return { type: 'blogInlineMath', raw: match[0], source: match[1], display: false };
    },
    renderer: renderToken,
  };

  const marked = new Marked({ extensions: [blockMath, inlineMath] });
  // Sanitize the article first; only KaTeX-generated markup can be inserted afterward.
  // Keep math fonts, layout spans, and MathML without broadening the HTML allowlist.
  const html = sanitize(marked.parse(markdown, { async: false, gfm: true }));
  return html.replace(new RegExp('<span>' + prefix + '(\\d+)Z</span>', 'g'),
    (original, index: string) => equations[Number(index)] ? typeset(equations[Number(index)]) : original);
}
