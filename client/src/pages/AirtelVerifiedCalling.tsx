import { useEffect, useState } from 'react';

// Renders the Airtel verified-business-calling guide (DLT + Airtel IQ +
// Business Name Display). The CallerNumberPicker's "Step-by-step guide →" link
// opens this page in a new tab. The markdown is served publicly by the backend
// at /api/v1/config/airtel-verified-calling-guide, so no auth/workspace context
// is needed — a fresh tab can load it directly.

const GUIDE_URL = '/api/v1/config/airtel-verified-calling-guide';

// Minimal, dependency-free markdown → HTML for THIS guide's subset: headings,
// GitHub-style tables, bold, inline code, links, and paragraphs. Intentionally
// small — it's not a general markdown engine, just enough for the guide.
function renderMarkdown(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isTableDivider = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes('-');
  const cells = (l: string) =>
    l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // Tables: a row followed by a --- divider row.
    if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const header = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(cells(lines[i]));
        i++;
      }
      out.push(
        '<table><thead><tr>' +
          header.map((h) => `<th>${inline(h)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows
            .map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>')
            .join('') +
          '</tbody></table>'
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Paragraph
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }

  return out.join('\n');
}

export default function AirtelVerifiedCalling() {
  const [html, setHtml] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Airtel Verified Business Calling — Guide';
    fetch(GUIDE_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load the guide (${res.status})`);
        return res.text();
      })
      .then((md) => setHtml(renderMarkdown(md)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the guide'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary, #0f0f0f)',
        color: 'var(--text-primary, #e6e6e6)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '48px 20px',
      }}
    >
      <style>{`
        .airtel-guide { max-width: 820px; margin: 0 auto; line-height: 1.65; }
        .airtel-guide h1 { font-size: 28px; font-weight: 800; margin: 0 0 20px; }
        .airtel-guide h2 { font-size: 20px; font-weight: 700; margin: 32px 0 12px; }
        .airtel-guide p { margin: 12px 0; color: var(--text-secondary, #c4c4c4); }
        .airtel-guide ol, .airtel-guide ul { margin: 12px 0; padding-left: 24px; color: var(--text-secondary, #c4c4c4); }
        .airtel-guide li { margin: 6px 0; }
        .airtel-guide strong { color: var(--text-primary, #e6e6e6); }
        .airtel-guide code { background: var(--bg-secondary, #1a1a1a); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
        .airtel-guide a { color: var(--teal, #0bbfcb); }
        .airtel-guide table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13.5px; display: block; overflow-x: auto; }
        .airtel-guide th, .airtel-guide td { border: 1px solid var(--border, #333); padding: 8px 10px; text-align: left; vertical-align: top; }
        .airtel-guide th { background: var(--bg-secondary, #1a1a1a); font-weight: 700; }
      `}</style>
      <div className="airtel-guide">
        {loading && <p>Loading guide…</p>}
        {error && (
          <p style={{ color: '#fca5a5' }}>
            {error}. The guide is served by the backend at <code>{GUIDE_URL}</code>.
          </p>
        )}
        {!loading && !error && <div dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
    </div>
  );
}
