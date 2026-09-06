import React, { useId } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { isLanguage, languages } from '../i18n/language';
import '../styles/language.css';

export default function LanguageMiniCard({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const { language, direction, setLanguage, t } = useLanguage();
  return (
    <div className={`language-mini-card localized-ui ${compact ? 'language-mini-card--compact' : ''}`} lang={language} dir={direction}>
      <span aria-hidden="true">🌐</span>
      <label className="sr-only" htmlFor={id}>{t('Change language')}</label>
      <select id={id} value={language} onChange={(event) => {
        if (isLanguage(event.target.value)) setLanguage(event.target.value);
      }}>
        {Object.entries(languages).map(([code, option]) => (
          <option key={code} value={code} lang={code} dir={option.direction}>{option.name}</option>
        ))}
      </select>
    </div>
  );
}
