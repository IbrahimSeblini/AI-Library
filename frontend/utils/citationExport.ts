import { Paper } from '../types';

// ── APA author formatting ─────────────────────────────────────────────────────
// "John Smith" → "Smith, J."
function formatAPAAuthor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((p) => p[0].toUpperCase() + '.')
    .join(' ');
  return `${last}, ${initials}`;
}

function formatAPAAuthors(authors: string[]): string {
  if (authors.length === 0) return 'Unknown Author';
  if (authors.length === 1) return formatAPAAuthor(authors[0]);
  if (authors.length === 2)
    return `${formatAPAAuthor(authors[0])}, & ${formatAPAAuthor(authors[1])}`;
  // 3+ authors
  const all = authors.map(formatAPAAuthor);
  return all.slice(0, -1).join(', ') + ', & ' + all[all.length - 1];
}

// ── BibTeX key ────────────────────────────────────────────────────────────────
function bibtexKey(paper: Paper): string {
  const first = (paper.authors[0] || 'unknown').trim().split(/\s+/).pop() || 'unknown';
  const lastName = first.toLowerCase().replace(/[^a-z]/g, '');
  // Take first 3 significant words of title
  const titleWord = (paper.title || '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 1)
    .join('')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return `${lastName}${paper.publicationYear}${titleWord}`;
}

// ── BibTeX escape ─────────────────────────────────────────────────────────────
function btEscape(s: string): string {
  return s.replace(/[&%$#_{}~^\\]/g, (c) => `\\${c}`);
}

// ── Exported formatters ────────────────────────────────────────────────────────

export function toAPA(paper: Paper): string {
  const authors = formatAPAAuthors(paper.authors);
  const year = paper.publicationYear || 'n.d.';
  const title = paper.title || 'Untitled';
  // Sentence-case the title
  const titleSC = title.charAt(0).toUpperCase() + title.slice(1).toLowerCase();
  const source = paper.subject || '';
  return `${authors} (${year}). ${titleSC}${source ? `. ${source}` : ''}.`;
}

export function toBibTeX(paper: Paper): string {
  const key = bibtexKey(paper);
  const authors = paper.authors.length ? paper.authors.join(' and ') : 'Unknown';
  const year = paper.publicationYear || '';
  const title = paper.title || '';
  const subject = paper.subject || '';

  const lines = [
    `@article{${key},`,
    `  author  = {${btEscape(authors)}},`,
    `  title   = {${btEscape(title)}},`,
    `  year    = {${year}},`,
  ];
  if (subject) lines.push(`  subject = {${btEscape(subject)}},`);
  lines.push('}');
  return lines.join('\n');
}
