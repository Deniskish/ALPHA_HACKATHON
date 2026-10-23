// User-facing labels shared by the API and the web client. Internal names never reach the client UI.
import type { ApplicationState, CheckProvider, CheckStatus, DecisionOutcome, DocumentType, RiskLevel } from './types';
export { purposeLabels } from './synthetic-data';

export const documentLabels: Record<DocumentType, string> = {
  BANK_STATEMENT: 'Выписка по расчётному счёту за 12 месяцев',
  FINANCIAL_STATEMENT: 'Бухгалтерская отчётность за последний год',
  REGISTRY_EXTRACT: 'Выписка из ЕГРЮЛ/ЕГРИП',
  INVESTMENT_PLAN: 'Описание проекта или коммерческое предложение поставщика',
  LOAN_AGREEMENT: 'Кредитные договоры, которые нужно рефинансировать',
  OTHER: 'Другой документ',
};

/** Client-facing status: what is happening and what the client should do. */
export const clientStateLabels: Record<ApplicationState, { title: string; next: string }> = {
  DRAFT: { title: 'Черновик', next: 'Выберите продукт и заполните заявку' },
  DATA_COLLECTION: { title: 'Заполнение заявки', next: 'Заполните недостающие данные и приложите документы' },
  READY_TO_SUBMIT: { title: 'Готова к отправке', next: 'Проверьте данные и отправьте заявку' },
  SUBMITTED: { title: 'Отправлена', next: 'Заявка поставлена в обработку' },
  VALIDATING: { title: 'Проверяем данные компании', next: 'Дождитесь окончания проверки' },
  NEEDS_INFO: { title: 'Нужны дополнительные данные', next: 'Дополните заявку и отправьте её повторно' },
  ENRICHING: { title: 'Получаем сведения', next: 'Дождитесь окончания проверки' },
  RISK_ASSESSMENT: { title: 'Оцениваем риски', next: 'Дождитесь окончания проверки' },
  SCORING: { title: 'Оцениваем заявку', next: 'Дождитесь окончания проверки' },
  DECISION: { title: 'Формируем решение', next: 'Решение будет готово через несколько секунд' },
  APPROVED: { title: 'Одобрено', next: 'Примите предложение' },
  COUNTER_OFFER: { title: 'Встречное предложение', next: 'Ознакомьтесь с условиями и примите предложение' },
  REJECTED: { title: 'Отказ', next: 'Ознакомьтесь с причинами; можно подать новую заявку позже' },
  OFFER_ACCEPTED: { title: 'Предложение принято', next: 'Подпишите договор (подписание моделируется)' },
  COMPLETED: { title: 'Договор подписан', next: 'Получите финансирование (выдача моделируется)' },
  ACTIVE_FINANCING: { title: 'Финансирование выдано', next: 'Следите за графиком платежей и новыми возможностями' },
};

export const outcomeLabels: Record<DecisionOutcome, string> = {
  APPROVED: 'Одобрено', COUNTER_OFFER: 'Встречное предложение', NEEDS_INFO: 'Нужны данные', REJECTED: 'Отказ',
};

export const riskLabels: Record<RiskLevel, string> = { LOW: 'Низкий', MEDIUM: 'Средний', HIGH: 'Высокий' };

export const providerLabels: Record<CheckProvider, { client: string; bank: string }> = {
  FNS: { client: 'Сведения о регистрации', bank: 'ФНС (mock)' },
  BKI: { client: 'Кредитная история', bank: 'БКИ (mock)' },
  FINANCE: { client: 'Финансовые показатели', bank: 'Финансовые данные (mock)' },
};

export const checkStatusLabels: Record<CheckStatus, string> = {
  OK: 'Получены', NO_HISTORY: 'Кредитной истории нет', NOT_FOUND: 'Сведения не найдены', DOCUMENT_BASED: 'По документам заявителя',
};
