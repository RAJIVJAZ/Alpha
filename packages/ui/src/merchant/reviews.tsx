'use client';

import * as React from 'react';
import { MessageSquareReply, Star } from 'lucide-react';
import { Button } from '../components/button';
import { Card, CardContent } from '../components/card';
import { Textarea } from '../components/form';
import { EmptyState, FilterBar, PageHeader } from '../components/layout';
import { Badge } from '../components/badge';
import { Select } from '../components/form';
import { api, type Paged } from '../lib/api';
import { formatDateTime, humanize } from '../lib/format';
import { useApi, useApiMutation } from '../lib/hooks';
import { OutletPicker, useOutlet } from './outlet';

interface Review {
  id: string;
  outletId: string;
  rating: number;
  foodRating: number | null;
  deliveryRating: number | null;
  comment: string | null;
  tags: string[];
  status: string;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  order?: { orderNumber: string };
}

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${label}: ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={i <= value ? 'size-4 fill-amber-400 text-amber-400' : 'size-4 text-muted-foreground/40'} aria-hidden />
      ))}
    </span>
  );
}

/** Customer reviews with replies. The outlet's rating summary comes from the outlet record. */
export function ReviewsInbox() {
  const { outletId, outlet } = useOutlet();
  const [page, setPage] = React.useState(1);
  const [filter, setFilter] = React.useState<'all' | 'unreplied' | 'low'>('all');
  const list = useApi<Paged<Review>>(outletId ? 'merchant/reviews' : null, { outletId: outletId ?? undefined, page });
  const rows = (list.data?.data ?? []).filter((r) => (filter === 'unreplied' ? !r.reply : filter === 'low' ? r.rating <= 3 : true));
  React.useEffect(() => setPage(1), [outletId]);

  return (
    <>
      <PageHeader
        title="Reviews"
        description={outlet ? `${outlet.ratingAvg.toFixed(1)} ★ from ${outlet.ratingCount.toLocaleString('en-IN')} ratings` : undefined}
        actions={<OutletPicker />}
      />
      <FilterBar>
        <Select aria-label="Show" className="w-48" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All reviews</option>
          <option value="unreplied">Not replied yet</option>
          <option value="low">3 stars or less</option>
        </Select>
        <span className="text-sm text-muted-foreground">Filters apply to this page of {list.data?.meta.pageSize ?? 30}.</span>
      </FilterBar>
      {rows.length ? (
        <div className={list.isFetching ? 'grid gap-3 opacity-60 transition-opacity' : 'grid gap-3'}>
          {rows.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Star />} title={list.isLoading ? 'Loading reviews…' : 'No reviews match'} />
      )}
      {list.data && list.data.meta.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {list.data.meta.totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= list.data.meta.totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </>
  );
}

function ReviewCard({ review: r }: { review: Review }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState('');
  const reply = useApiMutation(() => api.post(`merchant/reviews/${r.id}/reply`, { reply: text }), { invalidate: ['merchant/reviews'], success: 'Reply posted', onSuccess: () => setOpen(false) });
  return (
    <Card>
      <CardContent className="grid gap-2 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Stars value={r.rating} label="Overall" />
            {r.foodRating ? <span className="text-xs text-muted-foreground">Food {r.foodRating}/5</span> : null}
            {r.deliveryRating ? <span className="text-xs text-muted-foreground">Delivery {r.deliveryRating}/5</span> : null}
          </div>
          <span className="text-xs text-muted-foreground">
            {r.order?.orderNumber} · {formatDateTime(r.createdAt)}
          </span>
        </div>
        {r.comment ? <p className="text-sm">{r.comment}</p> : <p className="text-sm italic text-muted-foreground">No comment</p>}
        {r.tags.length ? (
          <div className="flex flex-wrap gap-1">
            {r.tags.map((t) => (
              <Badge key={t} variant="neutral">
                {humanize(t.replace(/-/g, '_'))}
              </Badge>
            ))}
          </div>
        ) : null}
        {r.reply ? (
          <div className="rounded-md border-l-2 border-primary bg-muted/50 px-3 py-2 text-sm">
            <p className="text-xs font-medium text-muted-foreground">Your reply · {formatDateTime(r.repliedAt)}</p>
            <p>{r.reply}</p>
          </div>
        ) : open ? (
          <form className="grid gap-2" onSubmit={(e) => (e.preventDefault(), reply.mutate())}>
            <Textarea aria-label="Reply" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Thank the customer or explain what you'll fix" required />
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={reply.isPending}>
                Post reply
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <MessageSquareReply /> Reply
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
