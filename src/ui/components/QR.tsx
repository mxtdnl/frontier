import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** Client-side QR code. Dark modules on a light field so scanners read it. */
export function QR({ text, label }: { text: string; label: string }) {
  const { count, path } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      }
    }
    return { count: n, path: d };
  }, [text]);
  return (
    <div className="qr" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${count} ${count}`} focusable="false">
        <path d={path} />
      </svg>
    </div>
  );
}
