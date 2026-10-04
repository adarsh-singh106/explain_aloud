import type {
  Block,
  BlockType,
  HeadingStructured,
  ParagraphStructured,
  ListStructured,
  CodeStructured,
  TableStructured,
  ResponseIR,
} from '@/src/types/ir';

/**
 * Extracts language name from class like "language-python" or "lang-js".
 */
function extractLanguage(element: Element): string | undefined {
  const codeEl = element.tagName.toLowerCase() === 'code' ? element : element.querySelector('code');
  const target = codeEl || element;
  const classNames = target.getAttribute('class') || '';
  const match = classNames.match(/(?:language|lang)-([\w#+-]+)/i);
  return match && match[1] ? match[1].toLowerCase() : undefined;
}

/**
 * Parses a single DOM element into a typed Block.
 */
export function parseElementToBlock(element: Element, index: number): Block {
  const tagName = element.tagName.toLowerCase();
  const raw = element.outerHTML;
  const id = `block-${index}`;

  if (/^h[1-6]$/.test(tagName)) {
    const level = parseInt(tagName.charAt(1), 10);
    const text = element.textContent?.trim() || '';
    const structured: HeadingStructured = { level, text };
    return {
      id,
      order: index,
      type: 'heading',
      raw,
      structured,
    };
  }

  if (tagName === 'p') {
    const text = element.textContent?.trim() || '';
    const structured: ParagraphStructured = { text };
    return {
      id,
      order: index,
      type: 'paragraph',
      raw,
      structured,
    };
  }

  if (tagName === 'ul' || tagName === 'ol') {
    const ordered = tagName === 'ol';
    const items: string[] = [];
    const liElements = element.querySelectorAll(':scope > li');
    liElements.forEach((li) => {
      items.push(li.textContent?.trim() || '');
    });

    const structured: ListStructured = { ordered, items };
    return {
      id,
      order: index,
      type: 'list',
      raw,
      structured,
    };
  }

  if (tagName === 'pre' || element.querySelector('code')) {
    const codeEl = element.querySelector('code') || element;
    const language = extractLanguage(element) || extractLanguage(codeEl) || 'plaintext';
    const code = codeEl.textContent || '';
    const structured: CodeStructured = { language, code };
    return {
      id,
      order: index,
      type: 'code',
      raw,
      language,
      structured,
    };
  }

  if (tagName === 'table') {
    const headers: string[] = [];
    const rows: string[][] = [];

    // Header cells: check <thead> or first <tr>
    const theadThs = element.querySelectorAll('thead th, thead td');
    if (theadThs.length > 0) {
      theadThs.forEach((th) => headers.push(th.textContent?.trim() || ''));
    } else {
      const firstRowThs = element.querySelectorAll('tr:first-child th');
      firstRowThs.forEach((th) => headers.push(th.textContent?.trim() || ''));
    }

    // Row cells: check <tbody> or non-header <tr>
    const bodyRows = element.querySelectorAll('tbody tr');
    const targetRows = bodyRows.length > 0 ? bodyRows : element.querySelectorAll('tr');

    targetRows.forEach((tr, trIdx) => {
      // If we used the first row as headers and there was no <thead>, skip the first row
      if (bodyRows.length === 0 && headers.length > 0 && trIdx === 0 && tr.querySelector('th')) {
        return;
      }
      const rowCells: string[] = [];
      tr.querySelectorAll('td, th').forEach((cell) => {
        rowCells.push(cell.textContent?.trim() || '');
      });
      if (rowCells.length > 0) {
        rows.push(rowCells);
      }
    });

    const structured: TableStructured = { headers, rows };
    return {
      id,
      order: index,
      type: 'table',
      raw,
      structured,
    };
  }

  // Fallback for unknown / generic containers to ensure no content silently disappears
  const text = element.textContent?.trim() || '';
  return {
    id,
    order: index,
    type: 'unknown',
    raw,
    structured: { tagName, text },
  };
}

/**
 * Finds the assistant response root in a document or element.
 */
function findAssistantContainer(root: ParentNode): Element {
  // Check fixture attribute
  const fixture = root.querySelector('[data-fixture="assistant-response"]');
  if (fixture) return fixture;

  // Check ChatGPT assistant role selector
  const chatgptAssistant = root.querySelector('[data-message-author-role="assistant"]');
  if (chatgptAssistant) return chatgptAssistant;

  // Check article element
  const article = root.querySelector('article');
  if (article) return article;

  // Fallback to body or root element
  if ('body' in root && (root as Document).body) {
    return (root as Document).body;
  }
  return root as Element;
}

/**
 * Parses an Element container into ResponseIR.
 */
export function parseResponseElement(container: Element, responseId = 'resp-0'): ResponseIR {
  const blocks: Block[] = [];
  const children = Array.from(container.children);

  let order = 0;
  for (const child of children) {
    // Skip empty script / style tags
    const tag = child.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style') {
      continue;
    }

    // Ignore whitespace-only unknown elements
    if (!child.textContent?.trim() && !child.querySelector('img, table, pre, code')) {
      continue;
    }

    blocks.push(parseElementToBlock(child, order++));
  }

  return {
    schemaVersion: '1.0',
    site: 'chatgpt',
    responseId,
    blocks,
    facts: [],
  };
}

/**
 * Parses an HTML string into ResponseIR.
 */
export function parseResponseHtml(html: string, responseId = 'resp-fixture'): ResponseIR {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const targetContainer = findAssistantContainer(doc);
  return parseResponseElement(targetContainer, responseId);
}
