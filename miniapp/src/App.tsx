import { useEffect, useState } from 'react';

type Cabinet = typeof import('./credit/CreditApp')['default'];
let cabinetRequest: Promise<Cabinet> | undefined;
function loadCabinet() {
  return cabinetRequest ??= import('./credit/CreditApp')
    .then((module) => module.default)
    .catch((error: unknown) => { cabinetRequest = undefined; throw error; });
}

export default function App() {
  const [CreditApp, setCreditApp] = useState<Cabinet | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void loadCabinet().then((component) => {
      if (active) setCreditApp(() => component);
    }).catch(() => {
      if (active) setLoadFailed(true);
    });
    return () => { active = false; };
  }, []);

  if (CreditApp) return <CreditApp />;
  return <main className="op-main" aria-busy={!loadFailed}>
    {loadFailed
      ? <div className="op-alert op-alert-danger" role="alert">
        <span>Не удалось загрузить приложение. Проверьте интернет и обновите страницу.</span>
        <button type="button" className="op-link" onClick={() => window.location.reload()}>Обновить страницу</button>
      </div>
      : <p className="op-loading" role="status"><span className="op-spinner" aria-hidden="true" />Открываем кредитный кабинет…</p>}
  </main>;
}
