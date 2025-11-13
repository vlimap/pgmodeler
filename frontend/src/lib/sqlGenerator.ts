import type { Column, DbModel, ForeignKey, Table } from '../types/model';
import { ensureUniqueConstraintName, toSnakeCase } from './naming';

const quoteIdent = (value: string): string =>
  `"${value.replaceAll('"', '""')}"`;

const qualify = (schema: string, name: string): string =>
  `${quoteIdent(schema)}.${quoteIdent(name)}`;

const buildColumnDefinition = (column: Column): string => {
  const parts = [quoteIdent(column.name), column.type];
  if (!column.nullable) {
    parts.push('NOT NULL');
  }
  if (column.defaultValue && column.defaultValue.trim().length > 0) {
    parts.push(`DEFAULT ${column.defaultValue.trim()}`);
  }
  return parts.join(' ');
};

const buildForeignKeyClause = (
  fk: ForeignKey,
  table: Table,
  getTableById: (id: string) => Table | undefined,
  getSchemaName: (schemaId: string) => string,
): string | null => {
  const fromColumn = table.columns.find((column) => column.id === fk.fromColumnId);
  const targetTable = getTableById(fk.toTableId);
  if (!fromColumn || !targetTable) {
    return null;
  }

  const targetSchema = getSchemaName(targetTable.schemaId);
  const targetColumn = targetTable.columns.find(
    (column) => column.id === fk.toColumnId,
  );
  if (!targetColumn) {
    return null;
  }

  const clauses: string[] = [
    `CONSTRAINT ${quoteIdent(fk.name)} FOREIGN KEY (${quoteIdent(fromColumn.name)})`,
    `REFERENCES ${qualify(targetSchema, targetTable.name)} (${quoteIdent(targetColumn.name)})`,
  ];

  if (fk.onDelete) {
    clauses.push(`ON DELETE ${fk.onDelete}`);
  }
  if (fk.onUpdate) {
    clauses.push(`ON UPDATE ${fk.onUpdate}`);
  }

  return clauses.join(' ');
};

const buildTableStatement = (
  table: Table,
  schemaName: string,
  getTableById: (id: string) => Table | undefined,
  getSchemaName: (schemaId: string) => string,
): string => {
  const columnDefinitions = table.columns.map(buildColumnDefinition);
  const pkColumns = table.columns
    .filter((column) => column.isPrimaryKey)
    .map((column) => quoteIdent(column.name));

  if (pkColumns.length > 0) {
    columnDefinitions.push(`PRIMARY KEY (${pkColumns.join(', ')})`);
  }

  const uniqueColumns = table.columns
    .filter((column) => column.isUnique && !column.isPrimaryKey)
    .map((column) => quoteIdent(column.name));

  uniqueColumns.forEach((columnName) => {
    columnDefinitions.push(`UNIQUE (${columnName})`);
  });

  table.foreignKeys.forEach((fk) => {
    const clause = buildForeignKeyClause(fk, table, getTableById, getSchemaName);
    if (clause) {
      columnDefinitions.push(clause);
    }
  });

  const multilineTableDefinition = `CREATE TABLE ${qualify(schemaName, table.name)} (\n  ${columnDefinitions.join(
    ',\n  ',
  )}\n);`;

  const inlineDefinitions = columnDefinitions.join(', ');
  const prefersInline =
    columnDefinitions.length <= 3 && inlineDefinitions.length <= 120;

  const tableDefinition = prefersInline
    ? `CREATE TABLE ${qualify(schemaName, table.name)} (${inlineDefinitions});`
    : multilineTableDefinition;

  const comments: string[] = [];
  if (table.comment) {
    comments.push(
      `COMMENT ON TABLE ${qualify(schemaName, table.name)} IS '${table.comment.replaceAll("'", "''")}';`,
    );
  }
  table.columns.forEach((column) => {
    if (column.comment) {
      comments.push(
        `COMMENT ON COLUMN ${qualify(schemaName, table.name)}.${quoteIdent(column.name)} IS '${column.comment.replaceAll("'", "''")}';`,
      );
    }
  });

  return [tableDefinition, ...comments].join('\n');
};

const buildIndexesForTable = (table: Table, schemaName: string): string[] => {
  const usedNames = new Set<string>();

  return table.columns
    .filter((column) => column.isIndexed && !column.isPrimaryKey && !column.isUnique)
    .map((column) => {
      const baseRaw = `${table.name}_${column.name}_idx`;
      const sanitized = toSnakeCase(baseRaw) || `idx_${column.id.slice(0, 8)}`;
      const base = sanitized.startsWith('idx_') ? sanitized : `idx_${sanitized}`;
      const indexName = ensureUniqueConstraintName(base, usedNames);
      usedNames.add(indexName);

      return `CREATE INDEX ${quoteIdent(indexName)} ON ${qualify(schemaName, table.name)} (${quoteIdent(column.name)});`;
    });
};

const topologicallySortTables = (
  tables: Table[],
  getSchemaName: (schemaId: string) => string,
  tableById: Map<string, Table>,
): Table[] => {
  const dependencyMap = new Map<string, Set<string>>();
  const dependentsMap = new Map<string, Set<string>>();

  tables.forEach((table) => {
    const dependencies = new Set<string>();

    table.foreignKeys.forEach((fk) => {
      if (!fk.toTableId || fk.toTableId === table.id) {
        return;
      }

      if (!tableById.has(fk.toTableId)) {
        return;
      }

      dependencies.add(fk.toTableId);

      const dependents = dependentsMap.get(fk.toTableId) ?? new Set<string>();
      dependents.add(table.id);
      dependentsMap.set(fk.toTableId, dependents);
    });

    dependencyMap.set(table.id, dependencies);
  });

  const compareBySchemaAndName = (leftId: string, rightId: string): number => {
    const leftTable = tableById.get(leftId);
    const rightTable = tableById.get(rightId);
    if (!leftTable || !rightTable) {
      return 0;
    }

    const schemaComparison = getSchemaName(leftTable.schemaId).localeCompare(
      getSchemaName(rightTable.schemaId),
    );
    if (schemaComparison !== 0) {
      return schemaComparison;
    }

    return leftTable.name.localeCompare(rightTable.name);
  };

  const readyQueue = tables
    .filter((table) => (dependencyMap.get(table.id)?.size ?? 0) === 0)
    .map((table) => table.id)
    .sort(compareBySchemaAndName);

  const ordered: Table[] = [];
  const visited = new Set<string>();

  while (readyQueue.length > 0) {
    const currentId = readyQueue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);

    const currentTable = tableById.get(currentId);
    if (!currentTable) {
      continue;
    }
    ordered.push(currentTable);

    const dependents = dependentsMap.get(currentId);
    if (!dependents) {
      continue;
    }

    dependents.forEach((dependentId) => {
      const dependencies = dependencyMap.get(dependentId);
      if (!dependencies) {
        return;
      }

      dependencies.delete(currentId);
      if (dependencies.size === 0) {
        const insertIndex = readyQueue.findIndex(
          (queuedId) => compareBySchemaAndName(dependentId, queuedId) < 0,
        );
        if (insertIndex === -1) {
          readyQueue.push(dependentId);
        } else {
          readyQueue.splice(insertIndex, 0, dependentId);
        }
      }
    });
  }

  if (ordered.length !== tables.length) {
    const remaining = tables.filter((table) => !visited.has(table.id));
    remaining
      .sort((a, b) => compareBySchemaAndName(a.id, b.id))
      .forEach((table) => {
        ordered.push(table);
      });
  }

  return ordered;
};

export const generatePostgresSql = (model: DbModel): string => {
  const schemaById = new Map(model.schemas.map((schema) => [schema.id, schema.name]));
  const tableById = new Map(model.tables.map((table) => [table.id, table]));

  const statements: string[] = [];

  const sortedSchemas = [...model.schemas].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  sortedSchemas.forEach((schema) => {
    if (schema.name !== 'public') {
      statements.push(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema.name)};`);
    }
  });

  const typesBySchema = new Map<string, typeof model.types>();
  model.types.forEach((customType) => {
    const list = typesBySchema.get(customType.schemaId) ?? [];
    list.push(customType);
    typesBySchema.set(customType.schemaId, list);
  });

  typesBySchema.forEach((types, schemaId) => {
    const schemaName = schemaById.get(schemaId);
    if (!schemaName) {
      return;
    }

    types.forEach((customType) => {
      if (customType.kind === 'enum') {
        const values = customType.values
          .map((value) => `'${value.replaceAll("'", "''")}'`)
          .join(', ');
        statements.push(
          `CREATE TYPE ${qualify(schemaName, customType.name)} AS ENUM (${values});`,
        );
      }
    });
  });

  const getSchemaName = (schemaId: string): string =>
    schemaById.get(schemaId) ?? 'public';

  const orderedTables = topologicallySortTables(
    model.tables,
    getSchemaName,
    tableById,
  );

  orderedTables.forEach((table) => {
    statements.push(
      buildTableStatement(
        table,
        getSchemaName(table.schemaId),
        (id) => tableById.get(id),
        getSchemaName,
      ),
    );

    const indexStatements = buildIndexesForTable(
      table,
      getSchemaName(table.schemaId),
    );
    statements.push(...indexStatements);
  });

  return statements.join('\n');
};
