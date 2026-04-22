import { useTranslation } from 'react-i18next';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import type { StatsTimePoint, StatsProjectRow } from '../types';

interface StatsChartsProps {
  timeSeries: StatsTimePoint[];
  byProject: StatsProjectRow[];
}

function formatPeriodLabel(period: string): string {
  // YYYY-MM → Jan 2026 style
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split('-');
    const d = new Date(Number(year), Number(month) - 1);
    return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }
  // YYYY-MM-DD → short date
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    const d = new Date(period + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return period;
}

// Custom Tooltip
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg text-sm">
      <p className="font-bold mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
        </p>
      ))}
    </div>
  );
}

export function StatsCharts({ timeSeries, byProject }: StatsChartsProps) {
  const { t } = useTranslation();

  const formattedTimeSeries = timeSeries.map((point) => ({
    ...point,
    periodLabel: formatPeriodLabel(point.period),
    kg: parseFloat((point.grams / 1000).toFixed(3)),
    hours: parseFloat((point.secs / 3600).toFixed(2)),
  }));

  const formattedByProject = byProject.slice(0, 10).map((p) => ({
    ...p,
    title: p.title.length > 20 ? p.title.slice(0, 18) + '…' : p.title,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {/* Trend: pieces over time */}
      <div className="rounded-xl border border-border/60 bg-card/80 p-4 backdrop-blur-sm">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
          {t('stats_chart_trend_title')}
        </h3>
        {formattedTimeSeries.length === 0 ? (
          <p className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            {t('stats_empty')}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={formattedTimeSeries} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="colorPieces" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorKg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="periodLabel" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="pieces"
                name={t('stats_chart_pieces')}
                stroke="#3b82f6"
                fill="url(#colorPieces)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="kg"
                name={t('stats_chart_kg')}
                stroke="#10b981"
                fill="url(#colorKg)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Cost by project */}
      <div className="rounded-xl border border-border/60 bg-card/80 p-4 backdrop-blur-sm">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
          {t('stats_chart_by_project_title')}
        </h3>
        {formattedByProject.length === 0 ? (
          <p className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            {t('stats_empty')}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={formattedByProject} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="title" tick={{ fontSize: 11 }} width={90} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="cost"
                name={t('stats_chart_cost')}
                fill="#8b5cf6"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
