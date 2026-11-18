import { renderMarkdownWithMath } from "./math-markdown";
import sanitizeHtml from "sanitize-html";

export function renderMarkdown(markdown: string) {
  return renderMarkdownWithMath(markdown, (html) =>
    sanitizeHtml(html, {
      allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "del"],
      allowedAttributes: {
        a: ["href", "title", "target", "rel"],
        img: ["src", "alt", "title", "loading", "referrerpolicy"],
        code: ["class"],
        th: ["align"],
        td: ["align"],
      },
      allowedSchemes: ["http", "https", "mailto"],
      allowProtocolRelative: false,
      transformTags: {
        a: (_tag, attrs) => ({
          tagName: "a",
          attribs: { ...attrs, target: "_blank", rel: "noopener noreferrer" },
        }),
        img: (_tag, attrs) => ({
          tagName: "img",
          attribs: { ...attrs, loading: "lazy", referrerpolicy: "no-referrer" },
        }),
      },
    }),
  );
}
