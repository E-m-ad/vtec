const createError = (message, statusCode = 500, details = undefined) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) {
    error.details = details;
  }
  return error;
};

export default createError;
