const errorMiddleware = (error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: error.message || 'Internal server error',
    details: error.details,
    stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
  });
};

export default errorMiddleware;
