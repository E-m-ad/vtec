import { Languages } from "lucide-react";

import { useLanguage } from "../i18n/LanguageProvider";

const LanguageToggle = ({ className = "" }) => {
  const { language, toggleLanguage } = useLanguage();
  const nextLabel = language === "ar" ? "English" : "العربية";
  const ariaLabel = language === "ar" ? "Switch to English" : "Switch to Arabic";

  return (
    <button
      aria-label={ariaLabel}
      className={["language-toggle", className].filter(Boolean).join(" ")}
      onClick={toggleLanguage}
      type="button"
    >
      <Languages size={17} aria-hidden="true" />
      <span>{nextLabel}</span>
    </button>
  );
};

export default LanguageToggle;

