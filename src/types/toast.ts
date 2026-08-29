export type ToastVariant = 'error' | 'success' | 'info';

export interface ToastOptions {
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

export interface ToastData extends ToastOptions {
  id: string;
}
