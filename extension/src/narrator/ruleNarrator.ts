import type { Block, HeadingStructured, ParagraphStructured, ListStructured } from '@/src/types/ir';
import type { NarrationSegment } from '@/src/types/narration';

/**
 * Normalizes text for speech by stripping visual-only phrasing like "as shown above/below".
 */
export function cleanSpokenText(text: string): string {
  let cleaned = text
    .replace(/(?:,\s*)?\bas\s+(?:shown|seen|indicated|described)\s+(?:above|below|here)\b(?:\s*,)?/gi, '')
    .replace(/\bplease\s+see\s+(?:the\s+)?(?:table|code|diagram|figure|chart|image)\s+(?:above|below)\b/gi, '')
    .replace(/\bsee\s+(?:the\s+)?(?:table|code|diagram|figure|chart|image)\s+(?:above|below)\b/gi, '')
    .replace(/\bin\s+the\s+(?:table|figure|diagram|chart|image)\s+(?:above|below)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Strip leading punctuation like dangling commas
  cleaned = cleaned.replace(/^[,\s;:]+/, '').trim();

  // Ensure initial letter is capitalized if a sentence starts
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // Ensure appropriate ending punctuation
  if (cleaned.length > 0 && !/[.?!]$/.test(cleaned)) {
    cleaned += '.';
  }

  return cleaned;
}

/**
 * Generates a spoken transition for a heading block.
 * e.g., "Choosing a model." or "Next, why this matters."
 */
export function narrateHeading(block: Block): NarrationSegment {
  const structured = block.structured as HeadingStructured | undefined;
  const rawText = structured?.text || block.raw.replace(/<[^>]+>/g, '').trim();
  // Only normalize a small ordinary-word vocabulary. Unknown names, acronyms,
  // mixed-case identifiers, and headings containing explicit code stay intact.
  const ordinary = new Set('a an the and or for to of in with why this matters small simple list table example overview introduction conclusion summary next steps'.split(' '));
  const normalized = /<code\b/i.test(block.raw) ? rawText : rawText.replace(/\b[A-Za-z]+\b/g, word =>
    /^[A-Z]?[a-z]+$/.test(word) && ordinary.has(word.toLowerCase()) ? word.toLowerCase() : word);
  let cleaned = cleanSpokenText(normalized).replace(/\.$/, '');
  const originalFirst = normalized.match(/^[A-Za-z]+/)?.[0] || '';
  if (/^[a-z]/.test(originalFirst) && (!ordinary.has(originalFirst.toLowerCase()) || /<code\b/i.test(block.raw))) {
    cleaned = normalized.charAt(0) + cleaned.slice(1);
  }

  let spokenText: string;
  if (block.order === 0) {
    spokenText = `${cleaned}.`;
  } else {
    const firstWord = cleaned.match(/^[A-Za-z]+/)?.[0] || '';
    const lowerFirst = !/<code\b/i.test(block.raw) && ordinary.has(firstWord.toLowerCase()) && /^[A-Z][a-z]+$/.test(firstWord)
      ? cleaned.charAt(0).toLowerCase() + cleaned.slice(1) : cleaned;
    spokenText = `Next, ${lowerFirst}.`;
  }

  return {
    id: `seg-${block.id}`,
    sourceBlockIds: [block.id],
    factIds: [],
    provenance: 'rule',
    text: spokenText,
    verified: true,
    pauseAfterMs: 450,
  };
}

/**
 * Narrates a paragraph block preserving near-direct meaning while removing visual-only references.
 */
export function narrateParagraph(block: Block): NarrationSegment {
  const structured = block.structured as ParagraphStructured | undefined;
  const rawText = structured?.text || block.raw.replace(/<[^>]+>/g, '').trim();
  const spokenText = cleanSpokenText(rawText);

  return {
    id: `seg-${block.id}`,
    sourceBlockIds: [block.id],
    factIds: [],
    provenance: 'rule',
    text: spokenText,
    verified: true,
    pauseAfterMs: 350,
  };
}

const ORDER_WORDS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

/**
 * Narrates a list block naturally grouping items without ever saying "bullet".
 */
export function narrateList(block: Block): NarrationSegment[] {
  const structured = block.structured as ListStructured | undefined;
  const items = structured?.items || [];

  if (items.length === 0) {
    return [];
  }

  const segments: NarrationSegment[] = [];
  const isOrdered = structured?.ordered ?? false;
  const itemParts = structured?.itemParts;

  items.forEach((item, index) => {
    const parts = itemParts?.[index];
    const hasCodeBlock = parts && parts.some((p) => p.type === 'code-block');

    let itemNumberPrefix = '';
    if (isOrdered) {
      const itemNumber = (structured?.start ?? 1) + index;
      const orderPrefix = (itemNumber >= 1 && itemNumber <= 10)
        ? ORDER_WORDS[itemNumber - 1]
        : `Step ${itemNumber}`;
      itemNumberPrefix = `${orderPrefix}, `;
    } else if (items.length > 1 && index === items.length - 1 && !hasCodeBlock) {
      itemNumberPrefix = 'Finally, ';
    }

    let spoken: string;

    if (hasCodeBlock && parts) {
      const partTexts: string[] = [];
      parts.forEach((p) => {
        if (p.type === 'code-block') {
          partTexts.push(formatLiteralCode(p.code || '', p.language || 'code'));
        } else if (p.type === 'inline-code') {
          if (p.code) partTexts.push(p.code);
        } else if (p.type === 'text' && p.text) {
          const cleaned = cleanSpokenText(p.text);
          if (cleaned) partTexts.push(cleaned);
        }
      });
      spoken = `${itemNumberPrefix}${partTexts.join('\n')}`.trim();
    } else {
      const itemText = cleanSpokenText(item);
      if (!itemText) return;
      spoken = `${itemNumberPrefix}${itemText}`;
    }

    if (!spoken) return;

    segments.push({
      id: `seg-${block.id}-${index}`,
      sourceBlockIds: [block.id],
      factIds: [],
      provenance: hasCodeBlock ? 'literal' : 'rule',
      text: spoken,
      verified: true,
      pauseAfterMs: index === items.length - 1 ? 400 : 250,
    });
  });

  return segments;
}

/**
 * Generates rule-based narration for standard simple blocks (paragraph, heading, list).
 * Returns null if the block requires LLM narration (e.g. code, table) or is unsupported.
 */
export function narrateBlockWithRules(block: Block): NarrationSegment[] | null {
  switch (block.type) {
    case 'heading':
      return [narrateHeading(block)];
    case 'paragraph':
      return [narrateParagraph(block)];
    case 'list':
      return narrateList(block);
    default:
      return null;
  }
}

/**
 * Formats a code block for literal narration, preserving line structure and meaningful indentation.
 */
export function formatLiteralCode(code: string, language: string): string {
  const rawLines = code.split('\n');
  while (rawLines.length > 0 && rawLines[rawLines.length - 1]!.trim() === '') {
    rawLines.pop();
  }
  while (rawLines.length > 0 && rawLines[0]!.trim() === '') {
    rawLines.shift();
  }

  if (rawLines.length <= 1 && !/^\s+/.test(rawLines[0] || '')) {
    return `Code snippet in ${language}: ${(rawLines[0] || '').trim()}`;
  }

  const formattedLines = rawLines.map((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    if (!trimmed) {
      return `Line ${lineNum}: blank`;
    }
    const leadingSpaces = line.match(/^(\s+)/);
    let indentPrefix = '';
    if (leadingSpaces) {
      const ws = leadingSpaces[1]!;
      const tabs = (ws.match(/\t/g) || []).length;
      const spaces = (ws.match(/ /g) || []).length;
      const parts = [];
      if (tabs > 0) parts.push(`${tabs} tab${tabs > 1 ? 's' : ''}`);
      if (spaces > 0) parts.push(`${spaces} space${spaces > 1 ? 's' : ''}`);
      if (parts.length > 0) {
        indentPrefix = `, indent ${parts.join(' and ')}`;
      }
    }
    return `Line ${lineNum}${indentPrefix}: ${trimmed}`;
  });

  return `Code snippet in ${language}:\n${formattedLines.join('\n')}`;
}

