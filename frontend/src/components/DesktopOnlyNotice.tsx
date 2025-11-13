import { useEffect, useState } from 'react';
import { useThemeStore } from '../store/themeStore';

type DesktopOnlyNoticeProps = {
  /** Quando true, ignora a detecção de mídia e sempre exibe o aviso */
  force?: boolean;
};

export const DesktopOnlyNotice = ({ force = false }: DesktopOnlyNoticeProps) => {
  const [isMobile, setIsMobile] = useState(false);
  const themeMode = useThemeStore((state) => state.mode);

  useEffect(() => {
    if (force || typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 1024px)');
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [force]);

  const showNotice = force || isMobile;

  if (!showNotice) {
    return null;
  }

  const logoSrc = themeMode === 'dark' ? '/logo-branca.png' : '/logo.png';

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-950/95 px-4 text-center text-white">
      <div className="w-full max-w-sm space-y-5 rounded-2xl bg-slate-900/40 p-6 shadow-2xl ring-1 ring-white/10">
        <div className="flex flex-col items-center gap-3">
          <img src={logoSrc} alt="PG Modeler" className="h-14 w-14 rounded-lg bg-white/10 p-2" />
          <h1 className="text-2xl font-semibold tracking-tight">PG Modeler</h1>
        </div>
        <p className="text-sm text-slate-200">
          Este editor foi pensado para telas grandes, onde é possível visualizar e manipular os diagramas com conforto. Abra o
          <strong> PG Modeler</strong> em um computador ou notebook para continuar.
        </p>
        <p className="text-xs text-slate-400">
          Caso precise acessar pelo celular, utilize o modo desktop do navegador — mas lembre-se de que alguns recursos podem ficar limitados.
        </p>
      </div>
    </div>
  );
};
