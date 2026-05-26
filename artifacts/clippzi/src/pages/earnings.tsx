import { useEffect, useState } from "react";
import { useParams } from "wouter";
import {
  useGetUserEarnings,
  useListUserPayouts,
  getGetUserEarningsQueryKey,
  getListUserPayoutsQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Banknote, Wallet, TrendingUp, ArrowDownToLine, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";

const apiBase = `${import.meta.env.BASE_URL}api`;
const fmt = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type StripeStatus = {
  connected: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted?: boolean;
  chargesEnabled?: boolean;
  accountId?: string;
  requirementsDue?: string[];
};

export default function Earnings() {
  const params = useParams<{ id: string }>();
  const userId = Number(params.id);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: earnings } = useGetUserEarnings(userId);
  const { data: payouts } = useListUserPayouts(userId);

  const statusQuery = useQuery<StripeStatus>({
    queryKey: ["stripe-status", userId],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/users/${userId}/stripe/status`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    refetchInterval: (q) => (q.state.data?.payoutsEnabled ? false : 5000),
  });

  const onboard = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${apiBase}/users/${userId}/stripe/onboard`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error ?? "failed");
      return r.json() as Promise<{ url: string }>;
    },
    onSuccess: (d) => { window.location.href = d.url; },
    onError: (e: any) => toast({ title: "Couldn't start onboarding", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const dashboard = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${apiBase}/users/${userId}/stripe/login-link`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error ?? "failed");
      return r.json() as Promise<{ url: string }>;
    },
    onSuccess: (d) => window.open(d.url, "_blank"),
    onError: (e: any) => toast({ title: "Couldn't open dashboard", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const withdraw = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${apiBase}/users/${userId}/stripe/payout`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "failed");
      return data;
    },
    onSuccess: (d) => {
      toast({ title: "Payout sent!", description: `${fmt(Number(d.amount))} transferred to your Stripe account` });
      qc.invalidateQueries({ queryKey: getGetUserEarningsQueryKey(userId) });
      qc.invalidateQueries({ queryKey: getListUserPayoutsQueryKey(userId) });
    },
    onError: (e: any) => toast({ title: "Withdrawal failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  // Refresh status when user returns from Stripe onboarding
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("stripe")) {
      statusQuery.refetch();
      url.searchParams.delete("stripe");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = statusQuery.data;
  const pending = earnings?.pendingPayout ?? 0;
  const canWithdraw = !!status?.payoutsEnabled && pending > 0;

  return (
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto" data-testid="page-earnings">
      <div className="flex items-center gap-3 mb-6">
        <Wallet className="w-7 h-7 text-primary" />
        <h1 className="text-3xl font-bold">Earnings & Payouts</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4" /> Pending Payout
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[hsl(142,76%,50%)]" data-testid="text-pending">{fmt(pending)}</div>
            <p className="text-xs text-muted-foreground mt-1">Your 60% streamer share</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground flex items-center gap-2">
              <Banknote className="w-4 h-4" /> Paid Out
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-paidout">{fmt(earnings?.paidOut ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Lifetime withdrawals</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Gross Gifts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{fmt(earnings?.totalGrossEarnings ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Before 40% platform fee</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Stripe Payouts</span>
            {status?.payoutsEnabled ? (
              <Badge variant="outline" className="border-green-500 text-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Active</Badge>
            ) : status?.connected ? (
              <Badge variant="outline" className="border-yellow-500 text-yellow-500"><AlertCircle className="w-3 h-3 mr-1" />Onboarding incomplete</Badge>
            ) : (
              <Badge variant="outline" className="border-muted-foreground">Not connected</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status?.connected && (
            <>
              <p className="text-sm text-muted-foreground">
                Set up payouts with Stripe to receive your earnings. Stripe handles bank verification, tax forms, and ACH transfers securely — Clippzi never sees your bank details.
              </p>
              <Button onClick={() => onboard.mutate()} disabled={onboard.isPending}
                className="bg-primary" data-testid="button-stripe-onboard">
                {onboard.isPending ? "Redirecting…" : "Set Up Stripe Payouts"}
                <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
            </>
          )}

          {status?.connected && !status.payoutsEnabled && (
            <>
              <p className="text-sm text-muted-foreground">
                Finish your Stripe onboarding to enable payouts. Missing: {status.requirementsDue?.join(", ") || "additional verification"}.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => onboard.mutate()} disabled={onboard.isPending} className="bg-primary" data-testid="button-finish-onboarding">
                  Continue Onboarding <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
                <Button variant="outline" onClick={() => statusQuery.refetch()}>Refresh Status</Button>
              </div>
            </>
          )}

          {status?.payoutsEnabled && (
            <>
              <div className="flex items-center justify-between p-3 rounded-md bg-card/50 border">
                <div>
                  <p className="font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" /> Stripe Express Account Connected
                  </p>
                  <p className="text-xs text-muted-foreground">Payouts route directly to your linked bank via Stripe</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => dashboard.mutate()} disabled={dashboard.isPending} data-testid="button-stripe-dashboard">
                  Stripe Dashboard <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              </div>
              <Button
                size="lg"
                className="w-full bg-[hsl(142,76%,50%)] text-black hover:opacity-90"
                disabled={!canWithdraw || withdraw.isPending}
                onClick={() => withdraw.mutate()}
                data-testid="button-withdraw"
              >
                <ArrowDownToLine className="w-4 h-4 mr-2" />
                {withdraw.isPending ? "Transferring…" : `Withdraw ${fmt(pending)}`}
              </Button>
              {pending <= 0 && (
                <p className="text-xs text-muted-foreground text-center">No pending earnings — keep streaming!</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payout History</CardTitle></CardHeader>
        <CardContent>
          {!payouts || payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payouts yet.</p>
          ) : (
            <div className="space-y-2">
              {payouts.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-md bg-card/50 border" data-testid={`row-payout-${p.id}`}>
                  <div>
                    <p className="font-semibold">{fmt(Number(p.amount))}</p>
                    <p className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</p>
                  </div>
                  <Badge variant="outline" className={p.status === "paid" ? "border-green-500 text-green-500 capitalize" : "border-yellow-500 text-yellow-500 capitalize"}>
                    {p.status.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
