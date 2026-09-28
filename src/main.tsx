import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/700.css';
import './i18n';
// Order matters: tokens define the custom properties every other rule reads,
// so they must be in the bundle before index.css layers any rule on top.
import './styles/tokens.css';
import './styles/index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useSettings } from './store/settings';
import { useNotification } from './store/notifications';
import { invoke, onChannel } from './lib/api';
import { initPlatform } from './lib/platform';

async function boot() {
  // initPlatform() only writes a data attribute and is internally guarded, but
  // it runs before the first render, so anything that ever threw here would
  // leave an empty <div id="root"> — a silent white screen. Keep the render
  // reachable no matter what.
  try {
    initPlatform();
  } catch (e) {
    console.error('initPlatform failed', e);
  }
  const root = document.getElementById('root');
  if (!root) {
    console.error('boot failed: #root is missing from index.html');
    return;
  }
  createRoot(root).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );

  const refreshNotifications = () => {
    Promise.all([
      invoke<any[]>('notifications:list'),
      invoke<number>('notifications:unread'),
    ]).then(([list, unread]) => useNotification.getState().set(list || [], unread ?? 0)).catch(() => {});
  };

  try {
    const [settings, user, notifications, unread] = await Promise.all([
      invoke<any>('settings:get'),
      invoke<any>('user:get'),
      invoke<any>('notifications:list'),
      invoke<number>('notifications:unread'),
    ]);
    useSettings.getState().init(settings, user);
    useNotification.getState().set((notifications || []), unread ?? 0);
  } catch (e) {
    console.error('boot failed', e);
  }

  // Keep the bell in sync whenever any engine mutates data (entity created/completed/
  // deleted, notification read/resolved/dismissed, scheduler fired).
  onChannel('data:changed', () => refreshNotifications());
  onChannel('notification', () => refreshNotifications());
}

boot();