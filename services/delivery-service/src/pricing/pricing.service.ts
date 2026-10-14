import { Injectable } from '@nestjs/common';
import { Prisma, type DeliveryPricingPolicy } from '@foodgrid/database';
import { PrismaService } from '@foodgrid/database/nest';
import { conflict } from '@foodgrid/utils';
import { InternalHttpService } from '@foodgrid/utils/server';
import { DEFAULT_PRICING, type DeliveryPricing } from '../domain/fees';
import type { DeliveryPricingDto } from './dto/pricing.dto';

/** How long a replica keeps the version in force before reading it again. */
const CACHE_MS = 30_000;

export function toPricing(p: DeliveryPricingPolicy): DeliveryPricing {
  return {
    customerFlatFee: Number(p.customerFlatFee),
    freeDeliveryAbove: p.freeDeliveryAbove == null ? null : Number(p.freeDeliveryAbove),
    riderPerKm: Number(p.riderPerKm),
    riderMinPayout: Number(p.riderMinPayout),
    waitingThresholdMins: p.waitingThresholdMins,
    waitingPay: Number(p.waitingPay),
    arrivalRadiusM: p.arrivalRadiusM,
    cancellationPay: Number(p.cancellationPay),
  };
}

/** Key of the transaction lock that takes pricing changes one at a time. */
const PRICING_LOCK = 4_207_001;

/** The rules of a requested change, without the bookkeeping fields. */
function rulesOf({ baseVersion: _base, note: _note, ...rules }: DeliveryPricingDto) {
  return rules;
}

/** What anyone may see: the rules in force and their version. */
export function toPublicPricing(p: DeliveryPricingPolicy) {
  return { version: p.version, ...toPricing(p) };
}

/** The admin shape of a version: the rules plus who set them, why and when. */
export function toPricingView(p: DeliveryPricingPolicy) {
  return {
    id: p.id,
    version: p.version,
    ...toPricing(p),
    note: p.note,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
  };
}

/**
 * Delivery pricing versions. Rows are never edited: a change adds the next version, which
 * new quotes and new deliveries use (within CACHE_MS on every replica); a delivery already
 * created keeps the version it was priced with.
 */
@Injectable()
export class PricingService {
  private cached: { at: number; policy: DeliveryPricingPolicy } | null = null;
  private readonly byIdCache = new Map<string, DeliveryPricingPolicy>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly internal: InternalHttpService,
  ) {}

  /** The version in force; the launch defaults become version 1 the first time. */
  async current(): Promise<DeliveryPricingPolicy> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.policy;
    const policy = (await this.latest()) ?? (await this.createDefaults());
    this.cached = { at: Date.now(), policy };
    this.byIdCache.set(policy.id, policy);
    return policy;
  }

  /** Drops the cached version in force, so the next read goes to the database. */
  reload() {
    this.cached = null;
  }

  /** The version in force read from the database now (admin screens, which must not lag). */
  async fresh(): Promise<DeliveryPricingPolicy> {
    this.reload();
    return this.current();
  }

  /** A version by id (versions never change, so they are cached for good). */
  async byId(id: string): Promise<DeliveryPricingPolicy | null> {
    const hit = this.byIdCache.get(id);
    if (hit) return hit;
    const policy = await this.prisma.deliveryPricingPolicy.findUnique({ where: { id } });
    if (policy) this.byIdCache.set(id, policy);
    return policy;
  }

  history() {
    return this.prisma.deliveryPricingPolicy.findMany({ orderBy: { version: 'desc' }, take: 50 });
  }

  /**
   * Adds the next version on top of `dto.baseVersion`, the version the admin edited: if
   * someone changed pricing since, nothing is saved (409 PRICING_CHANGED) rather than
   * silently undoing their change. Changes are taken one at a time (a transaction lock), and
   * who changed what goes to the admin audit log before the insert: a failed audit blocks
   * the change, as for commission rules.
   */
  async create(dto: DeliveryPricingDto, actorId: string): Promise<DeliveryPricingPolicy> {
    await this.current(); // version 1 exists before anyone edits it
    const policy = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${PRICING_LOCK})`);
        const last = await tx.deliveryPricingPolicy.findFirstOrThrow({
          orderBy: { version: 'desc' },
        });
        if (last.version !== dto.baseVersion)
          throw conflict(
            `Delivery pricing changed to version ${last.version} since you opened it. Reload and try again`,
            'PRICING_CHANGED',
          );
        const version = last.version + 1;
        await this.internal.post('user', 'internal/audit-logs', {
          actorId,
          action: 'delivery_pricing.create',
          entityType: 'DeliveryPricingPolicy',
          changes: { version, from: toPricing(last), to: rulesOf(dto) },
        });
        return tx.deliveryPricingPolicy.create({
          data: {
            version,
            customerFlatFee: dto.customerFlatFee,
            freeDeliveryAbove: dto.freeDeliveryAbove,
            riderPerKm: dto.riderPerKm,
            riderMinPayout: dto.riderMinPayout,
            waitingThresholdMins: dto.waitingThresholdMins,
            waitingPay: dto.waitingPay,
            arrivalRadiusM: dto.arrivalRadiusM,
            cancellationPay: dto.cancellationPay,
            note: dto.note?.trim() || null,
            createdBy: actorId,
          },
        });
      },
      { timeout: 15_000 },
    ); // the audit call happens under the lock
    this.cached = { at: Date.now(), policy };
    return policy;
  }

  private latest() {
    return this.prisma.deliveryPricingPolicy.findFirst({ orderBy: { version: 'desc' } });
  }

  private async createDefaults(): Promise<DeliveryPricingPolicy> {
    try {
      return await this.prisma.deliveryPricingPolicy.create({
        data: { version: 1, ...DEFAULT_PRICING, note: 'Launch rules', createdBy: 'system' },
      });
    } catch (e) {
      // another replica created it first
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        return this.prisma.deliveryPricingPolicy.findUniqueOrThrow({ where: { version: 1 } });
      throw e;
    }
  }
}
