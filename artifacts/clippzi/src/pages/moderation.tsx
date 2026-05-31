import {
  useGetPlatformEarnings,
  useListModerationReports,
  getListModerationReportsQueryKey,
  useResolveModerationReport,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Banknote, DollarSign, TrendingUp, Users, ExternalLink, Info, AlertTriangle, Bot, Check, Trash2, LifeBuoy, CheckCircle2, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";

const apiBase = `${import.meta.env.BASE_URL}api`;
const fmt = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function ModerationQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: reports, isLoading } = useListModerationReports(
    { status: "pending" },
    { query: { queryKey: getListModerationReportsQueryKey({ status: "pending" }), refetchInterval: 10000 } },
  );
  const resolve = useResolveModerationReport();

  // Highest-severity first: AI score desc, then most recent. Reports without an
  // AI score (manual user reports) sort below scored ones but above resolved.
  const sortedReports = reports
    ? [...reports].sort((a: any, b: any) => {
        const sa = typeof a.aiScore === "number" ? a.aiScore : -1;
        const sb = typeof b.aiScore === "number" ? b.aiScore : -1;
        if (sb !== sa) return sb - sa;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
    : reports;

  const act = (id: number, status: "actioned" | "dismissed") => {
    resolve.mutate(
      { id, data: { status } },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: getListModerationReportsQueryKey({ status: "pending" }) });
          toast({ title: status === "actioned" ? "Content removed" : "Report dismissed" });
        },
        onError: (e: any) => toast({ title: "Action failed", description: String(e?.message ?? e), variant: "destructive" }),
      },
    );
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-secondary" /> Moderation Queue
          {reports && reports.length > 0 && (
            <Badge variant="outline" className="border-secondary text-secondary">{reports.length} pending</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading reports…</p>
        ) : !reports || reports.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nothing to review — all clear. 🎉</p>
        ) : (
          <div className="space-y-3">
            {sortedReports!.map((r: any) => {
              const isAI = !r.reporter;
              return (
                <div key={r.id} className="p-4 rounded-md border bg-card/50 flex flex-col gap-2" data-testid={`report-${r.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize">{r.contentType} #{r.contentId}</Badge>
                      <Badge variant="outline" className="capitalize border-red-500/50 text-red-400">{r.reason}</Badge>
                      {isAI ? (
                        <span className="flex items-center gap-1 text-xs text-primary"><Bot className="w-3.5 h-3.5" /> AI auto-flag</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">by {r.reporter?.displayName ?? r.reporter?.username ?? "user"}</span>
                      )}
                      {typeof r.aiScore === "number" && (
                        <span className="text-xs text-muted-foreground">score {(r.aiScore * 100).toFixed(0)}%</span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                  {r.description && <p className="text-sm text-white/80">{r.description}</p>}
                  {r.aiFlags && r.aiFlags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.aiFlags.map((f: string) => (
                        <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/15 text-secondary">{f}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={resolve.isPending}
                      onClick={() => act(r.id, "actioned")}
                      data-testid={`button-remove-${r.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resolve.isPending}
                      onClick={() => act(r.id, "dismissed")}
                      data-testid={`button-approve-${r.id}`}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" /> Approve (dismiss)
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProblemReports() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: reports, isLoading } = useQuery<any[]>({
    queryKey: ["problem-reports"],
    queryFn: async () => {
      const r = await apiFetch("api/support/reports");
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    refetchInterval: 15000,
  });
  const resolve = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "open" | "resolved" }) => {
      const r = await apiFetch(`api/support/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["problem-reports"] });
      toast({ title: v.status === "resolved" ? "Marked resolved" : "Reopened" });
    },
    onError: (e: any) => toast({ title: "Action failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const openCount = reports?.filter((r) => r.status !== "resolved").length ?? 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LifeBuoy className="w-5 h-5 text-primary" /> Problem Reports
          {openCount > 0 && (
            <Badge variant="outline" className="border-primary text-primary">{openCount} open</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading reports…</p>
        ) : !reports || reports.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No problem reports yet. 🎉</p>
        ) : (
          <div className="space-y-3">
            {reports.map((r: any) => {
              const resolved = r.status === "resolved";
              return (
                <div key={r.id} className={`p-4 rounded-md border flex flex-col gap-2 ${resolved ? "bg-card/30 opacity-70" : "bg-card/50"}`} data-testid={`problem-report-${r.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{r.category}</Badge>
                      <span className="text-xs text-muted-foreground">
                        by {r.reporter?.displayName ?? r.reporter?.username ?? `user #${r.userId}`}
                      </span>
                      {resolved && (
                        <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> resolved</span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-white/90">{r.message}</p>
                  {r.aiResponse && (
                    <div className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3 whitespace-pre-wrap">
                      <span className="flex items-center gap-1 text-primary mb-1"><Bot className="w-3.5 h-3.5" /> AI reply sent</span>
                      {r.aiResponse}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    {resolved ? (
                      <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, status: "open" })} data-testid={`button-reopen-${r.id}`}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reopen
                      </Button>
                    ) : (
                      <Button size="sm" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, status: "resolved" })} data-testid={`button-resolve-${r.id}`}>
                        <Check className="w-3.5 h-3.5 mr-1" /> Mark resolved
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
      <p className="text-sm text-muted-foreground mb-6">Content moderation queue and your 40% platform revenue from gifts (powered by Stripe Connect)</p>

      <ModerationQueue />

      <ProblemReports />

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
