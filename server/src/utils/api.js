export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'error';
  }
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function badRequest(msg = 'Bad request') { return new ApiError(400, msg, 'bad_request'); }
export function unauthorized(msg = 'Unauthorized') { return new ApiError(401, msg, 'unauthorized'); }
export function forbidden(msg = 'Forbidden') { return new ApiError(403, msg, 'forbidden'); }
export function notFound(msg = 'Not found') { return new ApiError(404, msg, 'not_found'); }
export function conflict(msg = 'Conflict') { return new ApiError(409, msg, 'conflict'); }

export function parsePaging(req, { defaultLimit = 20, maxLimit = 200 } = {}) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit, 10) || defaultLimit));
  const offset = (page - 1) * limit;
  const sort = (req.query.sort || '').toString();
  const dir = String(req.query.dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { page, limit, offset, sort, dir };
}

export function listResponse(rows, total, { page, limit }) {
  return {
    items: rows,
    total: Number(total || 0),
    page,
    limit,
    pages: Math.ceil(Number(total || 0) / limit) || 1,
  };
}

/** build "SET a=$1, b=$2" fragment from a partial object */
export function setClause(obj, startIndex = 1) {
  const keys = Object.keys(obj);
  const cols = [];
  const vals = [];
  let i = startIndex;
  for (const k of keys) {
    if (!/^[a-z_][a-z0-9_]*$/.test(k)) throw badRequest('Invalid field name');
    cols.push(`"${k}"=$${i}`);
    vals.push(obj[k]);
    i++;
  }
  return { clause: cols.join(', '), vals };
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function todayStr(d = new Date()) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const valid = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
    && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  if (!valid(a) || !valid(b)) throw badRequest('Valid dates are required');
  const days = (Date.parse(b) - Date.parse(a)) / 86400000;
  if (days < 1 || days > 366) throw badRequest('Date range must be between 1 and 366 nights');
  return days;
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

export function monthRange(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  const start = todayStr(d);
  const d2 = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const end = todayStr(d2);
  return { start, end, label: d.toLocaleString('en', { month: 'short', year: 'numeric' }) };
}
