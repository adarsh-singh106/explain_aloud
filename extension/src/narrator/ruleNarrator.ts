import type { Block, HeadingStructured, ParagraphStructured, ListStructured } from '@/src/types/ir';
import type { NarrationSegment } from '@/src/types/narration';

/**
 * Normalizes text for speech by stripping visual-only phrasing like "as shown above/below".
 */
export function cleanSpokenText(text: string): string {
  let cleaned = text
    .replace(/(?:,\s*)?\bas\s+shown\s+(?:above|below|here)\b(?:\s*,)?/gi, '')
    .replace(/(?:,\s*)?\bas\s+seen\s+(?:above|below|here)\b(?:\s*,)?/gi, '')
    .replace(/\bplease\s+see\s+(?:the\s+)?(?:table|code|diagram|figure)\s+(?:above|below)\b/gi, '')
    .replace(/\bsee\s+(?:the\s+)?(?:table|code|diagram|figure)\s+(?:above|below)\b/gi, '')
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
  const cleaned = cleanSpokenText(rawText).replace(/\.$/, '');

  let spokenText: string;
  if (block.order === 0) {
    spokenText = `${cleaned}.`;
  } else {
    const lowerFirst = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
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

  items.forEach((item, index) => {
    let itemText = cleanSpokenText(item);
    if (!itemText) return;

    let spoken: string;
    if (isOrdered) {
      const orderPrefix = ORDER_WORDS[index] || `Step ${index + 1}`;
      spoken = `${orderPrefix}, ${itemText}`;
    } else {
      if (items.length > 1 && index === items.length - 1) {
        spoken = `Finally, ${itemText}`;
      } else {
        spoken = itemText;
      }
    }

    segments.push({
      id: `seg-${block.id}-${index}`,
      sourceBlockIds: [block.id],
      factIds: [],
      provenance: 'rule',
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
