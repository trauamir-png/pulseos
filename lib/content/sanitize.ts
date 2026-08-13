import sanitizeHtml from "sanitize-html";

/**
 * Column body sanitization. Same allowlist philosophy as lib/rss/parse.ts,
 * extended with the block-level tags and images the Column editor supports.
 * h2/h3 only: the page-level h1 is always the Column title itself.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "b", "strong", "i", "em", "u", "a", "ul", "ol", "li", "blockquote", "h2", "h3", "img"],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title"],
  },
  allowedSchemes: ["http", "https"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
  },
};

export function sanitizeColumnBody(raw: string | undefined | null): string {
  if (!raw) return "";
  return sanitizeHtml(raw, SANITIZE_OPTIONS).trim();
}
