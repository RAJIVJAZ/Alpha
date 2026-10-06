import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { Prisma, PayoutStatus } from '@foodgrid/database';
import { conflict, normalizePage, notFound, paginate, round2 } from '@foodgrid/utils';
import { CashDepositDto, MarkPayoutDto, PayoutRequestDto } from './dto/wallet.dto';
import { WalletLedgerService } from './wallet-ledger.service';

@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: WalletLedgerService,
  ) {}

  statement(ownerType: 'CUSTOMER' | 'RIDER', ownerId: string, page = 1, pageSize = 30) {
    return this.ledger.statement(ownerType, ownerId, page, pageSize);
  }

  /** Rider cash-out: funds are held (debited) immediately and paid by finance. */
  async requestPayout(riderUserId: string, dto: PayoutRequestDto) {
    const pending = await this.prisma.payout.count({ where: { ownerType: 'RIDER', ownerId: riderUserId, status: { in: ['REQUESTED', 'PROCESSING'] } } });
    if (pending) throw conflict('You already have a payout in progress', 'PAYOUT_PENDING');
    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.ledger.getOrCreate(tx, 'RIDER', riderUserId);
      const payout = await tx.payout.create({
        data: {
          walletId: wallet.id,
          ownerType: 'RIDER',
          ownerId: riderUserId,
          amount: dto.amount,
          method: dto.method,
          destination: dto.destination as Prisma.InputJsonValue,
        },
      });
      await this.ledger.debit(
        {
          ownerType: 'RIDER',
          ownerId: riderUserId,
          amount: dto.amount,
          reason: 'PAYOUT',
          idempotencyKey: `payout:${payout.id}`,
          referenceType: 'PAYOUT',
          referenceId: payout.id,
          description: `Payout via ${dto.method}`,
        },
        tx,
      );
      return payout;
    });
  }

  payouts(ownerId: string) {
    return this.prisma.payout.findMany({ where: { ownerId }, orderBy: { requestedAt: 'desc' }, take: 50 });
  }

  async adminPayouts(status?: PayoutStatus, page = 1) {
    const p = normalizePage({ page, pageSize: 50 });
    const where = status ? { status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.payout.findMany({ where, orderBy: { requestedAt: 'asc' }, skip: p.skip, take: p.take }),
      this.prisma.payout.count({ where }),
    ]);
    return paginate(rows, total, p.page, p.pageSize);
  }

  async markPaid(id: string, dto: MarkPayoutDto) {
    const payout = await this.prisma.payout.findUnique({ where: { id } });
    if (!payout) throw notFound('Payout', id);
    if (!['REQUESTED', 'PROCESSING'].includes(payout.status)) throw conflict('Payout already finalised', 'PAYOUT_FINAL');
    return this.prisma.payout.update({ where: { id }, data: { status: 'PAID', utr: dto.utr, processedAt: new Date() } });
  }

  /** Failed bank transfer: return the held funds to the wallet. */
  async markFailed(id: string, dto: MarkPayoutDto) {
    const payout = await this.prisma.payout.findUnique({ where: { id } });
    if (!payout) throw notFound('Payout', id);
    if (!['REQUESTED', 'PROCESSING'].includes(payout.status)) throw conflict('Payout already finalised', 'PAYOUT_FINAL');
    return this.prisma.$transaction(async (tx) => {
      await this.ledger.credit(
        {
          ownerType: payout.ownerType,
          ownerId: payout.ownerId,
          amount: Number(payout.amount),
          reason: 'PAYOUT_REVERSAL',
          idempotencyKey: `payout-reversal:${payout.id}`,
          referenceType: 'PAYOUT',
          referenceId: payout.id,
          description: dto.reason ?? 'Payout failed',
        },
        tx,
      );
      return tx.payout.update({ where: { id }, data: { status: 'FAILED', failureReason: dto.reason, processedAt: new Date() } });
    });
  }

  /**
   * COD cash is netted against rider earnings; a negative balance is cash the
   * rider holds beyond what they have earned and must hand in.
   */
  async riderCashDue() {
    const wallets = await this.prisma.wallet.findMany({ where: { ownerType: 'RIDER', balance: { lt: 0 } }, orderBy: { balance: 'asc' }, take: 200 });
    const last = wallets.length
      ? await this.prisma.walletTransaction.groupBy({ by: ['walletId'], where: { walletId: { in: wallets.map((w) => w.id) }, reason: 'COD_COLLECTION', type: 'DEBIT' }, _max: { createdAt: true } })
      : [];
    const lastAt = new Map(last.map((l) => [l.walletId, l._max.createdAt]));
    return wallets.map((w) => ({ walletId: w.id, ownerId: w.ownerId, cashDue: round2(-Number(w.balance)), lastCollectedAt: lastAt.get(w.id) ?? null }));
  }

  /** Finance records cash a rider handed in at a hub or deposited at the bank. */
  async recordCashDeposit(riderUserId: string, dto: CashDepositDto) {
    const wallet = await this.prisma.wallet.findUnique({ where: { ownerType_ownerId: { ownerType: 'RIDER', ownerId: riderUserId } } });
    if (!wallet) throw notFound('Rider wallet');
    const due = round2(-Number(wallet.balance));
    if (due <= 0) throw conflict('This rider has no cash to hand in', 'NO_CASH_DUE');
    if (dto.amount > due) throw conflict(`The rider owes ₹${due.toFixed(2)} — record that amount or less`, 'DEPOSIT_EXCEEDS_DUE');
    const depositId = randomUUID();
    return this.ledger.credit({
      ownerType: 'RIDER',
      ownerId: riderUserId,
      amount: dto.amount,
      reason: 'COD_COLLECTION',
      idempotencyKey: `cod-deposit:${depositId}`,
      referenceType: 'CASH_DEPOSIT',
      referenceId: dto.reference ?? depositId,
      description: dto.reference ? `Cash deposited · ${dto.reference}` : 'Cash deposited',
    });
  }
}
