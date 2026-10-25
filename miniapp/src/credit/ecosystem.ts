// B2B Counterparty Network and Alfa Ecosystem Trust Boost Engine

export interface CounterpartyNode {
  id: string;
  name: string;
  inn: string;
  role: 'BUYER' | 'SUPPLIER';
  volumeRub: number;
  sharePercent: number;
  isAlfaClient: boolean;
  alfaClientYears?: number;
  riskRating: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface EcosystemAnalysis {
  nodes: CounterpartyNode[];
  totalConnectedVolume: number;
  alfaConnectedVolume: number;
  alfaVolumeShare: number; // 0 to 1
  ecosystemBoostPoints: number; // 0 to 15
  rateDiscountPercent: number; // 0 to 1.5
  trustLevel: 'HIGH_ECOSYSTEM' | 'MODERATE_ECOSYSTEM' | 'STANDALONE';
  rationale: string;
}

export function analyzeCounterpartyEcosystem(
  companyInn: string,
  annualRevenue: number
): EcosystemAnalysis {
  // Generate realistic B2B counterparty network anchored to the business profile
  const isA = companyInn === '0001000010'; // Bakery
  const isB = companyInn === '0002000020'; // Tech service / equipment
  const isE = companyInn === '0005000050'; // Coffee shop chain

  let nodes: CounterpartyNode[] = [];

  if (isA) {
    nodes = [
      { id: 'n1', name: 'Федеральная сеть супермаркетов «Пятёрочка»', inn: '7728029110', role: 'BUYER', volumeRub: Math.round(annualRevenue * 0.42), sharePercent: 42, isAlfaClient: true, alfaClientYears: 8, riskRating: 'LOW' },
      { id: 'n2', name: 'Сеть гастрономов «Азбука Вкуса»', inn: '7705043063', role: 'BUYER', volumeRub: Math.round(annualRevenue * 0.28), sharePercent: 28, isAlfaClient: true, alfaClientYears: 6, riskRating: 'LOW' },
      { id: 'n3', name: 'АО «Алтайская Мельница» (Мука ГОСТ)', inn: '2225010203', role: 'SUPPLIER', volumeRub: Math.round(annualRevenue * 0.20), sharePercent: 20, isAlfaClient: true, alfaClientYears: 4, riskRating: 'LOW' },
      { id: 'n4', name: 'ООО «ЭкоУпаковка Сервис»', inn: '5024098123', role: 'SUPPLIER', volumeRub: Math.round(annualRevenue * 0.10), sharePercent: 10, isAlfaClient: false, riskRating: 'MEDIUM' },
    ];
  } else if (isB) {
    nodes = [
      { id: 'n1', name: 'ПАО «Северсталь Дистрибуция»', inn: '3528000597', role: 'SUPPLIER', volumeRub: Math.round(annualRevenue * 0.38), sharePercent: 38, isAlfaClient: true, alfaClientYears: 10, riskRating: 'LOW' },
      { id: 'n2', name: 'ООО «Техмаш-Инжиниринг Завод»', inn: '7714088921', role: 'BUYER', volumeRub: Math.round(annualRevenue * 0.30), sharePercent: 30, isAlfaClient: true, alfaClientYears: 5, riskRating: 'LOW' },
      { id: 'n3', name: 'ООО «РемПромСервис Урал»', inn: '6671044231', role: 'BUYER', volumeRub: Math.round(annualRevenue * 0.22), sharePercent: 22, isAlfaClient: false, riskRating: 'MEDIUM' },
      { id: 'n4', name: 'АО «Логистик-Групп»', inn: '7801099234', role: 'SUPPLIER', volumeRub: Math.round(annualRevenue * 0.10), sharePercent: 10, isAlfaClient: true, alfaClientYears: 3, riskRating: 'LOW' },
    ];
  } else if (isE) {
    nodes = [
      { id: 'n1', name: 'ООО «Торговый Комплекс Галерея СПб»', inn: '7842019921', role: 'SUPPLIER', volumeRub: Math.round(annualRevenue * 0.25), sharePercent: 25, isAlfaClient: true, alfaClientYears: 7, riskRating: 'LOW' },
      { id: 'n2', name: 'ООО «Импорт Кофе Бразилия-Эфиопия»', inn: '7709088123', role: 'SUPPLIER', volumeRub: Math.round(annualRevenue * 0.35), sharePercent: 35, isAlfaClient: true, alfaClientYears: 4, riskRating: 'LOW' },
      { id: 'n3', name: 'ООО «Кондитерская Мануфактура»', inn: '7810055412', role: 'SUPPLIER', volumeRub: Math.round(annualRevenue * 0.20), sharePercent: 20, isAlfaClient: false, riskRating: 'LOW' },
      { id: 'n4', name: 'Поток B2C покупателей (Эквайринг)', inn: '0000000000', role: 'BUYER', volumeRub: Math.round(annualRevenue * 0.85), sharePercent: 85, isAlfaClient: true, alfaClientYears: 3, riskRating: 'LOW' },
    ];
  } else {
    // Default SME network
    nodes = [
      { id: 'n1', name: 'ООО «Оптовый Партнёр»', inn: '7701020304', role: 'BUYER', volumeRub: Math.round(annualRevenue * 0.40), sharePercent: 40, isAlfaClient: true, alfaClientYears: 5, riskRating: 'LOW' },
      { id: 'n2', name: 'АО «Региональный Сбыт»', inn: '7802030405', role: 'BUYER', volumeRub: Math.round(annualRevenue * 0.30), sharePercent: 30, isAlfaClient: false, riskRating: 'MEDIUM' },
      { id: 'n3', name: 'ООО «Базовые Поставки»', inn: '5003040506', role: 'SUPPLIER', volumeRub: Math.round(annualRevenue * 0.30), sharePercent: 30, isAlfaClient: true, alfaClientYears: 3, riskRating: 'LOW' },
    ];
  }

  const totalConnectedVolume = nodes.reduce((s, n) => s + n.volumeRub, 0);
  const alfaConnectedVolume = nodes.filter((n) => n.isAlfaClient).reduce((s, n) => s + n.volumeRub, 0);
  const alfaVolumeShare = totalConnectedVolume > 0 ? alfaConnectedVolume / totalConnectedVolume : 0;

  let ecosystemBoostPoints = 0;
  let rateDiscountPercent = 0;
  let trustLevel: 'HIGH_ECOSYSTEM' | 'MODERATE_ECOSYSTEM' | 'STANDALONE';
  let rationale = '';

  if (alfaVolumeShare >= 0.65) {
    ecosystemBoostPoints = 12;
    rateDiscountPercent = 1.5;
    trustLevel = 'HIGH_ECOSYSTEM';
    rationale = 'Более 65% оборота замкнуто на надёжных клиентов Альфа-Банка. Риск фиктивных операций и неплатежей дебиторов минимален.';
  } else if (alfaVolumeShare >= 0.35) {
    ecosystemBoostPoints = 7;
    rateDiscountPercent = 0.8;
    trustLevel = 'MODERATE_ECOSYSTEM';
    rationale = 'Значительная часть расчётов (от 35%) проходит внутри экосистемы банка, что подтверждает устойчивость торговых цепочек.';
  } else {
    ecosystemBoostPoints = 2;
    rateDiscountPercent = 0.2;
    trustLevel = 'STANDALONE';
    rationale = 'Компания взаимодействует преимущественно со внешними контрагентами вне контура банка.';
  }

  return {
    nodes,
    totalConnectedVolume,
    alfaConnectedVolume,
    alfaVolumeShare: Math.round(alfaVolumeShare * 100) / 100,
    ecosystemBoostPoints,
    rateDiscountPercent,
    trustLevel,
    rationale,
  };
}
