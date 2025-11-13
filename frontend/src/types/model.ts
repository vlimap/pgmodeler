export type Column = {
  id: string;
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isIndexed: boolean;
  comment?: string;
};

export type ForeignKey = {
  id: string;
  name: string;
  fromColumnId: string;
  toTableId: string;
  toColumnId: string;
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
  comment?: string;
  // optional stored cardinality overrides
  startCardinality?: 'one' | 'many';
  endCardinality?: 'one' | 'many';
};

export type ReferentialAction =
  | 'NO ACTION'
  | 'RESTRICT'
  | 'CASCADE'
  | 'SET NULL'
  | 'SET DEFAULT';

export type TablePosition = {
  x: number;
  y: number;
};

export type Table = {
  id: string;
  schemaId: string;
  name: string;
  comment?: string;
  columns: Column[];
  foreignKeys: ForeignKey[];
  position?: TablePosition;
};

export type Schema = {
  id: string;
  name: string;
  comment?: string;
};

export type EnumType = {
  id: string;
  schemaId: string;
  name: string;
  kind: 'enum';
  values: string[];
  comment?: string;
};

export type CustomType = EnumType;

export type DbModel = {
  version: 1;
  schemas: Schema[];
  tables: Table[];
  types: CustomType[];
};
