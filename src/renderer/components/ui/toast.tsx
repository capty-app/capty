import { useCallback, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { ToastContext } from '@/renderer/lib/toast-context';
import { cn } from '@/renderer/lib/utils';
import type { ToastData, ToastOptions } from '@/types/toast';

const DEFAULT_DURATION_MS = 5000;

const TOAST_ICONS = {
  error: CircleAlert,
  success: CircleCheck,
  info: Info,
} as const;

const TOAST_ICON_CLASSES = {
  error: 'text-destructive',
  success: 'text-emerald-500',
  info: 'text-blue-500',
} as const;

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

function Toast({ toast, onDismiss }: ToastProps) {
  const Icon = TOAST_ICONS[toast.variant];

  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      className="bg-popover text-popover-foreground animate-in fade-in slide-in-from-bottom-2 pointer-events-auto flex w-80 items-start gap-2.5 rounded-lg border p-3 shadow-lg"
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          TOAST_ICON_CLASSES[toast.variant]
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.description && (
          <p className="text-muted-foreground mt-0.5 text-xs break-words">
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="text-muted-foreground hover:text-foreground shrink-0 rounded-sm transition-colors"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

interface ToastViewportProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const timeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
    setToasts(current => current.filter(t => t.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = crypto.randomUUID();
      setToasts(current => [...current, { ...options, id }]);

      const duration = options.duration ?? DEFAULT_DURATION_MS;
      timeoutsRef.current.set(
        id,
        setTimeout(() => dismiss(id), duration)
      );
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
