import { createContext } from 'react';
import type { ToastOptions } from '@/types/toast';

export interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
