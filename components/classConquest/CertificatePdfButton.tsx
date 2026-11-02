import React, { useEffect, useRef, useState } from 'react';
import type { ConquestResult } from '../../src/lib/classConquest';
import { buildCertificateDocument, openCertificatePrintWindow, type CertificateTheme, type PrintSides } from '../../src/lib/conquestCertificates';
import { deliverCertificatePdf, prepareCertificatePdf, type PreparedCertificates } from '../../services/conquestCertificatePdfService';

interface CertificatePdfButtonProps {
  result: ConquestResult;
  issuer?: string;
  schoolLogoUrl?: string | null;
  theme: CertificateTheme;
  printSides: PrintSides;
  /** One certificate (0–4 students, then the class certificate); omit for the whole pack. */
  only?: number | null;
  label: string;
  compact?: boolean;
}

const touch = () => typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || /iPhone|iPad|Android/i.test(navigator.userAgent));

/**
 * Two taps on purpose: the first prepares the PDF (fonts, logos, flag), the second hands it
 * to the device. Phones only open the share sheet straight from a tap, and preparing takes
 * a moment.
 */
const CertificatePdfButton: React.FC<CertificatePdfButtonProps> = ({ result, issuer, schoolLogoUrl, theme, printSides, only = null, label, compact = false }) => {
  const [state, setState] = useState<'idle' | 'preparing' | 'ready' | 'error'>('idle');
  const [prepared, setPrepared] = useState<PreparedCertificates | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const current = useRef<PreparedCertificates | null>(null);

  // A different week, theme or printer means a different PDF.
  useEffect(() => {
    setState('idle'); setNote(null);
    if (current.current) { URL.revokeObjectURL(current.current.url); current.current = null; }
    setPrepared(null);
  }, [result.week_start, result.grade, theme, printSides, only, issuer, schoolLogoUrl]);
  useEffect(() => () => { if (current.current) URL.revokeObjectURL(current.current.url); }, []);

  const prepare = async () => {
    setState('preparing'); setNote(null);
    try {
      const pdf = await prepareCertificatePdf({ result, issuer, schoolLogoUrl, theme, printSides, only });
      current.current = pdf; setPrepared(pdf); setState('ready');
    } catch {
      setState('error');
    }
  };

  const deliver = async () => {
    if (!prepared) return;
    const how = await deliverCertificatePdf(prepared);
    if (how === 'download') setNote('Your browser blocked the new tab. Use Download instead.');
    else setNote(null);
  };

  const printablePage = () => {
    const html = buildCertificateDocument({ result, issuer, schoolLogoUrl, brandLogoUrl: `${window.location.origin}/logo.png`, theme, printSides, returnUrl: window.location.href });
    if (!openCertificatePrintWindow(html)) setNote('Allow pop-ups for Brains Heist and try again.');
  };

  if (state === 'ready' && prepared) {
    return (
      <div className={compact ? 'ccq-pdf is-compact' : 'ccq-pdf'}>
        {!compact ? (
          <p className="ccq-pdf-summary" role="status">
            PDF ready · {prepared.certificates} certificate{prepared.certificates === 1 ? '' : 's'} · {prepared.pages} page{prepared.pages === 1 ? '' : 's'} · {prepared.sheets} sheet{prepared.sheets === 1 ? '' : 's'}{prepared.blankBacks ? ` (${prepared.blankBacks} blank backs)` : ''}
          </p>
        ) : null}
        <div className="ccq-pdf-actions">
          <button type="button" className={compact ? 'ccq-pdf-small' : 'ccq-present'} onClick={() => void deliver()}>
            {touch() ? '🖨 Print / share PDF' : '🖨 Open PDF to print'}
          </button>
          <a className="ccq-pdf-link" href={prepared.url} download={prepared.file.name}>Download</a>
        </div>
        {note ? <p className="ccq-modal-warn" role="alert">{note}</p> : null}
      </div>
    );
  }

  return (
    <div className={compact ? 'ccq-pdf is-compact' : 'ccq-pdf'}>
      <button type="button" className={compact ? 'ccq-pdf-small' : 'ccq-present'} disabled={state === 'preparing'} onClick={() => void prepare()}>
        {state === 'preparing' ? 'Preparing PDF…' : label}
      </button>
      {state === 'error' ? (
        <p className="ccq-modal-warn" role="alert">
          The PDF could not be prepared (check the connection). <button type="button" className="ccq-pdf-inline" onClick={printablePage}>Open the printable page instead</button>
        </p>
      ) : null}
      {note ? <p className="ccq-modal-warn" role="alert">{note}</p> : null}
    </div>
  );
};

export default CertificatePdfButton;
