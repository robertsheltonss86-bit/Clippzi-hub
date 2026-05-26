import { useGetPlatformEarnings } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Banknote, DollarSign, TrendingUp, Users, ExternalLink, Info } from "lucide-react";

const apiBase = `${import.meta.env.BASE_URL}api`;
const fmt = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Moderation() {
  const { data: earnings } = useGetPlatformEarnings();

  const balance = useQuery<{ available: number; pending: number; currency: string }>({
    queryKey: ["stripe-balance"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/platform/stripe/balance`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });
  const dashboard = useQuery<{ url: string }>({
    queryKey: ["stripe-dashboard"],
    queryFn: async () => (await fetch(`${apiBase}/platform/stripe/dashboard`)).json(),
  });

  return (
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto" data-testid="page-moderation">
      <div className="flex items-center gap-3 mb-2">
        <Shield className="w-7 h-7 text-primary" />
        <h1 className="text-3xl font-bold">Platform Admin</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Your 40% platform revenue from gifts (powered by Stripe Connect)</p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Stripe Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(142,76%,50%)]" data-testid="text-stripe-available">
              {balance.isLoading ? "…" : fmt(balance.data?.available ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Ready in your Stripe balance</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground flex items-center gap-2">
              <Banknote className="w-4 h-4" /> Stripe Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{balance.isLoading ? "…" : fmt(balance.data?.pending ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Settling (typically 2 business days)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Gross Gift Volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(earnings?.totalGross ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">All gifts sent on platform</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> Paid to Streamers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(earnings?.streamerShare ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Creator 60% share</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Stripe Dashboard</span>
            <Badge variant="outline" className="border-green-500 text-green-500">Connected</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-md bg-card/50 border flex items-start gap-3">
            <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="text-sm space-y-2">
              <p>
                Your 40% platform cut accumulates in your Stripe balance. <strong>Stripe automatically pays it out to your linked bank</strong> on the schedule you set in your Stripe Dashboard (default: daily, 2-day rolling).
              </p>
              <p className="text-muted-foreground">
                To link your bank, change payout frequency, view detailed reports, or download tax documents, open the Stripe Dashboard below.
              </p>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full bg-primary"
            onClick={() => dashboard.data?.url && window.open(dashboard.data.url, "_blank")}
            disabled={!dashboard.data?.url}
            data-testid="button-open-stripe-dashboard"
          >
            Open Stripe Dashboard <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Platform Economics</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between p-2 border-b">
              <span className="text-muted-foreground">Gross gift volume</span>
              <span className="font-mono">{fmt(earnings?.totalGross ?? 0)}</span>
            </div>
            <div className="flex justify-between p-2 border-b">
              <span className="text-muted-foreground">Streamer share (60%)</span>
              <span className="font-mono text-muted-foreground">−{fmt(earnings?.streamerShare ?? 0)}</span>
            </div>
            <div className="flex justify-between p-2 border-b">
              <span className="text-muted-foreground">Platform share (40%)</span>
              <span className="font-mono text-[hsl(142,76%,50%)]">{fmt(earnings?.platformShare ?? 0)}</span>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              Once you charge users for gifts via Stripe Checkout (next phase), the gross volume above lands in your Stripe balance and the 60% transfers automatically to each streamer's Stripe Connect account when they hit "Withdraw."
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
