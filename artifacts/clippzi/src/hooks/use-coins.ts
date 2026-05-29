import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "./use-current-user";

export interface CoinPack {
  id: string;
  coins: number;
  priceUsd: number;
  bonus?: number;
  popular?: boolean;
}

const base = () => import.meta.env.BASE_URL;

export const COINS_BALANCE_KEY = ["coins", "balance"];
export const COINS_PACKS_KEY = ["coins", "packs"];

export function useCoinBalance() {
  const { isAuthenticated } = useCurrentUser();
  return useQuery<number>({
    queryKey: COINS_BALANCE_KEY,
    enabled: isAuthenticated,
    refetchInterval: 15000,
    queryFn: async () => {
      const r = await fetch(`${base()}api/coins/balance`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      return Number(data.balance ?? 0);
    },
  });
}

export function useCoinPacks() {
  return useQuery<{ packs: CoinPack[]; coinUsd: number }>({
    queryKey: COINS_PACKS_KEY,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const r = await fetch(`${base()}api/coins/packs`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });
}

export function useCoinActions() {
  const queryClient = useQueryClient();

  const buyPack = async (packId: string): Promise<{ url: string }> => {
    const r = await fetch(`${base()}api/checkout/coins`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId }),
    });
    const data = await r.json();
    if (!r.ok || !data.url) throw new Error(data.error ?? `HTTP ${r.status}`);
    return data;
  };

  const sendGiftWithCoins = async (params: {
    giftId: number;
    receiverId: number;
    streamId: number;
    quantity?: number;
  }): Promise<{ balance: number; coinsSpent: number }> => {
    const r = await fetch(`${base()}api/gifts/send-with-coins`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 1, ...params }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
    queryClient.setQueryData(COINS_BALANCE_KEY, Number(data.balance ?? 0));
    return data;
  };

  const refreshBalance = () => queryClient.invalidateQueries({ queryKey: COINS_BALANCE_KEY });

  return { buyPack, sendGiftWithCoins, refreshBalance };
}

export function coinsForUsd(priceUsd: number): number {
  return Math.round(priceUsd * 100);
}
