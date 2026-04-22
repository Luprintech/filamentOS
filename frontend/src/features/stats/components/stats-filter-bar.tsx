import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { StatsFilters, Granularity, DatePreset } from '../types';

interface TrackerProject {
  id: string;
  title: string;
}

interface StatsFilterBarProps {
  filters: StatsFilters;
  onFiltersChange: (filters: StatsFilters) => void;
  projects: TrackerProject[];
}

function getPresetDates(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const toDate = now.toISOString().slice(0, 10);

  switch (preset) {
    case 'today': {
      return { from: toDate, to: toDate };
    }
    case 'last7': {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: from.toISOString().slice(0, 10), to: toDate };
    }
    case 'last30': {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: from.toISOString().slice(0, 10), to: toDate };
    }
    case 'thisYear': {
      return { from: `${now.getFullYear()}-01-01`, to: toDate };
    }
    case 'all':
    default:
      return { from: '2000-01-01', to: toDate };
  }
}

const PRESETS: Array<{ key: DatePreset; label: string }> = [
  { key: 'today', label: 'stats_filter_today' },
  { key: 'last7', label: 'stats_filter_last7' },
  { key: 'last30', label: 'stats_filter_last30' },
  { key: 'thisYear', label: 'stats_filter_this_year' },
  { key: 'all', label: 'stats_filter_all_time' },
];

export function StatsFilterBar({ filters, onFiltersChange, projects }: StatsFilterBarProps) {
  const { t } = useTranslation();

  function applyPreset(preset: DatePreset) {
    const { from, to } = getPresetDates(preset);
    onFiltersChange({ ...filters, from, to, preset });
  }

  function handleFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    onFiltersChange({ ...filters, from: e.target.value, preset: 'custom' });
  }

  function handleToChange(e: React.ChangeEvent<HTMLInputElement>) {
    onFiltersChange({ ...filters, to: e.target.value, preset: 'custom' });
  }

  function handleProjectChange(value: string) {
    onFiltersChange({ ...filters, projectId: value });
  }

  function handleGranularityChange(value: string) {
    onFiltersChange({ ...filters, granularity: value as Granularity });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card/80 p-4 backdrop-blur-sm">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(({ key, label }) => (
          <Button
            key={key}
            variant={filters.preset === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyPreset(key)}
            className="text-xs"
          >
            {t(label)}
          </Button>
        ))}
      </div>

      {/* Custom date range + project + granularity */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">{t('stats_filter_from')}</Label>
          <Input
            type="date"
            value={filters.from}
            onChange={handleFromChange}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">{t('stats_filter_to')}</Label>
          <Input
            type="date"
            value={filters.to}
            onChange={handleToChange}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">{t('stats_filter_project')}</Label>
          <Select value={filters.projectId} onValueChange={handleProjectChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={t('stats_filter_all_projects')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('stats_filter_all_projects')}</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">{t('stats_filter_granularity')}</Label>
          <Select value={filters.granularity} onValueChange={handleGranularityChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">{t('stats_granularity_day')}</SelectItem>
              <SelectItem value="week">{t('stats_granularity_week')}</SelectItem>
              <SelectItem value="month">{t('stats_granularity_month')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
