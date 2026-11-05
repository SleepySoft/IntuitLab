import React, { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function logSpace(min, max, count) {
  const out = [];
  const a = Math.log10(min);
  const b = Math.log10(max);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    out.push(10 ** (a + (b - a) * t));
  }
  return out;
}

function round(v, d = 4) {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

function fmt(v, d = 4) {
  if (!Number.isFinite(v)) return "0";
  return Number(v).toFixed(d);
}

function signed(v, d = 4) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "+ 0.0000";
  return `${n >= 0 ? "+" : "-"} ${Math.abs(n).toFixed(d)}`;
}

function rbjCoeffs({ type, fs, f0, Q, gainDb }) {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / fs;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / (2 * Math.max(0.001, Q));
  const S = 1;
  const shelfAlpha = (sinw0 / 2) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);

  let b0, b1, b2, a0, a1, a2;

  switch (type) {
    case "lowpass":
      b0 = (1 - cosw0) / 2;
      b1 = 1 - cosw0;
      b2 = (1 - cosw0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosw0;
      a2 = 1 - alpha;
      break;
    case "highpass":
      b0 = (1 + cosw0) / 2;
      b1 = -(1 + cosw0);
      b2 = (1 + cosw0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosw0;
      a2 = 1 - alpha;
      break;
    case "bandpass":
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cosw0;
      a2 = 1 - alpha;
      break;
    case "notch":
      b0 = 1;
      b1 = -2 * cosw0;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cosw0;
      a2 = 1 - alpha;
      break;
    case "peak":
      b0 = 1 + alpha * A;
      b1 = -2 * cosw0;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cosw0;
      a2 = 1 - alpha / A;
      break;
    case "lowshelf":
      b0 = A * ((A + 1) - (A - 1) * cosw0 + 2 * Math.sqrt(A) * shelfAlpha);
      b1 = 2 * A * ((A - 1) - (A + 1) * cosw0);
      b2 = A * ((A + 1) - (A - 1) * cosw0 - 2 * Math.sqrt(A) * shelfAlpha);
      a0 = (A + 1) + (A - 1) * cosw0 + 2 * Math.sqrt(A) * shelfAlpha;
      a1 = -2 * ((A - 1) + (A + 1) * cosw0);
      a2 = (A + 1) + (A - 1) * cosw0 - 2 * Math.sqrt(A) * shelfAlpha;
      break;
    case "highshelf":
      b0 = A * ((A + 1) + (A - 1) * cosw0 + 2 * Math.sqrt(A) * shelfAlpha);
      b1 = -2 * A * ((A - 1) + (A + 1) * cosw0);
      b2 = A * ((A + 1) + (A - 1) * cosw0 - 2 * Math.sqrt(A) * shelfAlpha);
      a0 = (A + 1) - (A - 1) * cosw0 + 2 * Math.sqrt(A) * shelfAlpha;
      a1 = 2 * ((A - 1) - (A + 1) * cosw0);
      a2 = (A + 1) - (A - 1) * cosw0 - 2 * Math.sqrt(A) * shelfAlpha;
      break;
    default:
      b0 = 1;
      b1 = 0;
      b2 = 0;
      a0 = 1;
      a1 = 0;
      a2 = 0;
  }

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

function firFilterWithTrace(input, coeffs) {
  const { b0, b1, b2 } = coeffs;
  let x1 = 0;
  let x2 = 0;
  const output = [];
  const trace = [];

  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const t0 = b0 * x0;
    const t1 = b1 * x1;
    const t2 = b2 * x2;
    const s1 = t0 + t1;
    const y = s1 + t2;
    const ySafe = Number.isFinite(y) ? y : 0;

    output.push(ySafe);
    trace.push({
      n: i,
      x0,
      x1,
      x2,
      y: ySafe,
      terms: [t0, t1, t2],
      expr: `y[${i}] = (${fmt(b0)} × ${fmt(x0)}) + (${fmt(b1)} × ${fmt(x1)}) + (${fmt(b2)} × ${fmt(x2)}) = ${fmt(
        t0,
        5
      )} + ${fmt(t1, 5)} + ${fmt(t2, 5)} = ${fmt(ySafe, 5)}`,
      steps: [
        `① t0 = b0 × x[${i}] = ${fmt(b0)} × ${fmt(x0)} = ${fmt(t0, 5)}`,
        `② t1 = b1 × x[${i - 1}] = ${fmt(b1)} × ${fmt(x1)} = ${fmt(t1, 5)}`,
        `③ s1 = t0 + t1 = ${fmt(t0, 5)} + ${fmt(t1, 5)} = ${fmt(s1, 5)}`,
        `④ t2 = b2 × x[${i - 2}] = ${fmt(b2)} × ${fmt(x2)} = ${fmt(t2, 5)}`,
        `⑤ y[${i}] = s1 + t2 = ${fmt(s1, 5)} + ${fmt(t2, 5)} = ${fmt(ySafe, 5)}`,
      ],
    });

    x2 = x1;
    x1 = x0;
  }

  return { output, trace };
}

function iirFilterWithTrace(input, coeffs) {
  const { b0, b1, b2, a1, a2 } = coeffs;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const output = [];
  const trace = [];

  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const t0 = b0 * x0;
    const t1 = b1 * x1;
    const t2 = b2 * x2;
    const f1 = -a1 * y1;
    const f2 = -a2 * y2;

    const s1 = t0 + t1;
    const s2 = s1 + t2;
    const s3 = s2 + f1;

    let y = s3 + f2;
    if (!Number.isFinite(y)) y = 0;
    y = clamp(y, -1e6, 1e6);

    output.push(y);
    trace.push({
      n: i,
      x0,
      x1,
      x2,
      y1,
      y2,
      y,
      terms: [t0, t1, t2, f1, f2],
      expr: `y[${i}] = (${fmt(b0)} × ${fmt(x0)}) + (${fmt(b1)} × ${fmt(x1)}) + (${fmt(b2)} × ${fmt(x2)}) - (${fmt(a1)} × ${fmt(y1)}) - (${fmt(a2)} × ${fmt(y2)}) = ${fmt(
        t0,
        5
      )} + ${fmt(t1, 5)} + ${fmt(t2, 5)} + ${fmt(f1, 5)} + ${fmt(f2, 5)} = ${fmt(y, 5)}`,
      steps: [
        `① t0 = b0 × x[${i}] = ${fmt(b0)} × ${fmt(x0)} = ${fmt(t0, 5)}`,
        `② t1 = b1 × x[${i - 1}] = ${fmt(b1)} × ${fmt(x1)} = ${fmt(t1, 5)}`,
        `③ s1 = t0 + t1 = ${fmt(t0, 5)} + ${fmt(t1, 5)} = ${fmt(s1, 5)}`,
        `④ t2 = b2 × x[${i - 2}] = ${fmt(b2)} × ${fmt(x2)} = ${fmt(t2, 5)}`,
        `⑤ s2 = s1 + t2 = ${fmt(s1, 5)} + ${fmt(t2, 5)} = ${fmt(s2, 5)}`,
        `⑥ f1 = -a1 × y[${i - 1}] = ${fmt(-a1)} × ${fmt(y1)} = ${fmt(f1, 5)}`,
        `⑦ s3 = s2 + f1 = ${fmt(s2, 5)} + ${fmt(f1, 5)} = ${fmt(s3, 5)}`,
        `⑧ f2 = -a2 × y[${i - 2}] = ${fmt(-a2)} × ${fmt(y2)} = ${fmt(f2, 5)}`,
        `⑨ y[${i}] = s3 + f2 = ${fmt(s3, 5)} + ${fmt(f2, 5)} = ${fmt(y, 5)}`,
      ],
    });

    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y;
  }

  return { output, trace };
}

function makeSignal({ waveform, fs, samples, mixHigh, mixLow }) {
  const out = [];
  for (let n = 0; n < samples; n++) {
    const t = n / fs;
    const low = Math.sin(2 * Math.PI * mixLow * t);
    const high = 0.5 * Math.sin(2 * Math.PI * mixHigh * t);
    let x = 0;
    switch (waveform) {
      case "sine":
        x = Math.sin(2 * Math.PI * mixLow * t);
        break;
      case "square":
        x = Math.sin(2 * Math.PI * mixLow * t) >= 0 ? 1 : -1;
        break;
      case "saw": {
        const p = (mixLow * t) % 1;
        x = 2 * p - 1;
        break;
      }
      case "mix":
        x = 0.8 * low + high;
        break;
      case "noise":
        x =
          Math.sin(2 * Math.PI * mixLow * t) * 0.35 +
          (Math.sin(2 * Math.PI * 1234 * t) + Math.sin(2 * Math.PI * 4567 * t)) * 0.15;
        break;
      case "impulse":
        x = n === 0 ? 1 : 0;
        break;
      case "step":
        x = n >= 8 ? 1 : 0;
        break;
      default:
        x = low;
    }
    out.push(x);
  }
  return out;
}

function responseCurve(coeffs, fs) {
  const freqs = logSpace(20, Math.max(100, fs / 2 - 1), 200);
  return freqs.map((f) => {
    const w = (2 * Math.PI * f) / fs;
    const c1 = Math.cos(w);
    const s1 = Math.sin(w);
    const c2 = Math.cos(2 * w);
    const s2 = Math.sin(2 * w);

    const nr = coeffs.b0 + coeffs.b1 * c1 + coeffs.b2 * c2;
    const ni = -coeffs.b1 * s1 - coeffs.b2 * s2;
    const dr = 1 + (coeffs.a1 || 0) * c1 + (coeffs.a2 || 0) * c2;
    const di = -(coeffs.a1 || 0) * s1 - (coeffs.a2 || 0) * s2;

    const numMag2 = nr * nr + ni * ni;
    const denMag2 = dr * dr + di * di;
    const mag = Math.sqrt(numMag2 / Math.max(1e-12, denMag2));
    return {
      freq: Math.round(f),
      magDb: 20 * Math.log10(Math.max(1e-6, mag)),
    };
  });
}

function impulseResponse(coeffs, kind = "iir", length = 64) {
  const input = Array.from({ length }, (_, i) => (i === 0 ? 1 : 0));
  if (kind === "fir") return firFilterWithTrace(input, coeffs).output;
  return iirFilterWithTrace(input, coeffs).output;
}

function estimateIirStability(a1, a2) {
  const disc = a1 * a1 - 4 * a2;
  if (disc >= 0) {
    const r1 = (-a1 + Math.sqrt(disc)) / 2;
    const r2 = (-a1 - Math.sqrt(disc)) / 2;
    const maxPoleMag = Math.max(Math.abs(r1), Math.abs(r2));
    return {
      stable: maxPoleMag < 1,
      maxPoleMag,
      label: maxPoleMag < 1 ? "稳定" : "可能不稳定",
    };
  }
  const real = -a1 / 2;
  const imag = Math.sqrt(-disc) / 2;
  const mag = Math.sqrt(real * real + imag * imag);
  return {
    stable: mag < 1,
    maxPoleMag: mag,
    label: mag < 1 ? "稳定" : "可能不稳定",
  };
}

function Section({ title, desc, children, badge }) {
  return (
    <div style={styles.card}>
      <div style={styles.sectionHeader}>
        <div>
          <div style={styles.sectionTitle}>{title}</div>
          {desc ? <div style={styles.sectionDesc}>{desc}</div> : null}
        </div>
        {badge ? <div style={styles.badge}>{badge}</div> : null}
      </div>
      <div style={styles.sectionBody}>{children}</div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => v,
  inputStep,
}) {
  const handleNumber = (raw) => {
    if (raw === "" || raw === "-" || raw === ".") return;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    onChange(clamp(parsed, min, max));
  };

  return (
    <div style={styles.controlBlock}>
      <div style={styles.labelRow}>
        <label style={styles.label}>{label}</label>
        <span style={styles.value}>{format(value)}</span>
      </div>
      <div style={styles.inputRow}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={styles.range}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={inputStep ?? step}
          value={value}
          onChange={(e) => handleNumber(e.target.value)}
          style={styles.numberInput}
        />
      </div>
    </div>
  );
}

function NumberPill({ label, value, color = "#0f172a" }) {
  return (
    <div style={styles.coeffPill}>
      <div style={styles.coeffLabel}>{label}</div>
      <div style={{ ...styles.coeffValue, color }}>{value}</div>
    </div>
  );
}

function FormulaCard({ title, color, lines }) {
  return (
    <div style={{ ...styles.formulaCard, borderColor: color }}>
      <div style={{ ...styles.formulaTitle, color }}>{title}</div>
      <div style={styles.formulaCodeWrap}>
        {lines.map((line, idx) => (
          <div key={idx} style={styles.formulaLine}>{line}</div>
        ))}
      </div>
    </div>
  );
}

function TraceDetails({ title, color, trace, type, defaultOpen = false, maxItems }) {
  const rows = trace.slice(0, maxItems);
  return (
    <details style={styles.details} open={defaultOpen}>
      <summary style={{ ...styles.detailsSummary, color }}>
        {title}（显示前 {rows.length} 步）
      </summary>
      <div style={styles.detailsContent}>
        {rows.map((row) => (
          <details key={`${type}-${row.n}`} style={styles.stepCard}>
            <summary style={styles.stepSummary}>
              <span style={styles.stepTitle}>{type} · n = {row.n}</span>
              <span style={styles.stepValue}>y[{row.n}] = {fmt(row.y, 5)}</span>
            </summary>
            <div style={styles.stepBody}>
              <div style={styles.monoLine}>{row.expr}</div>
              <div style={styles.stepGrid}>
                <div style={styles.stepMeta}><strong>x[n]</strong> = {fmt(row.x0, 5)}</div>
                <div style={styles.stepMeta}><strong>x[n-1]</strong> = {fmt(row.x1, 5)}</div>
                <div style={styles.stepMeta}><strong>x[n-2]</strong> = {fmt(row.x2, 5)}</div>
                {type === "IIR" ? (
                  <>
                    <div style={styles.stepMeta}><strong>y[n-1]</strong> = {fmt(row.y1, 5)}</div>
                    <div style={styles.stepMeta}><strong>y[n-2]</strong> = {fmt(row.y2, 5)}</div>
                  </>
                ) : null}
              </div>
              <div style={styles.stepList}>
                <div style={styles.stepListTitle}>逐步代数展开</div>
                {row.steps?.map((step, idx) => (
                  <div key={idx} style={styles.algebraLine}>{step}</div>
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>
    </details>
  );
}

const styles = {
  app: {
    minHeight: "100vh",
    background: "#f8fafc",
    color: "#0f172a",
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: 20,
  },
  shell: {
    maxWidth: 1550,
    margin: "0 auto",
    display: "grid",
    gap: 16,
  },
  hero: {
    background: "linear-gradient(135deg, #e2e8f0 0%, #ffffff 40%, #dbeafe 100%)",
    border: "1px solid #cbd5e1",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
  },
  heroTitle: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
    letterSpacing: -0.4,
  },
  heroDesc: {
    marginTop: 10,
    lineHeight: 1.7,
    color: "#334155",
    maxWidth: 1080,
  },
  heroTips: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
    marginTop: 18,
  },
  tipCard: {
    background: "rgba(255,255,255,0.82)",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 12,
    fontSize: 13,
    lineHeight: 1.6,
    color: "#334155",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "420px 1fr",
    gap: 16,
    alignItems: "start",
  },
  sidebar: {
    display: "grid",
    gap: 16,
    position: "sticky",
    top: 16,
    alignSelf: "start",
    maxHeight: "calc(100vh - 32px)",
    overflow: "auto",
    paddingRight: 2,
  },
  main: {
    display: "grid",
    gap: 16,
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 20,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
    overflow: "hidden",
  },
  sectionHeader: {
    padding: "18px 18px 0 18px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: -0.2,
  },
  sectionDesc: {
    marginTop: 6,
    color: "#475569",
    fontSize: 13,
    lineHeight: 1.6,
  },
  sectionBody: {
    padding: 18,
    display: "grid",
    gap: 12,
  },
  badge: {
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  controlBlock: { display: "grid", gap: 6 },
  labelRow: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" },
  label: { fontSize: 13, color: "#334155", fontWeight: 600 },
  value: {
    fontSize: 12,
    color: "#0f172a",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 999,
    padding: "2px 10px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  inputRow: {
    display: "grid",
    gridTemplateColumns: "1fr 110px",
    gap: 10,
    alignItems: "center",
  },
  range: { width: "100%" },
  numberInput: {
    width: "100%",
    padding: "9px 10px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
    fontSize: 13,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
    fontSize: 14,
  },
  segmented: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  toggleRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  button: (active) => ({
    borderRadius: 12,
    border: active ? "1px solid #3b82f6" : "1px solid #cbd5e1",
    background: active ? "#dbeafe" : "#fff",
    color: active ? "#1d4ed8" : "#334155",
    fontWeight: 700,
    padding: "10px 12px",
    cursor: "pointer",
  }),
  chartWrap: {
    width: "100%",
    height: 340,
    borderRadius: 18,
    background: "#ffffff",
  },
  responseNote: {
    marginTop: -2,
    color: "#475569",
    fontSize: 13,
    lineHeight: 1.6,
  },
  coeffGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
    gap: 10,
  },
  coeffPill: {
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    borderRadius: 14,
    padding: 12,
  },
  coeffLabel: { color: "#64748b", fontSize: 12, marginBottom: 6 },
  coeffValue: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700, fontSize: 15 },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  teachBox: {
    borderRadius: 16,
    background: "#fffbeb",
    border: "1px solid #fde68a",
    padding: 14,
    fontSize: 13,
    lineHeight: 1.7,
    color: "#92400e",
  },
  helperGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 10,
  },
  helperCard: {
    borderRadius: 16,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    padding: 12,
    fontSize: 13,
    lineHeight: 1.65,
    color: "#334155",
  },
  formulaGrid: {
    display: "grid",
    gap: 10,
  },
  formulaCard: {
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    borderRadius: 16,
    padding: 12,
    display: "grid",
    gap: 8,
  },
  formulaTitle: {
    fontSize: 13,
    fontWeight: 800,
  },
  formulaCodeWrap: {
    display: "grid",
    gap: 6,
  },
  formulaLine: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12.5,
    lineHeight: 1.7,
    color: "#0f172a",
    wordBreak: "break-word",
  },
  details: {
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    background: "#fff",
    overflow: "hidden",
  },
  detailsSummary: {
    cursor: "pointer",
    listStyle: "none",
    padding: "14px 16px",
    fontWeight: 800,
    fontSize: 14,
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
  },
  detailsContent: {
    padding: 12,
    display: "grid",
    gap: 10,
    maxHeight: 620,
    overflow: "auto",
  },
  stepCard: {
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    background: "#ffffff",
    overflow: "hidden",
  },
  stepSummary: {
    cursor: "pointer",
    listStyle: "none",
    padding: "12px 14px",
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    background: "#f8fafc",
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0f172a",
  },
  stepValue: {
    fontSize: 12,
    color: "#334155",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  stepBody: {
    padding: 14,
    display: "grid",
    gap: 10,
  },
  monoLine: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12.5,
    lineHeight: 1.7,
    color: "#0f172a",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  stepGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 8,
  },
  stepMeta: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    fontSize: 12.5,
    color: "#334155",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  stepList: {
    display: "grid",
    gap: 8,
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    padding: 12,
  },
  stepListTitle: {
    fontSize: 12,
    fontWeight: 800,
    color: "#475569",
    letterSpacing: 0.2,
  },
  algebraLine: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12.5,
    lineHeight: 1.75,
    color: "#0f172a",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    padding: "6px 8px",
    borderRadius: 10,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
  },
  singleCol: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  },
};

export default function InteractiveFilterTeachingPlaygroundV4() {
  const [waveform, setWaveform] = useState("mix");
  const [fs, setFs] = useState(48000);
  const [mixLow, setMixLow] = useState(200);
  const [mixHigh, setMixHigh] = useState(3000);
  const [samples, setSamples] = useState(256);
  const [traceCount, setTraceCount] = useState(24);

  const [firB0, setFirB0] = useState(0.33);
  const [firB1, setFirB1] = useState(0.33);
  const [firB2, setFirB2] = useState(0.33);

  const [iirMode, setIirMode] = useState("preset");
  const [filterType, setFilterType] = useState("lowpass");
  const [f0, setF0] = useState(1000);
  const [Q, setQ] = useState(0.707);
  const [gainDb, setGainDb] = useState(6);

  const [manualB0, setManualB0] = useState(0.2929);
  const [manualB1, setManualB1] = useState(0.5858);
  const [manualB2, setManualB2] = useState(0.2929);
  const [manualA1, setManualA1] = useState(0);
  const [manualA2, setManualA2] = useState(0.1716);

  const [showFIR, setShowFIR] = useState(true);
  const [showIIR, setShowIIR] = useState(true);

  const toggleShowFIR = () => {
    if (showFIR && !showIIR) return;
    setShowFIR((v) => !v);
  };

  const toggleShowIIR = () => {
    if (showIIR && !showFIR) return;
    setShowIIR((v) => !v);
  };

  const signal = useMemo(
    () => makeSignal({ waveform, fs, samples, mixHigh, mixLow }),
    [waveform, fs, samples, mixHigh, mixLow]
  );

  const firCoeffs = useMemo(
    () => ({ b0: firB0, b1: firB1, b2: firB2, a1: 0, a2: 0 }),
    [firB0, firB1, firB2]
  );

  const presetIirCoeffs = useMemo(
    () =>
      rbjCoeffs({
        type: filterType,
        fs,
        f0: clamp(f0, 20, fs / 2 - 100),
        Q,
        gainDb,
      }),
    [filterType, fs, f0, Q, gainDb]
  );

  const manualIirCoeffs = useMemo(
    () => ({ b0: manualB0, b1: manualB1, b2: manualB2, a1: manualA1, a2: manualA2 }),
    [manualB0, manualB1, manualB2, manualA1, manualA2]
  );

  const iirCoeffs = iirMode === "preset" ? presetIirCoeffs : manualIirCoeffs;

  const firRun = useMemo(() => firFilterWithTrace(signal, firCoeffs), [signal, firCoeffs]);
  const iirRun = useMemo(() => iirFilterWithTrace(signal, iirCoeffs), [signal, iirCoeffs]);

  const firOut = firRun.output;
  const firTrace = firRun.trace;
  const iirOut = iirRun.output;
  const iirTrace = iirRun.trace;

  const timeData = useMemo(
    () =>
      signal.map((x, i) => ({
        n: i,
        输入: round(x, 4),
        FIR: round(firOut[i], 4),
        IIR: round(iirOut[i], 4),
      })),
    [signal, firOut, iirOut]
  );

  const firRespBase = useMemo(() => responseCurve(firCoeffs, fs), [firCoeffs, fs]);
  const iirRespBase = useMemo(() => responseCurve(iirCoeffs, fs), [iirCoeffs, fs]);

  const respData = useMemo(
    () => firRespBase.map((row, i) => ({ freq: row.freq, FIR: row.magDb, IIR: iirRespBase[i]?.magDb ?? 0 })),
    [firRespBase, iirRespBase]
  );

  const firImpulse = useMemo(() => impulseResponse(firCoeffs, "fir", 64), [firCoeffs]);
  const iirImpulse = useMemo(() => impulseResponse(iirCoeffs, "iir", 64), [iirCoeffs]);

  const impulseData = useMemo(
    () =>
      firImpulse.map((v, i) => ({
        n: i,
        FIR: round(v, 5),
        IIR: round(iirImpulse[i] ?? 0, 5),
      })),
    [firImpulse, iirImpulse]
  );

  const stability = useMemo(() => estimateIirStability(iirCoeffs.a1, iirCoeffs.a2), [iirCoeffs]);

  const hints = {
    lowpass: "低通：保留慢变化，削弱快变化。截止频率越高，放过的高频越多。",
    highpass: "高通：削弱慢变化，只保留快变化。截止频率越高，被切掉的低频越多。",
    bandpass: "带通：只留下某一段频率。Q 越大，通带越窄。",
    notch: "陷波：在某个频点挖一个坑。Q 越大，坑越窄越深。",
    peak: "峰值 EQ：在某个频段做增强或削弱，Gain 决定抬高还是压低，Q 决定影响范围。",
    lowshelf: "低搁架：某个频率以下整体抬高或降低。",
    highshelf: "高搁架：某个频率以上整体抬高或降低。",
  };

  const firFormulaLines = [
    "通用：y[n] = b0·x[n] + b1·x[n-1] + b2·x[n-2]",
    `当前：y[n] = ${fmt(firCoeffs.b0)}·x[n] ${signed(firCoeffs.b1)}·x[n-1] ${signed(firCoeffs.b2)}·x[n-2]`,
  ];

  const iirFormulaLines = [
    "通用：y[n] = b0·x[n] + b1·x[n-1] + b2·x[n-2] - a1·y[n-1] - a2·y[n-2]",
    `当前：y[n] = ${fmt(iirCoeffs.b0)}·x[n] ${signed(iirCoeffs.b1)}·x[n-1] ${signed(iirCoeffs.b2)}·x[n-2] ${signed(-iirCoeffs.a1)}·y[n-1] ${signed(-iirCoeffs.a2)}·y[n-2]`,
  ];

  const traceLayoutStyle = showFIR && showIIR ? styles.twoCol : styles.singleCol;

  return (
    <div style={styles.app}>
      <div style={styles.shell}>
        <div style={styles.hero}>
          <h1 style={styles.heroTitle}>交互式 FIR / IIR 教学游乐场 V4</h1>
          <div style={styles.heroDesc}>
            这个版本增加了两个教学增强点：
            <strong> 可以单独开关 FIR / IIR，只看其中一个；逐样本迭代明细不再只给最终结果，而是把每一步代数式都展开。 </strong>
            这样你不止能讲“输出是什么”，还能讲“它是怎么一步一步算出来的”。
          </div>
          <div style={styles.heroTips}>
            <div style={styles.tipCard}><strong>建议 1：</strong>先用“混合波”，只打开 FIR，拖动 b0 / b1 / b2，观察“当前输入 + 延迟输入”如何形成平滑或差分效果。</div>
            <div style={styles.tipCard}><strong>建议 2：</strong>再只打开 IIR，切换 lowpass / highpass / peak，观察反馈项 a1 / a2 带来的拖尾、共振与频响变化。</div>
            <div style={styles.tipCard}><strong>建议 3：</strong>最后展开“逐步迭代明细”，点开某个 n，逐行讲每一步乘法项、中间和、最终 y[n] 是怎么得出的。</div>
          </div>
        </div>

        <div style={styles.layout}>
          <div style={styles.sidebar}>
            <Section title="显示开关" desc="可以只看 FIR，也可以只看 IIR。为了避免图表空白，至少会保留一个开启。" badge="Step 0">
              <div style={styles.toggleRow}>
                <button style={styles.button(showFIR)} onClick={toggleShowFIR}>显示 FIR</button>
                <button style={styles.button(showIIR)} onClick={toggleShowIIR}>显示 IIR</button>
              </div>
              <div style={styles.helperGrid}>
                <div style={styles.helperCard}><strong>影响范围：</strong>时域图、频率响应、冲激响应、迭代明细、当前系数区都会跟随开关变化。</div>
                <div style={styles.helperCard}><strong>不影响：</strong>参数编辑区始终保留，这样你可以边调一个、边只看另一个，方便做课堂对照。</div>
              </div>
            </Section>

            <Section title="输入信号" desc="先用同一个输入喂给 FIR 和 IIR，方便直接对照它们的差异。" badge="Step 1">
              <div style={styles.controlBlock}>
                <label style={styles.label}>波形类型</label>
                <select value={waveform} onChange={(e) => setWaveform(e.target.value)} style={styles.select}>
                  <option value="mix">混合波（低频 + 高频）</option>
                  <option value="sine">正弦</option>
                  <option value="square">方波</option>
                  <option value="saw">锯齿</option>
                  <option value="noise">类噪声混合</option>
                  <option value="impulse">冲激</option>
                  <option value="step">阶跃</option>
                </select>
              </div>
              <SliderRow label="低频成分" value={mixLow} min={40} max={2000} step={10} onChange={setMixLow} format={(v) => `${v} Hz`} />
              <SliderRow label="高频成分" value={mixHigh} min={500} max={12000} step={10} onChange={setMixHigh} format={(v) => `${v} Hz`} />
              <SliderRow label="采样率" value={fs} min={8000} max={96000} step={1000} onChange={setFs} format={(v) => `${v} Hz`} />
              <SliderRow label="显示样本数" value={samples} min={96} max={512} step={16} onChange={setSamples} format={(v) => `${v}`} />
              <SliderRow label="逐步明细条数" value={traceCount} min={4} max={64} step={1} onChange={setTraceCount} format={(v) => `${v}`} />
            </Section>

            <Section title="FIR：直接调 b 系数" desc="FIR 没有反馈，只有输入延迟项的线性组合。非常适合讲清楚 b0/b1/b2 的直觉。" badge="Step 2">
              <SliderRow label="FIR b0" value={firB0} min={-2} max={2} step={0.001} onChange={setFirB0} format={(v) => v.toFixed(3)} />
              <SliderRow label="FIR b1" value={firB1} min={-2} max={2} step={0.001} onChange={setFirB1} format={(v) => v.toFixed(3)} />
              <SliderRow label="FIR b2" value={firB2} min={-2} max={2} step={0.001} onChange={setFirB2} format={(v) => v.toFixed(3)} />
              <div style={styles.formulaGrid}>
                <FormulaCard title="FIR 差分表达式" color="#dc2626" lines={firFormulaLines} />
              </div>
              <div style={styles.helperGrid}>
                <div style={styles.helperCard}><strong>观察点：</strong>当 b0、b1、b2 都是正数而且比较接近时，通常更像“平均”，倾向于低通。</div>
                <div style={styles.helperCard}><strong>观察点：</strong>当某些项一正一负时，更像“差分”，倾向于强调快变化，也更像高通。</div>
              </div>
            </Section>

            <Section title="IIR：预设模式 / 直接系数模式" desc="先用预设理解滤波器家族，再切到直接系数，建立 a/b 与频响的直觉。" badge="Step 3">
              <div style={styles.segmented}>
                <button style={styles.button(iirMode === "preset")} onClick={() => setIirMode("preset")}>预设滤波器</button>
                <button style={styles.button(iirMode === "direct")} onClick={() => setIirMode("direct")}>直接调 a / b</button>
              </div>

              {iirMode === "preset" ? (
                <>
                  <div style={styles.controlBlock}>
                    <label style={styles.label}>滤波器类型</label>
                    <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={styles.select}>
                      <option value="lowpass">Low-pass 低通</option>
                      <option value="highpass">High-pass 高通</option>
                      <option value="bandpass">Band-pass 带通</option>
                      <option value="notch">Notch 陷波</option>
                      <option value="peak">Peak 峰值 EQ</option>
                      <option value="lowshelf">Low-shelf 低搁架</option>
                      <option value="highshelf">High-shelf 高搁架</option>
                    </select>
                  </div>
                  <SliderRow label="中心 / 截止频率" value={f0} min={20} max={Math.max(200, fs / 2 - 100)} step={10} onChange={setF0} format={(v) => `${v} Hz`} />
                  <SliderRow label="Q" value={Q} min={0.2} max={12} step={0.001} onChange={setQ} format={(v) => v.toFixed(3)} />
                  <SliderRow label="Gain" value={gainDb} min={-18} max={18} step={0.1} onChange={setGainDb} format={(v) => `${v.toFixed(1)} dB`} />
                  <div style={styles.teachBox}>{hints[filterType]}</div>
                </>
              ) : (
                <>
                  <SliderRow label="IIR b0" value={manualB0} min={-2} max={2} step={0.001} onChange={setManualB0} format={(v) => v.toFixed(3)} />
                  <SliderRow label="IIR b1" value={manualB1} min={-2} max={2} step={0.001} onChange={setManualB1} format={(v) => v.toFixed(3)} />
                  <SliderRow label="IIR b2" value={manualB2} min={-2} max={2} step={0.001} onChange={setManualB2} format={(v) => v.toFixed(3)} />
                  <SliderRow label="IIR a1" value={manualA1} min={-1.99} max={1.99} step={0.001} onChange={setManualA1} format={(v) => v.toFixed(3)} />
                  <SliderRow label="IIR a2" value={manualA2} min={-1.99} max={1.99} step={0.001} onChange={setManualA2} format={(v) => v.toFixed(3)} />
                  <div style={{ ...styles.teachBox, background: stability.stable ? "#ecfdf5" : "#fef2f2", borderColor: stability.stable ? "#86efac" : "#fca5a5", color: stability.stable ? "#166534" : "#991b1b" }}>
                    <strong>稳定性提醒：</strong>{stability.label}。当前估计最大极点模长约为 {stability.maxPoleMag.toFixed(4)}。如果大于等于 1，IIR 可能发散或出现巨大拖尾。
                  </div>
                </>
              )}

              <div style={styles.formulaGrid}>
                <FormulaCard title="IIR 差分表达式" color="#059669" lines={iirFormulaLines} />
              </div>
            </Section>
          </div>

          <div style={styles.main}>
            <Section title="时域：输入 vs FIR 输出 vs IIR 输出" desc="同一个输入同时喂两种滤波器，用肉眼比较波形边缘、平滑度和拖尾。">
              <div style={styles.responseNote}>
                蓝色 = 输入，红色 = FIR 输出，绿色 = IIR 输出。你现在可以通过顶部开关只看其中一个滤波器，方便课堂聚焦讲解。
              </div>
              <div style={styles.chartWrap}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeData} margin={{ top: 12, right: 24, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="n" />
                    <YAxis domain={["auto", "auto"]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="输入" stroke="#2563eb" dot={false} strokeWidth={2} />
                    {showFIR ? <Line type="monotone" dataKey="FIR" stroke="#dc2626" dot={false} strokeWidth={2} /> : null}
                    {showIIR ? <Line type="monotone" dataKey="IIR" stroke="#059669" dot={false} strokeWidth={2} /> : null}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="频率响应：FIR 与 IIR 同屏对比" desc="这条图就是“它们对每个频率的态度”。不需要先做 FFT 才能实现滤波，但我们可以用频率响应来理解它的选择性。">
              <div style={styles.responseNote}>
                看两条曲线如何变化：<strong>FIR</strong> 主要由 b 系数塑造延迟项叠加；<strong>IIR</strong> 除了 b 之外，还会被 a 系数（反馈极点）显著改变。只打开某一个时，就能专注看它自己的频率选择性。
              </div>
              <div style={styles.chartWrap}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={respData} margin={{ top: 12, right: 24, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="freq" tickFormatter={(v) => `${v}`} />
                    <YAxis domain={[-30, 30]} unit=" dB" />
                    <Tooltip formatter={(v) => [`${Number(v).toFixed(2)} dB`, "增益"]} labelFormatter={(label) => `${label} Hz`} />
                    <Legend />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                    {showFIR ? <Line type="monotone" dataKey="FIR" stroke="#dc2626" dot={false} strokeWidth={2} /> : null}
                    {showIIR ? <Line type="monotone" dataKey="IIR" stroke="#059669" dot={false} strokeWidth={2} /> : null}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="冲激响应：为什么 IIR 叫 Infinite？" desc="同样给一个单位冲激，FIR 的响应通常很快结束；IIR 则可能持续衰减很久。这个图特别适合讲“有限冲激响应 vs 无限冲激响应”。">
              <div style={styles.responseNote}>
                如果 IIR 的 a 系数让极点靠近单位圆，绿色拖尾会更长；如果跑到不稳定区，冲激响应甚至可能发散。只看单个滤波器时，这张图会更容易聚焦到“它自己的记忆长度”。
              </div>
              <div style={styles.chartWrap}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={impulseData} margin={{ top: 12, right: 24, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="n" />
                    <YAxis domain={["auto", "auto"]} />
                    <Tooltip />
                    <Legend />
                    {showFIR ? <Line type="monotone" dataKey="FIR" stroke="#dc2626" dot={false} strokeWidth={2} /> : null}
                    {showIIR ? <Line type="monotone" dataKey="IIR" stroke="#059669" dot={false} strokeWidth={2} /> : null}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="逐步迭代明细：把每一步算式展开" desc="你可以点开每个 n，查看 x / y 的实际代入值、中间项以及最终结果。非常适合讲‘递推是怎么一步一步跑出来的’。">
              <div style={styles.responseNote}>
                现在每个样本点都不只是显示最后的 y[n]，而是会把每一步乘法项、每一步中间和、最后的结果完整展开。FIR 看输入延迟项；IIR 还会额外展开反馈项 y[n-1]、y[n-2]。
              </div>
              <div style={traceLayoutStyle}>
                {showFIR ? <TraceDetails title="FIR 逐步明细" color="#dc2626" trace={firTrace} type="FIR" maxItems={traceCount} defaultOpen /> : null}
                {showIIR ? <TraceDetails title="IIR 逐步明细" color="#059669" trace={iirTrace} type="IIR" maxItems={traceCount} defaultOpen={!showFIR} /> : null}
              </div>
            </Section>

            <Section title="当前系数与讲解脚本" desc="你可以把这里当讲台提词器：一边拖参数，一边对照系数、公式和逐步明细。">
              <div style={showFIR && showIIR ? styles.twoCol : styles.singleCol}>
                {showFIR ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={styles.sectionTitle}>FIR 当前系数</div>
                    <div style={styles.coeffGrid}>
                      <NumberPill label="b0" value={firCoeffs.b0.toFixed(6)} color="#dc2626" />
                      <NumberPill label="b1" value={firCoeffs.b1.toFixed(6)} color="#dc2626" />
                      <NumberPill label="b2" value={firCoeffs.b2.toFixed(6)} color="#dc2626" />
                    </div>
                  </div>
                ) : null}
                {showIIR ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={styles.sectionTitle}>IIR 当前系数</div>
                    <div style={styles.coeffGrid}>
                      <NumberPill label="b0" value={iirCoeffs.b0.toFixed(6)} color="#059669" />
                      <NumberPill label="b1" value={iirCoeffs.b1.toFixed(6)} color="#059669" />
                      <NumberPill label="b2" value={iirCoeffs.b2.toFixed(6)} color="#059669" />
                      <NumberPill label="a1" value={iirCoeffs.a1.toFixed(6)} color="#059669" />
                      <NumberPill label="a2" value={iirCoeffs.a2.toFixed(6)} color="#059669" />
                    </div>
                  </div>
                ) : null}
              </div>
              <div style={styles.teachBox}>
                <strong>建议教学顺序：</strong>
                <ol style={{ margin: "8px 0 0 18px", padding: 0 }}>
                  <li>先只开 <strong>FIR</strong>，专讲 <strong>b0 / b1 / b2 是如何把当前输入、延迟一拍、延迟两拍相加相减</strong> 的。</li>
                  <li>再只开 <strong>IIR</strong>，用 lowpass / highpass / peak 讲“同样是二阶，为什么频响可以完全不同”。</li>
                  <li>然后把学生视角切到公式卡片：让他们先看通用表达式，再看当前系数代入后的表达式。</li>
                  <li>最后展开“逐步迭代明细”，挑一个 n，逐行解释 <strong>每一步乘法项、每一步中间和、最终 y[n]</strong> 是怎么得出的。</li>
                  <li>如果学生问“是不是先做傅里叶”，就让他们看：代码里真正实现的是样本级递推；频响图只是用来分析系统对不同频率的态度。</li>
                </ol>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
