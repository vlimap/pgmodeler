import type { ModelIssue } from '../lib/warnings';
import { POSTGRES_TYPES } from '../constants/postgresTypes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useModelStore } from '../store/modelStore';
import type { Column } from '../types/model';
import { computeKindsFromModel, normalizeCardinality } from './CrowFootEdge';
import { buildConstraintName } from '../lib/naming';
import { ensureMonacoSetup } from '../lib/monacoSetup';
import { useThemeStore } from '../store/themeStore';

if (typeof window !== 'undefined') {
  ensureMonacoSetup();
}

type PreviewTab = 'json' | 'sql';

type PreviewPanelProps = {
  activeTab: PreviewTab;
  onTabChange: (tab: PreviewTab) => void;
  modelJson: string;
  sql: string;
  issues: ModelIssue[];
};

const tabButton =
  'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold transition-colors';
const inputBase =
  'w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 shadow-sm transition-colors focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-brand-300 dark:focus:ring-brand-400/40';
const selectBase =
  'w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 shadow-sm transition-colors focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const labelMuted = 'block text-xs text-slate-500 dark:text-slate-400';

export const PreviewPanel = ({
  activeTab,
  onTabChange,
  modelJson,
  sql,
  issues,
}: PreviewPanelProps) => {
  // modelJson intentionally unused — JSON preview removed from UI
  void modelJson;
  const errorIssues = issues.filter((issue) => issue.level === 'error');
  const warningIssues = issues.filter((issue) => issue.level === 'warning');

  // properties panel state from store
  const selectedTableId = useModelStore((s) => s.selectedTableId);
  const selectedColumnId = useModelStore((s) => s.selectedColumnId);
  const model = useModelStore((s) => s.model);
  const updateColumn = useModelStore((s) => s.updateColumn);
  const addForeignKey = useModelStore((s) => s.addForeignKey);
  const updateForeignKey = useModelStore((s) => s.updateForeignKey);
  const removeForeignKey = useModelStore((s) => s.removeForeignKey);
  const convertForeignKeyToManyToMany = useModelStore(
    (s) => s.convertForeignKeyToManyToMany,
  );
  const setModel = useModelStore((s) => s.setModel);
  const themeMode = useThemeStore((s) => s.mode);
  const workerRef = useRef<Worker | null>(null);

  const [sqlDraft, setSqlDraft] = useState(sql);
  const [sqlDirty, setSqlDirty] = useState(false);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlBusy, setSqlBusy] = useState(false);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/sqlToModel.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const handler = (event: MessageEvent<any>) => {
      const message = event.data;
      if (!message) return;
      if (message.kind === 'model') {
        setSqlBusy(false);
        if (message.payload) {
          setModel(message.payload);
          setSqlDirty(false);
          setSqlError(null);
        } else {
          setSqlError('Nenhum objeto foi encontrado no SQL informado.');
        }
      } else if (message.kind === 'error') {
        setSqlBusy(false);
        setSqlError(message.message ?? 'Falha ao interpretar o SQL informado.');
      } else if (message.kind === 'validated') {
        setSqlBusy(false);
        setSqlError(null);
      }
    };
    worker.addEventListener('message', handler);
    return () => worker.removeEventListener('message', handler);
  }, [setModel]);

  useEffect(() => {
    if (!sqlDirty) {
      setSqlDraft(sql);
      setSqlError(null);
    }
  }, [sql, sqlDirty]);

  const handleApplySql = () => {
    const worker = workerRef.current;
    if (!worker) {
      setSqlError('Worker de análise não inicializado. Recarregue a página e tente novamente.');
      return;
    }
    setSqlBusy(true);
    setSqlError(null);
    worker.postMessage({ kind: 'build', sql: sqlDraft });
  };

  const handleResetSql = () => {
    setSqlDraft(sql);
    setSqlDirty(false);
    setSqlError(null);
    setSqlBusy(false);
  };

  const selected = useMemo(() => {
    if (!selectedTableId || !selectedColumnId) return null;
    const table = model.tables.find((t) => t.id === selectedTableId);
    if (!table) return null;
    const column = table.columns.find((c) => c.id === selectedColumnId);
    if (!column) return null;
    const fk = table.foreignKeys.find((f) => f.fromColumnId === column.id);
    return { table, column, fk } as const;
  }, [model.tables, selectedTableId, selectedColumnId]);

  const handleUpdateColumn = (patch: Partial<Column>) => {
    if (!selectedTableId || !selectedColumnId) return;
    updateColumn(selectedTableId, selectedColumnId, patch as any);
  };

  const maybeConvertManyToMany = useCallback(
    (tableId: string, fkId: string) => {
      const state = useModelStore.getState();
      const table = state.model.tables.find((t) => t.id === tableId);
      if (!table) {
        return false;
      }
      const fk = table.foreignKeys.find((item) => item.id === fkId);
      if (!fk) {
        return false;
      }
      if (fk.startCardinality !== 'many' || fk.endCardinality !== 'many') {
        return false;
      }
      return convertForeignKeyToManyToMany(tableId, fkId);
    },
    [convertForeignKeyToManyToMany],
  );

  const handleCreateFk = (toTableId: string, toColumnId: string) => {
    if (!selectedTableId || !selectedColumnId) return;
    const table = model.tables.find((t) => t.id === selectedTableId);
    const column = table?.columns.find((c) => c.id === selectedColumnId);
    const targetTable = model.tables.find((t) => t.id === toTableId);
    const targetColumn = targetTable?.columns.find((c) => c.id === toColumnId);
    if (!table || !column || !targetColumn) return;

    const { start, end } = computeKindsFromModel({
      fkNullable: !!column.nullable,
      fkIsUnique: !!(column.isPrimaryKey || column.isUnique),
      refIsUnique: !!(targetColumn.isPrimaryKey || targetColumn.isUnique),
    });

    addForeignKey(selectedTableId, {
      name: buildConstraintName(
        [table.name, column.name, 'fk'],
        `fk_${column.id.slice(0, 8)}`,
      ),
      fromColumnId: column.id,
      toTableId,
      toColumnId,
      startCardinality: start,
      endCardinality: end,
    });
  };

  return (
    <aside className="flex w-[28rem] flex-col border-l border-slate-200 bg-white text-slate-800 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex gap-2">
            <button
              type="button"
              className={`${tabButton} ${
                activeTab === 'sql'
                  ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-200'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
              onClick={() => onTabChange('sql')}
              title="Visualizar SQL"
            >
              <i className="bi bi-file-earmark-text mr-2" aria-hidden="true" />
              Visualização SQL
            </button>
          </div>
      </div>

      {selected ? (
        <div className="flex-1 overflow-auto bg-slate-50 p-4 transition-colors dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Propriedades da coluna
          </h3>
          <div className="space-y-3">
            <div>
              <label className={labelMuted}>Nome (legível)</label>
              <input
                className={inputBase}
                value={selected.column.name}
                onChange={(e) => handleUpdateColumn({ name: e.target.value })}
              />
            </div>

            <div>
              <label className={labelMuted}>Nome técnico</label>
              <input
                className={inputBase}
                value={selected.column.name}
                onChange={(e) => handleUpdateColumn({ name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelMuted}>Tipo</label>
                <select
                  className={selectBase}
                  value={selected.column.type}
                  onChange={(e) => handleUpdateColumn({ type: e.target.value })}
                >
                  <option value="">(selecione)</option>
                  {POSTGRES_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelMuted}>Tamanho</label>
                <input
                  className={inputBase}
                  value={selected.column.defaultValue ?? ''}
                  onChange={(e) => handleUpdateColumn({ defaultValue: e.target.value || undefined })}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-[13px] text-slate-700 dark:text-slate-200">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!selected.column.nullable}
                  onChange={(e) => handleUpdateColumn({ nullable: !e.target.checked })}
                />
                Obrigatório (NOT NULL)
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.column.isPrimaryKey}
                  onChange={(e) => handleUpdateColumn({ isPrimaryKey: e.target.checked })}
                />
                Chave primária
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.column.isUnique}
                  onChange={(e) => handleUpdateColumn({ isUnique: e.target.checked })}
                />
                Único
              </label>
            </div>

            <div>
              <label className={labelMuted}>Comentários</label>
              <textarea
                className={`${inputBase} min-h-[5rem]`}
                value={selected.column.comment ?? ''}
                onChange={(e) => handleUpdateColumn({ comment: e.target.value || undefined })}
              />
            </div>

            {/* FK section if present */}
            <div className="border-t border-slate-200 pt-2 dark:border-slate-800">
              <h4 className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Relacionamento</h4>
              {selected.fk ? (
                <div className="space-y-2">
                  <div>
                    <label className={labelMuted}>Tabela referenciada</label>
                    <select
                      className={selectBase}
                      value={selected.fk.toTableId}
                      onChange={(e) =>
                        updateForeignKey(selected.table.id, selected.fk!.id, { toTableId: e.target.value })
                      }
                    >
                      <option value="">(selecione)</option>
                      {model.tables
                        .filter((t) => t.id !== selected.table.id)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelMuted}>Campo referenciado</label>
                    <select
                      className={selectBase}
                      value={selected.fk.toColumnId}
                      onChange={(e) =>
                        updateForeignKey(selected.table.id, selected.fk!.id, { toColumnId: e.target.value })
                      }
                    >
                      <option value="">(selecione)</option>
                      {model.tables
                        .find((t) => t.id === selected.fk!.toTableId)
                        ?.columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelMuted}>Cardinalidade (início)</label>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      className="rounded-md border border-rose-300 bg-white px-3 py-1 text-sm text-rose-600 transition-colors hover:border-rose-400 hover:bg-rose-50 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-300 dark:hover:border-rose-500 dark:hover:bg-rose-950/30"
                      onClick={() => {
                        if (confirm('Remover relacionamento? Esta ação não pode ser desfeita.')) {
                          removeForeignKey(selected.table.id, selected.fk!.id);
                        }
                      }}
                    >
                      Remover relacionamento
                    </button>
                  </div>
                    <select
                      className={selectBase}
                      value={selected.fk.startCardinality == null ? '' : normalizeCardinality(selected.fk.startCardinality)}
                      onChange={(e) => {
                        const raw = e.target.value as 'one' | 'many' | '';
                        updateForeignKey(selected.table.id, selected.fk!.id, {
                          startCardinality: raw ? normalizeCardinality(raw) : undefined,
                        });
                        if (raw === 'many') {
                          setTimeout(() => {
                            void maybeConvertManyToMany(selected.table.id, selected.fk!.id);
                          }, 0);
                        }
                      }}
                    >
                      <option value="">(auto)</option>
                      <option value="one">Um</option>
                      <option value="many">Muitos</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelMuted}>Cardinalidade (fim)</label>
                    <select
                      className={selectBase}
                      value={selected.fk.endCardinality == null ? '' : normalizeCardinality(selected.fk.endCardinality)}
                      onChange={(e) => {
                        const raw = e.target.value as 'one' | 'many' | '';
                        updateForeignKey(selected.table.id, selected.fk!.id, {
                          endCardinality: raw ? normalizeCardinality(raw) : undefined,
                        });
                        if (raw === 'many') {
                          setTimeout(() => {
                            void maybeConvertManyToMany(selected.table.id, selected.fk!.id);
                          }, 0);
                        }
                      }}
                    >
                      <option value="">(auto)</option>
                      <option value="one">Um</option>
                      <option value="many">Muitos</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-slate-500 dark:text-slate-300">Nenhum relacionamento encontrado para esta coluna.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <select id="fk-target-table" className={selectBase}>
                      <option value="">Selecionar tabela</option>
                      {model.tables
                        .filter((t) => t.id !== selected.table.id)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm transition-colors hover:border-brand-200 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-brand-500 dark:hover:bg-brand-900/30"
                      onClick={() => {
                        const sel = (document.getElementById('fk-target-table') as HTMLSelectElement).value;
                        if (sel) {
                          // pick first column of target table as default
                          const t = model.tables.find((x) => x.id === sel);
                          const toColumnId = t?.columns[0]?.id;
                          if (toColumnId) handleCreateFk(sel, toColumnId);
                        }
                      }}
                    >
                      Adicionar relacionamento
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-1 flex-col gap-4 bg-slate-50 px-5 py-5 dark:bg-slate-900">
          <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900">
            <div className="flex-1 bg-slate-50/60 p-4 dark:bg-slate-900">
              <div className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-inner dark:border-slate-700 dark:bg-slate-950">
                <Editor
                  height="100%"
                  language="sql"
                  theme={themeMode === 'dark' ? 'vs-dark' : 'vs-light'}
                  value={sqlDraft}
                  onChange={(value) => {
                    setSqlDraft(value ?? '');
                    setSqlDirty(true);
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 12,
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                />
              </div>
            </div>
            <div className="border-t border-slate-200 bg-white/90 px-5 py-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleApplySql}
                    disabled={!sqlDirty || sqlBusy}
                  >
                    {sqlBusy ? 'Processando...' : 'Aplicar DDL ao diagrama'}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand-200 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:border-brand-400 dark:hover:text-brand-200"
                    onClick={handleResetSql}
                    disabled={!sqlDirty}
                  >
                    Reverter alterações
                  </button>
                </div>
                {sqlDirty && !sqlError && !sqlBusy && (
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-300">
                    SQL editado (ainda não aplicado)
                  </span>
                )}
              </div>
              {sqlError && (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  {sqlError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        {errorIssues.length === 0 && warningIssues.length === 0 && !sqlError && (
          <p className="flex items-center gap-2">
            <i className="bi bi-check-circle-fill text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
            Sem inconsistências detectadas.
          </p>
        )}
        {errorIssues.length > 0 && (
          <div className="mb-2">
            <p className="font-semibold text-rose-600 dark:text-rose-400">
              {errorIssues.length} {errorIssues.length === 1 ? 'erro' : 'erros'}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-rose-600 dark:text-rose-400">
              {errorIssues.map((issue, index) => (
                <li key={`error-${index}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}
        {warningIssues.length > 0 && (
          <div>
            <p className="font-semibold text-amber-600 dark:text-amber-400">
              {warningIssues.length}{' '}
              {warningIssues.length === 1 ? 'aviso' : 'avisos'}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-600 dark:text-amber-400">
              {warningIssues.map((issue, index) => (
                <li key={`warning-${index}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
};
