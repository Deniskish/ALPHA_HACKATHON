// LightGBM risk model exported by ml/train.py, evaluated without Python: tree traversal for the probability and
// exact TreeSHAP (Lundberg et al., 2018) for the explanation. Parity with LightGBM is checked against ml fixtures.
// Demo model on synthetic data: it estimates default12m and never makes the credit decision.
import exported from './model/risk-model.json';
import { formatAge } from './finance';
import { industries, type Industry } from './industry';
import { purposeLabels } from './labels';
import type { RiskFeatures } from './features';
import type { RiskModel, RiskModelOutput } from './risk-model';
import type { CreditPurpose, RiskFactor, RiskLevel } from './types';

type Node = number[]; // [feature, threshold, left, right, cover]; a child < 0 is the leaf ~child
type Tree = { root: number; nodes: Node[]; leaves: number[][] }; // leaf = [value, cover]
type NumericSpec = { name: string; source: string; transform?: string; clip?: number[]; label: string };
type CategoricalSpec = { name: string; categories: string[]; label: string };
export type ExportedRiskModel = { version: string; columns: string[]; numeric: NumericSpec[]; categorical: CategoricalSpec[];
  riskLevels: { mediumFrom: number; highFrom: number }; trees: Tree[] };

/** Raw features → model columns, the same rules as ml/common.py `encode`. */
export function encodeFeatures(model: ExportedRiskModel, features: Record<string, unknown>): number[] {
  const row: number[] = [];
  for (const spec of model.numeric) {
    let x = Number(features[spec.source]);
    if (!Number.isFinite(x)) throw new Error(`RISK_FEATURE_INVALID:${spec.source}`);
    if (spec.transform === 'log10') x = Math.log10(Math.max(x, 1));
    if (spec.clip) x = Math.min(spec.clip[1], Math.max(spec.clip[0], x));
    row.push(x);
  }
  for (const spec of model.categorical) for (const value of spec.categories) row.push(features[spec.name] === value ? 1 : 0);
  return row;
}

const isLeaf = (index: number) => index < 0;
const cover = (tree: Tree, index: number) => isLeaf(index) ? tree.leaves[~index][1] : tree.nodes[index][4];

function rawScore(model: ExportedRiskModel, row: number[]) {
  let total = 0;
  for (const tree of model.trees) {
    let index = tree.root;
    while (!isLeaf(index)) { const node = tree.nodes[index]; index = row[node[0]] <= node[1] ? node[2] : node[3]; }
    total += tree.leaves[~index][0];
  }
  return total;
}

// ---- TreeSHAP (port of the reference algorithm used by shap / LightGBM pred_contrib) ----
type PathElement = { feature: number; zero: number; one: number; weight: number };

function extendPath(path: PathElement[], depth: number, zero: number, one: number, feature: number) {
  path[depth] = { feature, zero, one, weight: depth === 0 ? 1 : 0 };
  for (let i = depth - 1; i >= 0; i--) {
    path[i + 1].weight += one * path[i].weight * (i + 1) / (depth + 1);
    path[i].weight = zero * path[i].weight * (depth - i) / (depth + 1);
  }
}

function unwindPath(path: PathElement[], depth: number, index: number) {
  const { one, zero } = path[index];
  let next = path[depth].weight;
  for (let i = depth - 1; i >= 0; i--) {
    if (one !== 0) {
      const tmp = path[i].weight;
      path[i].weight = next * (depth + 1) / ((i + 1) * one);
      next = tmp - path[i].weight * zero * (depth - i) / (depth + 1);
    } else path[i].weight = path[i].weight * (depth + 1) / (zero * (depth - i));
  }
  for (let i = index; i < depth; i++) path[i] = { ...path[i + 1], weight: path[i].weight };
}

function unwoundPathSum(path: PathElement[], depth: number, index: number) {
  const { one, zero } = path[index];
  let next = path[depth].weight, total = 0;
  for (let i = depth - 1; i >= 0; i--) {
    if (one !== 0) {
      const tmp = next * (depth + 1) / ((i + 1) * one);
      total += tmp;
      next = path[i].weight - tmp * zero * ((depth - i) / (depth + 1));
    } else if (zero !== 0) total += path[i].weight / zero / ((depth - i) / (depth + 1));
  }
  return total;
}

function treeShap(tree: Tree, row: number[], phi: number[]) {
  const recurse = (index: number, parent: PathElement[], depth: number, zero: number, one: number, feature: number) => {
    const path = parent.slice(0, depth + 1).map((p) => ({ ...p }));
    extendPath(path, depth, zero, one, feature);
    if (isLeaf(index)) {
      const value = tree.leaves[~index][0];
      for (let i = 1; i <= depth; i++) phi[path[i].feature] += unwoundPathSum(path, depth, i) * (path[i].one - path[i].zero) * value;
      return;
    }
    const [split, threshold, left, right] = tree.nodes[index];
    const [hot, cold] = row[split] <= threshold ? [left, right] : [right, left];
    let incomingZero = 1, incomingOne = 1;
    const seen = path.findIndex((p, i) => i <= depth && p.feature === split);
    if (seen >= 0) {
      incomingZero = path[seen].zero; incomingOne = path[seen].one;
      unwindPath(path, depth, seen);
      depth -= 1;
    }
    const total = cover(tree, index);
    recurse(hot, path, depth + 1, incomingZero * cover(tree, hot) / total, incomingOne, split);
    recurse(cold, path, depth + 1, incomingZero * cover(tree, cold) / total, 0, split);
  };
  recurse(tree.root, [], 0, 1, 1, -1);
}

/** Expected raw score over the training distribution (cover-weighted leaf mean), the SHAP base value. */
function expectedValue(model: ExportedRiskModel) {
  return model.trees.reduce((sum, tree) => {
    const root = cover(tree, tree.root);
    return sum + tree.leaves.reduce((s, [value, n]) => s + value * n / root, 0);
  }, 0);
}

/** SHAP values per model column (log-odds) plus the base value as the last element, like LightGBM pred_contrib. */
export function shapValues(model: ExportedRiskModel, row: number[]): number[] {
  const phi = new Array<number>(model.columns.length).fill(0);
  for (const tree of model.trees) treeShap(tree, row, phi);
  return [...phi, expectedValue(model)];
}

// ---- Plain-language factors ----
const percent = (x: number) => `${Math.round(x * 100)}%`;
const industryLabel = (code: string) => industries[code as Industry]?.label ?? code;
const legalFormLabels: Record<string, string> = { OOO: 'ООО', AO: 'АО', IP: 'ИП', OTHER: 'другая форма' };
const regionLabels: Record<string, string> = { capital: 'столичный регион', large: 'крупный регион', other: 'прочие регионы' };

/** Russian explanation of one factor. `up` = the factor raises the estimated risk. */
export function factorText(feature: string, up: boolean, f: RiskFeatures): string {
  switch (feature) {
    case 'paymentToProfit': {
      if (f.annualProfit <= 0) return 'Бизнес не показывает прибыль, из которой можно платить по кредиту';
      const heavy = f.paymentToProfit >= 0.5;
      return `Платёж около ${percent(f.paymentToProfit)} среднемесячной прибыли${heavy === up ? heavy ? ' — высокая нагрузка' : ' — нагрузка посильная' : ''}`;
    }
    case 'profitMargin': {
      const low = f.profitMargin < 0.08;
      return low === up ? `${low ? 'Невысокая' : 'Хорошая'} рентабельность — ${percent(f.profitMargin)}` : `Рентабельность ${percent(f.profitMargin)}`;
    }
    case 'debtToRevenue': return f.currentDebt <= 0 ? 'Действующих долгов нет'
      : `Долги составляют ${percent(f.debtToRevenue)} годовой выручки${(f.debtToRevenue >= 0.4) === up ? up ? ' — высокая нагрузка' : ' — нагрузка умеренная' : ''}`;
    case 'latePayments12m': return f.latePayments12m > 0 ? `Просрочки за последние 12 месяцев: ${f.latePayments12m}` : 'Нет просрочек за последние 12 месяцев';
    case 'maxOverdueDays': return f.maxOverdueDays > 0 ? `Самая длинная просрочка — ${f.maxOverdueDays} дн.` : 'Длительных просрочек не было';
    case 'overdueToRevenue': return f.overdueAmount > 0 ? 'Есть непогашенная просроченная задолженность' : 'Просроченной задолженности нет';
    case 'businessAgeMonths': return up ? `Небольшой срок работы бизнеса — ${formatAge(f.businessAgeMonths)}` : `Бизнес работает ${formatAge(f.businessAgeMonths)}`;
    case 'amountToRevenue': return `Запрошенная сумма — ${percent(f.amountToRevenue)} годовой выручки${up ? ', это заметная нагрузка' : ''}`;
    case 'keyRate': return up ? `Ключевая ставка ${f.keyRate}% удорожает обслуживание долга` : `Ключевая ставка ${f.keyRate}% снижает стоимость долга`;
    case 'industry': return `Отрасль «${industryLabel(f.industry)}»: риск ${up ? 'выше' : 'ниже'} среднего по демо-данным`;
    case 'purpose': return `Цель «${purposeLabels[f.purpose as CreditPurpose] ?? f.purpose}» ${up ? 'повышает' : 'снижает'} расчётный риск`;
    case 'region': return `${regionLabels[f.region]}: ${up ? 'повышает' : 'снижает'} расчётный риск`;
    case 'legalForm': return `Форма ${legalFormLabels[f.legalForm]} ${up ? 'повышает' : 'снижает'} расчётный риск`;
    case 'activeLoans': return `Действующих кредитов: ${f.activeLoans}`;
    case 'employees': return `Сотрудников: ${f.employees}`;
    case 'requestedTermMonths': return `Срок кредита ${f.requestedTermMonths} мес. ${up ? 'повышает' : 'снижает'} расчётный риск`;
    case 'logRevenue': return up ? 'Небольшой масштаб выручки' : 'Масштаб выручки снижает риск';
    default: return `${feature}: ${up ? 'повышает' : 'снижает'} риск`;
  }
}

export class LightGbmRiskModel implements RiskModel {
  readonly version: string;
  private readonly labels: Record<string, string>;
  constructor(private readonly model: ExportedRiskModel = exported as unknown as ExportedRiskModel) {
    this.version = model.version;
    this.labels = Object.fromEntries([...model.numeric, ...model.categorical].map((s) => [s.name, s.label]));
  }

  probability(features: RiskFeatures) {
    return 1 / (1 + Math.exp(-rawScore(this.model, encodeFeatures(this.model, features))));
  }

  riskLevel(probability: number): RiskLevel {
    return probability >= this.model.riskLevels.highFrom ? 'HIGH' : probability >= this.model.riskLevels.mediumFrom ? 'MEDIUM' : 'LOW';
  }

  assess(features: RiskFeatures): RiskModelOutput {
    const row = encodeFeatures(this.model, features);
    const probability = 1 / (1 + Math.exp(-rawScore(this.model, row)));
    const shap = shapValues(this.model, row);
    // One-hot columns are summed back into their business feature («industry=retail» → «industry»).
    const grouped = new Map<string, number>();
    this.model.columns.forEach((column, i) => { const key = column.split('=')[0]; grouped.set(key, (grouped.get(key) ?? 0) + shap[i]); });
    const topFactors: RiskFactor[] = [...grouped].filter(([, value]) => Math.abs(value) >= 0.02)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4)
      .map(([feature, value]) => ({ feature, label: this.labels[feature] ?? feature, impact: value > 0 ? 'negative' : 'positive',
        text: factorText(feature, value > 0, features) }));
    return { modelVersion: this.version, probability: Math.round(probability * 10_000) / 10_000, riskLevel: this.riskLevel(probability), topFactors };
  }
}
