import React, { useEffect, useId, useMemo, useState } from 'react';
import { apiService } from '../service/api';
import type { PriceHistoryPoint } from '../types';
import './PriceMonitorPanel.css';

const W = 640;
const H = 220;
const PAD_L = 48;
const PAD_R = 16;
const PAD_T = 24;
const PAD_B = 40;

interface PriceMonitorPanelProps {
  algorithmId: string;
  currentPrice?: number;
}

const PriceMonitorPanel: React.FC<PriceMonitorPanelProps> = ({ algorithmId, currentPrice }) => {
  const lineGradId = `priceLineGrad-${useId().replace(/:/g, '')}`;
  const [points, setPoints] = useState<PriceHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const data = await apiService.getAlgorithmPriceHistory(algorithmId);
        if (!cancelled) setPoints(data);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Не удалось загрузить историю цен');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [algorithmId]);

  const geom = useMemo(() => {
    if (!points.length) return null;
    const sorted = [...points].sort(
      (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
    );
    const ts = sorted.map((p) => new Date(p.recordedAt).getTime());
    const prices = sorted.map((p) => p.price);
    const t0 = ts[0];
    const t1 = ts[ts.length - 1];
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const spanT = Math.max(t1 - t0, 1);
    const spanP = Math.max(maxP - minP, 1);
    const padP = spanP * 0.08;
    const low = minP - padP;
    const high = maxP + padP;
    const rangeP = Math.max(high - low, 1);

    const xOf = (t: number) => PAD_L + ((t - t0) / spanT) * (W - PAD_L - PAD_R);
    const yOf = (pr: number) => PAD_T + (1 - (pr - low) / rangeP) * (H - PAD_T - PAD_B);

    const pathD = sorted
      .map((p, i) => {
        const x = xOf(new Date(p.recordedAt).getTime());
        const y = yOf(p.price);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');

    const dots = sorted.map((p) => ({
      x: xOf(new Date(p.recordedAt).getTime()),
      y: yOf(p.price),
      key: `${p.recordedAt}-${p.price}`,
    }));

    return { pathD, dots, sorted };
  }, [points]);

  return (
    <section className="price-monitor-panel">
      <div className="price-monitor-header">
        <div>
          <h2 className="price-monitor-title">Мониторинг цены</h2>
          <p className="price-monitor-sub">
            Текущая цена на площадке:{' '}
            <strong>{currentPrice != null ? `${currentPrice} ₽` : '—'}</strong>
            {points.length > 0 && (
              <span className="price-monitor-points-count"> · записей в истории: {points.length}</span>
            )}
          </p>
        </div>
        <button
          type="button"
          className="price-monitor-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          {collapsed ? 'Развернуть график' : 'Свернуть'}
        </button>
      </div>

      {!collapsed && (
        <div className="price-monitor-body">
          {loading && <p className="price-monitor-muted">Загрузка графика…</p>}
          {err && <p className="price-monitor-error">{err}</p>}
          {!loading && !err && points.length === 0 && (
            <p className="price-monitor-muted">
              История изменений цены пока пуста. Точки появятся при изменении цены автором после
              публикации.
            </p>
          )}
          {!loading && !err && geom && (
            <div className="price-chart-wrap">
              <svg
                className="price-chart-svg"
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="График изменения цены"
              >
                <defs>
                  <linearGradient id={lineGradId} x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#667eea" />
                    <stop offset="100%" stopColor="#764ba2" />
                  </linearGradient>
                </defs>
                <rect x="0" y="0" width={W} height={H} fill="#f8fafc" rx="8" />
                <path
                  d={geom.pathD}
                  fill="none"
                  stroke={`url(#${lineGradId})`}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {geom.dots.map(({ x, y, key }) => (
                  <circle key={key} cx={x} cy={y} r="5" fill="#fff" stroke="#667eea" strokeWidth="2" />
                ))}
              </svg>
              <ul className="price-chart-legend">
                {geom.sorted
                  .slice()
                  .reverse()
                  .slice(0, 8)
                  .map((p) => (
                    <li key={`${p.recordedAt}-${p.price}`}>
                      <time dateTime={p.recordedAt}>
                        {new Date(p.recordedAt).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      <span>{p.price} ₽</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default PriceMonitorPanel;
