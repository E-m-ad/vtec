import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  applyDocumentLanguage,
  getCurrentLanguage,
  getCurrentLanguageMeta,
  persistLanguage,
} from "./language";
import { applyRuntimeTranslations, startRuntimeTranslationObserver } from "./runtime";
import { languages, translateUiText } from "./translations";

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(getCurrentLanguage());

  const setLanguage = (nextLanguage) => {
    const persisted = persistLanguage(nextLanguage);
    setLanguageState(persisted);
  };

  const toggleLanguage = () => setLanguage(language === "ar" ? "en" : "ar");

  useEffect(() => {
    persistLanguage(language);
    applyDocumentLanguage(language);
    applyRuntimeTranslations(language);

    const stopObserver = startRuntimeTranslationObserver(() => getCurrentLanguage());
    return stopObserver;
  }, [language]);

  const value = useMemo(
    () => ({
      direction: getCurrentLanguageMeta().dir,
      language,
      languages,
      locale: getCurrentLanguageMeta().locale,
      setLanguage,
      t: (text) => translateUiText(text, language),
      toggleLanguage,
    }),
    [language],
  );

  return (
    <LanguageContext.Provider value={value}>
      <Fragment key={language}>{children}</Fragment>
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context) return context;

  return {
    direction: "ltr",
    language: "en",
    languages,
    locale: languages.en.locale,
    setLanguage: () => {},
    t: (text) => text,
    toggleLanguage: () => {},
  };
};
