import createError from "../utils/createError.js";

const notFoundMiddleware = (req, _res, next) => {
  next(createError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

export default notFoundMiddleware;
