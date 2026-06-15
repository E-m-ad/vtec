const FormInput = ({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder = "",
  error,
  disabled = false,
  min,
  step,
  onBlur,
  onKeyDown,
}) => {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        className="input"
        name={name}
        value={value ?? ""}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        step={step}
      />
      {error ? <small className="error-text">{error}</small> : null}
    </label>
  );
};

export default FormInput;
