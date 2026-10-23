// Explanation block: optional local LLM rephrasing of structured results, or the deterministic template.
import { useEffect, useState } from 'react';
import { BubbleMIcon } from '@alfalab/icons-glyph/BubbleMIcon';
import { creditApi, type ExplanationView } from './api';

export function Explanation({ applicationId, attempt, kind }: { applicationId: string; attempt: number; kind: 'decision' | 'improvements' }) {
  const [data, setData] = useState<ExplanationView | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    // A failed explanation never blocks the flow: the block simply stays hidden.
    creditApi.explanation(applicationId, kind, controller.signal).then(setData).catch(() => {});
    return () => controller.abort();
  }, [applicationId, attempt, kind]);
  if (!data) return null;
  return <aside className="op-explanation" data-source={data.source} aria-label="Объяснение">
    <BubbleMIcon className="op-explanation-icon" aria-hidden="true" />
    <span className="op-explanation-label">{data.source === 'llm' ? `AI-объяснение · модель ${data.model}` : 'Объяснение'}</span>
    <p>{data.text}</p>
    {data.source === 'llm' && <small className="op-muted">Сформулировано языковой моделью по готовому результату. Решение принимает кредитная логика, а не AI.</small>}
  </aside>;
}
