'use client';

import { createContext, useContext, useCallback, useState, ReactNode } from "react";
import { CheckCircle2, Info, XCircle, ExternalLink, X } from "lucide-react";

type Kind = "info" | "success" | "error";
interface Toast {
  id: number;
  kind: Kind;
  message: string;
  href?: string;
}
interface Ctx {
  push: (kind: Kind, message: string, href?: string) => void;
}

const ToastCtx = createContext<Ctx | null>(null);

const ICON = {
  info: { Icon: Info, cls: "text-brand-300" },
  success: { Icon: CheckCircle2, cls: "text-emerald-400" },
  error: { Icon: XCircle, cls: "text-red-400" },
};

let _id = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: Kind, message: string, href?: string) => {
      const id = _id++;
      setToasts((t) => [...t, { id, kind, message, href }]);
      setTimeout(() => remove(id), 9000);
    },
    [remove]
  );

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const { Icon, cls } = ICON[t.kind];
          return (
            <div key={t.id} className="card flex items-start gap-3 p-3.5 shadow-xl shadow-black/40">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cls}`} strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white">{t.message}</p>
                {t.href && (
                  <a
                    href={t.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand-300 transition hover:text-brand-200"
                  >
                    View on explorer <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <button onClick={() => remove(t.id)} aria-label="Dismiss" className="text-mist-500 transition hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  const push = ctx?.push ?? (() => {});
  return {
    info: (m: string, h?: string) => push("info", m, h),
    success: (m: string, h?: string) => push("success", m, h),
    error: (m: string, h?: string) => push("error", m, h),
  };
}
