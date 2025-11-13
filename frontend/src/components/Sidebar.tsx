// src/components/Sidebar.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { createEnumType, useModelStore } from '../store/modelStore';

type SidebarTab = 'tables' | 'types';

const controlButton =
  'inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-slate-500 transition hover:border-slate-300 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-100';

const segmentedButton =
  'inline-flex flex-1 items-center justify-center rounded-md px-3 py-1.5 text-sm font-semibold transition-colors';

const smallButton =
  'inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800';

const formInput =
  'w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 shadow-sm transition-colors focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-100 dark:focus:border-brand-400 dark:focus:ring-brand-300/60';

const formSelect =
  'w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 shadow-sm transition-colors focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

/** Sidebar (aside) – lista schemas, tabelas e tipos; ações rápidas */
export const Sidebar = () => {
  // Store (ajuste os nomes caso seu store use chaves diferentes)
  const model = useModelStore((s) => s.model);
  const selectedSchemaId = useModelStore((s) => s.selectedSchemaId);
  const selectedTableId = useModelStore((s) => s.selectedTableId);
  const selectedColumnId = useModelStore((s) => s.selectedColumnId);
  const setSelectedSchemaId = useModelStore((s) => s.setSelectedSchemaId);
  const setSelectedTableId = useModelStore((s) => s.setSelectedTableId);
  const setSelectedColumnId = useModelStore((s) => s.setSelectedColumnId);
  const addSchema = useModelStore((s) => s.addSchema);
  const updateSchema = useModelStore((s) => s.updateSchema);
  const removeSchema = useModelStore((s) => s.removeSchema);
  const addTable = useModelStore((s) => s.addTable);
  const updateTable = useModelStore((s) => s.updateTable);
  const removeTable = useModelStore((s) => s.removeTable);
  const removeColumn = useModelStore((s) => s.removeColumn);
  const addType = useModelStore((s) => s.addType);
  const updateType = useModelStore((s) => s.updateType);
  const removeType = useModelStore((s) => s.removeType);

  const [activeTab, setActiveTab] = useState<SidebarTab>('tables');

  // Criação inline de schema/tabela
  const [creatingSchema, setCreatingSchema] = useState(false);
  const [newSchemaName, setNewSchemaName] = useState('');
  const newSchemaInputRef = useRef<HTMLInputElement | null>(null);
  const [creatingTable, setCreatingTable] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const newTableInputRef = useRef<HTMLInputElement | null>(null);

  // Edição inline de schema/tabela
  const [editingSchemaId, setEditingSchemaId] = useState<string | null>(null);
  const editingSchemaRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const editingTableRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Derivados
  const tablesInSchema = useMemo(() => {
    if (!selectedSchemaId) return [];
    return (model?.tables ?? []).filter((t: any) => t.schemaId === selectedSchemaId);
  }, [model, selectedSchemaId]);

  const schemaOptions = useMemo(() => model?.schemas ?? [], [model]);

  // Ações: Schemas
  const handleAddSchema = () => {
    setCreatingSchema(true);
    setTimeout(() => newSchemaInputRef.current?.focus(), 50);
  };

  // Ações: Tabelas
  const handleAddTable = () => {
    if (!selectedSchemaId) return;
    setCreatingTable(true);
    setTimeout(() => newTableInputRef.current?.focus(), 50);
  };

  const confirmAddTable = () => {
    if (!selectedSchemaId) return;
    const name = (newTableName || '').trim();
    const tableName = name || 'sem_nome';
    addTable(selectedSchemaId, tableName);
    setNewTableName('');
    setCreatingTable(false);
  };

  const cancelAddTable = () => {
    setNewTableName('');
    setCreatingTable(false);
  };

  const confirmAddSchema = () => {
    const name = (newSchemaName || '').trim() || 'public';
    addSchema(name);
    setNewSchemaName('');
    setCreatingSchema(false);
  };

  const cancelAddSchema = () => {
    setNewSchemaName('');
    setCreatingSchema(false);
  };

  // Ações: Tipos (ENUM)
  const handleAddEnum = () => {
    if (!selectedSchemaId) return;
    const name = prompt('Nome do tipo ENUM:', 'status_enum');
    if (!name?.trim()) return;
    const valuesInput = prompt('Valores (separados por vírgula):', 'ativo,inativo');
    if (!valuesInput) return;
    const values = valuesInput
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length === 0) {
      alert('Adicione ao menos um valor.');
      return;
    }
    addType(createEnumType(selectedSchemaId, name.trim(), values));
  };

  // Mudar schema ativo — limpa seleção de coluna; seleção de tabela é ajustada via useEffect
  const handleSchemaChange = (schemaId: string | null) => {
    setSelectedSchemaId(schemaId);
    setSelectedColumnId(null);
    // A seleção de tabela é ajustada pelo efeito abaixo
  };

  // Sempre que o schema ativo mudar (ou as tabelas forem atualizadas),
  // garante que a seleção de tabela pertença ao schema ou seleciona a primeira disponível.
  useEffect(() => {
    if (!selectedSchemaId) {
      setSelectedTableId(null);
      return;
    }
    const state = useModelStore.getState();
    const tables = (state.model?.tables ?? []).filter((t: any) => t.schemaId === selectedSchemaId);
    if (tables.length === 0) {
      setSelectedTableId(null);
      return;
    }
    const stillValid =
      state.selectedTableId && tables.some((t: any) => t.id === state.selectedTableId);
    if (!stillValid) setSelectedTableId(tables[0].id);
  }, [selectedSchemaId, model?.tables, setSelectedTableId]);

  return (
    // adicionar `min-h-0` para permitir que o filho com `overflow-y-auto` role corretamente em containers flex
    <aside className="flex h-full w-80 min-h-0 flex-shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white text-slate-800 transition-colors dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
      {/* Tabs (Tabelas / Tipos) */}
      <div className="flex gap-2 p-3">
        <button
          type="button"
          className={`${segmentedButton} ${
            activeTab === 'tables'
              ? 'bg-white text-brand-600 shadow dark:bg-slate-800 dark:text-brand-200'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-900/70 dark:text-slate-300'
          }`}
          onClick={() => setActiveTab('tables')}
          title="Gerenciar tabelas"
        >
          <i className="bi bi-table mr-2" aria-hidden="true" />
          Tabelas
        </button>
        <button
          type="button"
          className={`${segmentedButton} ${
            activeTab === 'types'
              ? 'bg-white text-brand-600 shadow dark:bg-slate-800 dark:text-brand-200'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-900/70 dark:text-slate-300'
          }`}
          onClick={() => setActiveTab('types')}
          title="Gerenciar tipos"
        >
          <i className="bi bi-tags mr-2" aria-hidden="true" />
          Tipos
        </button>
      </div>

      {/* Passos rápidos (tour/onboarding leve) */}
      <div className="px-4 pb-3">
          <div className="rounded-md border border-brand-100 bg-brand-50/60 p-3 text-sm text-slate-800 dark:border-brand-900/40 dark:bg-slate-900/70 dark:text-slate-100">
          <div className="flex items-start gap-3">
            <i className="bi bi-info-circle-fill text-brand-600 mt-1 dark:text-brand-300" aria-hidden="true" />
            <div>
              <p className="font-semibold text-brand-700 dark:text-brand-300">Passos rápidos</p>
              <ol className="mt-2 ml-4 list-decimal space-y-1 text-xs text-slate-700 dark:text-slate-300">
                <li>
                  <strong>Escolha ou crie um schema</strong> — é o escopo onde suas tabelas ficam.
                </li>
                <li>
                  <strong>Clique em + (Tabelas)</strong> para criar uma nova tabela.
                </li>
                <li>
                  <strong>Selecione a tabela</strong> e clique numa coluna para editar propriedades no painel da direita.
                </li>
                <li>
                  <strong>Crie relacionamentos</strong> usando Foreign Keys no painel direito.
                </li>
                <li>
                  <strong>Excluir:</strong> use o ícone de lixeira ao lado da tabela ou da coluna.
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo principal */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 min-h-0">
        {activeTab === 'tables' ? (
          <div className="space-y-6">
            {/* Schemas */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schemas</h2>
                <button
                  type="button"
                  className={controlButton}
                  onClick={handleAddSchema}
                  title="Adicionar schema"
                  data-tour="add-schema"
                >
                  <i className="bi bi-plus-lg" aria-hidden="true" />
                </button>
              </div>

              {creatingSchema && (
                <div className="mb-3">
                  <div className="flex items-center gap-2">
                    <input
                      ref={newSchemaInputRef}
                      className={`${formInput} w-44`}
                      value={newSchemaName}
                      placeholder="ex: analytics"
                      onChange={(e) => setNewSchemaName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          confirmAddSchema();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelAddSchema();
                        }
                      }}
                    />
                    <button type="button" className={smallButton} onClick={confirmAddSchema} title="Confirmar schema">
                      <i className="bi bi-check-lg mr-1" aria-hidden="true" />
                      Confirmar
                    </button>
                    <button type="button" className={controlButton} onClick={cancelAddSchema} title="Cancelar criação de schema">
                      <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Pressione <kbd className="rounded border px-1 py-0.5">Enter</kbd> para confirmar ou{' '}
                    <kbd className="rounded border px-1 py-0.5">Esc</kbd> para cancelar.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {(model?.schemas ?? []).map((schema: any) => (
                  <div
                    key={schema.id}
                    className={`rounded-md border ${
                      schema.id === selectedSchemaId
                        ? 'border-brand-400 bg-white shadow-sm dark:border-brand-400 dark:bg-slate-900'
                        : 'border-transparent bg-slate-100 dark:bg-slate-900/60'
                    } p-2`}
                  >
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        className="text-sm font-semibold text-slate-700 dark:text-slate-100"
                        onClick={() => handleSchemaChange(schema.id)}
                      >
                        {schema.name}
                      </button>
                      <button
                        type="button"
                        className={controlButton}
                        onClick={() => {
                          if (!window.confirm(`Remover schema "${schema.name}"?`)) return;
                          removeSchema(schema.id);
                          // se removemos o schema ativo, limpar seleção
                          if (selectedSchemaId === schema.id) {
                            handleSchemaChange(null);
                          }
                        }}
                        disabled={(model?.schemas?.length ?? 0) <= 1}
                        title="Remover schema"
                      >
                        <i className="bi bi-trash" aria-hidden="true" />
                      </button>
                    </div>

                    <input
                      className={`${formInput} mt-2`}
                      defaultValue={schema.name}
                      ref={(el) => {
                        editingSchemaRefs.current[schema.id] = el;
                        if (editingSchemaId === schema.id && el) {
                          setTimeout(() => {
                            try {
                              el.focus();
                              el.select();
                            } catch {
                              /* noop */
                            }
                          }, 0);
                        }
                      }}
                      onFocus={() => setEditingSchemaId(schema.id)}
                      onBlur={(e) => {
                        if (editingSchemaId === schema.id) {
                          const newName = (e.target as HTMLInputElement).value.trim() || schema.name;
                          updateSchema(schema.id, { name: newName });
                          setEditingSchemaId(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && editingSchemaId === schema.id) {
                          const val = (e.target as HTMLInputElement).value.trim() || schema.name;
                          updateSchema(schema.id, { name: val });
                          setEditingSchemaId(null);
                          (e.target as HTMLInputElement).blur();
                        }
                        if (e.key === 'Escape' && editingSchemaId === schema.id) {
                          setEditingSchemaId(null);
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Nome do schema (ex: <code>public</code>). Escolha onde suas tabelas serão criadas.
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Tabelas */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tabelas</h2>
                  {/* selector de schema para alternar facilmente entre schemas */}
                  <select
                    className={`${formSelect} max-w-[160px] text-sm`}
                    value={selectedSchemaId ?? ''}
                    onChange={(e) => handleSchemaChange(e.target.value || null)}
                  >
                    <option value="">-- selecione --</option>
                    {schemaOptions.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className={controlButton}
                  onClick={handleAddTable}
                  title="Adicionar tabela"
                  disabled={!selectedSchemaId}
                  data-tour="add-table"
                >
                  <i className="bi bi-plus-lg" aria-hidden="true" />
                </button>
              </div>

              {/* Wrapper da lista de tabelas — rolagem será do container principal */}
              <div className="pr-1">
                {creatingTable && (
                  <div className="mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        ref={newTableInputRef}
                        className={`${formInput} w-44`}
                        value={newTableName}
                        placeholder="nome_da_tabela"
                        onChange={(e) => setNewTableName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmAddTable();
                          if (e.key === 'Escape') cancelAddTable();
                        }}
                      />
                      <button type="button" className={smallButton} onClick={confirmAddTable} title="Confirmar">
                        <i className="bi bi-check-lg mr-1" aria-hidden="true" />
                        Confirmar
                      </button>
                      <button type="button" className={controlButton} onClick={cancelAddTable} title="Cancelar">
                        <i className="bi bi-x-lg" aria-hidden="true" />
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Dica: pressione <kbd className="rounded border px-1 py-0.5">Enter</kbd> para confirmar ou{' '}
                      <kbd className="rounded border px-1 py-0.5">Esc</kbd> para cancelar.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  {tablesInSchema.length === 0 && (
                    <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                      <p className="font-semibold text-slate-700 dark:text-slate-100">Nenhuma tabela ainda</p>
                      <p className="mt-1 text-xs">
                        Clique no botão <strong>+</strong> acima para criar sua primeira tabela. Após criar, selecione-a para editar colunas e
                        relacionamentos.
                      </p>
                    </div>
                  )}

                  {tablesInSchema.map((table: any, idx: number) => (
                    <div key={table.id} className="space-y-1" data-tour={idx === 0 ? 'first-table' : undefined}>
                      <div
                        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition ${
                          table.id === selectedTableId
                            ? 'bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-200 dark:shadow-[0_0_0_1px_rgba(148,163,184,0.35)]'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/80'
                        }`}
                      >
                        <div className="flex-1">
                          {editingTableId === table.id ? (
                            <div className="flex items-center gap-2">
                              <i className="bi bi-table text-slate-400 dark:text-slate-500" aria-hidden="true" />
                              <input
                                data-editing-table={table.id}
                                className={`${formInput} w-full max-w-[180px]`}
                                defaultValue={table.name || 'sem_nome'}
                                ref={(el) => {
                                  editingTableRefs.current[table.id] = el;
                                  if (editingTableId === table.id && el) {
                                    setTimeout(() => {
                                      try {
                                        el.focus();
                                        el.select();
                                      } catch {
                                        /* noop */
                                      }
                                    }, 0);
                                  }
                                }}
                                onBlur={(e) => {
                                  const newName = (e.target as HTMLInputElement).value.trim() || table.name;
                                  updateTable(table.id, { name: newName });
                                  setEditingTableId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const newName = (e.target as HTMLInputElement).value.trim() || table.name;
                                    updateTable(table.id, { name: newName });
                                    setEditingTableId(null);
                                    (e.target as HTMLInputElement).blur();
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingTableId(null);
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="text-left inline-flex items-center gap-2"
                              onClick={() => {
                                setEditingTableId(table.id);
                                setSelectedTableId(table.id);
                                const tryFocus = () => {
                                  try {
                                    const el = editingTableRefs.current[table.id];
                                    el?.focus();
                                    el?.select();
                                  } catch {
                                    /* noop */
                                  }
                                };
                                setTimeout(tryFocus, 50);
                                requestAnimationFrame(tryFocus);
                                setTimeout(tryFocus, 200);
                              }}
                            >
                              <i className="bi bi-table mr-2 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                              {table.name || 'sem_nome'}
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className={controlButton}
                            title="Remover tabela"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Remover tabela "${table.name}"?`)) {
                                removeTable(table.id);
                              }
                            }}
                          >
                            <i className="bi bi-trash" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      {/* Lista de colunas (sem overflow interno) */}
                      <div className="mt-1 w-full space-y-1 pl-8">
                        {(table.columns ?? []).map((column: any, cidx: number) => (
                          <div
                            key={column.id}
                            className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                              column.id === selectedColumnId
                                ? 'bg-white text-brand-600 dark:bg-slate-900 dark:text-brand-200'
                                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800/80'
                            }`}
                          >
                            <button
                              type="button"
                              data-tour={idx === 0 && cidx === 0 ? 'first-column' : undefined}
                              className="text-left inline-flex items-center gap-2 flex-1 truncate text-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTableId(table.id);
                                setSelectedColumnId(column.id);
                              }}
                            >
                              <i className="bi bi-list-ul text-slate-400 dark:text-slate-500" aria-hidden="true" />
                              <span className="truncate">{column.name || 'sem_nome'}</span>
                            </button>
                            <button
                              type="button"
                              className={controlButton}
                              title="Remover coluna"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Remover coluna "${column.name}"?`)) {
                                  removeColumn(table.id, column.id);
                                }
                              }}
                            >
                              <i className="bi bi-trash" aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* A edição detalhada da tabela/coluna vive no painel direito (properties panel) */}
          </div>
        ) : (
          // Tab "Tipos"
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tipos personalizados</h2>
              <button type="button" className={smallButton} onClick={handleAddEnum} disabled={!selectedSchemaId}>
                Novo ENUM
              </button>
            </div>

            {(model?.types?.length ?? 0) === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum tipo cadastrado. Adicione tipos ENUM para reutilizar em colunas.</p>
            )}

            <div className="space-y-3">
              {(model?.types ?? []).map((customType: any) => (
                <div
                  key={customType.id}
                  className="rounded border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-100">{customType.name}</h3>
                    <button type="button" className={smallButton} onClick={() => removeType(customType.id)}>
                      Remover
                    </button>
                  </div>

                  <div className="mt-3 space-y-3 text-sm">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Nome</label>
                      <input
                        className={formInput}
                        value={customType.name}
                        onChange={(event) => updateType(customType.id, { name: event.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Schema</label>
                      <select
                        className={formSelect}
                        value={customType.schemaId}
                        onChange={(event) => updateType(customType.id, { schemaId: event.target.value })}
                      >
                        {schemaOptions.map((schema: any) => (
                          <option key={schema.id} value={schema.id}>
                            {schema.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Valores (um por linha)
                      </label>
                      <textarea
                        className={`${formInput} min-h-[80px]`}
                        value={(customType.values ?? []).join('\n')}
                        onChange={(event) =>
                          updateType(customType.id, {
                            values: event.target.value
                              .split('\n')
                              .map((value) => value.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
