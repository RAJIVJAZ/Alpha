import 'reflect-metadata';
import type Redis from 'ioredis';
import type { PrismaService } from '@foodgrid/database/nest';
import type { InternalHttpService } from '@foodgrid/utils/server';
import type { DiscoveryService } from '../outlets/discovery.service';
import { RecommendationsService } from './recommendations.service';

describe('RecommendationsService.dishes', () => {
  it('flags items with variants or add-on groups as customisable', async () => {
    const counts = { plain: [0, 0], sized: [2, 0], extras: [0, 1] } as const;
    const prisma = {
      menuItem: {
        findMany: jest.fn().mockResolvedValue(
          Object.entries(counts).map(([id, [variants, addonGroups]]) => ({
            id,
            name: id,
            _count: { variants, addonGroups },
          })),
        ),
      },
    };
    const internal = {
      post: jest
        .fn()
        .mockResolvedValue(Object.keys(counts).map((itemId, i) => ({ itemId, score: 1 - i / 10 }))),
    };
    const redis = { get: jest.fn().mockResolvedValue('[["plain","sized"]]') };
    const reco = new RecommendationsService(
      prisma as unknown as PrismaService,
      {} as DiscoveryService,
      internal as unknown as InternalHttpService,
      redis as unknown as Redis,
    );

    const dishes = await reco.dishes('outlet-1', ['plain']);

    expect(dishes.map((d) => [d.id, d.customisable])).toEqual([
      ['plain', false],
      ['sized', true],
      ['extras', true],
    ]);
    expect(dishes[0]).not.toHaveProperty('_count');
  });
});
