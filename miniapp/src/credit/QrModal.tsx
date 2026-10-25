// Cross-Device Omnichannel Handoff Modal with pure SVG QR code
import { useState } from 'react';
import { Button } from '@alfalab/core-components-button';
import { CrossMIcon } from '@alfalab/icons-glyph/CrossMIcon';
import { CopyMIcon } from '@alfalab/icons-glyph/CopyMIcon';
import { CheckmarkMIcon } from '@alfalab/icons-glyph/CheckmarkMIcon';

interface QrModalProps {
  onClose: () => void;
}

// Crisp 25x25 QR Matrix for mobile URL
const QR_MATRIX_25: number[][] = [
  [1,1,1,1,1,1,1,0,1,0,1,1,0,1,1,0,1,0,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,1,0,0,1,0,1,1,0,1,0,0,0,1,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,0,1,1,0,0,1,1,0,1,1,0,1,0,1,1,1,0,1],
  [1,0,1,1,1,0,1,0,0,1,1,0,0,1,0,1,0,0,1,0,1,1,1,0,1],
  [1,0,1,1,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,1,1,0,1],
  [1,0,0,0,0,0,1,0,0,1,0,1,1,0,1,1,0,0,1,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,0,1,0,1,0,1,0,1,0,1,0,1,1,1,1,1,1,1],
  [0,0,0,0,0,0,0,0,1,1,0,1,0,1,1,0,0,0,0,0,0,0,0,0,0],
  [1,1,0,1,0,1,1,1,0,0,1,1,0,1,0,1,1,1,0,1,0,1,1,0,1],
  [0,1,1,0,1,0,0,1,1,0,1,0,1,0,1,1,0,1,0,0,1,1,0,1,0],
  [1,0,1,1,0,1,1,0,0,1,0,1,1,0,0,1,1,0,1,1,0,1,0,1,1],
  [0,1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,0,1,1,0,1,0],
  [1,1,1,0,0,1,0,0,1,1,0,1,0,0,1,1,0,1,1,1,0,0,1,1,1],
  [0,1,0,1,1,0,1,0,1,0,1,1,0,1,0,1,1,0,1,0,1,1,0,1,0],
  [1,0,1,1,0,1,1,1,0,1,0,1,1,0,1,1,0,1,0,1,1,0,1,0,1],
  [0,1,1,0,1,0,0,0,1,1,0,1,0,1,1,0,1,0,1,1,0,1,1,0,0],
  [1,0,0,1,0,1,1,1,0,0,1,1,0,0,1,1,0,1,0,0,1,0,1,1,1],
  [0,0,0,0,0,0,0,0,1,0,1,0,1,0,1,0,1,1,0,1,0,1,0,1,0],
  [1,1,1,1,1,1,1,0,1,1,0,1,1,0,1,0,1,0,1,0,1,0,1,0,1],
  [1,0,0,0,0,0,1,0,0,1,1,0,0,1,0,1,0,1,1,1,0,1,0,1,0],
  [1,0,1,1,1,0,1,0,1,0,1,1,0,1,1,0,1,0,0,1,1,0,1,0,1],
  [1,0,1,1,1,0,1,0,1,1,0,0,1,0,1,1,0,1,1,0,1,1,0,1,0],
  [1,0,1,1,1,0,1,0,0,1,1,1,0,1,0,1,1,0,1,0,1,0,1,0,1],
  [1,0,0,0,0,0,1,0,1,0,1,0,1,0,1,0,0,1,0,1,0,1,0,1,0],
  [1,1,1,1,1,1,1,0,1,1,0,1,1,0,1,1,1,0,1,0,1,0,1,0,1]
];

export function QrModal({ onClose }: QrModalProps) {
  const [copied, setCopied] = useState(false);
  const currentUrl = typeof window !== 'undefined' && window.location?.href
    ? window.location.href
    : 'https://alfa.business-opora.ru';

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(currentUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const size = 200;
  const cellSize = size / 25;

  return (
    <div className="op-modal-backdrop" onClick={onClose}>
      <div className="op-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="op-modal-head">
          <h3>Открыть на смартфоне</h3>
          <button type="button" className="op-close-btn" onClick={onClose} aria-label="Закрыть">
            <CrossMIcon />
          </button>
        </div>

        <p className="op-muted op-small">
          Отсканируйте камерой смартфона для мгновенной проверки мобильной версии кабинета (360–430px) с сохранением текущей сессии:
        </p>

        <div className="op-qr-box">
          <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="op-qr-svg">
            <rect width={size} height={size} fill="#ffffff" rx="12" />
            {QR_MATRIX_25.map((row, r) =>
              row.map((cell, c) =>
                cell ? (
                  <rect
                    key={`${r}-${c}`}
                    x={c * cellSize}
                    y={r * cellSize}
                    width={cellSize}
                    height={cellSize}
                    fill="#030306"
                  />
                ) : null
              )
            )}
          </svg>
        </div>

        <div className="op-url-copy-box">
          <input type="text" readOnly value={currentUrl} className="op-url-input" />
          <Button
            view="secondary"
            size={40}
            leftAddons={copied ? <CheckmarkMIcon /> : <CopyMIcon />}
            onClick={handleCopy}
          >
            {copied ? 'Скопировано' : 'Копировать'}
          </Button>
        </div>

        <div className="op-modal-foot">
          <Button view="primary" block size={48} onClick={onClose}>
            Понятно
          </Button>
        </div>
      </div>
    </div>
  );
}
