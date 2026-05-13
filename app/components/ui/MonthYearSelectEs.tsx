'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../context/TranslationContext';

const MONTH_CODES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] as const;

const DEFAULT_SELECT_CLASS =
  'min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#515151]';

type MonthYearSelectEsProps = {
  value: string;
  onChange: (yyyyMm: string) => void;
  /** Classes applied to both native selects */
  selectClassName?: string;
};

/** Mes y año en español (evita `input type="month"`, que suele seguir el idioma del SO). Valor: `YYYY-MM` o cadena vacía. */
export default function MonthYearSelectEs({ value, onChange, selectClassName }: MonthYearSelectEsProps) {
  const { t } = useTranslation();
  const [y, setY] = useState('');
  const [m, setM] = useState('');

  useEffect(() => {
    if (!value || !value.includes('-')) {
      setY('');
      setM('');
      return;
    }
    const [yy, rawM] = value.split('-');
    setY(yy || '');
    if (!rawM) {
      setM('');
      return;
    }
    const mo = rawM.length === 1 ? `0${rawM}` : rawM.slice(0, 2);
    setM(mo);
  }, [value]);

  const years = useMemo(() => {
    const cy = new Date().getFullYear();
    const list: number[] = [];
    for (let yr = cy + 1; yr >= cy - 10; yr--) list.push(yr);
    return list;
  }, []);

  const cls = selectClassName ?? DEFAULT_SELECT_CLASS;

  const commit = (nextY: string, nextM: string) => {
    setY(nextY);
    setM(nextM);
    if (nextY && nextM) onChange(`${nextY}-${nextM}`);
    else onChange('');
  };

  return (
    <div className="flex w-full gap-2">
      <select
        aria-label={t('common.monthYearMonthAria')}
        className={cls}
        value={m}
        onChange={(e) => commit(y, e.target.value)}
      >
        <option value="">{t('salesNotes.all')}</option>
        {MONTH_CODES.map((code) => (
          <option key={code} value={code}>
            {t(`common.monthName.${code}`)}
          </option>
        ))}
      </select>
      <select
        aria-label={t('common.monthYearYearAria')}
        className={cls}
        value={y}
        onChange={(e) => commit(e.target.value, m)}
      >
        <option value="">{t('salesNotes.all')}</option>
        {years.map((yr) => (
          <option key={yr} value={String(yr)}>
            {yr}
          </option>
        ))}
      </select>
    </div>
  );
}
