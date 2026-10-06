import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import type { SupplierStrategy } from '@foodgrid/database';
import type { SupplierRecommendation } from '@foodgrid/types';
import { notFound, unprocessable } from '@foodgrid/utils';
import { ClientsService, RankedOption } from '../clients/clients.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Price comparison across every serviceable supplier for an ingredient and
 * AI ranking by strategy (lowest cost, fastest, best rated, balanced).
 */
@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly settings: SettingsService,
  ) {}

  async recommend(tenantId: string, ingredientId: string, quantity?: number, strategy?: SupplierStrategy): Promise<SupplierRecommendation & { ingredientName: string }> {
    const ing = await this.clients.ingredient(ingredientId);
    if (ing.tenantId !== tenantId) throw notFound('Ingredient', ingredientId);
    const settings = await this.settings.get(tenantId);
    const chosen = strategy ?? settings.defaultStrategy;
    const alert = await this.prisma.reorderAlert.findFirst({ where: { ingredientId, status: 'OPEN' } });
    const qty = quantity ?? (alert ? Number(alert.suggestedQty) : Number(ing.reorderQty) || 1);
    const outlet = await this.clients.outlet(ing.outletId);
    if (!ing.marketplaceCategory) throw unprocessable(`Set a marketplace category for ${ing.name} to compare suppliers`, 'NO_CATEGORY');

    const offers = await this.clients.quotes({
      buyerTenantId: tenantId,
      category: ing.marketplaceCategory,
      searchTerm: ing.name,
      unit: ing.unit,
      quantity: qty,
      pincode: outlet.pincode,
      lat: outlet.lat,
      lng: outlet.lng,
    });
    const ranked = offers.length ? await this.clients.rank({ offers, quantity: qty, strategy: chosen, tenantId }) : { options: [], best: {} };

    if (ranked.options.length) {
      await this.prisma.supplierQuote.createMany({
        data: ranked.options.slice(0, 10).map((o) => ({
          tenantId,
          ingredientId,
          productId: o.productId,
          supplierTenantId: o.supplierTenantId,
          supplierName: o.supplierName,
          quantity: o.quantity,
          unitPrice: o.unitPrice,
          landedCost: o.landedCost,
          leadTimeHours: o.leadTimeHours,
          rating: o.rating,
          onTimeRate: o.onTimeRate,
          score: o.score,
          rank: o.rank,
          strategy: chosen,
        })),
      });
    }
    return {
      ingredientId,
      ingredientName: ing.name,
      quantity: qty,
      unit: ing.unit,
      strategy: chosen,
      options: ranked.options as unknown as SupplierRecommendation['options'],
      best: ranked.best as SupplierRecommendation['best'],
    };
  }

  /** Best feasible option for the strategy (used by auto-PO). */
  async bestOption(tenantId: string, ingredientId: string, quantity: number, strategy?: SupplierStrategy): Promise<RankedOption | null> {
    const rec = await this.recommend(tenantId, ingredientId, quantity, strategy);
    return ((rec.options as unknown as RankedOption[]).find((o) => o.feasible) ?? null);
  }
}
