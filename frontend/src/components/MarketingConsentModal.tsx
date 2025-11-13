import { useState } from 'react';

type MarketingConsentModalProps = {
  open: boolean;
  onAccept: () => Promise<void> | void;
  onDecline: () => Promise<void> | void;
};

export const MarketingConsentModal = ({ open, onAccept, onDecline }: MarketingConsentModalProps) => {
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null);

  if (!open) return null;

  const handleClick = async (kind: 'accept' | 'decline', fn: () => Promise<void> | void) => {
    try {
      setLoading(kind);
      await fn();
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm transition-colors dark:bg-slate-950/70">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 text-slate-800 shadow-xl transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Podemos manter contato?</h3>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Utilizaremos o e-mail público do seu GitHub para enviar novidades, cursos gratuitos e conteúdo extra sobre modelagem
          de banco de dados. Você pode retirar o consentimento a qualquer momento.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
            onClick={() => handleClick('decline', onDecline)}
            disabled={loading === 'decline' || loading === 'accept'}
          >
            {loading === 'decline' ? 'Registrando...' : 'Prefiro não receber'}
          </button>
          <button
            type="button"
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-500 disabled:opacity-60"
            onClick={() => handleClick('accept', onAccept)}
            disabled={loading === 'accept' || loading === 'decline'}
          >
            {loading === 'accept' ? 'Registrando...' : 'Quero receber novidades'}
          </button>
        </div>
      </div>
    </div>
  );
};
