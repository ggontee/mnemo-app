"use client";

import { useMemo } from "react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function parseMarkdown(md: string): string {
  let html = md;

  // Escape HTML
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (```...```) — must come before inline processing
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="md-code-block"><code>${code.trim()}</code></pre>`;
  });

  // Split into lines for block-level processing
  const lines = html.split("\n");
  const result: string[] = [];
  let inList = false;
  let listType: "ul" | "ol" | null = null;
  let inBlockquote = false;

  const closeList = () => {
    if (inList && listType) {
      result.push(`</${listType}>`);
      inList = false;
      listType = null;
    }
  };

  const closeBlockquote = () => {
    if (inBlockquote) {
      result.push("</blockquote>");
      inBlockquote = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Skip lines inside code blocks (already processed)
    if (line.includes('<pre class="md-code-block">')) {
      closeList();
      closeBlockquote();
      // Collect until </pre>
      let block = line;
      while (!block.includes("</pre>") && i + 1 < lines.length) {
        i++;
        block += "\n" + lines[i];
      }
      result.push(block);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      closeList();
      closeBlockquote();
      result.push('<hr class="md-hr" />');
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      closeList();
      closeBlockquote();
      const level = headerMatch[1].length;
      const text = processInline(headerMatch[2]);
      result.push(`<h${level} class="md-h${level}">${text}</h${level}>`);
      continue;
    }

    // Blockquote
    if (line.startsWith("&gt; ") || line === "&gt;") {
      closeList();
      if (!inBlockquote) {
        result.push('<blockquote class="md-blockquote">');
        inBlockquote = true;
      }
      const text = processInline(line.replace(/^&gt;\s?/, ""));
      result.push(`<p>${text}</p>`);
      continue;
    } else if (inBlockquote) {
      closeBlockquote();
    }

    // Unordered list (exclude **bold** lines)
    const ulMatch = line.match(/^(\s*)(?:\-|\+|\*(?!\*))\ +(.+)$/);
    if (ulMatch) {
      closeBlockquote();
      if (!inList || listType !== "ul") {
        closeList();
        result.push('<ul class="md-ul">');
        inList = true;
        listType = "ul";
      }
      result.push(`<li>${processInline(ulMatch[2])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      closeBlockquote();
      if (!inList || listType !== "ol") {
        closeList();
        result.push('<ol class="md-ol">');
        inList = true;
        listType = "ol";
      }
      result.push(`<li>${processInline(olMatch[2])}</li>`);
      continue;
    }

    // Close list if current line is not a list item
    if (inList) {
      closeList();
    }

    // Empty line
    if (line.trim() === "") {
      result.push("");
      continue;
    }

    // Regular paragraph
    result.push(`<p class="md-p">${processInline(line)}</p>`);
  }

  closeList();
  closeBlockquote();

  return result.join("\n");
}

function processInline(text: string): string {
  // Inline code (must come first to prevent inner processing)
  text = text.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Bold + Italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="md-link" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  return text;
}

export default function MarkdownRenderer({
  content,
  className = "",
}: MarkdownRendererProps) {
  const html = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div
      className={`md-rendered ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
