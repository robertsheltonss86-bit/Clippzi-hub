import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import { useCurrentUser } from "./use-current-user";

export const COIN_BALANCE_QUERY_KEY = ["coin-balance"] as const;

export function useCoinBalance() {
  const { isAuthenticated } = useCurrentUser();
  const query = useQuery({
    queryKey: COIN_BALANCE_QUERY_KEY,
    enabled: isAuthenticated,
    queryFn: async () => {
      const r = await apiFetch("api/coins/balance");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      return Number(data.balance ?? 0);
    },
  });
  return {
    balance: query.data ?? 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useInvalidateCoinBalance() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: COIN_BALANCE_QUERY_KEY });
}
