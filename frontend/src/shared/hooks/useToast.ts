import { useState, useCallback } from 'react';

export interface NotificationData {
  type: 'error' | 'warning' | 'success';
  message: string;
}

export function useToast() {
  const [toast, setToast] = useState<NotificationData | null>(null);

  const showNotification = useCallback(({ type, message }: NotificationData, duration = 4000) => {
    setToast({ type, message });
    const timer = setTimeout(() => setToast(null), duration);
    return () => clearTimeout(timer);
  }, []);

  const showToast = useCallback((message: string, duration = 4000) => {
    let type: 'error' | 'warning' | 'success' = 'success';
    const lower = message.toLowerCase();
    if (lower.includes('failed') || lower.includes('error') || lower.includes('invalid') || lower.includes('cannot')) {
      type = 'error';
    } else if (lower.includes('warning') || lower.includes('expose') || lower.includes('risk') || lower.includes('alert')) {
      type = 'warning';
    }
    setToast({ type, message });
    const timer = setTimeout(() => setToast(null), duration);
    return () => clearTimeout(timer);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  return { toast, showNotification, showToast, dismissToast };
}
