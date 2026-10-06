import { AlertTriangle, CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';
import { humanize } from '../lib/format';
import { Badge } from './badge';

type Tone = 'good' | 'warning' | 'serious' | 'critical' | 'info' | 'neutral';

/** Status → tone across orders, POs, B2B orders, payments, approvals, deliveries and settlements. */
const TONES: Record<string, Tone> = {
  // success / done
  DELIVERED: 'good',
  SENT: 'good',
  COMPLETED: 'good',
  RECEIVED: 'good',
  PAID: 'good',
  CAPTURED: 'good',
  APPROVED: 'good',
  ACTIVE: 'good',
  PROCESSED: 'good',
  CONFIRMED: 'good',
  IN_STOCK: 'good',
  ACHIEVED: 'good',
  PUBLISHED: 'good',
  RESOLVED: 'good',
  ALLOW: 'good',
  OPEN_NOW: 'good',
  // in progress
  PLACED: 'info',
  ACCEPTED: 'info',
  PREPARING: 'info',
  READY: 'info',
  PICKED_UP: 'info',
  OUT_FOR_DELIVERY: 'info',
  SENT_TO_SUPPLIER: 'info',
  DISPATCHED: 'info',
  IN_TRANSIT: 'info',
  PACKED: 'info',
  ASSIGNED: 'info',
  AT_PICKUP: 'info',
  AT_DROP: 'info',
  SEARCHING: 'info',
  IN_PROGRESS: 'info',
  PROCESSING: 'info',
  SCHEDULED: 'info',
  SENDING: 'info',
  CREATED: 'info',
  AUTHORIZED: 'info',
  // needs attention
  PENDING: 'warning',
  PENDING_APPROVAL: 'warning',
  PENDING_PAYMENT: 'warning',
  PENDING_REVIEW: 'warning',
  COD_PENDING: 'warning',
  REQUESTED: 'warning',
  PARTIALLY_CONFIRMED: 'warning',
  PARTIALLY_RECEIVED: 'warning',
  LOW_STOCK: 'warning',
  OPEN: 'warning',
  REVIEW: 'warning',
  CHANGES_REQUESTED: 'warning',
  ON_HOLD: 'warning',
  MEDIUM: 'warning',
  PAUSED: 'neutral',
  DRAFT: 'neutral',
  UNASSIGNED: 'warning',
  PROSPECT: 'neutral',
  HIGH: 'serious',
  OVERDUE: 'serious',
  EXHAUSTED: 'serious',
  PARTIALLY_REFUNDED: 'serious',
  REFUNDED: 'neutral',
  // failed / stopped
  CANCELLED: 'critical',
  REJECTED: 'critical',
  FAILED: 'critical',
  SUPPLIER_REJECTED: 'critical',
  OUT_OF_STOCK: 'critical',
  CRITICAL: 'critical',
  BLOCK: 'critical',
  BLOCKED: 'critical',
  SUSPENDED: 'critical',
  EXPIRED: 'neutral',
  CLOSED: 'neutral',
  INACTIVE: 'neutral',
  LOW: 'neutral',
};

const ICONS: Record<Tone, typeof Circle> = {
  good: CheckCircle2,
  warning: Clock,
  serious: AlertTriangle,
  critical: XCircle,
  info: Circle,
  neutral: Circle,
};

/** Status chip: tone color always paired with an icon and the label (never color alone). */
export function StatusBadge({
  status,
  label,
  tone,
}: {
  status: string | null | undefined;
  label?: string;
  tone?: Tone;
}) {
  const t = tone ?? TONES[status ?? ''] ?? 'neutral';
  const Icon = ICONS[t];
  return (
    <Badge variant={t}>
      <Icon aria-hidden />
      {label ?? humanize(status)}
    </Badge>
  );
}

export const statusTone = (status: string) => TONES[status] ?? 'neutral';
