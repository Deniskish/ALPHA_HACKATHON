// «Опора» — умный кредитный кабинет для бизнеса. One CreditApplication, two route shells:
// the client cabinet (`#/`, `#/credit/...`) and the bank workspace (`#/bank/...`) over the same API.
import type { ReactNode } from 'react';
import { BankMIcon } from '@alfalab/icons-glyph/BankMIcon';
import { ListBulletedMIcon } from '@alfalab/icons-glyph/ListBulletedMIcon';
import { ArrowBackMIcon } from '@alfalab/icons-glyph/ArrowBackMIcon';
import { UserMIcon } from '@alfalab/icons-glyph/UserMIcon';
import { navigate, shellOf, useRoute } from './routes';
import { CreditDashboard } from './CreditDashboard';
import { NeedStep } from './NeedStep';
import { ApplicationPage } from './ApplicationPage';
import { BankWorkspace } from './BankWorkspace';
import { StartScreen } from './StartScreen';
import { companyInitial, Logo } from './ui';
import { setSession, useSession } from './session';

export default function CreditApp() {
  const route = useRoute();
  const session = useSession();
  if (shellOf(route) === 'bank') return <BankShell>
    {route.name === 'bank' && <BankWorkspace />}
    {route.name === 'bank-application' && <BankWorkspace key={route.id} selectedId={route.id} />}
  </BankShell>;
  return <ClientShell>
    {route.name === 'dashboard' && (session ? <CreditDashboard session={session} /> : <StartScreen />)}
    {route.name === 'new' && (session ? <NeedStep session={session} /> : <StartScreen />)}
    {route.name === 'application' && <ApplicationPage key={route.id} id={route.id} stage={route.stage} />}
  </ClientShell>;
}

function ClientShell({ children }: { children: ReactNode }) {
  const session = useSession();
  return <div className="op-app op-client">
    <header className="op-topbar">
      <a className="op-brand" href="#/" onClick={() => window.scrollTo({ top: 0 })} aria-label="Опора — на главную">
        <Logo variant="graphite" height={26} />
        <span className="op-brand-tagline">Умный кредитный кабинет<br />для бизнеса</span>
      </a>
      <div className="op-topbar-actions">
        {session && <button type="button" className="op-company-chip" onClick={() => { setSession(null); navigate({ name: 'dashboard' }); }}
          title="Сменить компанию">
          <span className="op-company-avatar" aria-hidden="true">{companyInitial(session.company.name)}</span>
          <span className="op-company-chip-text"><strong>{session.company.name}</strong>
            <small>{session.relationship === 'client' ? 'клиент банка' : 'пока не клиент'} · сменить</small></span>
        </button>}
        <a className="op-shell-link" href="#/bank" aria-label="Рабочее место банка"><BankMIcon aria-hidden="true" /><span>Рабочее место банка</span></a>
      </div>
    </header>
    <main className="op-main">{children}</main>
    <footer className="op-footer">
      <Logo variant="graphite" kind="mark" height={18} />
      <p>Демонстрационный MVP «Опоры» — модуля финансирования цифрового банка для бизнеса. Компании, продукты, ставки, проверки,
        модель риска и решения синтетические; реальные системы и данные Альфа-Банка не используются, авторизации нет,
        договор, выдача и платежи моделируются.</p>
    </footer>
  </div>;
}

function BankShell({ children }: { children: ReactNode }) {
  return <div className="op-app op-bank-shell">
    <aside className="op-sidebar" aria-label="Рабочее место банка">
      <a className="op-sidebar-brand" href="#/bank">
        <Logo variant="silver" height={22} />
        <span>Кредитный конвейер</span>
      </a>
      <nav className="op-sidebar-nav">
        <a href="#/bank" aria-current="page"><ListBulletedMIcon aria-hidden="true" /><span>Заявки</span></a>
      </nav>
      <div className="op-sidebar-foot">
        <span className="op-env">DEMO · synthetic data</span>
        <div className="op-sidebar-user"><UserMIcon aria-hidden="true" /><span>Кредитный аналитик<small>демо-роль без авторизации</small></span></div>
        <a className="op-sidebar-back" href="#/"><ArrowBackMIcon aria-hidden="true" /><span>Клиентский кабинет</span></a>
      </div>
    </aside>
    <main className="op-bank-main">{children}</main>
  </div>;
}
