import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((message, type = 'success') => {
    const id = crypto.randomUUID();
    setToasts((items) => [...items, { id, message, type }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3600);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed inset-x-4 top-4 z-[100] ml-auto flex max-w-sm flex-col gap-2 sm:left-auto">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex animate-rise-in items-start gap-3 rounded-2xl border border-white/20 bg-ink px-4 py-3 text-sm font-semibold text-white shadow-soft"
          >
            {toast.type === 'error' ? <CircleAlert className="mt-0.5 size-5 shrink-0 text-coral" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-mint" />}
            <span className="flex-1">{toast.message}</span>
            <button aria-label="Đóng" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}>
              <X className="size-4 opacity-60" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

