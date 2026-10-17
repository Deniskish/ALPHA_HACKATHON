// Подключаем тему и запускаем React.
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import App from './App';
import { installViewportSizing } from './viewport';
import { installTheme, useSystemTheme } from './theme';
import './index.css';
installTheme();
function ThemedApp() {
  const theme = useSystemTheme();
  useEffect(installViewportSizing, []);
  return <div className={`opora-theme theme-${theme}`}><App /></div>;
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemedApp />
  </StrictMode>,
);
