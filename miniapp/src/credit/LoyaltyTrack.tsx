// Dynamic Rate Discount and Loan Servicing Loyalty Tracker
import { StarMIcon } from '@alfalab/icons-glyph/StarMIcon';
import { CheckmarkMIcon } from '@alfalab/icons-glyph/CheckmarkMIcon';
import { LockClosedMIcon } from '@alfalab/icons-glyph/LockClosedMIcon';

interface LoyaltyTrackProps {
  paidInstallments: number;
  totalTermMonths?: number;
  baseRate: number;
}

export function LoyaltyTrack({ paidInstallments, baseRate }: LoyaltyTrackProps) {
  const currentStep = Math.min(paidInstallments, 6);
  const isGoldUnlocked = paidInstallments >= 6;
  const isSilverUnlocked = paidInstallments >= 3;
  const effectiveRate = isGoldUnlocked ? Math.max(0, baseRate - 0.5) : baseRate;

  return (
    <div className="op-loyalty-card" aria-label="Программа лояльности заёмщика">
      <div className="op-loyalty-head">
        <div>
          <span className="op-loyalty-badge">
            <StarMIcon aria-hidden="true" /> Программа лояльности «Надёжный заёмщик»
          </span>
          <h4 className="op-loyalty-title">Дисциплина платежей и снижение ставки</h4>
        </div>
        <div className="op-loyalty-rate-box">
          <span className="op-muted op-small">Текущая ставка:</span>
          <strong>
            {effectiveRate.toFixed(1).replace('.', ',')}% годовых
            {isGoldUnlocked && <span className="op-discount-badge">-0.5% скидка</span>}
          </strong>
        </div>
      </div>

      {/* Progress track 0 to 6 */}
      <div className="op-milestones-track">
        {[1, 2, 3, 4, 5, 6].map((step) => {
          const isDone = paidInstallments >= step;
          const isCurrent = paidInstallments + 1 === step;

          return (
            <div
              key={step}
              className={`op-milestone-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
            >
              <div className="op-milestone-circle">
                {isDone ? <CheckmarkMIcon /> : step}
              </div>
              <span className="op-milestone-label">{step}-й платёж</span>
            </div>
          );
        })}
      </div>

      {/* Perks summary */}
      <div className="op-perks-grid">
        <div className={`op-perk-card ${isSilverUnlocked ? 'active' : 'locked'}`}>
          <div className="op-perk-icon">
            {isSilverUnlocked ? <CheckmarkMIcon /> : <LockClosedMIcon />}
          </div>
          <div className="op-perk-body">
            <strong>Серебряный уровень (от 3 платежей)</strong>
            <p>Предодобренная возобновляемая кредитная линия на пополнение оборота без повторной проверки.</p>
          </div>
        </div>

        <div className={`op-perk-card ${isGoldUnlocked ? 'active' : 'locked'}`}>
          <div className="op-perk-icon">
            {isGoldUnlocked ? <CheckmarkMIcon /> : <LockClosedMIcon />}
          </div>
          <div className="op-perk-body">
            <strong>Золотой уровень (от 6 платежей)</strong>
            <p>
              Снижение процентной ставки на <strong>-0.5% годовых</strong> на весь остаток долга + экспресс-овердрафт до 1 000 000 ₽.
            </p>
          </div>
        </div>
      </div>

      <div className="op-loyalty-foot">
        {!isGoldUnlocked ? (
          <span>
            Внесите ещё <strong>{6 - currentStep}</strong> {6 - currentStep === 1 ? 'платёж' : 'платежа'} вовремя для авто-снижения ставки на -0.5% годовых.
          </span>
        ) : (
          <span className="op-text-positive">
            Поздравляем! Вы достигли Золотого уровня дисциплины. Процентная ставка автоматически снижена.
          </span>
        )}
      </div>
    </div>
  );
}
