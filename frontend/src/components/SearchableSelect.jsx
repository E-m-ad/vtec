import { ChevronDown, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

const defaultValue = (option) => option?.value ?? option?.id ?? "";
const defaultLabel = (option) => option?.label ?? option?.name ?? String(defaultValue(option));

const normalize = (value) => String(value ?? "").toLowerCase();

const SearchableSelect = ({
  className = "",
  disabled = false,
  emptyLabel = "",
  getOptionDescription,
  getOptionLabel = defaultLabel,
  getOptionSearchText,
  getOptionValue = defaultValue,
  label,
  noOptionsMessage = "No matches found",
  onChange,
  onSearchChange,
  options = [],
  placeholder = "Search",
  value,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const blurTimer = useRef(null);

  const normalizedOptions = useMemo(
    () =>
      options.map((option) => {
        const optionValue = String(getOptionValue(option) ?? "");
        const optionLabel = String(getOptionLabel(option) ?? "");
        const description = getOptionDescription ? String(getOptionDescription(option) || "") : "";
        const searchText = getOptionSearchText
          ? String(getOptionSearchText(option) || "")
          : [optionLabel, description].filter(Boolean).join(" ");

        return {
          description,
          label: optionLabel,
          option,
          searchText: normalize(searchText),
          value: optionValue,
        };
      }),
    [getOptionDescription, getOptionLabel, getOptionSearchText, getOptionValue, options],
  );

  const selected = normalizedOptions.find((option) => option.value === String(value ?? ""));
  const normalizedQuery = normalize(query.trim());
  const filteredOptions = normalizedQuery
    ? normalizedOptions.filter((option) => option.searchText.includes(normalizedQuery)).slice(0, 40)
    : normalizedOptions.slice(0, 40);
  const inputValue = open ? query : selected?.label || "";

  const selectOption = (optionValue, option = null) => {
    onChange?.(optionValue, option);
    setQuery("");
    setOpen(false);
  };

  const handleBlur = () => {
    blurTimer.current = window.setTimeout(() => {
      setOpen(false);
      setQuery("");
    }, 120);
  };

  const handleFocus = () => {
    if (blurTimer.current) window.clearTimeout(blurTimer.current);
    setOpen(true);
    setQuery("");
    onSearchChange?.("");
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      return;
    }

    if (event.key !== "Enter") return;
    if (!open) return;

    event.preventDefault();
    if (filteredOptions.length) {
      const firstOption = filteredOptions[0];
      selectOption(firstOption.value, firstOption.option);
    }
  };

  const control = (
    <div className={`searchable-select ${className}`}>
      <div className="searchable-select-control">
        <input
          className="input"
          disabled={disabled}
          onBlur={handleBlur}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setOpen(true);
            onSearchChange?.(nextQuery);
          }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={selected ? "Search to change" : placeholder}
          value={inputValue}
        />
        {selected && !disabled ? (
          <button
            aria-label="Clear selection"
            className="searchable-select-icon"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectOption("")}
            type="button"
          >
            <X size={15} />
          </button>
        ) : (
          <span className="searchable-select-icon" aria-hidden="true">
            <ChevronDown size={15} />
          </span>
        )}
      </div>

      {open && !disabled ? (
        <div className="searchable-select-menu" role="listbox">
          {emptyLabel ? (
            <button
              className="searchable-select-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption("")}
              type="button"
            >
              <strong>{emptyLabel}</strong>
            </button>
          ) : null}
          {filteredOptions.length ? (
            filteredOptions.map((option) => (
              <button
                className="searchable-select-option"
                key={option.value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option.value, option.option)}
                type="button"
              >
                <strong>{option.label}</strong>
                {option.description ? <small>{option.description}</small> : null}
              </button>
            ))
          ) : (
            <div className="searchable-select-empty">{noOptionsMessage}</div>
          )}
        </div>
      ) : null}
    </div>
  );

  if (!label) return control;

  return (
    <div className="form-field">
      <span>{label}</span>
      {control}
    </div>
  );
};

export default SearchableSelect;
