import React, { useEffect, useRef, useState } from 'react';
import Logo from './ui/Logo';

interface SplashScreenProps {
  src?: string;
  durationMs?: number;
}

const SplashScreen: React.FC<SplashScreenProps> = ({
  src = '/splash.mp4',
  durationMs = 4000,
}) => {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const fadeTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const seen = sessionStorage.getItem('splash_seen');
    if (seen === 'true') return;
    sessionStorage.setItem('splash_seen', 'true');
    setVisible(true);
    hideTimerRef.current = window.setTimeout(() => {
      startFade();
    }, durationMs);

    return () => {
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [durationMs]);

  const startFade = () => {
    if (fading) return;
    setFading(true);
    fadeTimerRef.current = window.setTimeout(() => {
      setVisible(false);
    }, 500);
  };

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[220] bg-black flex items-center justify-center transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <button
        type="button"
        onClick={startFade}
        className="absolute top-6 right-6 px-4 py-2 rounded-full bg-white dark:bg-slate-900/10 text-white text-[10px] font-black uppercase tracking-widest border border-white/20 hover:bg-white dark:hover:bg-slate-800 dark:bg-slate-900/20 transition"
      >
        Omitir
      </button>
      {hasError ? (
        <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-black to-slate-900">
          <div className="flex flex-col items-center gap-4">
            <Logo
              className="scale-125"
              textClassName="text-white"
              subTextClassName="text-slate-300"
            />
            <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
              Cargando
            </div>
          </div>
        </div>
      ) : (
        <video
          className="w-screen h-screen object-cover"
          src={src}
          autoPlay
          muted
          playsInline
          onEnded={startFade}
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
};

export default SplashScreen;
