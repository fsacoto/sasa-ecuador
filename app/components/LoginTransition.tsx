'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '../context/TranslationContext';

type LoginTransitionProps = {
  userName: string;
};

export default function LoginTransition({ userName }: LoginTransitionProps) {
  const { t, tf } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const displayName = userName.trim() || tf('login.defaultUserName', 'Usuario');
  const welcomeText = tf('login.welcomeUser', 'Bienvenido, {name}').replace('{name}', displayName);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white transition-opacity duration-500 ease-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className={`flex flex-col items-center px-6 text-center transition-all duration-700 ease-out ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        <div className="mb-8 flex h-28 w-28 items-center justify-center">
          <img
            src="/sasa.png"
            alt=""
            width={112}
            height={112}
            className="h-auto max-h-28 w-auto max-w-28 object-contain"
          />
        </div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-gray-400">
          {t('login.entering')}
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">{welcomeText}</h2>
        <p className="mt-2 text-sm text-gray-500">{t('login.preparingWorkspace')}</p>
        <div className="mt-8 flex items-center gap-2" aria-hidden>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
