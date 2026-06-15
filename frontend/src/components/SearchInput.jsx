import { Search } from "lucide-react";

const SearchInput = ({
  value,
  onBlur,
  onChange,
  onKeyDown,
  placeholder = "Search",
}) => {
  return (
    <label className="search-input">
      <Search size={18} aria-hidden="true" />
      <input
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
    </label>
  );
};

export default SearchInput;
