'use client';

import { useMemo, useState } from 'react';
import { Star, MessageSquareHeart, Trash2, RefreshCw, AlertTriangle, Send } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { useList, useDebounced } from '@/lib/hooks';
import { api } from '@/lib/api';
import { num, pct, fmtDateTime } from '@/lib/format';
import { StatCard, EmptyState, Field, PageLoader, Badge } from '@/components/ui/kit';
import { DataTable, SearchInput, Select, PaginationBar, Toggle } from '@/components/ui/table';
import { Drawer, ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const PAGE_SIZE = 10;

function Stars({ rating = 0, size = 14 }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= Number(rating) ? 'fill-amber-400 text-amber-400' : 'text-ink-300'}
        />
      ))}
    </span>
  );
}

export default function ReviewsPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [ratingFilter, setRatingFilter] = useState('');
  const [pubFilter, setPubFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const params = useMemo(() => {
    const p = { limit: 200, sort: 'created_at', dir: 'desc' };
    if (debouncedQ) p.q = debouncedQ;
    if (ratingFilter) p.rating = ratingFilter;
    if (pubFilter) p.is_published = pubFilter;
    return p;
  }, [debouncedQ, ratingFilter, pubFilter]);

  const { items, loading, error, reload } = useList('/reviews', params);

  const stats = useMemo(() => {
    const total = items.length;
    const avg = total ? items.reduce((s, r) => s + Number(r.rating || 0), 0) / total : 0;
    const published = items.filter((r) => r.is_published).length;
    const replied = items.filter((r) => r.response).length;
    const low = items.filter((r) => Number(r.rating) <= 3).length;
    return { total, avg, published, pending: total - published, replied, low, responseRate: total ? Math.round((replied / total) * 100) : 0 };
  }, [items]);

  const rows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, page]);

  function openReview(r) {
    setSelected(r);
    setReply(r.response || '');
  }

  async function patch(payload, okMsg) {
    setSaving(true);
    try {
      await api.put(`/reviews/${selected.id}`, payload);
      setSelected({ ...selected, ...payload });
      toast.success(okMsg);
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeReview() {
    const id = confirm.id;
    setConfirm(null);
    try {
      await api.del(`/reviews/${id}`);
      if (selected?.id === id) setSelected(null);
      toast.success('Review deleted');
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Guest reviews"
        subtitle="Ratings, comments and public responses"
        actions={
          <button className="btn-secondary" onClick={reload}>
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Average rating" value={`${stats.avg.toFixed(1)} / 5`} sub={`${stats.total} reviews`} icon={Star} tone="amber" />
        <StatCard label="Published" value={num(stats.published)} sub={`${stats.pending} awaiting review`} icon={MessageSquareHeart} tone="emerald" />
        <StatCard label="Response rate" value={pct(stats.responseRate)} sub={`${stats.replied} replied`} icon={Send} tone="brand" />
        <StatCard label="Low ratings" value={num(stats.low)} sub="3 stars or less" icon={AlertTriangle} tone="rose" />
      </div>

      <div className="card">
        <div className="flex flex-wrap items-end gap-3 border-b border-ink-100 p-4">
          <SearchInput value={q} onChange={setQ} placeholder="Search guests or comments…" className="w-full sm:w-72" />
          <Select value={ratingFilter} onChange={(v) => { setRatingFilter(v); setPage(1); }} className="w-40">
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{n} stars</option>
            ))}
          </Select>
          <Select value={pubFilter} onChange={(v) => { setPubFilter(v); setPage(1); }} className="w-44">
            <option value="">All visibility</option>
            <option value="true">Published</option>
            <option value="false">Unpublished</option>
          </Select>
        </div>

        {loading ? (
          <PageLoader label="Loading reviews…" />
        ) : error ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <AlertTriangle size={24} className="text-rose-500" />
            <p className="text-sm text-ink-500">{error.message}</p>
            <button className="btn-secondary btn-sm" onClick={reload}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : (
          <>
            <DataTable
              rows={rows}
              columns={[
                {
                  key: 'guest_name',
                  label: 'Guest',
                  render: (r) => (
                    <div className="min-w-[160px]">
                      <p className="font-medium text-ink-900">{r.guest_name || 'Anonymous'}</p>
                      <p className="text-[12px] text-ink-400">{fmtDateTime(r.created_at)}</p>
                    </div>
                  ),
                },
                { key: 'rating', label: 'Rating', render: (r) => <Stars rating={r.rating} /> },
                { key: 'category', label: 'Category', render: (r) => (r.category ? <Badge>{r.category.replace(/_/g, ' ')}</Badge> : '—') },
                {
                  key: 'comment',
                  label: 'Comment',
                  render: (r) => <p className="max-w-[340px] truncate text-ink-600">{r.comment || '—'}</p>,
                },
                {
                  key: 'response',
                  label: 'Reply',
                  render: (r) =>
                    r.response ? (
                      <span className="text-[12.5px] text-emerald-600">Replied</span>
                    ) : (
                      <span className="text-[12.5px] text-ink-400">None</span>
                    ),
                },
                {
                  key: 'is_published',
                  label: 'Visibility',
                  render: (r) =>
                    r.is_published ? (
                      <Badge tone="bg-emerald-100 text-emerald-700">Published</Badge>
                    ) : (
                      <Badge tone="bg-ink-100 text-ink-600">Hidden</Badge>
                    ),
                },
                {
                  key: 'actions',
                  label: '',
                  render: (r) => (
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => openReview(r)}
                        title="Reply"
                      >
                        <MessageSquareHeart size={15} />
                      </button>
                      <button
                        className="btn-ghost btn-sm text-rose-500 hover:text-rose-600"
                        onClick={() => setConfirm(r)}
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ),
                },
              ]}
              onRowClick={openReview}
              empty={
                <EmptyState
                  icon={MessageSquareHeart}
                  title="No reviews found"
                  message={q || ratingFilter || pubFilter ? 'Try clearing the filters.' : 'Guest feedback will show up here.'}
                />
              }
            />
            {items.length > PAGE_SIZE && (
              <PaginationBar page={page} pageSize={PAGE_SIZE} total={items.length} onPage={setPage} />
            )}
          </>
        )}
      </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)} className="w-[min(480px,100vw)]">
        {selected && (
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-6 py-4">
              <div>
                <p className="text-base font-semibold text-ink-900">{selected.guest_name || 'Anonymous'}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Stars rating={selected.rating} size={15} />
                  <span className="text-[12.5px] font-semibold text-ink-700">{selected.rating}/5</span>
                  <span className="text-[12.5px] text-ink-400">{fmtDateTime(selected.created_at)}</span>
                </div>
              </div>
              <button
                className="btn-ghost btn-sm"
                onClick={() => setConfirm(selected)}
                title="Delete review"
              >
                <Trash2 size={16} className="text-rose-500" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="flex flex-wrap items-center gap-2">
                {selected.category && <Badge>{selected.category.replace(/_/g, ' ')}</Badge>}
                {selected.booking_code && <Badge tone="bg-brand-50 text-brand-700">{selected.booking_code}</Badge>}
                {selected.booking_id && !selected.booking_code && <Badge tone="bg-brand-50 text-brand-700">Booking</Badge>}
              </div>

              <div>
                <p className="label">Guest comment</p>
                <p className="rounded-2xl bg-ink-50 p-4 text-[14px] leading-relaxed text-ink-700">
                  {selected.comment || 'No comment left.'}
                </p>
              </div>

              <div>
                <Field label="Your reply" hint="Shown to the guest and on the public review when published">
                  <textarea
                    className="input min-h-[120px] resize-y"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Thank the guest and address their feedback…"
                  />
                </Field>
                <button
                  className="btn-primary mt-2"
                  disabled={saving || reply === (selected.response || '')}
                  onClick={() => patch({ response: reply }, 'Reply saved')}
                >
                  {saving ? 'Saving…' : 'Save reply'}
                </button>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-ink-100 px-4 py-3">
                <div>
                  <p className="text-[13.5px] font-semibold text-ink-800">Publish on website</p>
                  <p className="text-[12px] text-ink-400">Hidden reviews stay internal</p>
                </div>
                <Toggle
                  checked={!!selected.is_published}
                  onChange={(v) => patch({ is_published: v }, v ? 'Review published' : 'Review hidden')}
                />
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={removeReview}
        title="Delete review"
        message={`Delete the review by ${confirm?.guest_name || 'this guest'}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
