import type {
  Block,
  HeadingStructured,
  ParagraphStructured,
  ListStructured,
  ListItemPart,
  CodeStructured,
  TableStructured,
  ResponseIR,
} from '@/src/types/ir';

const INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdo', 'cite', 'code', 'dfn', 'em', 'i', 'kbd',
  'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup',
  'time', 'u', 'var',
]);

/**
 * Extracts language name from class like "language-python" or "lang-js".
 */
function extractLanguage(element: Element): string | undefined {
  const codeEl = element.tagName.toLowerCase() === 'code' ? element : element.querySelector('code');
  let genericLanguage: string | undefined;
  for (const target of [codeEl, element]) {
    if (!target) continue;
    const explicit = target.getAttribute('data-language') || target.getAttribute('data-lang');
    const match = (target.getAttribute('class') || '').match(/(?:language|lang)-([\w#+-]+)/i);
    const language = explicit?.match(/^[\w#+-]+$/) ? explicit.toLowerCase() : match?.[1]?.toLowerCase();
    if (language && !['plaintext', 'text'].includes(language)) return language;
    genericLanguage ||= language;
  }
  const pre = element.closest('pre') || element.querySelector('pre');
  if (!pre) return genericLanguage;
  // Read labels only inside this code block or its immediate header sibling.
  for (const header of Array.from(pre.querySelectorAll('div, span'))) {
    const language = codeHeaderLanguage(header);
    if (language) return language;
  }
  let target: Element = pre;
  for (let depth = 0; depth < 3; depth++) {
    const sibling = target.previousElementSibling;
    if (sibling) return codeHeaderLanguage(sibling) || genericLanguage;
    const parent = target.parentElement;
    if (!parent || parent.matches('.markdown, .prose, li, [data-message-author-role]')) break;
    target = parent;
  }
  return genericLanguage;
}

const LANGUAGE_LABELS = new Set('python javascript typescript js ts jsx tsx java c c++ c# cpp csharp go rust ruby php swift kotlin bash shell sh sql html css json yaml yml xml markdown plaintext text powershell r'.split(' '));

function codeHeaderLanguage(el: Element): string | undefined {
  if (!el.matches('div, span') || el.closest('code') || el.querySelector('pre, code')) return undefined;
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('button, svg').forEach(node => node.remove());
  const label = clone.textContent?.trim().toLowerCase() || '';
  return LANGUAGE_LABELS.has(label) ? label : undefined;
}

/**
 * Extracts inner text of an element preserving boundaries between block/inline children.
 * Inline elements (like code, span) remain adjacent without artificial spaces.
 */
function extractElementTextWithBoundaries(el: Element): string {
  function traverse(node: Node): string {
    if (node.nodeType === 3 /* Node.TEXT_NODE */) {
      return node.textContent || '';
    }
    if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
      const childEl = node as Element;
      const tag = childEl.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style') {
        return '';
      }
      if (tag === 'br') {
        return '\n';
      }

      const isBlock = !INLINE_TAGS.has(tag);
      let innerText = '';
      for (const child of Array.from(childEl.childNodes)) {
        innerText += traverse(child);
      }

      if (isBlock) {
        return ` ${innerText.trim()} `;
      }
      return innerText;
    }
    return '';
  }

  let result = '';
  for (const child of Array.from(el.childNodes)) {
    result += traverse(child);
  }
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Checks if an element is a ChatGPT code block header (typically language name + Copy button).
 */
function isCodeBlockHeader(el: Element): boolean {
  if (el.querySelector('pre, code') || el.closest('code')) return false;
  const next = el.nextElementSibling;
  if (codeHeaderLanguage(el) && (el.closest('pre') || next?.matches('pre') || next?.querySelector('pre'))) return true;
  const tag = el.tagName.toLowerCase();
  if (tag !== 'div') return false;
  const buttons = Array.from(el.querySelectorAll('button'));
  const hasCopyBtn = buttons.some(b => /\bcopy\b/i.test(b.textContent || ''));
  if (!hasCopyBtn) return false;
  
  const btnTextLen = buttons.reduce((sum, b) => sum + (b.textContent || '').length, 0);
  const totalTextLen = (el.textContent || '').length;
  return (totalTextLen - btnTextLen) < 25; // Only short language name allowed besides the button
}

/**
 * Checks if a container has meaningful sibling content apart from the target element.
 * Considers text nodes, spans, warnings, and other semantic elements.
 */
function hasMeaningfulContentApartFrom(container: Element, target: Element): boolean {
  for (const child of Array.from(container.childNodes)) {
    if (child === target || target.contains(child)) {
      continue;
    }
    if (child.nodeType === 3 /* Node.TEXT_NODE */) {
      if (child.textContent && child.textContent.trim().length > 0) {
        return true;
      }
    } else if (child.nodeType === 1 /* Node.ELEMENT_NODE */) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      // Skip ignorable UI chrome and code block headers
      if (tag === 'script' || tag === 'style' || tag === 'button' || el.classList.contains('explain-aloud-btn-container') || isCodeBlockHeader(el)) {
        continue;
      }
      if (el.contains(target)) {
        if (hasMeaningfulContentApartFrom(el, target)) {
          return true;
        }
      } else {
        if (el.textContent && el.textContent.trim().length > 0) {
          return true;
        }
        if (/^(?:table|pre|code|img|ul|ol|p|h[1-6]|span|strong|em|b|i|a|blockquote)$/.test(tag)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Checks if a container is exclusively a single table wrapper without other semantic blocks.
 */
function isSingleTableWrapper(el: Element): Element | null {
  const tables = el.querySelectorAll('table');
  if (tables.length !== 1) return null;
  const table = tables[0]!;
  if (hasMeaningfulContentApartFrom(el, table)) {
    return null;
  }
  return table;
}

/**
 * Checks if a container is exclusively a single code wrapper without other semantic blocks.
 */
function isSingleCodeWrapper(el: Element): Element | null {
  const pres = el.querySelectorAll('pre');
  if (pres.length !== 1) return null;
  const pre = pres[0]!;
  if (hasMeaningfulContentApartFrom(el, pre)) {
    return null;
  }
  return pre;
}

/**
 * Parses structured parts of a list item to preserve block-level code blocks
 * while keeping all inline text and code properly adjacent.
 */
function parseListItemParts(li: Element): ListItemPart[] {
  const parts: ListItemPart[] = [];
  let currentContainer = li.ownerDocument.createElement('div');

  function flushText() {
    if (currentContainer.childNodes.length > 0) {
      const text = extractElementTextWithBoundaries(currentContainer);
      if (text.trim()) {
        parts.push({ type: 'text', text });
      }
      currentContainer = li.ownerDocument.createElement('div');
    }
  }

  function processChild(node: Node) {
    if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
      const el = node as Element;
      // Skip ChatGPT chrome before it gets appended
      if (isCodeBlockHeader(el) || el.classList.contains('explain-aloud-btn-container')) {
        return;
      }
      if (el.tagName.toLowerCase() === 'pre') {
        flushText();
        const codeEl = el.querySelector('code') || el;
        const language = extractLanguage(el) || extractLanguage(codeEl) || 'plaintext';
        parts.push({ type: 'code-block', code: codeEl.textContent || '', language });
        return;
      }
      if (el.querySelector('pre')) {
        Array.from(el.childNodes).forEach(processChild);
        return;
      }
    }
    
    // Accumulate all other nodes (text, inline code, paragraphs)
    currentContainer.appendChild(node.cloneNode(true));
  }

  Array.from(li.childNodes).forEach(processChild);
  flushText();

  return parts;
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
    const singleTable = isSingleTableWrapper(element);
    if (singleTable) {
      return parseElementToBlock(singleTable, index);
    }
    const singleCode = isSingleCodeWrapper(element);
    if (singleCode) {
      return parseElementToBlock(singleCode, index);
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

  // 3. Paragraph: <p>, <span>
  if (tagName === 'p' || tagName === 'span') {
    const text = extractElementTextWithBoundaries(element) || element.textContent?.trim() || '';
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
    const startAttr = element.getAttribute('start');
    const start = (ordered && startAttr) ? parseInt(startAttr, 10) : undefined;
    const items: string[] = [];
    const itemParts: ListItemPart[][] = [];
    const liElements = element.querySelectorAll(':scope > li');
    liElements.forEach((li) => {
      const parts = parseListItemParts(li);
      const itemText = extractElementTextWithBoundaries(li);
      if (itemText || parts.length > 0) {
        itemParts.push(parts);
        items.push(itemText);
      }
    });

    const structured: ListStructured = {
      ordered,
      items,
      ...(start !== undefined && !isNaN(start) ? { start } : {}),
      ...(itemParts.length > 0 ? { itemParts } : {}),
    };
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

    // Skip scripts, styles, injected UI chrome, and ChatGPT code block headers
    if (tag === 'script' || tag === 'style' || el.classList.contains('explain-aloud-btn-container') || isCodeBlockHeader(el)) {
      return;
    }

    // Ignore whitespace-only unknown elements
    if (!el.textContent?.trim() && !el.querySelector('img, table, pre, code')) {
      return;
    }

    // Presentation containers: unwrap unless it's exclusively a single-block wrapper
    const isContainer = /^(?:div|section|article|main|header|footer)$/.test(tag);
    if (isContainer) {
      const singleTable = isSingleTableWrapper(el);
      if (singleTable) {
        blocks.push(parseElementToBlock(singleTable, order++));
        return;
      }

      const singleCode = isSingleCodeWrapper(el);
      if (singleCode) {
        blocks.push(parseElementToBlock(singleCode, order++));
        return;
      }

      // If container has children, unwrap and process each child in document order
      if (el.children.length > 0) {
        Array.from(el.childNodes).forEach(processNode);
        return;
      }
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
