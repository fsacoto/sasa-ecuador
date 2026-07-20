'use client';

import { useCallback, useEffect, useState } from 'react';
import ModalPortal from './ui/ModalPortal';

export type StorefrontStatusPayload = {
  ok: boolean;
  status: 'connected' | 'partial' | 'misconfigured' | 'error';
  checkedAt: string;
  baseUrl: string;
  api: {
    keyConfigured: boolean;
    keyHint: string | null;
    authHeaders: string[];
    corsOrigin: string;
    endpoints: { method: string; path: string; description: string }[];
    curlExample: string;
  };
  firestore: {
    ok: boolean;
    productCount: number;
    categoryCounts: Record<string, number>;
    error?: string;
    projectId: string | null;
  };
  storefront: {
    url: string;
    reachable: boolean | null;
    productCount?: number;
    error?: string;
    expectedEnv: {
      INVENTORY_API_URL: string;
      INVENTORY_API_KEY: string;
    };
  };
};

const STATUS_LABEL: Record<StorefrontStatusPayload['status'], string> = {
  connected: 'Conectado',
  partial: 'Parcial',
  misconfigured: 'Sin configurar',
  error: 'Error',
};

const STATUS_COLOR: Record<StorefrontStatusPayload['status'], string> = {
  connected: 'bg-emerald-500',
  partial: 'bg-amber-500',
  misconfigured: 'bg-slate-400',
  error: 'bg-red-500',
};

const CATEGORY_LABELS: Record<string, string> = {
  earrings: 'Aretes',
  necklaces: 'Cadenas',
  rings: 'Anillos',
  bracelets: 'Pulseras',
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function StorefrontConnectionPanel({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StorefrontStatusPayload | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/store/status', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as StorefrontStatusPayload;
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el estado');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadStatus();
  }, [open, loadStatus]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="storefront-config-title"
          className="sasa-modal-dark flex max-h-[min(92vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#141414] text-[#e8e8e8] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#2a2a2a] px-5 py-4">
            <div>
              <h2 id="storefront-config-title" className="text-base font-semibold tracking-wide">
                Configuración · Storefront
              </h2>
              <p className="mt-1 text-xs text-[#9a9a9a]">
                Estado de la API de tienda y conexión con la vitrina local.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-[#9a9a9a] hover:bg-[#222] hover:text-white"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loading && !data && (
              <p className="text-sm text-[#9a9a9a]">Comprobando conexión…</p>
            )}
            {error && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}

            {data && (
              <div className="space-y-5">
                <section className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_COLOR[data.status]}`}
                        aria-hidden
                      />
                      <div>
                        <p className="text-sm font-medium">{STATUS_LABEL[data.status]}</p>
                        <p className="text-[11px] text-[#8a8a8a]">
                          Última comprobación:{' '}
                          {new Date(data.checkedAt).toLocaleString('es-EC')}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadStatus()}
                      disabled={loading}
                      className="rounded-md border border-[#333] bg-[#222] px-3 py-1.5 text-xs font-medium text-[#ddd] hover:bg-[#2a2a2a] disabled:opacity-50"
                    >
                      {loading ? 'Actualizando…' : 'Actualizar'}
                    </button>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-[#9a9a9a]">
                    {data.status === 'connected' &&
                      'La API de inventario responde y el storefront local está alcanzable.'}
                    {data.status === 'partial' &&
                      'La API de inventario funciona, pero el storefront no responde (¿está corriendo en el puerto configurado?).'}
                    {data.status === 'misconfigured' &&
                      'Falta STORE_API_KEY en .env.local del hub de inventario.'}
                    {data.status === 'error' &&
                      'No se pudo leer productos desde Firestore. Revisa reglas y credenciales Firebase.'}
                  </p>
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">
                    API de inventario (este proyecto)
                  </h3>
                  <dl className="grid gap-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-[11px] text-[#8a8a8a]">URL base</dt>
                      <dd className="mt-0.5 break-all font-mono text-xs">{data.baseUrl}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[#8a8a8a]">API key</dt>
                      <dd className="mt-0.5 font-mono text-xs">
                        {data.api.keyConfigured
                          ? data.api.keyHint
                          : 'No configurada'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[#8a8a8a]">CORS</dt>
                      <dd className="mt-0.5 font-mono text-xs">{data.api.corsOrigin}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[#8a8a8a]">Auth</dt>
                      <dd className="mt-0.5 text-xs">{data.api.authHeaders.join(' · ')}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] text-[#8a8a8a]">Firestore</dt>
                      <dd className="mt-0.5 text-xs">
                        {data.firestore.ok ? (
                          <>
                            OK · {data.firestore.productCount} producto(s) publicados
                            {data.firestore.projectId
                              ? ` · ${data.firestore.projectId}`
                              : ''}
                          </>
                        ) : (
                          <span className="text-red-300">
                            Error: {data.firestore.error || 'desconocido'}
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  {data.firestore.ok && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(data.firestore.categoryCounts).map(([key, count]) => (
                        <span
                          key={key}
                          className="rounded-full border border-[#333] bg-[#1a1a1a] px-2.5 py-1 text-[11px] text-[#bbb]"
                        >
                          {CATEGORY_LABELS[key] || key}: {count}
                        </span>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">
                    Storefront (tienda)
                  </h3>
                  <dl className="grid gap-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4 text-sm sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] text-[#8a8a8a]">URL</dt>
                      <dd className="mt-0.5 flex flex-wrap items-center gap-2">
                        <span className="break-all font-mono text-xs">{data.storefront.url}</span>
                        <a
                          href={data.storefront.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[#c5c5c5] underline underline-offset-2 hover:text-white"
                        >
                          Abrir
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[#8a8a8a]">Alcanzable</dt>
                      <dd className="mt-0.5 text-xs">
                        {data.storefront.reachable === true && (
                          <span className="text-emerald-300">Sí</span>
                        )}
                        {data.storefront.reachable === false && (
                          <span className="text-amber-300">
                            No{data.storefront.error ? ` — ${data.storefront.error}` : ''}
                          </span>
                        )}
                        {data.storefront.reachable === null && '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-[#8a8a8a]">Productos vía BFF</dt>
                      <dd className="mt-0.5 text-xs">
                        {data.storefront.productCount != null
                          ? data.storefront.productCount
                          : '—'}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-2 rounded-lg border border-dashed border-[#333] bg-[#161616] p-3">
                    <p className="mb-2 text-[11px] font-medium text-[#aaa]">
                      Variables en la tienda (`.env.local`)
                    </p>
                    <pre className="overflow-x-auto rounded bg-[#0f0f0f] p-2 font-mono text-[11px] leading-relaxed text-[#ccc]">
{`INVENTORY_API_URL=${data.storefront.expectedEnv.INVENTORY_API_URL}
INVENTORY_API_KEY=${data.api.keyConfigured ? '<mismo valor que STORE_API_KEY>' : '<definir STORE_API_KEY>'}`}
                    </pre>
                    <button
                      type="button"
                      className="mt-2 text-[11px] text-[#c5c5c5] underline underline-offset-2 hover:text-white"
                      onClick={() =>
                        void copyText(
                          'env',
                          `INVENTORY_API_URL=${data.storefront.expectedEnv.INVENTORY_API_URL}\nINVENTORY_API_KEY=`
                        )
                      }
                    >
                      {copied === 'env' ? 'Copiado' : 'Copiar plantilla'}
                    </button>
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">
                    Endpoints
                  </h3>
                  <ul className="space-y-2">
                    {data.api.endpoints.map((ep) => (
                      <li
                        key={ep.path}
                        className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2"
                      >
                        <p className="font-mono text-[11px] text-[#ddd]">
                          <span className="text-[#8a8a8a]">{ep.method}</span> {ep.path}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#8a8a8a]">{ep.description}</p>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] text-[#8a8a8a]">Ejemplo curl</p>
                    <pre className="overflow-x-auto rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3 font-mono text-[11px] leading-relaxed text-[#ccc]">
                      {data.api.curlExample}
                    </pre>
                    <button
                      type="button"
                      className="mt-2 text-[11px] text-[#c5c5c5] underline underline-offset-2 hover:text-white"
                      onClick={() => void copyText('curl', data.api.curlExample)}
                    >
                      {copied === 'curl' ? 'Copiado' : 'Copiar curl'}
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>

          <div className="flex justify-end border-t border-[#2a2a2a] px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-[#2a2a2a] px-4 py-2 text-xs font-medium text-white hover:bg-[#333]"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
