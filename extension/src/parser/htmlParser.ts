import type {
  Block,
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
 * Parses a single DOM element or Node into a typed Block.
 */
export function parseElementToBlock(element: Element, index: number): Block {
  const tagName = element.tagName.toLowerCase();
  const raw = element.outerHTML;
  const id = `block-${index}`;

  // 1. Unwrap presentation containers (e.g. div.table-wrapper or div.code-block)
  if (tagName === 'div' || tagName === 'section') {
    const tableChild = element.querySelector(':scope > table') || (element.children.length === 1 ? element.querySelector('table') : null);
    if (tableChild) {
      return parseElementToBlock(tableChild, index);
    }
    const preChild = element.querySelector(':scope > pre') || (element.children.length === 1 ? element.querySelector('pre') : null);
    if (preChild) {
      return parseElementToBlock(preChild, index);
    }
  }

  // 2. Heading: <h1> - <h6>
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

  // 3. Paragraph: <p>
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

  // 4. List: <ul> or <ol>
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

  // 5. Table: <table> (Must precede code block detection to avoid inline <code> stealing tables!)
  if (tagName === 'table') {
    const headers: string[] = [];
    const rows: string[][] = [];

    // Header cells: check <thead> or first <tr>
    const theadThs = element.querySelectorAll('thead th, thead td');
    if (theadThs.length > 0) {
      theadThs.forEach((th) => headers.push(th.textContent?.trim() || ''));
    } else {
      const firstRowThs = element.querySelectorAll('tr:first-child th');
      if (firstRowThs.length > 0) {
        firstRowThs.forEach((th) => headers.push(th.textContent?.trim() || ''));
      }
    }

    // Row cells: check all <tr> elements
    const allTrs = Array.from(element.querySelectorAll('tr'));
    allTrs.forEach((tr, trIdx) => {
      // If we used the first row as headers and there was no <thead>, skip the first row
      if (theadThs.length === 0 && headers.length > 0 && trIdx === 0) {
        return;
      }
      // Check if tr is in thead
      if (tr.parentElement?.tagName.toLowerCase() === 'thead') {
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

    // If headers still empty but rows exist, synthesize or use row 1
    if (headers.length === 0 && rows.length > 0) {
      const colCount = rows[0]?.length || 0;
      for (let c = 0; c < colCount; c++) {
        headers.push(`Column ${c + 1}`);
      }
    }

    const structured: TableStructured = { headers, rows };
    return {
      id,
      order: index,
      type: 'table',
      raw,
      structured,
    };
  }

  // 6. Code: <pre> or standalone <code> block
  if (tagName === 'pre' || tagName === 'code') {
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
 * Parses an Element container into ResponseIR preserving text nodes and nested elements in document order.
 */
export function parseResponseElement(container: Element, responseId = 'resp-0'): ResponseIR {
  const blocks: Block[] = [];
  let order = 0;

  // Find inner content container (e.g. .markdown, .prose) if present
  const contentRoot = container.querySelector('.markdown, .prose') || container;

  function processNode(node: Node) {
    // 1. Text nodes directly under the root container
    if (node.nodeType === 3 /* Node.TEXT_NODE */) {
      const text = node.textContent?.trim();
      if (text) {
        blocks.push({
          id: `block-${order}`,
          order: order++,
          type: 'paragraph',
          raw: `<p>${text}</p>`,
          structured: { text } as ParagraphStructured,
        });
      }
      return;
    }

    if (node.nodeType !== 1 /* Node.ELEMENT_NODE */) {
      return;
    }

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    // Skip scripts, styles, and injected UI chrome
    if (tag === 'script' || tag === 'style' || el.classList.contains('explain-aloud-btn-container')) {
      return;
    }

    // Ignore whitespace-only unknown elements
    if (!el.textContent?.trim() && !el.querySelector('img, table, pre, code')) {
      return;
    }

    // If it's a generic div or section containing multiple semantic block children, unwrap and process children
    if ((tag === 'div' || tag === 'section') && el.children.length > 1 && !el.querySelector(':scope > table, :scope > pre')) {
      Array.from(el.childNodes).forEach(processNode);
      return;
    }

    blocks.push(parseElementToBlock(el, order++));
  }

  Array.from(contentRoot.childNodes).forEach(processNode);

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
