const StatCard = ({ title, value, icon: Icon, tone = "neutral", subtitle }) => {
  return (
    <div className="stat-card">
      <div>
        <p>{title}</p>
        <strong>{value ?? 0}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </div>
      {Icon ? (
        <div className={`stat-icon stat-${tone}`}>
          <Icon size={22} aria-hidden="true" />
        </div>
      ) : null}
    </div>
  );
};

export default StatCard;
