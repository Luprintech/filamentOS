import { useTranslation } from 'react-i18next';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildCsv, downloadTextFile, slugifyFilename } from '@/lib/export-utils';
import type { StatsResponse } from '../types';

interface StatsExportButtonsProps {
  data: StatsResponse;
  dateLabel: string; // e.g. "2026-01-01_2026-04-22"
}

export function StatsExportButtons({ data, dateLabel }: StatsExportButtonsProps) {
  const { t } = useTranslation();

  function handleCsvExport() {
    const headers = [
      t('stats_export_col_period'),
      t('stats_export_col_pieces'),
      t('stats_export_col_grams'),
      t('stats_export_col_kg'),
      t('stats_export_col_cost'),
      t('stats_export_col_hours'),
    ];

    const rows = data.timeSeries.map((point) => [
      point.period,
      point.pieces,
      point.grams.toFixed(2),
      (point.grams / 1000).toFixed(3),
      point.cost.toFixed(4),
      (point.secs / 3600).toFixed(2),
    ]);

    const csv = buildCsv([headers, ...rows]);
    const filename = `stats-${slugifyFilename(dateLabel)}.csv`;
    downloadTextFile(csv, filename, 'text/csv;charset=utf-8;');
  }

  function handleProjectCsvExport() {
    const headers = [
      t('stats_export_col_project'),
      t('stats_export_col_pieces'),
      t('stats_export_col_grams'),
      t('stats_export_col_kg'),
      t('stats_export_col_cost'),
      t('stats_export_col_hours'),
    ];

    const rows = data.byProject.map((p) => [
      p.title,
      p.pieces,
      p.grams.toFixed(2),
      (p.grams / 1000).toFixed(3),
      p.cost.toFixed(4),
      (p.secs / 3600).toFixed(2),
    ]);

    const csv = buildCsv([headers, ...rows]);
    const filename = `stats-by-project-${slugifyFilename(dateLabel)}.csv`;
    downloadTextFile(csv, filename, 'text/csv;charset=utf-8;');
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={handleCsvExport} className="gap-2 text-xs">
        <Download className="h-3.5 w-3.5" />
        {t('stats_export_csv_trend')}
      </Button>
      <Button variant="outline" size="sm" onClick={handleProjectCsvExport} className="gap-2 text-xs">
        <FileText className="h-3.5 w-3.5" />
        {t('stats_export_csv_project')}
      </Button>
    </div>
  );
}
