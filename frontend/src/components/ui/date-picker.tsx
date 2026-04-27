import React, { useState, useRef, useEffect, useMemo } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export function formatDateLabel(value: string | null | undefined, locale: string): string {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale || 'es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function getCalendarMatrix(monthDate: Date) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const startDay = (start.getDay() + 6) % 7; // Monday as first day
  const daysInMonth = end.getDate();
  const cells: Array<Date | null> = [];

  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<Array<Date | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export interface DatePickerProps {
  value?: string | null;
  onChange?: (date: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DatePicker({ value, onChange, placeholder, className, disabled }: DatePickerProps) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    if (value) {
      const d = new Date(`${value.slice(0, 10)}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
  });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const calendarWeeks = useMemo(() => getCalendarMatrix(calendarMonth), [calendarMonth]);
  const todayIso = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  function handleSelectDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    onChange?.(`${year}-${month}-${day}`);
    setIsOpen(false);
  }

  function handleClear() {
    onChange?.('');
    setIsOpen(false);
  }

  const displayLabel = value ? formatDateLabel(value, i18n.language) : placeholder || 'Seleccionar fecha';

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-[12px] border border-border/60 bg-card/80 px-3 py-2 text-sm font-medium text-foreground shadow-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-white/[0.10] dark:bg-white/[0.04] disabled:opacity-50 disabled:cursor-not-allowed',
          className
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={cn(!value && 'text-muted-foreground')}>
          {displayLabel}
        </span>
        <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-full min-w-[280px] max-w-[300px] rounded-[16px] border border-border/60 bg-card/95 p-3 shadow-2xl backdrop-blur-md dark:border-white/[0.10] dark:bg-[#121826]/95">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="rounded-full border border-border/60 p-1.5 hover:bg-accent dark:border-white/[0.10] transition-colors text-foreground"
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <p className="text-xs font-bold text-foreground capitalize">
              {new Intl.DateTimeFormat(i18n.language || 'es-ES', { month: 'long', year: 'numeric' }).format(calendarMonth)}
            </p>
            <button
              type="button"
              className="rounded-full border border-border/60 p-1.5 hover:bg-accent dark:border-white/[0.10] transition-colors text-foreground"
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>

          <div className="space-y-1">
            {calendarWeeks.map((week, index) => (
              <div key={index} className="grid grid-cols-7 gap-1">
                {week.map((date, cellIndex) => {
                  const iso = date
                    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                    : null;
                  const isSelected = iso === value;
                  const isToday = iso === todayIso;
                  
                  if (!date) {
                    return <div key={cellIndex} className="h-9" />;
                  }

                  return (
                    <button
                      key={cellIndex}
                      type="button"
                      onClick={() => handleSelectDate(date)}
                      className={cn(
                        'flex h-8 items-center justify-center rounded-[9px] text-xs font-semibold transition-colors',
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow'
                          : isToday
                            ? 'border border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15'
                            : 'hover:bg-accent text-foreground'
                      )}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-3 flex justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full px-3 text-[11px] font-bold"
              onClick={handleClear}
            >
              {t('tracker.date.clear', 'Limpiar')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full px-3 text-[11px] font-bold"
              onClick={() => setIsOpen(false)}
            >
              {t('tracker.date.close', 'Cerrar')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
