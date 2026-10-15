'use client';

const BASE = '/api';

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request(path, { method = 'GET', body, headers, cache = 'no-store' } = {}) {
  const opts = {
    method,
    cache,
    credentials: 'include',
    headers: {
      'X-Requested-With': 'HotelHub',
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  };
  if (body) opts.body = body instanceof FormData ? body : JSON.stringify(body);

  let res;
  try {
    res = await fetch(`${BASE}${path}`, opts);
  } catch (e) {
    throw new ApiError('Cannot reach the server. Is the API running?', 0, null);
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!res.ok) {
    const message = data?.message || data?.error?.message || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }
  return data;
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  del: (path, body, opts) => request(path, { ...opts, method: 'DELETE', body }),
  upload: (path, formData, opts) => request(path, { ...opts, method: 'POST', body: formData }),
};

export function qs(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '' || v === false) return;
    search.set(k, v);
  });
  const s = search.toString();
  return s ? `?${s}` : '';
}

export { ApiError };
