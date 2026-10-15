import { ApiError } from '../utils/api.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}`, code: 'not_found' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const payload = {
    message: status === 500 ? 'Something went wrong on our side' : err.message,
    code: err.code || 'error',
  };
  if (err instanceof ApiError) payload.message = err.message;
  if (process.env.NODE_ENV !== 'production' && status === 500) payload.detail = err.message;
  if (status >= 500) console.error('[error]', req.method, req.originalUrl, err);
  res.status(status).json(payload);
}
