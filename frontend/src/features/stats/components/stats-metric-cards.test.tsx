import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { StatsMetricCards } from './stats-metric-cards';
import type { StatsSummary } from '../types';

const mockSummary: StatsSummary = {
  totalPieces: 42,
  totalGrams: 1500,
  totalCost: 37.8,
  totalSecs: 18000, // 5 hours
  avgCostPerPiece: 0.9,
  projectCount: 3,
};

function renderWithI18n(ui: React.ReactElement) {
  return render(
    <I18nextProvider i18n={i18n}>
      {ui}
    </I18nextProvider>
  );
}

describe('StatsMetricCards', () => {
  it('renders the total piece count', () => {
    renderWithI18n(<StatsMetricCards summary={mockSummary} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders filament in kg when >= 1000g', () => {
    renderWithI18n(<StatsMetricCards summary={mockSummary} />);
    // 1500g → 1.50 kg
    expect(screen.getByText('1.50 kg')).toBeInTheDocument();
  });

  it('renders filament in grams when < 1000g', () => {
    const summary = { ...mockSummary, totalGrams: 350 };
    renderWithI18n(<StatsMetricCards summary={summary} />);
    expect(screen.getByText('350.0 g')).toBeInTheDocument();
  });

  it('renders print time correctly for hours > 0', () => {
    renderWithI18n(<StatsMetricCards summary={mockSummary} />);
    // 18000s → 5h 0m
    expect(screen.getByText('5h 0m')).toBeInTheDocument();
  });

  it('renders print time in minutes when < 1 hour', () => {
    const summary = { ...mockSummary, totalSecs: 2700 }; // 45 minutes
    renderWithI18n(<StatsMetricCards summary={summary} />);
    expect(screen.getByText('45m')).toBeInTheDocument();
  });
});
