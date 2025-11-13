import { z } from 'zod';
import type { DbModel } from '../types/model';

const referentialActionSchema = z.enum([
  'NO ACTION',
  'RESTRICT',
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
]);

const columnSchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .min(1, 'O nome da coluna é obrigatório')
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Use snake_case ou letras/números'),
  type: z.string().min(1, 'Selecione um tipo'),
  nullable: z.boolean(),
  defaultValue: z.string().optional(),
  isPrimaryKey: z.boolean(),
  isUnique: z.boolean(),
  isIndexed: z.boolean().optional().default(false),
  comment: z.string().optional(),
});

const foreignKeySchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .min(1, 'A constraint precisa de um nome')
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Use snake_case ou letras/números'),
  fromColumnId: z.string().min(1),
  toTableId: z.string().min(1),
  toColumnId: z.string().min(1),
  onDelete: referentialActionSchema.optional(),
  onUpdate: referentialActionSchema.optional(),
  comment: z.string().optional(),
});

const tableSchema = z.object({
  id: z.string().min(1),
  schemaId: z.string().min(1),
  name: z
    .string()
    .min(1, 'O nome da tabela é obrigatório')
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Use snake_case ou letras/números'),
  comment: z.string().optional(),
  columns: z.array(columnSchema),
  foreignKeys: z.array(foreignKeySchema),
  position: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
    })
    .optional(),
});

const schemaSchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .min(1, 'O nome do schema é obrigatório')
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Use snake_case ou letras/números'),
  comment: z.string().optional(),
});

const enumTypeSchema = z.object({
  id: z.string().min(1),
  schemaId: z.string().min(1),
  name: z
    .string()
    .min(1, 'O nome do tipo é obrigatório')
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Use snake_case ou letras/números'),
  kind: z.literal('enum'),
  values: z.array(z.string().min(1)).min(1, 'Adicione ao menos um valor'),
  comment: z.string().optional(),
});

export const modelSchema = z
  .object({
    version: z.literal(1),
    schemas: z.array(schemaSchema).min(1, 'Defina ao menos um schema'),
    tables: z.array(tableSchema),
    types: z.array(enumTypeSchema),
  })
  .superRefine((model, ctx) => {
    const schemaIds = new Set(model.schemas.map((schema) => schema.id));
    const tableIds = new Set(model.tables.map((table) => table.id));

    model.tables.forEach((table, tableIndex) => {
      if (!schemaIds.has(table.schemaId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tables', tableIndex, 'schemaId'],
          message: `Schema inexistente para a tabela "${table.name}"`,
        });
      }

      const columnNames = new Set<string>();
      table.columns.forEach((column, columnIndex) => {
        const key = `${table.schemaId}.${table.name}.${column.name.toLowerCase()}`;
        if (columnNames.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['tables', tableIndex, 'columns', columnIndex, 'name'],
            message: 'Nome de coluna duplicado na mesma tabela',
          });
        }
        columnNames.add(key);
      });

      table.foreignKeys.forEach((fk, fkIndex) => {
        if (!table.columns.some((column) => column.id === fk.fromColumnId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['tables', tableIndex, 'foreignKeys', fkIndex, 'fromColumnId'],
            message: `Coluna inexistente para a FK "${fk.name}"`,
          });
        }

        if (!tableIds.has(fk.toTableId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['tables', tableIndex, 'foreignKeys', fkIndex, 'toTableId'],
            message: `Tabela de referência inexistente para a FK "${fk.name}"`,
          });
        }
      });
    });

    model.types.forEach((customType, typeIndex) => {
      if (!schemaIds.has(customType.schemaId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['types', typeIndex, 'schemaId'],
          message: `Schema inexistente para o tipo "${customType.name}"`,
        });
      }
    });
  });

export type ModelInput = z.infer<typeof modelSchema>;

export const parseModel = (payload: unknown): DbModel =>
  modelSchema.parse(payload) as DbModel;
