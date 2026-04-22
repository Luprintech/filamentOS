import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Loader2, BarChart2 } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { apiGetProjects } from '@/components/filament-challenge/tracker-api';
import { StatsFilterBar } from './stats-filter-bar';
import { StatsMetricCards } from './stats-metric-cards';
import { StatsCharts } from './stats-charts';
import { StatsExportButtons } from './stats-export-buttons';
import { useStatsQuery } from '../api/use-stats';
import type { StatsFilters } from '../types';

function getDefaultFilters(): StatsFilters {
  const now = new Date();
  const from = `${now.getFullYear()}-01-01`;
  const to = now.toISOString().slice(0, 10);
  return {
    from,
    to,
    projectId: 'all',
    granularity: 'month',
    preset: 'thisYear',
  };
}

export function StatsDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [filters, setFilters] = useState<StatsFilters>(getDefaultFilters);

  // Fetch tracker projects for the filter dropdown
  const projectsQuery = useQuery({
    queryKey: ['tracker-projects-for-stats'],
    queryFn: apiGetProjects,
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(user),
  });

  // Fetch stats
  const statsQuery = useStatsQuery(filters);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
        <BarChart2 className="h-12 w-12 opacity-30" />
        <p className="text-sm">{t('stats_login_required')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="flex items-center gap-3">
        <BarChart2 className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-bold">{t('stats_title')}</h2>
          <p className="text-sm text-muted-foreground">{t('stats_subtitle')}</p>
        </div>
      </div>

      {/* Filter bar */}
      <StatsFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        projects={projectsQuery.data ?? []}
      />

      {/* Loading state */}
      {statsQuery.isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error state */}
      {statsQuery.isError && !statsQuery.isLoading && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {t('stats_error_load')}: {statsQuery.error?.message}
        </div>
      )}

      {/* Empty state */}
      {statsQuery.isSuccess && statsQuery.data.summary.totalPieces === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border/60 bg-card/50 py-20">
          <BarChart2 className="h-10 w-10 opacity-20" />
          <p className="text-sm text-muted-foreground">{t('stats_empty')}</p>
        </div>
      )}

      {/* Data loaded */}
      {statsQuery.isSuccess && statsQuery.data.summary.totalPieces > 0 && (
        <>
          {/* Metric cards */}
          <StatsMetricCards summary={statsQuery.data.summary} />

          {/* Charts */}
          <StatsCharts
            timeSeries={statsQuery.data.timeSeries}
            byProject={statsQuery.data.byProject}
          />

          {/* Export */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-muted-foreground">{t('stats_export_label')}</p>
            <StatsExportButtons
              data={statsQuery.data}
              dateLabel={`${filters.from}_${filters.to}`}
            />
          </div>
        </>
      )}
    </div>
  );
}
