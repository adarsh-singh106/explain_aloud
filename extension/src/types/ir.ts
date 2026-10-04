export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'code'
  | 'table'
  | 'unknown';

export interface HeadingStructured {
  level: number;
  text: string;
}

export interface ParagraphStructured {
  text: string;
}

export interface ListStructured {
  ordered: boolean;
  items: string[];
}

export interface CodeStructured {
  language: string;
  code: string;
}

export interface TableStructured {
  headers: string[];
  rows: string[][];
}

export type BlockStructured =
  | HeadingStructured
  | ParagraphStructured
  | ListStructured
  | CodeStructured
  | TableStructured
  | unknown;

export interface Block {
  id: string;
  order: number;
  type: BlockType;
  raw: string;
  language?: string;
  structured?: BlockStructured;
}

export type FactKind =
  | 'number'
  | 'comparison'
  | 'identifier'
  | 'negation'
  | 'relation';

export interface Fact {
  id: string;
  sourceBlockIds: string[];
  kind: FactKind;
  value: unknown;
  critical: boolean;
}

export interface ResponseIR {
  schemaVersion: '1.0';
  site: 'chatgpt';
  responseId: string;
  blocks: Block[];
  facts: Fact[];
}
