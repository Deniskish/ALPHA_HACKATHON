// Cross-Device Omnichannel Handoff Modal with standard ISO/IEC 18004 SVG QR code
import { useMemo, useState } from 'react';
import { Button } from '@alfalab/core-components-button';
import { CrossMIcon } from '@alfalab/icons-glyph/CrossMIcon';
import { CopyMIcon } from '@alfalab/icons-glyph/CopyMIcon';
import { CheckmarkMIcon } from '@alfalab/icons-glyph/CheckmarkMIcon';
import { qrcodegen } from './qrcodegen';
import { buildHandoffUrl, useSession } from './session';

interface QrModalProps {
  onClose: () => void;
  url?: string;
}

export function QrModal({ onClose, url }: QrModalProps) {
  const [copied, setCopied] = useState(false);
  const session = useSession();

  // Target URL with embedded handoff session payload
  const transferUrl = useMemo(() => {
    return url || buildHandoffUrl(session);
  }, [url, session]);

  // Generate dynamic, standards-compliant QR Code Matrix
  const { qr, totalModules, border } = useMemo(() => {
    let code: qrcodegen.QrCode;
    try {
      code = qrcodegen.QrCode.encodeText(transferUrl, qrcodegen.QrCode.Ecc.MEDIUM);
    } catch {
      code = qrcodegen.QrCode.encodeText(transferUrl, qrcodegen.QrCode.Ecc.LOW);
    }
    const border = 4; // ISO quiet zone
    return { qr: code, totalModules: code.size + border * 2, border };
  }, [transferUrl]);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(transferUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const viewBoxSize = 250;
  const cellSize = viewBoxSize / totalModules;

  // Build SVG dark module rects
  const darkCells: Array<{ key: string; x: number; y: number }> = [];
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.getModule(c, r)) {
        darkCells.push({
          key: `${r}-${c}`,
          x: (c + border) * cellSize,
          y: (r + border) * cellSize,
        });
      }
    }
  }

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
          Отсканируйте камерой смартфона: текущая сессия и выбранная компания синхронизируются автоматически:
        </p>

        {session && (
          <div className="op-handoff-session-badge">
            <span className="op-check-dot">●</span>
            <span>
              Синхронизация сессии: <strong>{session.company.name}</strong>
            </span>
          </div>
        )}

        <div className="op-qr-box">
          <svg
            viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
            width={200}
            height={200}
            className="op-qr-svg"
            role="img"
            aria-label="QR-код для перехода на мобильную версию с синхронизацией сессии"
          >
            {/* White quiet-zone canvas */}
            <rect width={viewBoxSize} height={viewBoxSize} fill="#ffffff" rx="12" />
            {/* Render verified dark modules */}
            {darkCells.map((cell) => (
              <rect
                key={cell.key}
                x={cell.x}
                y={cell.y}
                width={cellSize + 0.1}
                height={cellSize + 0.1}
                fill="#030306"
              />
            ))}
          </svg>
        </div>

        <div className="op-url-copy-box">
          <input type="text" readOnly value={transferUrl} className="op-url-input" />
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
