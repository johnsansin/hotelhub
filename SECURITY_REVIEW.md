# Security review — 15 October 2026

## Changes

- Parameterized website booking notifications; guest names and room names no longer enter SQL text. Dynamic update field identifiers are validated.
- Enforced API module permissions, admin-only account management, hotel-role validation, tenant ownership of client-selected relationships, and hotel scoping for generic CRUD (including platform users selecting a hotel).
- Kept housekeeping/maintenance staff pickers working with a restricted staff response that excludes HR and bank data.
- Scoped notifications and AI conversation access to their intended users.
- Required current-password verification, fixed the broken admin password-reset update, removed default passwords for newly created accounts, and rejected passwords beyond bcrypt's 72-byte limit.
- Required a non-placeholder signing secret, restricted JWT verification to HS256, enabled Secure cookies in production, and blocked existing sessions for suspended hotels.
- Added browser request verification and origin checking, login/signup/public API rate limits, no-store API responses, and security headers.
- Rejected new SVG uploads, sandboxed all uploaded files (including existing SVGs), disabled MIME sniffing, forced PDF/CSV downloads, bounded multipart uploads, and randomized filenames. React's existing text escaping is preserved; no raw HTML rendering was introduced.
- Replaced new public/reception booking references with 128-bit random codes. Public lookup rejects legacy sequential references, which remain available to authorized hotel staff. Hotel settings and demo account discovery are no longer exposed publicly by default.
- Escaped spreadsheet formula prefixes in CSV exports and rejected malformed, reversed, or excessively large date ranges.
- Corrected availability fallback when existing physical rooms have zero capacity, and corrected free-room SQL placeholders when excluding a booking without selecting a room type.
- Run migrations before routes inspect schema metadata; abort startup when migrations fail.
- Updated Next.js to 15.5.28 and PostCSS to 8.5.30; override vulnerable nested PostCSS and selector-parser versions. The maintenance release addresses the [14 October upstream security advisory](https://nextjs.org/blog/nextjs-security-update-october-14-2026).

No layout, CSS, component styling, or navigation design was changed. Dynamic hotel pages use `useParams` for compatibility with Next.js 15, and the API client sends the browser-verification header automatically.

## Deployment requirements and behavior changes

1. Set `JWT_SECRET` to a unique cryptographically random value (at least 32 characters; `openssl rand -hex 32`). Docker Compose also requires an explicit `DB_PASSWORD`. Replacing an existing secret invalidates sessions.
2. Serve production over HTTPS; Secure cookies are deliberately unavailable over plain HTTP. Set `CLIENT_ORIGIN` to the exact allowed browser origin(s), comma-separated. Set `TRUST_PROXY` only to the actual trusted proxy hop count and block direct access to the API when trusting proxy headers.
3. Browser mutations require `X-Requested-With: HotelHub`. The bundled client supplies it. API integrations may use Bearer authentication.
4. Existing sequential booking codes cannot be used for anonymous lookup. Hotel staff can still find those reservations internally. New random booking codes are bearer credentials: avoid sharing them publicly.
5. Account creation now requires an explicit password. Current-password verification cannot be omitted when changing one's own password. Demo account discovery requires `ENABLE_DEMO_ACCOUNTS=true` outside production; rotate/remove any previously seeded demo credentials before production use.
6. SVG uploads are rejected; existing SVG content is sandboxed. PDF/CSV files download instead of executing inline.

## Verification

Completed: isolated security tests passed; 24 HTTP regression checks and additional SQL-payload, password, cookie, and availability assertions passed against a fresh PostgreSQL test database. Both production dependency audits reported zero known vulnerabilities. The final Next.js production build passed for all 33 pages.

Run `npm test` in `server` for isolated security tests. Run `npm run test:security` with `SECURITY_TEST_DB=isolated` and `DB_*` pointing to a disposable PostgreSQL database for migration and HTTP regression tests. The integration suite creates temporary tenants and removes them afterward. Never point it at production.

Run `npm run build` in `web`, and `npm audit --omit=dev` in both projects. The final frontend production audit reports no known vulnerabilities. The full frontend audit still reports five high-severity build-tool dependency findings involving Tailwind 3, braces, chokidar, micromatch, and fast-glob. Migrating to Tailwind 4 needs separate visual regression testing because styling must remain unchanged.

## Remaining scope

This is a targeted source review and regression suite, not proof that every business workflow is secure. Rate limiting is process-local; multiple API instances need a shared limiter or gateway policy. Upload URLs remain public and must not be used for private identity documents. Booking/payment concurrency, comprehensive financial invariants, password-change session revocation, and a full browser/visual comparison need further dedicated verification. The tests do not replace a production penetration test.
