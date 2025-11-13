import { useMemo, useState } from 'react';

type Project = { id: string; name: string; createdAt: string };

type Props = {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  loading?: boolean;
};

export const ProjectsModal = ({ open, onClose, projects, onSave, onLoad, onDelete, loading }: Props) => {
  const [newName, setNewName] = useState('');
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [projects],
  );

  if (!open) return null;

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onSave(name);
    setNewName('');
  };

  const handleDelete = (id: string, name: string) => {
    const confirmed = window.confirm(`Remover o projeto "${name}"? Essa ação não pode ser desfeita.`);
    if (!confirmed) return;
    onDelete(id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm transition-colors dark:bg-slate-950/70">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Seus projetos</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Salve, organize e reabra diagramas quando precisar.</p>
          </div>
          <button
            type="button"
            className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={onClose}
            aria-label="Fechar modal"
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-6 px-6 py-6">
          <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition-colors sm:flex sm:items-center sm:justify-between sm:gap-4 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Novo projeto</label>
              <p className="text-sm text-slate-600 dark:text-slate-300">Defina um nome e clique em salvar para criar um snapshot do diagrama atual.</p>
            </div>
            <div className="mt-3 flex w-full flex-col gap-2 sm:mt-0 sm:max-w-sm">
              <input
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Ex.: CRM_prod"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
              />
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleCreate}
                disabled={!newName.trim()}
              >
                <i className="bi bi-save me-2" aria-hidden="true" />
                Salvar projeto
              </button>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between pb-2">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Projetos salvos</h4>
              {loading && <span className="text-xs text-slate-500 dark:text-slate-400">Carregando...</span>}
            </div>
            <div className="max-h-80 overflow-y-auto overflow-x-hidden pr-1">
              {loading ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                  Recuperando projetos...
                </div>
              ) : sortedProjects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                  Você ainda não salvou nenhum projeto. Crie um snapshot usando o formulário acima.
                </div>
              ) : (
                <ul className="space-y-3">
                  {sortedProjects.map((project) => (
                    <li
                      key={project.id}
                      className="group rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-brand-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{project.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Atualizado em {new Date(project.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-lg border border-brand-200 px-3 py-1.5 text-sm font-medium text-brand-600 transition hover:bg-brand-50 dark:border-brand-400 dark:text-brand-200 dark:hover:bg-brand-900/30"
                            onClick={() => onLoad(project.id)}
                          >
                            <i className="bi bi-folder2-open" aria-hidden="true" />
                            Abrir
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:border-rose-500 dark:text-rose-300 dark:hover:bg-rose-950/30"
                            onClick={() => handleDelete(project.id, project.name)}
                          >
                            <i className="bi bi-trash" aria-hidden="true" />
                            Remover
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
