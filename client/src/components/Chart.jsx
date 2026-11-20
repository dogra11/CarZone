/**
 * components/Chart.jsx - Lightweight SVG charts (no chart library).
 *   <BarChart data={[{ label, value, value2 }]} format={(v) => '₹' + v} />   grouped bars
 *   <DonutChart segments={[{ label, value, color }]} center="22" />
 * Values are scaled to a "nice" maximum so the y-axis has round numbers.
 */
export function BarChart({ data, format = (v) => v, seriesLabels = ['', ''] }) {
  const W = 640; const H = 260; const pad = { t: 20, r: 10, b: 34, l: 58 };
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.value2 || 0)));
  const step = 10 ** Math.floor(Math.log10(max));
  const top = Math.ceil(max / step) * step;
  const innerW = W - pad.l - pad.r; const innerH = H - pad.t - pad.b;
  const slot = innerW / data.length;
  const hasSecond = data.some((d) => d.value2);
  const barW = Math.min(26, slot * (hasSecond ? 0.34 : 0.55));
  const y = (v) => pad.t + innerH - (v / top) * innerH;
  const labelEvery = Math.ceil(data.length / 7);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Bar chart">
      <defs><linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5aa6ff" /><stop offset="1" stopColor="#1663d6" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={y((top * i) / 4)} y2={y((top * i) / 4)} />
          <text className="axis-label" x={pad.l - 8} y={y((top * i) / 4) + 4} textAnchor="end">{format((top * i) / 4)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = pad.l + slot * i + slot / 2;
        const x1 = hasSecond ? x - barW - 1 : x - barW / 2;
        return (
          <g key={d.label + i}>
            <title>{`${d.label}: ${format(d.value)}${hasSecond ? ` / ${seriesLabels[1]} ${format(d.value2 || 0)}` : ''}`}</title>
            <rect className="bar" x={x1} y={y(d.value)} width={barW} height={Math.max(innerH - (y(d.value) - pad.t), d.value ? 2 : 0)} rx="4" />
            {hasSecond && <rect className="bar-refund" x={x + 1} y={y(d.value2 || 0)} width={barW} height={Math.max(innerH - (y(d.value2 || 0) - pad.t), d.value2 ? 2 : 0)} rx="4" />}
            {(i % labelEvery === 0 || i === data.length - 1) && <text className="axis-label" x={x} y={H - 10} textAnchor="middle">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function DonutChart({ segments, center }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const R = 70; const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg className="donut" viewBox="0 0 180 180" role="img" aria-label="Donut chart">
        <circle cx="90" cy="90" r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="20" />
        {segments.map((s) => {
          const len = (s.value / total) * C;
          const el = (
            <circle key={s.label} cx="90" cy="90" r={R} fill="none" stroke={s.color} strokeWidth="20"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 90 90)"><title>{`${s.label}: ${s.value}`}</title></circle>
          );
          offset += len;
          return el;
        })}
        <text x="90" y="88" textAnchor="middle" fontSize={String(center).length > 5 ? 20 : 30} fontWeight="700">{center}</text>
        <text x="90" y="110" textAnchor="middle" fontSize="11" style={{ fill: '#8a93a3' }}>TOTAL</text>
      </svg>
      <div className="legend">
        {segments.map((s) => <div key={s.label}><i style={{ background: s.color }} />{s.label}<b>{s.display ?? s.value}</b></div>)}
      </div>
    </div>
  );
}

/** Horizontal progress bars, e.g. top services. */
export function BarList({ rows, gold = false }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bar-list">
      {rows.map((r) => (
        <div className="row" key={r.label}>
          <div className="row-head"><span>{r.label}</span><span className="text-muted">{r.note}</span></div>
          <div className="track"><div className="fill" style={{ width: `${(r.value / max) * 100}%`, ...(gold ? { background: 'linear-gradient(90deg,#8e7135,#e3c886)' } : {}) }} /></div>
        </div>
      ))}
    </div>
  );
}
