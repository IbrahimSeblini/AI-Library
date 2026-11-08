import type { ReadAloudSource } from '../types';

const isPdf = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
const isEpub = (file: File) => file.name.toLowerCase().endsWith('.epub');

const extractPdfText = async (file: File) => {
  const pdfjs = await import('pdfjs-dist');
  const workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  (pdfjs as any).GlobalWorkerOptions.workerSrc = workerSrc;

  const buffer = await file.arrayBuffer();
  const loadingTask = (pdfjs as any).getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = (content.items as Array<{ str?: string }>).map((item) => item.str || '').join(' ');
    pageTexts.push(pageText.trim());
  }

  return pageTexts.filter(Boolean).join('\n\n');
};

const extractEpubText = async (file: File) => {
  const epubModule = await import('epubjs');
  const ePub = (epubModule as any).default || (epubModule as any);
  const buffer = await file.arrayBuffer();
  const book = ePub(buffer);
  await book.ready;

  const spineItems = book.spine?.items || book.spine?.spineItems || [];
  const sections: string[] = [];

  for (const item of spineItems) {
    try {
      const sectionMarkup = await book.load(item.href);
      const parsed = new DOMParser().parseFromString(sectionMarkup, 'text/html');
      const text = parsed.body?.textContent || '';
      if (text.trim()) sections.push(text.trim());
      book.unload(item.href);
    } catch {
      // Keep going on a best-effort basis.
    }
  }

  book.destroy();
  return sections.join('\n\n');
};

export const extractTextFromFile = async (file: File): Promise<ReadAloudSource> => {
  if (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt')) {
    const text = await file.text();
    return { text, label: file.name };
  }

  if (isPdf(file)) {
    const text = await extractPdfText(file);
    return { text, label: file.name };
  }

  if (isEpub(file)) {
    const text = await extractEpubText(file);
    return { text, label: file.name };
  }

  throw new Error('Unsupported file type. Please upload a TXT, PDF, or EPUB file.');
};
