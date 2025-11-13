import { Parser as DBMLParser } from '@dbml/core';
import type {
  Column,
  CustomType,
  DbModel,
  ForeignKey,
  Schema,
  Table,
} from '../types/model';

const createId = () =>
  (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

const sanitizeIdent = (value: unknown): string => {
  if (value == null) return '';
  const raw = String(value).trim();
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/""/g, '"');
  }
  return raw;
};

const tableKey = (schema: string, table: string) => `${schema.toLowerCase()}.${table.toLowerCase()}`;

type DBMLDatabase = any;

const normaliseRule = (rule: unknown) => {
  if (!rule) return undefined;
  const value = String(rule).toUpperCase();
  if (value.includes('CASCADE')) return 'CASCADE';
  if (value.includes('SET NULL')) return 'SET NULL';
  if (value.includes('SET DEFAULT')) return 'SET DEFAULT';
  if (value.includes('RESTRICT')) return 'RESTRICT';
  if (value.includes('NO ACTION')) return 'NO ACTION';
  return undefined;
};

const resolveTypeName = (type: any): string => {
  if (!type) return 'text';
  if (typeof type === 'string') return type;
  if (typeof type.type_name === 'string') return type.type_name;
  if (typeof type.name === 'string') return type.name;
  return 'text';
};

const extractDefault = (value: any): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (typeof value.value === 'string') return value.value;
    if (typeof value.name === 'string') return value.name;
  }
  return undefined;
};

const splitQualified = (qualified: string): [string, string] => {
  const safe = sanitizeIdent(qualified);
  if (safe.length === 0) return ['public', ''];
  const parts = safe.split('.');
  if (parts.length === 2) {
    return [sanitizeIdent(parts[0]), sanitizeIdent(parts[1])];
  }
  return ['public', sanitizeIdent(parts[0])];
};

const normalizeSchemaName = (name: string): string =>
  sanitizeIdent(name) || 'public';

const getEndpointColumns = (endpoint: any): string[] => {
  if (!endpoint) return [];
  const buffer: unknown[] = [];
  if (Array.isArray(endpoint.fieldNames)) buffer.push(...endpoint.fieldNames);
  if (Array.isArray(endpoint.columnNames)) buffer.push(...endpoint.columnNames);
  if (Array.isArray(endpoint.fields)) {
    endpoint.fields.forEach((field: any) => {
      if (field?.name) buffer.push(field.name);
    });
  }
  return buffer
    .map((entry) => sanitizeIdent(entry))
    .filter((entry) => entry.length > 0);
};

export const sqlToDbModelWithDbml = (sql: string): DbModel => {
  const parser = new DBMLParser();
  const db: DBMLDatabase = parser.parse(sql, 'postgres');

  const schemas: Schema[] = [];
  const schemaIndex = new Map<string, Schema>();

  const ensureSchema = (name: string): Schema => {
    const normalised = normalizeSchemaName(name);
    const existing = schemaIndex.get(normalised);
    if (existing) return existing;
    const schema: Schema = { id: createId(), name: normalised };
    schemaIndex.set(normalised, schema);
    schemas.push(schema);
    return schema;
  };

  if (Array.isArray(db.schemas)) {
    db.schemas.forEach((schema: any) => {
      ensureSchema(schema?.name ?? 'public');
    });
  }
  if (!schemaIndex.has('public')) {
    ensureSchema('public');
  }

  const tables: Table[] = [];
  const tableIndex = new Map<string, TableDraft>();

  type TableDraft = {
    table: Table;
    columnByName: Map<string, Column>;
  };

  const registerTable = (schemaName: string, tableData: any) => {
    const schema = ensureSchema(schemaName);
    const tableName = sanitizeIdent(tableData.name);
    const table: Table = {
      id: createId(),
      schemaId: schema.id,
      name: tableName || 'sem_nome',
      comment: tableData.note || tableData.comment,
      columns: [],
      foreignKeys: [],
    };
    const columnByName = new Map<string, Column>();

    const fields = tableData.fields ?? tableData.columns ?? [];

    fields.forEach((column: any) => {
      const columnName = sanitizeIdent(column.name);
      if (!columnName) {
        return;
      }
      const isPrimaryKey = !!column.pk;
      const notNull =
        column.not_null === true ||
        String(column.not_null ?? '').toLowerCase() === 'not null';
      const col: Column = {
        id: createId(),
        name: columnName,
        type: resolveTypeName(column.type),
        nullable: !(notNull || isPrimaryKey),
        defaultValue: extractDefault(column.dbdefault ?? column.default),
        isPrimaryKey,
        isUnique: !!column.unique && !column.pk,
        isIndexed: false,
        comment: column.note || column.comment,
      };
      columnByName.set(col.name, col);
      table.columns.push(col);
    });

    (tableData.indexes ?? []).forEach((index: any) => {
      const columns = (index.columns ?? [])
        .map((entry: any) => sanitizeIdent(entry?.value ?? entry?.name))
        .filter(Boolean);
      if (index.pk) {
        columns.forEach((name: string) => {
          const column = columnByName.get(name);
          if (column) {
            column.isPrimaryKey = true;
            column.isUnique = true;
            column.isIndexed = true;
            column.nullable = false;
          }
        });
      } else if (index.unique) {
        columns.forEach((name: string) => {
          const column = columnByName.get(name);
          if (column && !column.isPrimaryKey) {
            column.isUnique = true;
            column.isIndexed = true;
          }
        });
      } else {
        columns.forEach((name: string) => {
          const column = columnByName.get(name);
          if (column) {
            column.isIndexed = true;
          }
        });
      }
    });

    tables.push(table);
    tableIndex.set(tableKey(schema.name, table.name), { table, columnByName });
  };

  (db.schemas ?? []).forEach((schema: any) => {
    const schemaName = normalizeSchemaName(schema?.name ?? 'public');
    (schema.tables ?? []).forEach((table: any) => registerTable(schemaName, table));
  });

  const getSchemaAndTable = (endpoint: any) => {
    if (!endpoint) return { schema: 'public', table: '' };
    const schemaName = sanitizeIdent(endpoint.schemaName);
    const tableName = sanitizeIdent(endpoint.tableName);
    if (schemaName && tableName) {
      return { schema: schemaName, table: tableName }; // table already without schema prefix
    }
    const [fallbackSchema, fallbackTable] = splitQualified(tableName || '');
    return {
      schema: schemaName || fallbackSchema,
      table: tableName || fallbackTable,
    };
  };

  const collectRefs = (refs: any[]) => {
    refs.forEach((ref: any) => {
      const endpoints = ref?.endpoints ?? [];
      if (endpoints.length < 2) return;

      const chooseSource = (endpoint: any) => {
        const relation = String(endpoint?.relation ?? '').toLowerCase();
        return relation.includes('*') || relation.includes('{') || relation.includes('n');
      };

      const [epA, epB] = endpoints as [any, any];
      const sourceEp = chooseSource(epA) ? epA : chooseSource(epB) ? epB : epA;
      const targetEp = sourceEp === epA ? epB : epA;

      const { schema: sourceSchemaMaybe, table: sourceTableMaybe } = getSchemaAndTable(sourceEp);
      const { schema: targetSchemaMaybe, table: targetTableMaybe } = getSchemaAndTable(targetEp);
      const [sourceFallbackSchema, sourceFallbackTable] = splitQualified(sourceEp?.tableName ?? '');
      const [targetFallbackSchema, targetFallbackTable] = splitQualified(targetEp?.tableName ?? '');

      const sourceSchema = normalizeSchemaName(sourceSchemaMaybe || sourceFallbackSchema);
      const targetSchema = normalizeSchemaName(targetSchemaMaybe || targetFallbackSchema);
      const sourceTable = sanitizeIdent(sourceTableMaybe) || sourceFallbackTable;
      const targetTable = sanitizeIdent(targetTableMaybe) || targetFallbackTable;

      const sourceDraft = tableIndex.get(tableKey(sourceSchema, sourceTable));
      const targetDraft = tableIndex.get(tableKey(targetSchema, targetTable));
      if (!sourceDraft || !targetDraft) return;

      const sourceColumnName = getEndpointColumns(sourceEp)[0];
      const targetColumnName = getEndpointColumns(targetEp)[0];
      if (!sourceColumnName || !targetColumnName) return;

      const sourceColumn = sourceDraft.columnByName.get(sourceColumnName);
      const targetColumn = targetDraft.columnByName.get(targetColumnName);
      if (!sourceColumn || !targetColumn) return;

      const fk: ForeignKey = {
        id: createId(),
        name: ref.name || `${sourceDraft.table.name}_${sourceColumn.name}_fkey`,
        fromColumnId: sourceColumn.id,
        toTableId: targetDraft.table.id,
        toColumnId: targetColumn.id,
        onDelete: normaliseRule(ref.onDelete),
        onUpdate: normaliseRule(ref.onUpdate),
      };

      sourceDraft.table.foreignKeys.push(fk);
    });
  };

  (db.refs ?? []).forEach(collectRefs);
  (db.schemas ?? []).forEach((schema: any) => collectRefs(schema?.refs ?? []));

  const types: CustomType[] = [];
  (db.schemas ?? []).forEach((schema: any) => {
    const schemaObj = ensureSchema(schema?.name ?? 'public');
    (schema.enums ?? []).forEach((enumType: any) => {
      const values = (enumType.values ?? [])
        .map((value: any) => value?.name ?? value?.value)
        .filter(Boolean);
      types.push({
        id: createId(),
        schemaId: schemaObj.id,
        name: enumType.name,
        kind: 'enum',
        values,
      });
    });
  });

  return {
    version: 1,
    schemas,
    tables,
    types,
  };
};
