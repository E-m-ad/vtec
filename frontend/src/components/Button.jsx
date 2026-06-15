const Button = ({
  children,
  type = "button",
  variant = "primary",
  onClick,
  disabled = false,
  icon: Icon,
  className = "",
}) => {
  return (
    <button
      className={`btn btn-${variant} ${className}`}
      type={type}
      onClick={onClick}
      disabled={disabled}
    >
      {Icon ? <Icon size={17} aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
};

export default Button;
