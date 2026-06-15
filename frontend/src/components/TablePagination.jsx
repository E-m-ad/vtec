import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { useLanguage } from "../i18n/LanguageProvider";

const formatNumber = (value, locale) =>
  new Intl.NumberFormat(locale).format(Number(value ?? 0));

const TablePagination = ({
  itemLabel = "products",
  loading = false,
  onPageChange,
  page,
  pageCount,
  total,
  firstItem,
  lastItem,
}) => {
  const { locale, t } = useLanguage();
  const [pageDraft, setPageDraft] = useState(String(page));
  const normalizedTotal = Number(total || 0);
  const normalizedPageCount = Math.max(Number(pageCount || 1), 1);
  const normalizedFirst = normalizedTotal ? Number(firstItem || 0) : 0;
  const normalizedLast = normalizedTotal ? Number(lastItem || 0) : 0;
  const canGoPrevious = !loading && page > 1;
  const canGoNext = !loading && page < normalizedPageCount;

  useEffect(() => {
    setPageDraft(String(page));
  }, [page]);

  const commitPage = (value = pageDraft) => {
    const nextPage = Number(value);
    if (!Number.isInteger(nextPage)) {
      setPageDraft(String(page));
      return;
    }

    const clampedPage = Math.min(Math.max(nextPage, 1), normalizedPageCount);
    setPageDraft(String(clampedPage));
    if (clampedPage !== page) onPageChange(clampedPage);
  };

  const rangeText = `${formatNumber(normalizedFirst, locale)}-${formatNumber(normalizedLast, locale)}`;
  const totalText = formatNumber(normalizedTotal, locale);
  const pageCountText = formatNumber(normalizedPageCount, locale);
  const ofLabel = t("of");
  const translatedItemLabel = t(itemLabel);

  return (
    <div className="table-pagination">
      <div className="pagination-summary" aria-live="polite">
        <bdi className="pagination-number-range" dir="ltr">
          {rangeText}
        </bdi>
        <span>{ofLabel}</span>
        <bdi>{totalText}</bdi>
        <span>{translatedItemLabel}</span>
      </div>
      <div className="pagination-controls">
        <button
          className="btn btn-secondary btn-small"
          disabled={!canGoPrevious}
          onClick={() => onPageChange(Math.max(page - 1, 1))}
          type="button"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          <span>{t("Previous")}</span>
        </button>
        <label className="pagination-page-input">
          <span>{t("Page")}</span>
          <input
            className="input"
            min="1"
            max={normalizedPageCount}
            onBlur={() => commitPage()}
            onChange={(event) => setPageDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            type="number"
            value={pageDraft}
          />
          <span>{ofLabel}</span>
          <bdi>{pageCountText}</bdi>
        </label>
        <button
          className="btn btn-secondary btn-small"
          disabled={!canGoNext}
          onClick={() => onPageChange(Math.min(page + 1, normalizedPageCount))}
          type="button"
        >
          <span>{t("Next")}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default TablePagination;
