import { ParagraphSegment, SentenceSegment } from '../types';

const DEFAULT_MAX_SENTENCE_CHARS = 360;
const SENTENCE_SPLIT_REGEX = /[^.!?]+[.!?]+|[^.!?]+$/g;

const normalizeText = (text: string) => {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.replace(/\n{3,}/g, '\n\n').trim();
};

const splitIntoParagraphs = (text: string) => {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized.split(/\n\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
};

const splitSentence = (sentence: string, maxChars: number) => {
  if (sentence.length <= maxChars) return [sentence];
  const chunks: string[] = [];
  let current = '';
  const words = sentence.split(/\s+/);
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) chunks.push(current);
  return chunks;
};

const splitIntoSentences = (paragraph: string, maxChars: number) => {
  const matches = paragraph.match(SENTENCE_SPLIT_REGEX);
  if (!matches) return [paragraph.trim()].filter(Boolean);
  const sentences: string[] = [];
  matches
    .map((match) => match.trim())
    .filter(Boolean)
    .forEach((sentence) => {
      splitSentence(sentence, maxChars).forEach((chunk) => {
        if (chunk.trim()) sentences.push(chunk.trim());
      });
    });
  return sentences;
};

export const buildParagraphSegments = (text: string, maxSentenceChars = DEFAULT_MAX_SENTENCE_CHARS) => {
  const paragraphs = splitIntoParagraphs(text);
  let cursor = 0;
  const segments: ParagraphSegment[] = paragraphs.map((paragraph, paragraphIndex) => {
    const sentences = splitIntoSentences(paragraph, maxSentenceChars);
    const sentenceSegments: SentenceSegment[] = sentences.map((sentence, sentenceIndex) => ({
      id: `p${paragraphIndex}-s${sentenceIndex}`,
      paragraphIndex,
      sentenceIndex,
      text: sentence,
    }));
    const startOffset = text.indexOf(paragraph, cursor);
    const safeStartOffset = startOffset >= 0 ? startOffset : cursor;
    const endOffset = safeStartOffset + paragraph.length;
    cursor = endOffset;

    return {
      id: `p${paragraphIndex}`,
      paragraphIndex,
      text: paragraph,
      startOffset: safeStartOffset,
      endOffset,
      sentences: sentenceSegments,
    };
  });

  return segments;
};

export const flattenSentences = (paragraphs: ParagraphSegment[]) => {
  return paragraphs.flatMap((paragraph) => paragraph.sentences);
};

export const getSentenceByPosition = (
  paragraphs: ParagraphSegment[],
  paragraphIndex: number,
  sentenceIndex: number
) => {
  const paragraph = paragraphs[paragraphIndex];
  if (!paragraph) return null;
  return paragraph.sentences[sentenceIndex] || null;
};

export const getNextPosition = (paragraphs: ParagraphSegment[], paragraphIndex: number, sentenceIndex: number) => {
  const paragraph = paragraphs[paragraphIndex];
  if (!paragraph) return null;
  if (sentenceIndex + 1 < paragraph.sentences.length) {
    return { paragraphIndex, sentenceIndex: sentenceIndex + 1 };
  }
  const nextParagraphIndex = paragraphIndex + 1;
  const nextParagraph = paragraphs[nextParagraphIndex];
  if (!nextParagraph || nextParagraph.sentences.length === 0) return null;
  return { paragraphIndex: nextParagraphIndex, sentenceIndex: 0 };
};

export const getPreviousPosition = (
  paragraphs: ParagraphSegment[],
  paragraphIndex: number,
  sentenceIndex: number
) => {
  const paragraph = paragraphs[paragraphIndex];
  if (!paragraph) return null;
  if (sentenceIndex - 1 >= 0) {
    return { paragraphIndex, sentenceIndex: sentenceIndex - 1 };
  }
  const prevParagraphIndex = paragraphIndex - 1;
  if (prevParagraphIndex < 0) return null;
  const prevParagraph = paragraphs[prevParagraphIndex];
  if (!prevParagraph || prevParagraph.sentences.length === 0) return null;
  return { paragraphIndex: prevParagraphIndex, sentenceIndex: prevParagraph.sentences.length - 1 };
};
