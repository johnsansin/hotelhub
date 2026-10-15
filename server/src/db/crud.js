import { Router } from 'express';
import { many, one, sql } from '../db/pool.js';
import {
  parsePaging, listResponse, notFound, badRequest, asyncHandler, setClause,
} from '../utils/api.js';

const RESERVED = new Set(['id', 'created_at', 'updated_at', 'password_hash']);

/**
 * Build a tenant-scoped CRUD router for a table.
 *
 * config:
 *  - table (required)
 *  - resource: label for errors
 *  - search: columns to text-search with ?q=
 *  - defaultSort / sortable: whitelist for ?sort=
 *  - select / joins / where(req, params): custom list SQL
 *  - writable: whitelist of columns for create/update (default: all non-reserved)
 *  - readOnly: columns returned but never writable
 *  - create: false / update: false / remove: false to disable
 *  - beforeWrite(body, req): mutate payload
 *  - requireHotel: default true
 */
export async function crud(config) {
  const {
    table,
    resource = table,
    search = [],
    defaultSort = 'created_at',
    sortable = null,
    select = `${table}.*`,
    joins = '',
    writable: writableOverride = null,
    readOnly = [],
    create: canCreate = true,
    update: canUpdate = true,
    remove: canRemove = true,
    beforeWrite = null,
    afterCreate = null,
    softDelete = false,
    custom = null,
  } = config;

  const colRows = await sql(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1`,
    [table]
  );
  const columns = colRows.rows.map((r) => r.column_name);
  const has = (c) => columns.includes(c);
  const hotelScoped = has('hotel_id');
  const writableCols = writableOverride
    ? columns.filter((c) => writableOverride.includes(c) || (hotelScoped && c === 'hotel_id'))
    : columns.filter((c) => !RESERVED.has(c) && !readOnly.includes(c));
  const sortWhitelist = sortable || (columns.length ? columns : [defaultSort]);

  const r = Router();

  // ---------- LIST ----------
  r.get(
    '/',
    asyncHandler(async (req, res) => {
      const { page, limit, offset, sort, dir } = parsePaging(req);
      const params = [];
      const where = [];

      if (hotelScoped && !config.where) {
        params.push(req.hotelId);
        where.push(`${table}.hotel_id = $${params.length}`);
      }
      if (config.where) {
        const extra = config.where(req, params.length);
        if (extra?.clause) where.push(extra.clause);
        if (extra?.params) params.push(...extra.params);
      }

      const q = String(req.query.q || '').trim();
      if (q && search.length) {
        params.push(`%${q}%`);
        const p = `$${params.length}`;
        where.push(`(${search.map((c) => `${table}.${c} ILIKE ${p}`).join(' OR ')})`);
      }

      // equality filters from query for known columns
      for (const c of columns) {
        if (c === 'hotel_id') continue;
        if (req.query[c] !== undefined && req.query[c] !== '') {
          params.push(req.query[c]);
          where.push(`${table}.${c} = $${params.length}`);
        }
      }
      // date ranges: start_field / end_field handled by callers via config

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const sortCol = sortWhitelist.includes(sort) ? sort : defaultSort;
      const sortSql = sortCol.includes('.') ? sortCol : `${table}.${sortCol}`;
      const orderDir = dir === 'ASC' ? 'ASC' : 'DESC';

      const countSql = `SELECT count(*)::int AS c FROM ${table} ${joins} ${whereSql}`;
      const totalRes = await sql(countSql, params);
      const total = totalRes.rows[0].c;

      const listSql = `SELECT ${select} FROM ${table} ${joins} ${whereSql}
                       ORDER BY ${sortSql} ${orderDir} NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      const rows = await sql(listSql, [...params, limit, offset]);
      res.json(listResponse(rows.rows, total, { page, limit }));
    })
  );

  // ---------- GET ONE ----------
  if (true) {
    r.get(
      '/:id',
      asyncHandler(async (req, res) => {
        const params = [req.params.id];
        let scope = '';
        if (hotelScoped) {
          if (!req.isSuper) {
            params.push(req.hotelId);
            scope = ` AND ${table}.hotel_id = $2`;
          }
        }
        const row = await one(
          `SELECT ${select} FROM ${table} ${joins} WHERE ${table}.id = $1${scope}`,
          params
        );
        if (!row) throw notFound(`${resource} not found`);
        res.json(row);
      })
    );
  }

  // ---------- CREATE ----------
  if (canCreate) {
    r.post(
      '/',
      asyncHandler(async (req, res) => {
        let body = { ...req.body };
        delete body.id;
        delete body.hotelId;
        if (hotelScoped) body.hotel_id = req.hotelId;
        if (beforeWrite) body = await beforeWrite(body, req, 'create');

        const keys = Object.keys(body).filter((k) => writableCols.includes(k));
        if (!keys.length) throw badRequest('No valid fields supplied');
        const vals = keys.map((k) => body[k]);
        const colsSql = keys.map((k) => `"${k}"`).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const row = await one(
          `INSERT INTO ${table} (${colsSql}) VALUES (${placeholders}) RETURNING *`,
          vals
        );
        if (afterCreate) await afterCreate(row, req);
        res.status(201).json(row);
      })
    );
  }

  // ---------- UPDATE ----------
  if (canUpdate) {
    r.put(
      '/:id',
      asyncHandler(async (req, res) => {
        let body = { ...req.body };
        delete body.id;
        delete body.hotel_id;
        delete body.hotelId;
        if (beforeWrite) body = await beforeWrite(body, req, 'update');

        const keys = Object.keys(body).filter((k) => writableCols.includes(k));
        if (!keys.length) throw badRequest('No valid fields supplied');
        const { clause, vals } = setClause(
          Object.fromEntries(keys.map((k) => [k, body[k]]))
        );
        const params = [...vals, req.params.id];
        let scope = '';
        if (hotelScoped && !req.isSuper) {
          params.push(req.hotelId);
          scope = ` AND hotel_id = $${params.length}`;
        }
        const row = await one(
          `UPDATE ${table} SET ${clause} WHERE id = $${vals.length + 1}${scope} RETURNING *`,
          params
        );
        if (!row) throw notFound(`${resource} not found`);
        res.json(row);
      })
    );
  }

  // ---------- DELETE ----------
  if (canRemove) {
    r.delete(
      '/:id',
      asyncHandler(async (req, res) => {
        const params = [req.params.id];
        let scope = '';
        if (hotelScoped && !req.isSuper) {
          params.push(req.hotelId);
          scope = ` AND hotel_id = $${params.length}`;
        }
        if (softDelete && has('is_active')) {
          const row = await one(
            `UPDATE ${table} SET is_active = false WHERE id = $1${scope} RETURNING id`,
            params
          );
          if (!row) throw notFound(`${resource} not found`);
        } else {
          const r2 = await sql(`DELETE FROM ${table} WHERE id = $1${scope}`, params);
          if (!r2.rowCount) throw notFound(`${resource} not found`);
        }
        res.json({ deleted: true });
      })
    );
  }

  if (custom) await custom(r, config);
  return r;
}

export { listResponse };
