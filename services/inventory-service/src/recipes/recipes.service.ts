import { Injectable } from '@nestjs/common';
import { PrismaService } from '@foodgrid/database/nest';
import { badRequest, canConvert, notFound, Unit } from '@foodgrid/utils';
import { InternalHttpService } from '@foodgrid/utils/server';
import { assertOutletAccess, OutletActor, outletScope } from '../common/outlet-access';
import { recipeCost } from '../domain/costing';
import { RecipeDto } from './dto/recipe.dto';

const INCLUDE = { lines: { include: { ingredient: true } } } as const;

/** Recipes (bill of materials) link menu items to ingredient consumption and costing. */
@Injectable()
export class RecipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly internal: InternalHttpService,
  ) {}

  list(tenantId: string, outletId?: string, user?: OutletActor) {
    return this.prisma.forTenant(tenantId).recipe.findMany({
      where: outletScope(user, outletId),
      include: INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async get(tenantId: string, menuItemId: string, user?: OutletActor) {
    const recipe = await this.prisma
      .forTenant(tenantId)
      .recipe.findFirst({ where: { menuItemId }, include: INCLUDE });
    if (!recipe) throw notFound('Recipe for menu item', menuItemId);
    assertOutletAccess(user, recipe.outletId);
    return recipe;
  }

  /** Create or replace the recipe for a menu item. */
  async upsert(tenantId: string, dto: RecipeDto, user?: OutletActor) {
    assertOutletAccess(user, dto.outletId);
    // menuItemId is unique across tenants: only a dish on this outlet's menu may get a recipe,
    // so nobody can claim another business's dish and block its own recipe
    const menu = await this.internal
      .get<{ id: string }[]>('order', `internal/outlets/${dto.outletId}/menu-prices`)
      .catch(() => [] as { id: string }[]);
    if (!menu.some((i) => i.id === dto.menuItemId)) throw notFound('Menu item', dto.menuItemId);
    const ingredients = await this.prisma.forTenant(tenantId).ingredient.findMany({
      where: { id: { in: dto.lines.map((l) => l.ingredientId) }, outletId: dto.outletId },
    });
    const byId = new Map(ingredients.map((i) => [i.id, i]));
    for (const line of dto.lines) {
      const ing = byId.get(line.ingredientId);
      if (!ing)
        throw badRequest(
          `Ingredient ${line.ingredientId} not found at this outlet`,
          'INVALID_INGREDIENT',
        );
      if (!canConvert(line.unit as Unit, ing.unit as Unit)) {
        throw badRequest(
          `${ing.name} is stocked in ${ing.unit}; ${line.unit} is not compatible`,
          'UNIT_MISMATCH',
        );
      }
    }
    const { lines, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      const recipe = await tx.recipe.upsert({
        where: { menuItemId: dto.menuItemId },
        create: { ...data, tenantId },
        update: { ...data },
      });
      if (recipe.tenantId !== tenantId) throw notFound('Recipe for menu item', dto.menuItemId);
      await tx.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
      await tx.recipeIngredient.createMany({
        data: lines.map((l) => ({
          recipeId: recipe.id,
          ingredientId: l.ingredientId,
          quantity: l.quantity,
          unit: l.unit,
          wastagePct: l.wastagePct ?? 0,
        })),
      });
      return tx.recipe.findUniqueOrThrow({ where: { id: recipe.id }, include: INCLUDE });
    });
  }

  async remove(tenantId: string, menuItemId: string, user?: OutletActor) {
    const recipe = await this.get(tenantId, menuItemId, user);
    await this.prisma.recipe.delete({ where: { id: recipe.id } });
  }

  async cost(tenantId: string, menuItemId: string, user?: OutletActor) {
    const recipe = await this.get(tenantId, menuItemId, user);
    return {
      recipeId: recipe.id,
      menuItemId,
      name: recipe.name,
      yieldQty: recipe.yieldQty,
      ...recipeCost(
        recipe.lines.map((l) => ({
          ingredientId: l.ingredientId,
          name: l.ingredient.name,
          quantity: Number(l.quantity),
          unit: l.unit as Unit,
          wastagePct: Number(l.wastagePct),
          ingredientUnit: l.ingredient.unit as Unit,
          avgUnitCost: Number(l.ingredient.avgUnitCost),
        })),
        Number(recipe.yieldQty),
      ),
    };
  }
}
