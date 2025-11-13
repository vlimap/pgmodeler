import { useRef } from 'react';
import type { ModelIssue } from '../lib/warnings';

type HeaderProps = {
  issues: ModelIssue[];
  onNew: () => void;
  onImportFile: (file: File) => Promise<void>;
  onSave: () => void;
  onCopySql: () => Promise<void>;
  onToggleErd: () => void;
  showErd: boolean;
  onStartTour?: () => void;
  // user & project controls (opcionais)
  user?: { name: string; avatarUrl: string | null } | null;
  isUserLoading?: boolean;
  onOpenLogin?: () => void;
  onOpenProjects?: () => void;
  onOpenAccount?: () => void;
  onOpenFeedback?: () => void;
  themeMode: 'light' | 'dark';
  onToggleTheme: () => void;
};

const buttonBase =
  'inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-700';

const badgeBase =
  'inline-flex items-center rounded-full px-2 text-xs font-semibold';

const GITHUB_REPO_URL = 'https://github.com/vlimap/block-postgres';
const KO_FI_URL = 'https://ko-fi.com/I2I5GOM2U';

export const Header = ({
  issues,
  onNew,
  onImportFile,
  onSave,
  onCopySql,
  onToggleErd,
  showErd,
  onStartTour,
  user,
  isUserLoading,
  onOpenLogin,
  onOpenProjects,
  onOpenAccount,
  onOpenFeedback,
  themeMode,
  onToggleTheme,
}: HeaderProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const logoSrc = themeMode === 'dark' ? '/logo-branca.png' : '/logo.png';

  const handleClickImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const [file] = event.target.files ?? [];
    if (!file) {
      return;
    }
    try {
      await onImportFile(file);
    } finally {
      event.target.value = '';
    }
  };

  const errorCount = issues.filter((issue) => issue.level === 'error').length;
  const warningCount = issues.filter((issue) => issue.level === 'warning').length;
  const hasStatusBadges = errorCount > 0 || warningCount > 0;

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <img src={logoSrc} alt="PG Modeler" className="h-8 w-8 rounded" />
        <span className="text-xl font-semibold text-slate-800 dark:text-slate-100">PG Modeler</span>
        <div className="flex items-center gap-2">
          <button type="button" className={buttonBase} onClick={onNew} title="Novo projeto">
            <i className="bi bi-plus-lg" aria-hidden="true" />
            Novo
          </button>
          <button
            type="button"
            className={buttonBase}
            onClick={handleClickImport}
            title="Importar .pgjson"
          >
            <i className="bi bi-file-earmark-arrow-up" aria-hidden="true" />
            Importar
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.pgjson,application/json"
            className="hidden"
            onChange={handleFileChange}
          />
          <button type="button" className={buttonBase} onClick={onSave} title="Salvar modelo">
            <i className="bi bi-save" aria-hidden="true" />
            Salvar
          </button>
          <button type="button" className={buttonBase} onClick={onCopySql} title="Copiar SQL">
            <i className="bi bi-clipboard" aria-hidden="true" />
            Copiar SQL
          </button>
          <button type="button" className={buttonBase} onClick={onToggleErd} title="Alternar ERD">
            {showErd ? (
              <>
                <i className="bi bi-eye-slash" aria-hidden="true" />
                Ocultar ERD
              </>
            ) : (
              <>
                <i className="bi bi-eye" aria-hidden="true" />
                Mostrar ERD
              </>
            )}
          </button>
          {onStartTour && (
            <button type="button" className={buttonBase} onClick={onStartTour} title="Iniciar tutorial">
              <i className="bi bi-info-circle" aria-hidden="true" />
              Tutorial
            </button>
          )}

          {/* Login / Projects */}
          {user ? (
            <div className="inline-flex items-center gap-2">
              <button type="button" className={buttonBase} onClick={onOpenProjects} title="Meus projetos">
                <i className="bi bi-folder2-open" aria-hidden="true" />
                Meus projetos
              </button>
              <button type="button" className={buttonBase} onClick={onOpenAccount} title="Conta">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="h-5 w-5 rounded-full" />
                ) : (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-600">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </button>
            </div>
          ) : (
            <button type="button" className={buttonBase} onClick={onOpenLogin} title="Entrar com GitHub" disabled={isUserLoading}>
              <i className="bi bi-github" aria-hidden="true" />
              {isUserLoading ? 'Verificando...' : 'Entrar (GitHub)'}
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {onOpenFeedback && (
          <button
            type="button"
            onClick={onOpenFeedback}
            className={buttonBase}
            title="Compartilhar feedback"
          >
            <i className="bi bi-chat-left-heart" aria-hidden="true" />
            Enviar feedback
          </button>
        )}
        <button
          type="button"
          onClick={onToggleTheme}
          className={buttonBase}
          title={themeMode === 'dark' ? 'Alternar para modo claro' : 'Alternar para modo escuro'}
        >
          <i className={`bi ${themeMode === 'dark' ? 'bi-brightness-high' : 'bi-moon-stars'}`} aria-hidden="true" />
          {themeMode === 'dark' ? 'Modo claro' : 'Modo escuro'}
        </button>

        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noreferrer"
          className={buttonBase}
          title="Abrir projeto no GitHub"
        >
          <i className="bi bi-github" aria-hidden="true" />
          GitHub
        </a>

        <a
          href={KO_FI_URL}
          target="_blank"
          rel="noreferrer"
          className={buttonBase}
          title="Doe um café no Ko-fi"
        >
          <i className="bi bi-cup-straw" aria-hidden="true" />
          Doe um café
        </a>
        {hasStatusBadges && (
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            {errorCount > 0 && (
              <span className={`${badgeBase} bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300`}>
                <i className="bi bi-exclamation-circle-fill mr-1" aria-hidden="true" />
                {errorCount} {errorCount === 1 ? 'erro' : 'erros'}
              </span>
            )}
            {warningCount > 0 && (
              <span className={`${badgeBase} bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300`}>
                <i className="bi bi-exclamation-triangle-fill mr-1" aria-hidden="true" />
                {warningCount} {warningCount === 1 ? 'aviso' : 'avisos'}
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
