import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { isLanguage, languages, readLanguage, saveLanguage, translate, type Language, type Translate } from '../i18n/language';
import AppLocalizationLayer from '../components/AppLocalizationLayer';

interface LanguageContextValue {
  language: Language;
  direction: 'ltr' | 'rtl';
  setLanguage: (language: Language) => void;
  t: Translate;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en', direction: 'ltr', setLanguage: () => {}, t: (key, params) => translate('en', key, params),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, updateLanguage] = useState<Language>(() => {
    try { return readLanguage(window.localStorage); } catch { return 'en'; }
  });
  const setLanguage = useCallback((next: Language) => {
    if (!isLanguage(next)) return;
    updateLanguage(next);
    try { saveLanguage(next, window.localStorage); } catch { /* Storage access may be blocked. */ }
  }, []);
  const t = useCallback<Translate>((key, params) => translate(language, key, params), [language]);
  const direction = languages[language].direction;
  const value = useMemo(() => ({ language, direction, setLanguage, t }), [language, direction, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      <AppLocalizationLayer language={language} direction={direction} setLanguage={setLanguage}>
        {children}
      </AppLocalizationLayer>
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
