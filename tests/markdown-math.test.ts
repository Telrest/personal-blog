import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import sanitizeHtml from 'sanitize-html';
import { renderMarkdownWithMath } from '../src/lib/math-markdown.ts';

const render = (markdown: string) => renderMarkdownWithMath(markdown, sanitizeHtml);

test('renders Chinese-adjacent inline and standalone display formulas with accessible MathML', () => {
  const html = render('设$A_1$为矩阵。\n\n$$\n\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}\n\\tag{1}\n$$\n\n$$x^2$$\n\n下一段。');
  assert.match(html, /设<span class="math-inline">.*<math/);
  assert.equal((html.match(/class="math-display"/g) || []).length, 2);
  assert.match(html, /annotation[^>]*>.*?\\tag\{1\}/s);
  assert.match(html, /<p>下一段。<\/p>/);
});

test('keeps inline and fenced code, escaped dollars, and common currency literal', () => {
  const tick = String.fromCharCode(96);
  const html = render(tick + '$x^2$' + tick + '\n\n~~~latex\n$$\ny^2\n$$\n~~~\n\nPrices: $10 and $20. Escaped: \\$x\\$.');
  assert.doesNotMatch(html, /class="math-(inline|display)"/);
  assert.match(html, /<code>\$x\^2\$<\/code>/);
  assert.match(html, /\$10 and \$20/);
});

test('preserves safe HTML and Markdown while isolating invalid formulas', () => {
  const html = render('正文 **可读** $\\notACommand{<script>}$。\n\n**后一段**。');
  assert.match(html, /公式有误/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>后一段<\/strong>/);
  assert.doesNotMatch(html, /<script>/);
});

test('does not enable raw HTML, trusted KaTeX links or external images', () => {
  const html = render('<script>alert(1)</script>\n\n$\\href{https://example.com}{x}$ $\\includegraphics{https://example.com/a.jpg}$ $\\htmlStyle{background:red}{x}$');
  assert.doesNotMatch(html, /<script|<a\s|<img|style="[^"]*background:red/i);
});
