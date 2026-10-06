import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { Prisma } from '@foodgrid/database';
import type { LedgerReason, Wallet, WalletOwnerType, WalletTransaction } from '@foodgrid/database';
import { AppError, round2 } from '@foodgrid/utils';

type Tx = Prisma.TransactionClient;

export interface LedgerEntry {
  ownerType: WalletOwnerType;
  ownerId: string;
  amount: number;
  reason: LedgerReason;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  /** Riders may go negative when holding COD cash. */
  allowNegative?: boolean;
}

const MAX_RETRIES = 5;

/**
 * Append-only wallet ledger. Every movement writes a WalletTransaction with
 * the running balance; balances change through compare-and-swap on `version`
 * so concurrent debits can never overspend. Idempotency keys make retries of
 * the same business operation return the original entry.
 */
@Injectable()
export class WalletLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(db: Tx | PrismaService, ownerType: WalletOwnerType, ownerId: string): Promise<Wallet> {
    return db.wallet.upsert({
      where: { ownerType_ownerId: { ownerType, ownerId } },
      create: { ownerType, ownerId },
      update: {},
    });
  }

  credit(entry: LedgerEntry, tx?: Tx) {
    return this.apply('CREDIT', entry, tx);
  }

  debit(entry: LedgerEntry, tx?: Tx) {
    return this.apply('DEBIT', entry, tx);
  }

  private async apply(type: 'CREDIT' | 'DEBIT', entry: LedgerEntry, tx?: Tx): Promise<WalletTransaction> {
    const amount = round2(entry.amount);
    if (amount <= 0) throw new AppError('INVALID_AMOUNT', 'Amount must be positive', 400);
    const run = (db: Tx) => this.applyInTx(db, type, { ...entry, amount });
    if (tx) return run(tx);
    try {
      return await this.prisma.$transaction(run);
    } catch (err) {
      // A concurrent request with the same idempotency key committed first: the
      // operation has already happened, so return the original entry.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.walletTransaction.findUnique({ where: { idempotencyKey: entry.idempotencyKey } });
        if (existing) return existing;
      }
      throw err;
    }
  }

  private async applyInTx(db: Tx, type: 'CREDIT' | 'DEBIT', entry: LedgerEntry): Promise<WalletTransaction> {
    const existing = await db.walletTransaction.findUnique({ where: { idempotencyKey: entry.idempotencyKey } });
    if (existing) return existing;
    // INSERT ... ON CONFLICT DO NOTHING on the caller's connection: concurrent first-time
    // operations never fail on the (ownerType, ownerId) unique key, and no second pooled
    // connection is needed while a transaction is open.
    await db.wallet.createMany({ data: [{ ownerType: entry.ownerType, ownerId: entry.ownerId }], skipDuplicates: true });

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const wallet = await this.getOrCreate(db, entry.ownerType, entry.ownerId);
      if (wallet.status !== 'ACTIVE' && type === 'DEBIT') throw new AppError('WALLET_FROZEN', 'Wallet is not active', 409);
      const delta = type === 'CREDIT' ? entry.amount : -entry.amount;
      const next = round2(Number(wallet.balance) + delta);
      if (next < 0 && !entry.allowNegative) {
        throw new AppError('INSUFFICIENT_BALANCE', 'Insufficient wallet balance', 409, {
          balance: wallet.balance,
          required: entry.amount,
        });
      }
      const res = await db.wallet.updateMany({
        where: { id: wallet.id, version: wallet.version },
        data: { balance: next, version: { increment: 1 } },
      });
      if (res.count === 1) {
        return db.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type,
            reason: entry.reason,
            amount: entry.amount,
            balanceAfter: next,
            referenceType: entry.referenceType,
            referenceId: entry.referenceId,
            description: entry.description,
            idempotencyKey: entry.idempotencyKey,
          },
        });
      }
    }
    throw new AppError('WALLET_CONTENTION', 'Wallet is busy, please retry', 409);
  }

  async statement(ownerType: WalletOwnerType, ownerId: string, page = 1, pageSize = 30) {
    const wallet = await this.getOrCreate(this.prisma, ownerType, ownerId);
    const [rows, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);
    return { wallet, transactions: rows, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  /** Reconciliation: replays the ledger and compares with the stored balance. */
  async reconcile(walletId: string) {
    const wallet = await this.prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
    const sums = await this.prisma.walletTransaction.groupBy({ by: ['type'], where: { walletId }, _sum: { amount: true } });
    const credit = Number(sums.find((s) => s.type === 'CREDIT')?._sum.amount ?? 0);
    const debit = Number(sums.find((s) => s.type === 'DEBIT')?._sum.amount ?? 0);
    const ledger = round2(credit - debit);
    return { walletId, storedBalance: Number(wallet.balance), ledgerBalance: ledger, consistent: ledger === Number(wallet.balance) };
  }
}
