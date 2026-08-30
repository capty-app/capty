import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/renderer/App';
import '@/renderer/styles/app.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('ipcRenderer' in window) {
  window.ipcRenderer.on('main-process-message', (_event, message) => {
    console.log(message);
  });
}
