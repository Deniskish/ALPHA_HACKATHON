// «Опора» — умный кредитный кабинет для бизнеса. Root: demo role switch and screen routing.
import { navigate, useRoute } from './routes';
import { CreditDashboard } from './CreditDashboard';
import { NeedStep } from './NeedStep';
import { ApplicationPage } from './ApplicationPage';
import { BankWorkspace } from './BankWorkspace';
import { StartScreen } from './StartScreen';
import { setSession, useSession } from './session';

export default function CreditApp() {
  const route = useRoute();
  const session = useSession();
  const bank = route.name === 'bank' || route.name === 'bank-application';
  return <div className="op-app" data-role={bank ? 'bank' : 'client'}>
    <header className="op-topbar">
      <a className="op-brand" href="#/" onClick={() => window.scrollTo({ top: 0 })}>
        <span className="op-brand-mark" aria-hidden="true">О</span>
        <span><strong>Опора</strong><small>Умный кредитный кабинет для бизнеса</small></span>
      </a>
      <div className="op-topbar-actions">
        {!bank && session && <button type="button" className="op-company-chip" onClick={() => { setSession(null); navigate({ name: 'dashboard' }); }}
          title="Сменить компанию">{session.company.name}<span aria-hidden="true">×</span></button>}
        <div className="op-segmented" role="group" aria-label="Демо-роль">
          <button type="button" aria-pressed={!bank} onClick={() => navigate({ name: 'dashboard' })}>Клиент</button>
          <button type="button" aria-pressed={bank} onClick={() => navigate({ name: 'bank' })}>Банковская сторона</button>
        </div>
      </div>
    </header>
    <main className="op-main">
      {route.name === 'dashboard' && (session ? <CreditDashboard session={session} /> : <StartScreen />)}
      {route.name === 'new' && (session ? <NeedStep session={session} /> : <StartScreen />)}
      {route.name === 'application' && <ApplicationPage key={route.id} id={route.id} stage={route.stage} />}
      {route.name === 'bank' && <BankWorkspace />}
      {route.name === 'bank-application' && <BankWorkspace key={route.id} selectedId={route.id} />}
    </main>
    <footer className="op-footer">
      Демонстрационный MVP «Опоры» — модуля финансирования для цифрового банка для бизнеса. Компании, продукты, ставки, проверки, модель риска
      и решения синтетические; реальные системы и данные Альфа-Банка не используются, авторизации нет, договор и выдача денег моделируются.
    </footer>
  </div>;
}
