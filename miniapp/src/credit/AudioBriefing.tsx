// Audio Executive Briefing for Credit Committee with animated waveform
import { useState, useEffect, useRef } from 'react';
import { formatRub, months } from './format';
import type { BankView } from './api';

export function generateBriefingText(view: BankView): string {
  const { application: app, company, product, decision, scoring, riskAssessment: risk } = view;
  const requestedStr = app.requestedAmount ? `${formatRub(app.requestedAmount)} на ${months(app.requestedTermMonths ?? 0)}` : 'не указана';
  const scoreStr = scoring ? `${scoring.score} баллов из ста` : 'скоринг в процессе';
  const riskStr = risk ? `вероятность дефолта по риск-модели ${Math.round(risk.probability * 1000) / 10} процента` : 'риск-модель не применялась';
  const prodName = product ? `по продукту «${product.name}»` : '';

  let verdictClause = '';
  if (decision) {
    if (decision.outcome === 'APPROVED' && decision.offer) {
      verdictClause = `Рекомендация конвейера: полное одобрение ${prodName} на запрашиваемых условиях. Сумма ${formatRub(decision.offer.amount)}, ставка ${decision.offer.rate.toFixed(1).replace('.', ',')} процента годовых. Кредитная нагрузка посильная, стоп-факторы отсутствуют.`;
    } else if (decision.outcome === 'COUNTER_OFFER' && decision.offer) {
      verdictClause = `Рекомендация конвейера: встречное предложение ${prodName} на ${formatRub(decision.offer.amount)} на ${months(decision.offer.termMonths)} по ставке ${decision.offer.rate.toFixed(1).replace('.', ',')} процента. Запрошенный платёж превышал безопасный лимит прибыли, встречные условия приводят долговую нагрузку в норму.`;
    } else if (decision.outcome === 'NEEDS_INFO') {
      verdictClause = `Рекомендация конвейера: запрос недостающих документов. Внешние реестры не содержат полной отчётности заёмщика. Требуется подтверждение выручки документами.`;
    } else if (decision.outcome === 'REJECTED') {
      const topReason = decision.reasons.find((r) => r.kind === 'negative')?.text || 'критический фактор риска';
      verdictClause = `Рекомендация конвейера: отказ в финансировании. Причина: ${topReason}. Принятие кредитного риска в текущем цикле не рекомендуется.`;
    }
  } else {
    verdictClause = `Заявка находится в процессе обработки внешними сервисами и скоринговым конвейером.`;
  }

  return `Уважаемые члены кредитного комитета. Докладываю по заявке номер ${app.number}, компания ${company.name}. Запрошено ${requestedStr}. Оценка скоринга — ${scoreStr}, ${riskStr}. ${verdictClause} Доклад окончен.`;
}

interface AudioBriefingProps {
  view: BankView;
}

export function AudioBriefing({ view }: AudioBriefingProps) {
  const [playing, setPlaying] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [rate, setRate] = useState<number>(1.0);
  const transcript = generateBriefingText(view);
  const timerRef = useRef<number | null>(null);

  const totalDuration = 38; // approx 38s at 1.0x

  const stopAudio = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPlaying(false);
    setSeconds(0);
  };

  const togglePlay = () => {
    if (playing) {
      stopAudio();
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(transcript);
      utter.lang = 'ru-RU';
      utter.rate = rate;
      utter.onend = () => {
        stopAudio();
      };
      utter.onerror = () => {
        stopAudio();
      };
      window.speechSynthesis.speak(utter);
    }

    setPlaying(true);
    setSeconds(0);

    const interval = window.setInterval(() => {
      setSeconds((prev) => {
        if (prev >= totalDuration) {
          stopAudio();
          return 0;
        }
        return prev + 1;
      });
    }, 1000 / rate);
    timerRef.current = interval;
  };

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="op-audio-brief-card" aria-label="Аудио-брифинг кредитного комитета">
      <div className="op-audio-head">
        <div className="op-audio-meta">
          <span className="op-audio-badge">
            <span className="op-mic-dot">●</span> Голосовой AI-меморандум
          </span>
          <h4 className="op-audio-title">Аудио-доклад для кредитного комитета (40 сек)</h4>
        </div>
        <div className="op-audio-speed-picker">
          {[1.0, 1.25, 1.5].map((s) => (
            <button
              key={s}
              type="button"
              className={`op-speed-pill ${rate === s ? 'active' : ''}`}
              onClick={() => {
                setRate(s);
                if (playing) {
                  stopAudio();
                }
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="op-audio-player-bar">
        <button
          type="button"
          className={`op-audio-play-btn ${playing ? 'playing' : ''}`}
          onClick={togglePlay}
          aria-label={playing ? 'Пауза' : 'Слушать аудио-доклад'}
        >
          {playing ? '⏸' : '▶'}
        </button>

        {/* 24-Bar Animated Equalizer Waveform */}
        <div className={`op-audio-waveform ${playing ? 'animated' : ''}`}>
          {[6, 12, 18, 24, 15, 20, 26, 14, 8, 22, 28, 16, 10, 24, 18, 12, 20, 26, 14, 8, 16, 22, 10, 5].map((h, i) => (
            <span
              key={i}
              className="op-wave-bar"
              style={{
                height: playing ? undefined : `${h}px`,
                animationDelay: `${(i * 0.05).toFixed(2)}s`,
              }}
            />
          ))}
        </div>

        <div className="op-audio-timer op-mono">
          {formatTimer(seconds)} / {formatTimer(totalDuration)}
        </div>
      </div>

      <div className="op-audio-transcript">
        <strong>Стенограмма меморандума: </strong>
        <span>«{transcript}»</span>
      </div>
    </div>
  );
}
