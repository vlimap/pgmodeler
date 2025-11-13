import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  Column,
  CustomType,
  DbModel,
  ForeignKey,
  Schema,
  Table,
  TablePosition,
} from '../types/model';
import {
  ensureUniqueConstraintName,
  sanitizeConstraintName,
  buildConstraintName,
  toSnakeCase,
} from '../lib/naming';

const GENERIC_PK_NAME = 'id';
const MAX_UNDO_STACK = 20;

const cloneModel = (model: DbModel): DbModel => {
  if (typeof structuredClone === 'function') {
    return structuredClone(model) as DbModel;
  }
  return JSON.parse(JSON.stringify(model)) as DbModel;
};

const createId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

// Modelo inicial usado ao carregar a aplicação ou resetar o workspace.
const createDefaultModel = (): DbModel => {
  const schemaId = createId();
  return {
    version: 1,
    schemas: [{ id: schemaId, name: 'public' }],
    tables: [],
    types: [],
  };
};

// Coluna padrão com PK gerada automaticamente.
const createDefaultColumn = (name: string, type = 'uuid'): Column => ({
  id: createId(),
  name,
  type,
  nullable: false,
  defaultValue: undefined,
  isPrimaryKey: name === GENERIC_PK_NAME,
  isUnique: name === GENERIC_PK_NAME,
});

const createDefaultTable = (schemaId: string, name: string): Table => ({
  id: createId(),
  schemaId,
  name,
  columns: [createDefaultColumn(GENERIC_PK_NAME)],
  foreignKeys: [],
});

const ensureUniqueName = (
  baseName: string,
  existingNames: Iterable<string>,
): string => {
  const normalized = baseName.trim().length === 0 ? 'sem_nome' : baseName.trim();
  if (![...existingNames].includes(normalized)) {
    return normalized;
  }

  let counter = 2;
  let candidate = `${normalized}_${counter}`;
  const set = new Set(existingNames);
  while (set.has(candidate)) {
    counter += 1;
    candidate = `${normalized}_${counter}`;
  }
  return candidate;
};

const pickReferenceColumn = (
  table: Table,
  preferredColumnId?: string,
  exclude: Set<string> = new Set(),
): Column | null => {
  if (preferredColumnId) {
    const preferred = table.columns.find(
      (column) => column.id === preferredColumnId && !exclude.has(column.id),
    );
    if (preferred) {
      return preferred;
    }
  }

  const primary = table.columns.find(
    (column) => column.isPrimaryKey && !exclude.has(column.id),
  );
  if (primary) {
    return primary;
  }

  const unique = table.columns.find(
    (column) => column.isUnique && !exclude.has(column.id),
  );
  if (unique) {
    return unique;
  }

  const fallback = table.columns.find((column) => !exclude.has(column.id));
  return fallback ?? null;
};

const buildJoinColumnName = (
  tableName: string,
  referencedColumnName: string,
  existingNames: Set<string>,
): string => {
  const baseRaw = `${toSnakeCase(tableName)}_${toSnakeCase(referencedColumnName)}`;
  const fallback = `${toSnakeCase(tableName)}_${GENERIC_PK_NAME}`;
  const base = baseRaw.trim().length > 0 ? baseRaw : fallback;
  const unique = ensureUniqueName(base, existingNames);
  existingNames.add(unique);
  return unique;
};

const normalizeFkCardinality = (
  value: ForeignKey['startCardinality'] | ForeignKey['endCardinality'] | string | null | undefined,
): ForeignKey['startCardinality'] | undefined => {
  if (value == null) {
    return undefined;
  }
  if (value === 'many' || value === 'one_or_many' || value === 'zero_or_many') {
    return 'many';
  }
  return 'one';
};

const sanitizeModel = (model: DbModel): DbModel => ({
  ...model,
  tables: model.tables.map((table) => {
    const used = new Set<string>();
    const foreignKeys = table.foreignKeys.map((fk) => {
      const fallback = `fk_${fk.id.slice(0, 8)}`;
      const base = sanitizeConstraintName(fk.name, fallback);
      const unique = ensureUniqueConstraintName(base, used);
      used.add(unique);
      return {
        ...fk,
        name: unique,
      };
    });
    return { ...table, foreignKeys };
  }),
});

type ModelSnapshot = {
  model: DbModel;
  selectedSchemaId: string | null;
  selectedTableId: string | null;
  selectedColumnId: string | null;
};

type ModelState = {
  model: DbModel;
  selectedSchemaId: string | null;
  selectedTableId: string | null;
  selectedColumnId: string | null;
  showErd: boolean;
  undoStack: ModelSnapshot[];
  setModel: (model: DbModel) => void;
  reset: () => void;
  addSchema: (name: string) => string;
  updateSchema: (id: string, patch: Partial<Schema>) => void;
  removeSchema: (id: string) => void;
  addTable: (schemaId: string, name?: string, position?: TablePosition) => string;
  updateTable: (id: string, patch: Partial<Omit<Table, 'id' | 'columns' | 'foreignKeys'>>) => void;
  removeTable: (id: string) => void;
  addColumn: (tableId: string, name?: string) => string;
  updateColumn: (tableId: string, columnId: string, patch: Partial<Column>) => void;
  removeColumn: (tableId: string, columnId: string) => void;
  moveColumn: (tableId: string, columnId: string, targetColumnId: string) => void;
      addForeignKey: (
        tableId: string,
        fk: Omit<ForeignKey, 'id'>,
      ) => string;
  updateForeignKey: (
    tableId: string,
    fkId: string,
    patch: Partial<ForeignKey>,
  ) => void;
  removeForeignKey: (tableId: string, fkId: string) => void;
  convertForeignKeyToManyToMany: (tableId: string, fkId: string) => boolean;
  setTablePosition: (tableId: string, position: TablePosition) => void;
  setTablePositions: (positions: Record<string, TablePosition>) => void;
  addType: (type: CustomType) => void;
  updateType: (id: string, patch: Partial<CustomType>) => void;
  removeType: (id: string) => void;
  setSelectedSchemaId: (schemaId: string | null) => void;
  setSelectedTableId: (tableId: string | null) => void;
  setSelectedColumnId: (columnId: string | null) => void;
  toggleErd: () => void;
  undo: () => void;
};

const storage =
  typeof window === 'undefined'
    ? undefined
    : createJSONStorage<{
        model: DbModel;
        selectedSchemaId: string | null;
        selectedTableId: string | null;
        selectedColumnId: string | null;
        showErd: boolean;
      }>(() => window.localStorage);

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      model: createDefaultModel(),
      selectedSchemaId: null,
      selectedTableId: null,
      selectedColumnId: null,
      showErd: true,
      undoStack: [],

      setModel: (model) => {
        const sanitized = sanitizeModel({ ...model, version: 1 });
        set({
          model: sanitized,
          selectedSchemaId: sanitized.schemas[0]?.id ?? null,
          selectedTableId: sanitized.tables[0]?.id ?? null,
          selectedColumnId: null,
          undoStack: [],
        });
      },

      reset: () => {
        const freshModel = createDefaultModel();
        set({
          model: freshModel,
          selectedSchemaId: freshModel.schemas[0]?.id ?? null,
          selectedTableId: null,
          selectedColumnId: null,
          undoStack: [],
        });
      },

      addSchema: (name) => {
        const {
          model: { schemas },
        } = get();
        const newSchema: Schema = {
          id: createId(),
          name: ensureUniqueName(
            name,
            schemas.map((schema) => schema.name),
          ),
        };
        set((state) => ({
          model: {
            ...state.model,
            schemas: [...state.model.schemas, newSchema],
          },
          selectedSchemaId: newSchema.id,
        }));
        return newSchema.id;
      },

      updateSchema: (id, patch) => {
        set((state) => ({
          model: {
            ...state.model,
            schemas: state.model.schemas.map((schema) =>
              schema.id === id ? { ...schema, ...patch } : schema,
            ),
          },
        }));
      },

      removeSchema: (id) => {
        set((state) => {
          if (state.model.schemas.length <= 1) {
            return state;
          }

          const filteredSchemas = state.model.schemas.filter(
            (schema) => schema.id !== id,
          );
          const filteredTables = state.model.tables.filter(
            (table) => table.schemaId !== id,
          );

          const selectedSchemaId =
            state.selectedSchemaId === id
              ? filteredSchemas[0]?.id ?? null
              : state.selectedSchemaId;

          const selectedTableId =
            state.selectedTableId &&
            !filteredTables.some((table) => table.id === state.selectedTableId)
              ? filteredTables[0]?.id ?? null
              : state.selectedTableId;

          let selectedColumnId = state.selectedColumnId;
          if (
            selectedColumnId &&
            !filteredTables.some((table) =>
              table.columns.some((column) => column.id === selectedColumnId),
            )
          ) {
            selectedColumnId = null;
          }

          return {
            model: {
              ...state.model,
              schemas: filteredSchemas,
              tables: filteredTables,
            },
            selectedSchemaId,
            selectedTableId,
            selectedColumnId,
          };
        });
      },

      addTable: (schemaId, name = 'tabela', position) => {
        const { model } = get();
        if (!model.schemas.some((schema) => schema.id === schemaId)) {
          throw new Error('Schema inexistente');
        }

        const schemaTables = model.tables.filter(
          (table) => table.schemaId === schemaId,
        );

        const tableName = ensureUniqueName(
          name,
          schemaTables.map((table) => table.name),
        );

        const newTable = createDefaultTable(schemaId, tableName);
        if (position) {
          newTable.position = position;
        }

        set((state) => ({
          model: {
            ...state.model,
            tables: [...state.model.tables, newTable],
          },
          selectedTableId: newTable.id,
          selectedColumnId: null,
        }));

        return newTable.id;
      },

      updateTable: (id, patch) => {
        set((state) => ({
          model: {
            ...state.model,
            tables: state.model.tables.map((table) =>
              table.id === id ? { ...table, ...patch } : table,
            ),
          },
        }));
      },

      removeTable: (id) => {
        const snapshot: ModelSnapshot = {
          model: cloneModel(get().model),
          selectedSchemaId: get().selectedSchemaId,
          selectedTableId: get().selectedTableId,
          selectedColumnId: get().selectedColumnId,
        };

        set((state) => {
          const tables = state.model.tables.filter((table) => table.id !== id);
          const sanitizedTables = tables.map((table) => ({
            ...table,
            foreignKeys: table.foreignKeys.filter(
              (fk) => fk.toTableId !== id,
            ),
          }));

          const selectedTableId =
            state.selectedTableId === id
              ? sanitizedTables[0]?.id ?? null
              : state.selectedTableId;

          let selectedColumnId = state.selectedColumnId;
          if (
            !selectedColumnId ||
            !sanitizedTables.some((table) =>
              table.columns.some((column) => column.id === selectedColumnId),
            )
          ) {
            const table =
              sanitizedTables.find((item) => item.id === selectedTableId) ??
              sanitizedTables[0];
            selectedColumnId = table?.columns[0]?.id ?? null;
          }

          return {
            model: {
              ...state.model,
              tables: sanitizedTables,
            },
            selectedTableId,
            selectedColumnId,
            undoStack: [snapshot, ...state.undoStack].slice(0, MAX_UNDO_STACK),
          };
        });
      },

      addColumn: (tableId, name = 'coluna') => {
        const { model } = get();
        const table = model.tables.find((item) => item.id === tableId);
        if (!table) {
          throw new Error('Tabela inexistente');
        }

        const columnName = ensureUniqueName(
          name,
          table.columns.map((column) => column.name),
        );

        const newColumn = createDefaultColumn(columnName, 'text');

        set((state) => ({
          model: {
            ...state.model,
            tables: state.model.tables.map((item) =>
              item.id === tableId
                ? {
                    ...item,
                    columns: [...item.columns, newColumn],
                  }
                : item,
            ),
          },
          selectedColumnId: newColumn.id,
        }));

        return newColumn.id;
      },

      updateColumn: (tableId, columnId, patch) => {
        set((state) => ({
          model: {
            ...state.model,
            tables: state.model.tables.map((table) =>
              table.id === tableId
                ? {
                    ...table,
                    columns: table.columns.map((column) =>
                      column.id === columnId ? { ...column, ...patch } : column,
                    ),
                  }
                : table,
            ),
          },
        }));
      },

      removeColumn: (tableId, columnId) => {
        const snapshot: ModelSnapshot = {
          model: cloneModel(get().model),
          selectedSchemaId: get().selectedSchemaId,
          selectedTableId: get().selectedTableId,
          selectedColumnId: get().selectedColumnId,
        };

        set((state) => {
          let nextSelectedColumnId = state.selectedColumnId;

          const updatedTables = state.model.tables.map((table) => {
            if (table.id !== tableId) {
              return {
                ...table,
                foreignKeys: table.foreignKeys.filter(
                  (fk) => fk.toColumnId !== columnId,
                ),
              };
            }

            const filteredColumns = table.columns.filter(
              (column) => column.id !== columnId,
            );

            if (nextSelectedColumnId === columnId) {
              nextSelectedColumnId = null;
            }

            return {
              ...table,
              columns: filteredColumns,
              foreignKeys: table.foreignKeys.filter(
                (fk) => fk.fromColumnId !== columnId,
              ),
            };
          });

          if (
            nextSelectedColumnId &&
            !updatedTables.some((table) =>
              table.columns.some((column) => column.id === nextSelectedColumnId),
            )
          ) {
            nextSelectedColumnId = null;
          }

          return {
            model: {
              ...state.model,
              tables: updatedTables,
            },
            selectedColumnId: nextSelectedColumnId,
            undoStack: [snapshot, ...state.undoStack].slice(0, MAX_UNDO_STACK),
          };
        });
      },

      moveColumn: (tableId, columnId, targetColumnId) => {
        if (columnId === targetColumnId) {
          return;
        }
        set((state) => {
          const tableIndex = state.model.tables.findIndex(
            (table) => table.id === tableId,
          );
          if (tableIndex === -1) {
            return state;
          }
          const table = state.model.tables[tableIndex];
          const columns = [...table.columns];
          const fromIndex = columns.findIndex(
            (column) => column.id === columnId,
          );
          const toIndex = columns.findIndex(
            (column) => column.id === targetColumnId,
          );
          if (fromIndex === -1 || toIndex === -1) {
            return state;
          }
          const updatedColumns = [...columns];
          const [moved] = updatedColumns.splice(fromIndex, 1);
          updatedColumns.splice(toIndex, 0, moved);
          const updatedTables = state.model.tables.map((item, idx) =>
            idx === tableIndex ? { ...item, columns: updatedColumns } : item,
          );
          return {
            model: {
              ...state.model,
              tables: updatedTables,
            },
            selectedColumnId:
              state.selectedColumnId === columnId
                ? columnId
                : state.selectedColumnId,
          };
        });
      },

      addForeignKey: (tableId, fk) => {
        const fkId = createId();
        set((state) => {
          const tables = state.model.tables.map((table) => {
            if (table.id !== tableId) {
              return table;
            }
            const fallback = `fk_${fkId.slice(0, 8)}`;
            const currentNames = table.foreignKeys.map((item) => item.name);
            const base = sanitizeConstraintName(fk.name, fallback);
            const uniqueName = ensureUniqueConstraintName(base, currentNames);
            const normalizedStart = normalizeFkCardinality(fk.startCardinality);
            const normalizedEnd = normalizeFkCardinality(fk.endCardinality);
            const fkWithId: ForeignKey = {
              ...fk,
              id: fkId,
              name: uniqueName,
              startCardinality: normalizedStart ?? fk.startCardinality,
              endCardinality: normalizedEnd ?? fk.endCardinality,
            };
            return {
              ...table,
              foreignKeys: [...table.foreignKeys, fkWithId],
            };
          });
          return {
            model: {
              ...state.model,
              tables,
            },
          };
        });
        return fkId;
      },

      updateForeignKey: (tableId, fkId, patch) => {
        set((state) => ({
          model: {
            ...state.model,
            tables: state.model.tables.map((table) => {
              if (table.id !== tableId) {
                return table;
              }
              const foreignKeys = table.foreignKeys.map((fk) => {
                if (fk.id !== fkId) {
                  return fk;
                }
                const updated: Partial<ForeignKey> = { ...patch };

                if (patch.name !== undefined) {
                  const fallback = fk.name ?? `fk_${fk.id.slice(0, 8)}`;
                  const base = sanitizeConstraintName(patch.name, fallback);
                  const existingNames = table.foreignKeys
                    .filter((item) => item.id !== fkId)
                    .map((item) => item.name);
                  updated.name = ensureUniqueConstraintName(base, existingNames);
                }
                if (patch.startCardinality !== undefined) {
                  updated.startCardinality = normalizeFkCardinality(patch.startCardinality) ?? patch.startCardinality;
                }
                if (patch.endCardinality !== undefined) {
                  updated.endCardinality = normalizeFkCardinality(patch.endCardinality) ?? patch.endCardinality;
                }

                return { ...fk, ...updated };
              });
              return { ...table, foreignKeys };
            }),
          },
        }));
      },

      removeForeignKey: (tableId, fkId) => {
        set((state) => ({
          model: {
            ...state.model,
            tables: state.model.tables.map((table) =>
              table.id === tableId
                ? {
                    ...table,
                    foreignKeys: table.foreignKeys.filter(
                      (fk) => fk.id !== fkId,
                    ),
                  }
                : table,
            ),
          },
        }));
      },

      convertForeignKeyToManyToMany: (tableId, fkId) => {
        let success = false;
        set((state) => {
          const tableIndex = state.model.tables.findIndex(
            (table) => table.id === tableId,
          );
          if (tableIndex === -1) {
            return state;
          }

          const table = state.model.tables[tableIndex];
          const fkIndex = table.foreignKeys.findIndex((fk) => fk.id === fkId);
          if (fkIndex === -1) {
            return state;
          }

          const fk = table.foreignKeys[fkIndex];
          const sourceColumn = table.columns.find(
            (column) => column.id === fk.fromColumnId,
          );
          const targetTableIndex = state.model.tables.findIndex(
            (candidate) => candidate.id === fk.toTableId,
          );

          if (!sourceColumn || targetTableIndex === -1) {
            return state;
          }

          const targetTable = state.model.tables[targetTableIndex];
          const targetColumn = targetTable.columns.find(
            (column) => column.id === fk.toColumnId,
          );

          if (!targetColumn) {
            return state;
          }

          const shouldRemoveSourceColumn = !sourceColumn.isPrimaryKey;

          const excluded = new Set<string>();
          if (shouldRemoveSourceColumn) {
            excluded.add(sourceColumn.id);
          }
          const sourceReference = pickReferenceColumn(
            table,
            sourceColumn.id,
            excluded,
          );
          const targetReference = pickReferenceColumn(
            targetTable,
            targetColumn.id,
          );

          if (!sourceReference || !targetReference) {
            return state;
          }

          const schemaId = table.schemaId;
          const schemaTables = state.model.tables.filter(
            (candidate) => candidate.schemaId === schemaId,
          );

          const orderedNames = [table.name, targetTable.name].sort((a, b) =>
            a.localeCompare(b),
          );
          const baseNameRaw = `${orderedNames.join('_')}`;
          const fallbackName = `${toSnakeCase(table.name)}_${toSnakeCase(targetTable.name)}`;
          const baseNameSanitized = toSnakeCase(baseNameRaw) || fallbackName;
          const baseName = baseNameSanitized || 'relacionamento';
          const joinTableName = ensureUniqueName(
            baseName,
            schemaTables.map((item) => item.name),
          );
          const joinTableId = createId();

          const joinColumnNames = new Set<string>();
          const leftColumn: Column = {
            id: createId(),
            name: buildJoinColumnName(
              `fk_${table.name}`,
              sourceReference.name,
              joinColumnNames,
            ),
            type: sourceReference.type,
            nullable: false,
            defaultValue: undefined,
            isPrimaryKey: true,
            isUnique: false,
          };

          const rightColumn: Column = {
            id: createId(),
            name: buildJoinColumnName(
              `fk_${targetTable.name}`,
              targetReference.name,
              joinColumnNames,
            ),
            type: targetReference.type,
            nullable: false,
            defaultValue: undefined,
            isPrimaryKey: true,
            isUnique: false,
          };

          const fkNames = new Set<string>();
          const leftFkId = createId();
          const leftFkNameBase = buildConstraintName(
            [joinTableName, leftColumn.name, table.name, 'fk'],
            `fk_${leftFkId.slice(0, 8)}`,
          );
          const leftFkName = ensureUniqueConstraintName(leftFkNameBase, fkNames);
          fkNames.add(leftFkName);

          const rightFkId = createId();
          const rightFkNameBase = buildConstraintName(
            [joinTableName, rightColumn.name, targetTable.name, 'fk'],
            `fk_${rightFkId.slice(0, 8)}`,
          );
          const rightFkName = ensureUniqueConstraintName(
            rightFkNameBase,
            fkNames,
          );
          fkNames.add(rightFkName);

          const leftFk: ForeignKey = {
            id: leftFkId,
            name: leftFkName,
            fromColumnId: leftColumn.id,
            toTableId: table.id,
            toColumnId: sourceReference.id,
            startCardinality: 'many',
            endCardinality: 'one',
          };

          const rightFk: ForeignKey = {
            id: rightFkId,
            name: rightFkName,
            fromColumnId: rightColumn.id,
            toTableId: targetTable.id,
            toColumnId: targetReference.id,
            startCardinality: 'many',
            endCardinality: 'one',
          };

          const layoutSpacing = 320;
          let sourcePosition = table.position ?? null;
          let targetPosition = targetTable.position ?? null;
          let joinPosition: TablePosition;

          const laneY = sourcePosition?.y ?? targetPosition?.y ?? 0;

          if (sourcePosition && targetPosition) {
            const distance = Math.abs(targetPosition.x - sourcePosition.x);
            const centerX = (sourcePosition.x + targetPosition.x) / 2;
            if (distance < layoutSpacing * 2) {
              sourcePosition = { x: centerX - layoutSpacing, y: laneY };
              targetPosition = { x: centerX + layoutSpacing, y: laneY };
            } else {
              sourcePosition = { x: sourcePosition.x, y: laneY };
              targetPosition = { x: targetPosition.x, y: laneY };
            }
            joinPosition = {
              x: (sourcePosition.x + targetPosition.x) / 2,
              y: laneY,
            };
          } else if (sourcePosition) {
            sourcePosition = { x: sourcePosition.x, y: laneY };
            joinPosition = { x: sourcePosition.x + layoutSpacing, y: laneY };
            targetPosition = { x: joinPosition.x + layoutSpacing, y: laneY };
          } else if (targetPosition) {
            targetPosition = { x: targetPosition.x, y: laneY };
            joinPosition = { x: targetPosition.x - layoutSpacing, y: laneY };
            sourcePosition = { x: joinPosition.x - layoutSpacing, y: laneY };
          } else {
            sourcePosition = { x: -layoutSpacing, y: laneY };
            joinPosition = { x: 0, y: laneY };
            targetPosition = { x: layoutSpacing, y: laneY };
          }

          const sourceColumnId = sourceColumn.id;

          const sanitizedTables = state.model.tables.map((candidate, index) => {
            if (index === tableIndex) {
              return {
                ...candidate,
                columns: shouldRemoveSourceColumn
                  ? candidate.columns.filter(
                      (column) => column.id !== sourceColumnId,
                    )
                  : candidate.columns,
                foreignKeys: candidate.foreignKeys.filter(
                  (item) =>
                    item.id !== fk.id &&
                    (shouldRemoveSourceColumn
                      ? item.fromColumnId !== sourceColumnId
                      : true),
                ),
                position: sourcePosition ?? undefined,
              };
            }

            if (index === targetTableIndex) {
              return {
                ...candidate,
                foreignKeys: candidate.foreignKeys.filter(
                  (item) =>
                    shouldRemoveSourceColumn
                      ? item.toColumnId !== sourceColumnId
                      : true,
                ),
                position: targetPosition ?? undefined,
              };
            }

            return {
              ...candidate,
              foreignKeys: shouldRemoveSourceColumn
                ? candidate.foreignKeys.filter(
                    (item) => item.toColumnId !== sourceColumnId,
                  )
                : candidate.foreignKeys,
            };
          });

          const nextTables = [...sanitizedTables];
          nextTables.splice(tableIndex + 1, 0, {
            id: joinTableId,
            schemaId,
            name: joinTableName,
            columns: [leftColumn, rightColumn],
            foreignKeys: [leftFk, rightFk],
            position: joinPosition,
          });

          success = true;
          return {
            model: {
              ...state.model,
              tables: nextTables,
            },
            selectedTableId: joinTableId,
            selectedColumnId: leftColumn.id,
          };
        });
        return success;
      },

      setTablePosition: (tableId, position) => {
        set((state) => ({
          model: {
            ...state.model,
            tables: state.model.tables.map((table) =>
              table.id === tableId
                ? {
                    ...table,
                    position,
                  }
                : table,
            ),
          },
        }));
      },

      setTablePositions: (positions) => {
        set((state) => ({
          model: {
            ...state.model,
            tables: state.model.tables.map((table) => ({
              ...table,
              position: positions[table.id] ?? table.position,
            })),
          },
        }));
      },

      addType: (type) => {
        set((state) => ({
          model: {
            ...state.model,
            types: [...state.model.types, type],
          },
        }));
      },

      updateType: (id, patch) => {
        set((state) => ({
          model: {
            ...state.model,
            types: state.model.types.map((type) =>
              type.id === id ? { ...type, ...patch } : type,
            ),
          },
        }));
      },

      removeType: (id) => {
        set((state) => ({
          model: {
            ...state.model,
            types: state.model.types.filter((type) => type.id !== id),
          },
        }));
      },

      setSelectedSchemaId: (schemaId) => {
        set((state) =>
          state.selectedSchemaId === schemaId
            ? state
            : { selectedSchemaId: schemaId },
        );
      },

      setSelectedTableId: (tableId) => {
        set((state) => {
          if (state.selectedTableId === tableId) {
            return state;
          }

          return {
            selectedTableId: tableId,
            selectedColumnId: null,
          };
        });
      },

      setSelectedColumnId: (columnId) => {
        set((state) =>
          state.selectedColumnId === columnId
            ? state
            : { selectedColumnId: columnId },
        );
      },

      toggleErd: () => {
        set((state) => ({ showErd: !state.showErd }));
      },

      undo: () => {
        set((state) => {
          const [snapshot, ...rest] = state.undoStack;
          if (!snapshot) {
            return state;
          }

          return {
            model: cloneModel(snapshot.model),
            selectedSchemaId: snapshot.selectedSchemaId,
            selectedTableId: snapshot.selectedTableId,
            selectedColumnId: snapshot.selectedColumnId,
            undoStack: rest,
          };
        });
      },
    }),
    {
      name: 'pg-modeler-mvp',
      version: 1,
      storage,
      partialize: (state) => ({
        model: state.model,
        selectedSchemaId: state.selectedSchemaId,
        selectedTableId: state.selectedTableId,
        selectedColumnId: state.selectedColumnId,
        showErd: state.showErd,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }
        state.model = sanitizeModel(state.model);
        if (!state.selectedSchemaId) {
          state.selectedSchemaId = state.model.schemas[0]?.id ?? null;
        }
        if (
          state.selectedTableId &&
          !state.model.tables.some((table) => table.id === state.selectedTableId)
        ) {
          state.selectedTableId = state.model.tables[0]?.id ?? null;
        }
        if (
          state.selectedColumnId &&
          !state.model.tables.some((table) =>
            table.columns.some((column) => column.id === state.selectedColumnId),
          )
        ) {
          state.selectedColumnId = null;
        }
      },
    },
  ),
);

export const createEnumType = (
  schemaId: string,
  name: string,
  values: string[],
): CustomType => ({
  id: createId(),
  schemaId,
  name,
  kind: 'enum',
  values,
});
