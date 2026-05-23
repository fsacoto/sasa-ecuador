'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../context/TranslationContext';
import { useDarkMode } from '../../hooks/useDarkMode';
import {
  buildCalendarMonth,
  formatMonthYearEs,
  isIsoInRange,
  parseIsoDate,
  toIsoDate,
  weekdayLabelsEs,
} from '../../utils/calendarUtils';

export type DateInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
  'aria-label'?: string;
};

export const DATE_INPUT_TRIGGER_CLASS =
  'flex w-full min-w-[9.5rem] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#515151] disabled:cursor-not-allowed disabled:opacity-50';

export default function DateInput({
  value,
  onChange,
  className,
  inputClassName,
  id: idProp,
  required,
  disabled,
  min,
  max,
  placeholder,
  'aria-label': ariaLabel,
}: DateInputProps) {
  const { t } = useTranslation();
  const darkMode = useDarkMode();
  const autoId = useId();
  const id = idProp ?? autoId;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const selected = parseIsoDate(value);
  const todayIso = toIsoDate(new Date());
  const [viewYear, setViewYear] = useState(() => selected?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => selected?.getMonth() ?? new Date().getMonth());

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const d = parseIsoDate(value) ?? new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [open, value]);

  const syncPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const popW = 288;
    const pad = 8;
    let left = r.left;
    left = Math.max(pad, Math.min(left, window.innerWidth - popW - pad));
    setPos({ top: r.bottom + 6, left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    syncPosition();
  }, [open, syncPosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => syncPosition();
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    document.addEventListener('mousedown', onDocMouseDown);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
      document.removeEventListener('mousedown', onDocMouseDown);
    };
  }, [open, syncPosition]);

  const cells = useMemo(() => buildCalendarMonth(viewYear, viewMonth), [viewYear, viewMonth]);
  const weekdays = useMemo(() => weekdayLabelsEs(), []);

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const pickDay = (iso: string) => {
    if (!isIsoInRange(iso, min, max)) return;
    onChange(iso);
    setOpen(false);
  };

  const display = value
    ? (parseIsoDate(value)?.toLocaleDateString('es-EC', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
      }) ?? value)
    : placeholder ?? t('common.selectDate');
  const triggerClass = inputClassName ?? DATE_INPUT_TRIGGER_CLASS;

  const popover = open && mounted ? (
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('common.selectDate')}
      className={`sasa-date-picker fixed z-[120] w-72 overflow-hidden rounded-xl border shadow-xl ${
        darkMode ? 'sasa-date-picker-dark border-white/15 bg-[#141414]' : 'border-gray-200 bg-white'
      }`}
      style={{ top: pos.top, left: pos.left }}
    >
      <div
        className={`flex items-center justify-between border-b px-3 py-2.5 ${
          darkMode ? 'border-white/10' : 'border-gray-100'
        }`}
      >
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className={`rounded-md p-1.5 transition-colors ${
            darkMode ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-gray-100'
          }`}
          aria-label={t('common.previous')}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          {formatMonthYearEs(viewYear, viewMonth)}
        </p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className={`rounded-md p-1.5 transition-colors ${
            darkMode ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-gray-100'
          }`}
          aria-label={t('common.next')}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 px-2 pt-2">
        {weekdays.map((label, i) => (
          <div
            key={`${label}-${i}`}
            className={`pb-1 text-center text-[10px] font-semibold uppercase tracking-wide ${
              darkMode ? 'text-gray-500' : 'text-gray-400'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
        {cells.map((cell) => {
          const disabledDay = !isIsoInRange(cell.iso, min, max);
          const isSelected = value === cell.iso;
          const isToday = cell.iso === todayIso;
          return (
            <button
              key={cell.iso}
              type="button"
              disabled={disabledDay}
              onClick={() => pickDay(cell.iso)}
              className={`flex h-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors ${
                disabledDay
                  ? 'cursor-not-allowed opacity-30'
                  : isSelected
                    ? 'bg-[#515151] font-semibold text-white'
                    : isToday
                      ? darkMode
                        ? 'border border-white/30 font-medium text-white hover:bg-white/10'
                        : 'border border-[#515151] font-medium text-gray-900 hover:bg-gray-100'
                      : cell.inMonth
                        ? darkMode
                          ? 'text-gray-200 hover:bg-white/10'
                          : 'text-gray-800 hover:bg-gray-100'
                        : darkMode
                          ? 'text-gray-600 hover:bg-white/5'
                          : 'text-gray-400 hover:bg-gray-50'
              }`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      <div
        className={`flex justify-between gap-2 border-t px-3 py-2.5 ${
          darkMode ? 'border-white/10' : 'border-gray-100'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            onChange('');
            setOpen(false);
          }}
          className={`text-xs font-medium transition-colors ${
            darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {t('common.clearDate')}
        </button>
        <button
          type="button"
          onClick={() => pickDay(todayIso)}
          disabled={!isIsoInRange(todayIso, min, max)}
          className={`text-xs font-medium transition-colors ${
            darkMode ? 'text-gray-300 hover:text-white' : 'text-[#515151] hover:text-black'
          } disabled:opacity-40`}
        >
          {t('common.today')}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? t('common.selectDate')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`${triggerClass} ${!value ? (darkMode ? 'text-gray-500' : 'text-gray-400') : ''} ${
          darkMode ? 'sasa-date-input-trigger-dark border-white/20 bg-white/5 text-white hover:border-white/30' : ''
        }`}
      >
        <svg
          className={`h-4 w-4 shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
          />
        </svg>
        <span className="min-w-0 flex-1 truncate">{display}</span>
      </button>
      {required && !value ? (
        <input tabIndex={-1} required className="sr-only" value="" readOnly aria-hidden onChange={() => {}} />
      ) : null}
      {mounted && popover ? createPortal(popover, document.body) : null}
    </div>
  );
}
