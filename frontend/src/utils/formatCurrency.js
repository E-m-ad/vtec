import { getCurrentLanguage, getCurrentLocale } from "../i18n/language";

const formatCurrency = (value) => {
  const number = Number(value ?? 0);
  const language = getCurrentLanguage();
  const currencyFormatter = new Intl.NumberFormat(getCurrentLocale(), {
    style: "currency",
    currency: "EGP",
    currencyDisplay: language === "ar" ? "symbol" : "code",
    minimumFractionDigits: 2,
  });

  return currencyFormatter.format(Number.isFinite(number) ? number : 0);
};

export default formatCurrency;
