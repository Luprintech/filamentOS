import { useTranslation } from 'react-i18next';
import { Layers, Weight, Euro, Clock } from 'lucide-react';
import type { StatsSummary } from '../types';

interface StatsMetricCardsProps {
  summary: StatsSummary;
}

function formatTime(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatKg(grams: number): string {
  const kg = grams / 1000;
  return kg >= 1 ? `${kg.toFixed(2)} kg` : `${grams.toFixed(1)} g`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}

function MetricCard({ icon, label, value, sub, color }: MetricCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/80 p-4 backdrop-blur-sm">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
        {icon}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function StatsMetricCards({ summary }: StatsMetricCardsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <MetricCard
        icon={<Layers className="h-4 w-4 text-white" />}
        label={t('stats_metric_pieces')}
        value={summary.totalPieces.toLocaleString()}
        sub={t('stats_metric_projects', { count: summary.projectCount })}
        color="bg-blue-500"
      />
      <MetricCard
        icon={<Weight className="h-4 w-4 text-white" />}
        label={t('stats_metric_filament')}
        value={formatKg(summary.totalGrams)}
        color="bg-emerald-500"
      />
      <MetricCard
        icon={<Euro className="h-4 w-4 text-white" />}
        label={t('stats_metric_cost')}
        value={formatCurrency(summary.totalCost)}
        sub={t('stats_metric_avg_cost', { value: formatCurrency(summary.avgCostPerPiece) })}
        color="bg-violet-500"
      />
      <MetricCard
        icon={<Clock className="h-4 w-4 text-white" />}
        label={t('stats_metric_time')}
        value={formatTime(summary.totalSecs)}
        color="bg-orange-500"
      />
    </div>
  );
}
