const EmptyState = ({ message = "No records found", action }) => {
  return (
    <div className="empty-state">
      <p>{message}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
};

export default EmptyState;
