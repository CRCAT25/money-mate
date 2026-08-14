import api from './api.js';

export async function getPushNotificationState() {
  const supported = supportsPush();
  if (!supported) {
    return { supported: false, configured: false, permission: notificationPermission(), subscribed: false };
  }

  const [{ data: config }, registration] = await Promise.all([
    api.get('/push/config'),
    navigator.serviceWorker.getRegistration(),
  ]);
  const subscription = await registration?.pushManager.getSubscription();
  return {
    supported: true,
    configured: Boolean(config.enabled && config.publicKey),
    permission: Notification.permission,
    subscribed: Boolean(subscription),
  };
}

export async function enablePushNotifications() {
  if (!supportsPush()) throw new Error('Thiết bị này chưa hỗ trợ thông báo cho ứng dụng web.');
  const { data: config } = await api.get('/push/config');
  if (!config.enabled || !config.publicKey) throw new Error('Thông báo chưa được cấu hình trên máy chủ.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Bạn đã chặn thông báo. Hãy cho phép lại trong cài đặt của thiết bị.'
      : 'Bạn chưa cho phép MoneyMate gửi thông báo.');
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    });
  }

  try {
    const { data } = await api.post('/push/subscriptions', subscription.toJSON());
    return data;
  } catch (error) {
    await subscription.unsubscribe().catch(() => {});
    throw error;
  }
}

export async function disablePushNotifications({ notifyServer = true } = {}) {
  if (!supportsPush()) return { message: 'Đã tắt thông báo trên thiết bị này.' };
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return { message: 'Thông báo đã được tắt trên thiết bị này.' };

  if (notifyServer) {
    await api.delete('/push/subscriptions', { data: { endpoint: subscription.endpoint } });
  }
  await subscription.unsubscribe();
  return { message: 'Đã tắt thông báo trên thiết bị này.' };
}

function supportsPush() {
  return window.isSecureContext
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

function notificationPermission() {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bytes = atob(base64);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}
