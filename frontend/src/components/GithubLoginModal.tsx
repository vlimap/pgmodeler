import { useState } from 'react';
import { api } from '../lib/api';

type Props = {
  open: boolean;
  onClose: () => void;
};

export const GithubLoginModal = ({ open, onClose }: Props) => {
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const canContinue = acceptTerms;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-colors dark:bg-slate-950/70">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 text-slate-800 shadow-xl transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <h3 className="text-lg font-semibold">Entrar com GitHub</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Vamos redirecionar você ao GitHub para autorizar o uso do seu nome, avatar e e-mail público. Usaremos esses dados para
          salvar seus projetos e, se você quiser, enviar notícias e conteúdos gratuitos.
        </p>

        <div className="mt-4 space-y-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 transition-colors dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(event) => setAcceptTerms(event.target.checked)}
              className="mt-1"
            />
            <span>
              Li e aceito os{' '}
              <a href="/termos.html" target="_blank" rel="noreferrer" className="text-brand-600 underline-offset-2 hover:underline">
                Termos de Uso
              </a>{' '}
              e a{' '}
              <a href="/privacidade.html" target="_blank" rel="noreferrer" className="text-brand-600 underline-offset-2 hover:underline">
                Política de Privacidade
              </a>
              . Estou ciente de que meus dados do GitHub serão utilizados para criar e manter minha conta.
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(event) => setMarketingOptIn(event.target.checked)}
              className="mt-1"
            />
            <span>
              Quero receber novidades, cursos gratuitos e conteúdos sobre modelagem de dados. (Opcional — você pode alterar depois.)
            </span>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded bg-brand-600 px-3 py-1 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-60"
            onClick={() => {
              sessionStorage.setItem(
                'pg:marketing-pref',
                JSON.stringify({ marketingOptIn, timestamp: Date.now() }),
              );
              onClose();
              window.location.href = api.loginUrl;
            }}
            disabled={!canContinue}
          >
            Prosseguir com GitHub
          </button>
        </div>
      </div>
    </div>
  );
};
