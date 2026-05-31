import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";

export type PayoutMethodData = {
  payoutMethod: string | null;
  payoutHandle: string | null;
  hasPayout: boolean;
};

export function payoutMethodQueryKey(userId: number) {
  return ["payout-method", userId] as const;
}

// Reads a user's saved payout method. Self can read their own; admins can read
// anyone's (so the owner can see how to pay each creator).
export function usePayoutMethod(userId: number, enabled = true) {
  const query = useQuery({
    queryKey: payoutMethodQueryKey(userId),
    enabled: enabled && !!userId,
    queryFn: async (): Promise<PayoutMethodData> => {
      const r = await apiFetch(`api/users/${userId}/payout-method`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });
  return { data: query.data, isLoading: query.isLoading, refetch: query.refetch };
}

export function useInvalidatePayoutMethod() {
  const qc = useQueryClient();
  return (userId: number) => qc.invalidateQueries({ queryKey: payoutMethodQueryKey(userId) });
}
