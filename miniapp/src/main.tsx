// Запускаем React. Тема одна — светлая, в духе дизайн-системы Альфа-Банка.
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installViewportSizing } from './viewport';
import './index.css';
function Root() {
  useEffect(installViewportSizing, []);
  return <App />;
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
