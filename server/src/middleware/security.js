import { ApiError, forbidden } from '../utils/api.js';

export function securityHeaders(_req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  });
  next();
}

// A custom header cannot be submitted by a cross-site HTML form. Browsers
// preflight cross-origin fetches, which must also pass the origin allowlist.
export function csrfProtection(origins) {
  const allowed = new Set(origins);
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.headers.authorization?.startsWith('Bearer ')) return next();
    if (req.headers['x-requested-with'] !== 'HotelHub') return next(forbidden('Request verification failed'));
    const origin = req.headers.origin;
    if (origin && !allowed.has(origin)) return next(forbidden('Origin is not allowed'));
    next();
  };
}

// Bounded, process-local limits. Multi-instance deployments need a shared edge limit.
export function rateLimit({ limit = 20, windowMs = 15 * 60 * 1000 } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of buckets) if (value.reset <= now) buckets.delete(key);
    const key = req.ip || req.socket.remoteAddress;
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= 10000) return next(new ApiError(429, 'Please try again later', 'rate_limited'));
      bucket = { count: 0, reset: now + windowMs };
      buckets.set(key, bucket);
    }
    if (++bucket.count > limit) {
      res.set('Retry-After', String(Math.ceil((bucket.reset - now) / 1000)));
      return next(new ApiError(429, 'Too many requests, please try again later', 'rate_limited'));
    }
    next();
  };
}

export function uploadHeaders(res, filePath) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
  if (/\.(pdf|csv)$/i.test(filePath)) res.set('Content-Disposition', 'attachment');
}
