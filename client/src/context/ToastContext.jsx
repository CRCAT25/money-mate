import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CircleAlert, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((items) => items.map((item) => item.id === id ? { ...item, leaving: true } : item));
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
    }, 300);
  }, []);

  const notify = useCallback((message, type = 'success') => {
    const id = crypto.randomUUID();
    setToasts((items) => [...items, { id, message, type }]);
    window.setTimeout(() => dismiss(id), type === 'error' ? 2700 : 700);
  }, [dismiss]);

  const value = useMemo(() => ({ notify }), [notify]);
  const successToasts = toasts.filter((toast) => toast.type !== 'error');
  const errorToasts = toasts.filter((toast) => toast.type === 'error');

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center px-6">
        <div className="flex w-full max-w-[290px] flex-col items-center gap-2.5">
          {successToasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto flex w-full flex-col items-center rounded-[20px] border border-ink/15 bg-white/20 px-5 py-5 text-center text-sm font-medium text-ink shadow-[0_14px_34px_rgba(32,49,44,0.12)] backdrop-blur-[3px] ${toast.leaving ? 'toast-center-out' : 'toast-center-in'}`}
              role="status"
            >
              <span className="mb-3 grid size-12 place-items-center rounded-full bg-mint text-forest">
                <svg className="toast-check size-8" viewBox="0 0 32 32" aria-hidden="true">
                  <circle className="toast-check__circle" cx="16" cy="16" r="12" />
                  <path className="toast-check__mark" d="m10.5 16.4 3.5 3.5 7.7-8" />
                </svg>
              </span>
              <span className="leading-5">{toast.message}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="fixed inset-x-4 top-[calc(12px+env(safe-area-inset-top))] z-[101] ml-auto flex max-w-sm flex-col gap-2 sm:left-auto">
        {errorToasts.map((toast) => (
          <div
            key={toast.id}
            className="flex animate-rise-in items-start gap-3 rounded-2xl border border-white/20 bg-ink px-4 py-3 text-sm font-semibold text-white shadow-soft"
            role="alert"
          >
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-coral" />
            <span className="flex-1">{toast.message}</span>
            <button aria-label="Đóng" onClick={() => dismiss(toast.id)}>
              <X className="size-4 opacity-60" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
