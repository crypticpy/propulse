/**
 * MarkdownRenderer -- Minimal regex-based markdown renderer.
 *
 * Supports: **bold**, *italic*, [links](url), unordered lists (- or *), line breaks.
 * HTML entities are escaped first to prevent XSS, then markdown transforms applied.
 * Note: escapeHtml converts & to &amp; before link extraction, so URLs with
 * query params (a=1&b=2) become a=1&amp;b=2 in href — this is correct HTML
 * encoding; browsers decode it when following the link.
 */

import { useMemo } from "react";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:")
  );
}

function renderInline(line: string): string {
  // Links: [text](url) — only allow safe protocols (http, https, mailto)
  let result = line.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match: string, text: string, url: string) =>
      isSafeUrl(url)
        ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-plasma-orange hover:text-plasma-orange/80 underline">${text}</a>`
        : text,
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
  const html = useMemo(() => (text ? markdownToHtml(text) : ""), [text]);

  if (!text) return null;

  return (
    <div
      className={`text-sm text-gray-300 leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
