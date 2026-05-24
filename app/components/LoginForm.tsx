'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';

export default function LoginForm() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    setIsSubmitting(true);
    try {
      const outcome = await login(email, password);
      if (outcome === 'wrong-password') {
        setError(t('login.wrongPassword'));
      } else if (outcome === 'email-not-found') {
        setError(t('login.emailNotRegistered'));
      } else if (outcome === 'failed') {
        setError(t('login.loginError'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setSuccessMessage('');
    if (!email.trim()) {
      setError(t('login.emailRequiredForReset'));
      return;
    }
    setResetSending(true);
    const outcome = await resetPassword(email);
    setResetSending(false);
    if (outcome === 'sent') {
      setSuccessMessage(t('login.resetEmailSent'));
    } else if (outcome === 'not-found') {
      setError(t('login.emailNotFound'));
    } else {
      setError(t('login.resetEmailFailed'));
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-32 w-32 shrink-0 items-center justify-center">
              <img
                src="/sasa.png"
                alt=""
                width={128}
                height={128}
                className="max-h-32 max-w-32 h-auto w-auto object-contain"
              />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              {t('login.welcomeBack')}
            </h1>
            <p className="mt-2 text-sm text-gray-500">{t('login.signInSubtitle')}</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-3">
              <label htmlFor="email" className="sr-only">
                {t('login.email')}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                placeholder={t('login.email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label htmlFor="password" className="sr-only">
                {t('login.password')}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                placeholder={t('login.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            {successMessage && (
              <div className="rounded-md border border-green-100 bg-green-50 px-3 py-2">
                <p className="text-sm text-green-700">{successMessage}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-black py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  {t('login.signingIn')}
                </span>
              ) : (
                t('login.signIn')
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetSending}
                className="text-sm font-medium text-gray-700 underline-offset-2 hover:text-gray-900 hover:underline disabled:opacity-50"
              >
                {resetSending ? t('login.sendingReset') : t('login.forgotPassword')}
              </button>
            </div>
          </form>
        </div>
      </div>

      <footer className="shrink-0 border-t border-transparent py-6 text-center">
        <p className="text-xs text-gray-400">{t('login.footerCompany')}</p>
      </footer>
    </div>
  );
}
