import { ThemeSettings } from "./ThemeSettings";

export function SettingsPage() {
  return (
    <div className="settings-page">
      <ThemeSettings />
      <section className="profile-panel account-panel">
        <h3>Данные на устройстве</h3>
        <p>Профиль бизнеса, черновики и документы хранятся только в этом браузере.</p>
      </section>
    </div>
  );
}
