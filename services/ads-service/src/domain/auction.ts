import { round2 } from '@foodgrid/utils';

export interface AuctionCandidate {
  campaignId: string;
  bidType: 'CPC' | 'CPM';
  bidAmount: number;
  impressions: number;
  clicks: number;
}

/** Bayesian CTR estimate (prior 2% worth 100 impressions) avoids cold-start bias. */
export function estimateCtr(impressions: number, clicks: number, priorCtr = 0.02, priorWeight = 100): number {
  return (clicks + priorCtr * priorWeight) / (impressions + priorWeight);
}

/** Expected value per 1000 impressions (eCPM) — the auction ranking key. */
export function ecpm(c: AuctionCandidate): number {
  return c.bidType === 'CPM' ? c.bidAmount : c.bidAmount * estimateCtr(c.impressions, c.clicks) * 1000;
}

export interface AuctionWinner extends AuctionCandidate {
  rank: number;
  ecpm: number;
  /** Generalised second-price: what the winner actually pays per click / mille. */
  price: number;
}

/**
 * Generalised second-price auction ranked by eCPM. Each winner pays the
 * minimum bid that would still keep its position, plus ₹0.01, capped at its
 * own bid.
 */
export function runAuction(candidates: AuctionCandidate[], slots: number): AuctionWinner[] {
  const ranked = candidates.map((c) => ({ ...c, ecpm: ecpm(c) })).sort((a, b) => b.ecpm - a.ecpm);
  return ranked.slice(0, slots).map((c, i) => {
    const next = ranked[i + 1];
    let price = c.bidAmount;
    if (next) {
      price =
        c.bidType === 'CPM'
          ? next.ecpm + 0.01
          : next.ecpm / (estimateCtr(c.impressions, c.clicks) * 1000) + 0.01;
    } else {
      price = c.bidType === 'CPM' ? Math.min(c.bidAmount, 10) : Math.min(c.bidAmount, 1); // reserve price
    }
    return { ...c, rank: i + 1, ecpm: round2(c.ecpm), price: round2(Math.min(price, c.bidAmount)) };
  });
}

/** Whether a campaign can still spend `amount` today and in total. */
export function hasBudget(
  c: { totalBudget: number; spent: number; dailyBudget: number; spentToday: number; spentTodayDate: string | null },
  amount: number,
  today: string,
): boolean {
  const spentToday = c.spentTodayDate === today ? c.spentToday : 0;
  return c.spent + amount <= c.totalBudget && spentToday + amount <= c.dailyBudget;
}
