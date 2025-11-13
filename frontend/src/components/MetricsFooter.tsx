type MetricsFooterProps = {
  schemas: number;
  tables: number;
  columns: number;
  indexes: number;
  warnings: number;
};

export const MetricsFooter = ({ schemas, tables, columns, indexes, warnings }: MetricsFooterProps) => (
  <footer className="border-t border-slate-200 bg-white px-6 py-3 text-xs font-medium text-slate-600 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1">
          <i className="bi bi-box-seam" aria-hidden="true" /> Schemas: <strong className="ml-1">{schemas}</strong>
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="bi bi-grid-3x3-gap" aria-hidden="true" /> Tabelas: <strong className="ml-1">{tables}</strong>
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="bi bi-columns" aria-hidden="true" /> Colunas: <strong className="ml-1">{columns}</strong>
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="bi bi-hash" aria-hidden="true" /> Índices: <strong className="ml-1">{indexes}</strong>
        </span>
      </div>
      <div className="inline-flex items-center gap-2">
        <i className="bi bi-exclamation-triangle-fill text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <span>
          Avisos: <span className="font-semibold text-amber-600 dark:text-amber-400">{warnings}</span>
        </span>
      </div>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-normal text-slate-500 sm:justify-end dark:text-slate-400">
      <a href="/termos.html" target="_blank" rel="noreferrer" className="hover:text-brand-600 dark:hover:text-brand-300">
        Termos de Uso
      </a>
      <span aria-hidden="true">•</span>
      <a href="/privacidade.html" target="_blank" rel="noreferrer" className="hover:text-brand-600 dark:hover:text-brand-300">
        Política de Privacidade
      </a>
    </div>
  </footer>
);
