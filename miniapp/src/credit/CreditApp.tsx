// Root of the credit cabinet: demo role switch, theme and screen routing.
import { navigate, useRoute } from './routes';
import { CreditDashboard } from './CreditDashboard';
import { NewCredit } from './NewCredit';
import { ApplicationPage } from './ApplicationPage';
import { BankWorkspace } from './BankWorkspace';
import { setThemePreference, useSystemTheme } from '../theme';
import { Icon } from '../shared/Icon';

export default function CreditApp() {
  const route = useRoute();
  const theme = useSystemTheme();
  const bank = route.name === 'bank' || route.name === 'bank-application';
  return <div className="cc-app" data-role={bank ? 'bank' : 'client'}>
    <header className="cc-topbar">
      <a className="cc-brand" href="#/" onClick={() => window.scrollTo({ top: 0 })}>
        <span className="cc-brand-mark" aria-hidden="true">₽</span>
        <span><strong>Кредитный кабинет</strong><small>для малого и микробизнеса · демо</small></span>
      </a>
      <div className="cc-topbar-actions">
        <div className="cc-segmented" role="group" aria-label="Демо-роль">
          <button type="button" aria-pressed={!bank} onClick={() => navigate({ name: 'dashboard' })}>Клиент</button>
          <button type="button" aria-pressed={bank} onClick={() => navigate({ name: 'bank' })}>Банковская сторона</button>
        </div>
        <button type="button" className="cc-icon-button" aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          onClick={() => setThemePreference(theme === 'dark' ? 'light' : 'dark')}><Icon name="eye" size={20} /></button>
      </div>
    </header>
    <main className="cc-main">
      {route.name === 'dashboard' && <CreditDashboard />}
      {route.name === 'new' && <NewCredit />}
      {route.name === 'application' && <ApplicationPage key={route.id} id={route.id} />}
      {route.name === 'bank' && <BankWorkspace />}
      {route.name === 'bank-application' && <BankWorkspace key={route.id} selectedId={route.id} />}
    </main>
    <footer className="cc-footer">
      Демонстрационный MVP. Компании, продукты, ставки, проверки и решения — синтетические; реальные банковские системы не используются,
      договор и выдача денег не выполняются.
    </footer>
  </div>;
}
