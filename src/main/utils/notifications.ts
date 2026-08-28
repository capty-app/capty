import { Notification } from 'electron';

interface NotificationOptions {
  title: string;
  body: string;
  onClick?: () => void;
}

export function showNotification({
  title,
  body,
  onClick,
}: NotificationOptions): void {
  if (!Notification.isSupported()) {
    return;
  }

  const notification = new Notification({ title, body });

  if (onClick) {
    notification.on('click', onClick);
  }

  notification.show();
}
