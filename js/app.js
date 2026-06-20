// Entry point: register the service worker and start the UI.
import { mount } from './ui.js';

mount();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {/* offline support is optional */});
  });
}
