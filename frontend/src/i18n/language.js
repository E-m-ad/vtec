import { languages } from "./translations";

export const LANGUAGE_STORAGE_KEY = "vtec_language";

const normalizeLanguage = (language) => (language === "ar" ? "ar" : "en");

const readStoredLanguage = () => {
  try {
    return normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return "en";
  }
};

let currentLanguage = readStoredLanguage();

export const getCurrentLanguage = () => currentLanguage;

export const getCurrentLanguageMeta = () => languages[currentLanguage] || languages.en;

export const getCurrentLocale = () => getCurrentLanguageMeta().locale;

export const persistLanguage = (language) => {
  currentLanguage = normalizeLanguage(language);

  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
  } catch {
    // Storage can fail in private or locked-down browser modes.
  }

  return currentLanguage;
};

export const applyDocumentLanguage = (language = currentLanguage) => {
  const normalized = normalizeLanguage(language);
  const meta = languages[normalized] || languages.en;

  document.documentElement.lang = normalized;
  document.documentElement.dir = meta.dir;
  document.body.dataset.language = normalized;
  document.title = normalized === "ar" ? "VTEC" : "Vtec";
};

