import { getCurrentLocale } from "../i18n/language";

const formatDate = (value) => {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat(getCurrentLocale(), {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
};

export default formatDate;
