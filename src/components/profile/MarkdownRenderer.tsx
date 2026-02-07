/**
 * MarkdownRenderer -- Minimal regex-based markdown renderer.
 *
 * Supports: **bold**, *italic*, [links](url), unordered lists (- or *), line breaks.
 * HTML entities are escaped first to prevent XSS, then markdown transforms applied.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderInline(line: string): string {
  // Links: [text](url)
  let result = line.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-plasma-orange hover:text-plasma-orange/80 underline">$1</a>',
  );

  // Bold: **text** or __text__
  result = result.replace(
    /\*\*(.+?)\*\*/g,
    '<strong class="font-semibold text-white">$1</strong>',
  );
  result = result.replace(
    /__(.+?)__/g,
    '<strong class="font-semibold text-white">$1</strong>',
  );

  // Italic: *text* or _text_ (single, not already consumed by bold)
  result = result.replace(
    /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g,
    '<em class="italic">$1</em>',
  );
  result = result.replace(
    /(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g,
    '<em class="italic">$1</em>',
  );

  return result;
}

function markdownToHtml(text: string): string {
  // Escape HTML entities first (XSS protection)
  const escaped = escapeHtml(text);

  const lines = escaped.split("\n");
  const htmlLines: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trimStart();

    // Unordered list items: - item or * item
    const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      if (!inList) {
        htmlLines.push('<ul class="list-disc list-inside space-y-0.5 ml-1">');
        inList = true;
      }
      htmlLines.push(`<li>${renderInline(listMatch[1])}</li>`);
      continue;
    }

    // Close open list
    if (inList) {
      htmlLines.push("</ul>");
      inList = false;
    }

    // Empty line -> break
    if (trimmed === "") {
      htmlLines.push("<br />");
      continue;
    }

    // Regular line
    htmlLines.push(`${renderInline(trimmed)}<br />`);
  }

  // Close trailing list
  if (inList) {
    htmlLines.push("</ul>");
  }

  return htmlLines.join("");
}

interface MarkdownRendererProps {
  text: string;
  className?: string;
}

export function MarkdownRenderer({
  text,
  className = "",
}: MarkdownRendererProps) {
  if (!text) return null;

  const html = markdownToHtml(text);

  return (
    <div
      className={`text-sm text-gray-300 leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
