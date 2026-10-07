import { ecpm, estimateCtr, hasBudget, runAuction } from './auction';

describe('ads auction', () => {
  it('smooths CTR for new campaigns', () => {
    expect(estimateCtr(0, 0)).toBeCloseTo(0.02);
    expect(estimateCtr(10_000, 500)).toBeCloseTo(0.0496, 3);
  });

  it('ranks by eCPM, not raw bid', () => {
    const winners = runAuction(
      [
        {
          campaignId: 'highbid-lowctr',
          bidType: 'CPC',
          bidAmount: 10,
          impressions: 10_000,
          clicks: 50,
        },
        {
          campaignId: 'lowbid-highctr',
          bidType: 'CPC',
          bidAmount: 6,
          impressions: 10_000,
          clicks: 600,
        },
        { campaignId: 'cpm', bidType: 'CPM', bidAmount: 40, impressions: 0, clicks: 0 },
      ],
      2,
    );
    expect(winners.map((w) => w.campaignId)).toEqual(['lowbid-highctr', 'highbid-lowctr']);
  });

  it('charges second price, never above the bid', () => {
    const winners = runAuction(
      [
        { campaignId: 'a', bidType: 'CPC', bidAmount: 8, impressions: 1000, clicks: 50 },
        { campaignId: 'b', bidType: 'CPC', bidAmount: 5, impressions: 1000, clicks: 50 },
      ],
      1,
    );
    expect(winners[0]!.price).toBeCloseTo(5.01, 2);
    expect(winners[0]!.price).toBeLessThanOrEqual(8);
    expect(
      ecpm({ campaignId: 'x', bidType: 'CPM', bidAmount: 30, impressions: 0, clicks: 0 }),
    ).toBe(30);
  });

  it('enforces daily and total budgets', () => {
    const c = {
      totalBudget: 1000,
      spent: 990,
      dailyBudget: 200,
      spentToday: 50,
      spentTodayDate: '2026-10-06',
    };
    expect(hasBudget(c, 5, '2026-10-06')).toBe(true);
    expect(hasBudget(c, 20, '2026-10-06')).toBe(false);
    expect(hasBudget({ ...c, spent: 0, spentToday: 199 }, 5, '2026-10-06')).toBe(false);
    expect(hasBudget({ ...c, spent: 0, spentToday: 199 }, 5, '2026-10-07')).toBe(true);
  });
});
