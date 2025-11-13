import { FormEvent, useEffect, useState } from 'react';

type FeedbackModalProps = {
  open: boolean;
  onSubmit: (payload: { rating: number; comment: string }) => Promise<void> | void;
};

const starScale = [1, 2, 3, 4, 5] as const;

export const FeedbackModal = ({ open, onSubmit }: FeedbackModalProps) => {
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRating(0);
    setComment('');
    setError(null);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rating) {
      setError('Selecione uma nota de 1 a 5 estrelas.');
      return;
    }

    setError(null);
    try {
      setSubmitting(true);
      await onSubmit({ rating, comment: comment.trim() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível registrar o feedback.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm transition-colors dark:bg-slate-950/80">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-slate-800 shadow-2xl transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Ajude a melhorar o pgmodeler</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Depois de bastante uso, queremos ouvir você! Avalie a experiência e conte o que pode ser melhorado.
        </p>

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Como você avalia o app?</span>
            <div className="mt-2 flex gap-2">
              {starScale.map((value) => {
                const active = value <= rating;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`flex h-10 w-10 items-center justify-center rounded-full border text-xl transition-colors ${
                      active
                        ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:border-brand-400 dark:bg-brand-400/20 dark:text-brand-200'
                        : 'border-slate-200 bg-white text-slate-400 hover:border-brand-400 hover:text-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500 dark:hover:border-brand-400 dark:hover:text-brand-300'
                    }`}
                    onClick={() => setRating(value)}
                    aria-pressed={active}
                    aria-label={`${value} estrela${value > 1 ? 's' : ''}`}
                  >
                    <i className={`bi ${value <= rating ? 'bi-star-fill' : 'bi-star'}`} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="feedback-comment" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Conte pra gente o que pode melhorar
            </label>
            <textarea
              id="feedback-comment"
              className="mt-2 h-28 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-brand-400 dark:focus:ring-brand-300/60"
              placeholder="Ex: Adicionar atalhos para duplicar colunas..."
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={2000}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Campo opcional, mas sua opinião ajuda bastante.</p>
          </div>

          {error && <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? 'Enviando...' : 'Enviar feedback'}
          </button>
        </form>
      </div>
    </div>
  );
};
