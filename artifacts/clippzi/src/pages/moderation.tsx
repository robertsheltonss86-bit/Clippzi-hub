import { useState } from "react";
import {
  useGetPlatformEarnings,
  useGetPlatformBank,
  useLinkPlatformBank,
  useRequestPlatformPayout,
  useListPlatformPayouts,
  getGetPlatformEarningsQueryKey,
  getGetPlatformBankQueryKey,
  getListPlatformPayoutsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Shield, Banknote, ArrowDownToLine, Lock, DollarSign, TrendingUp, Users } from "lucide-react";

const fmt = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Moderation() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: earnings } = useGetPlatformEarnings();
  const { data: bank } = useGetPlatformBank({ query: { retry: false } });
  const { data: payouts } = useListPlatformPayouts();
  const linkBank = useLinkPlatformBank();
  const requestPayout = useRequestPlatformPayout();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ bankName: "", accountNumber: "", routingNumber: "", accountHolderName: "" });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetPlatformEarningsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetPlatformBankQueryKey() });
    qc.invalidateQueries({ queryKey: getListPlatformPayoutsQueryKey() });
  };

  const submitBank = async () => {
    if (!form.bankName || !form.accountNumber || !form.accountHolderName) {
      toast({ title: "Fill required fields", variant: "destructive" });
      return;
    }
    try {
      await linkBank.mutateAsync({ data: form });
      toast({ title: "Platform bank linked!", description: `Account •••${form.accountNumber.slice(-4)}` });
      setOpen(false);
      setForm({ bankName: "", accountNumber: "", routingNumber: "", accountHolderName: "" });
      invalidate();
    } catch (e: any) {
      toast({ title: "Couldn't link bank", description: String(e?.message ?? e), variant: "destructive" });
    }
  };

  const withdraw = async () => {
    try {
      const p = await requestPayout.mutateAsync();
      toast({ title: "Platform withdrawal sent!", description: `${fmt(Number(p.amount))} to •••${p.bankLast4}` });
      invalidate();
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? String(e?.message ?? e);
      toast({ title: "Withdrawal failed", description: msg, variant: "destructive" });
    }
  };

  const pending = earnings?.pendingPayout ?? 0;
  const hasBank = !!bank && !(bank as any).error;
  const canWithdraw = hasBank && pending > 0;

  return (
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto" data-testid="page-moderation">
      <div className="flex items-center gap-3 mb-2">
        <Shield className="w-7 h-7 text-primary" />
        <h1 className="text-3xl font-bold">Platform Admin</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Manage your 40% platform revenue from gifts</p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Platform Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[hsl(var(--neon-green,142_76%_50%))]" data-testid="text-platform-pending">
              {fmt(pending)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Ready to withdraw</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground flex items-center gap-2">
              <Banknote className="w-4 h-4" /> Platform Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-platform-paid">{fmt(earnings?.paidOut ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Lifetime withdrawals</p>
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
            <span>Platform Bank Account</span>
            {hasBank ? (
              <Badge variant="outline" className="border-green-500 text-green-500">Linked</Badge>
            ) : (
              <Badge variant="outline" className="border-yellow-500 text-yellow-500">Not Linked</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasBank ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold" data-testid="text-platform-bank-name">{(bank as any).bankName}</p>
                <p className="text-sm text-muted-foreground">
                  {(bank as any).accountHolderName} • Account •••{(bank as any).last4}
                </p>
              </div>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-replace-platform-bank">Replace</Button>
                </DialogTrigger>
                <BankForm form={form} setForm={setForm} onSubmit={submitBank} loading={linkBank.isPending} />
              </Dialog>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Link your platform bank to withdraw the {fmt(pending)} in platform revenue.
              </p>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-link-platform-bank" className="bg-primary">Link Platform Bank</Button>
                </DialogTrigger>
                <BankForm form={form} setForm={setForm} onSubmit={submitBank} loading={linkBank.isPending} />
              </Dialog>
            </>
          )}

          <div className="pt-4 border-t">
            <Button
              size="lg"
              className="w-full bg-[hsl(var(--neon-green,142_76%_50%))] text-black hover:opacity-90"
              disabled={!canWithdraw || requestPayout.isPending}
              onClick={withdraw}
              data-testid="button-platform-withdraw"
            >
              <ArrowDownToLine className="w-4 h-4 mr-2" />
              {requestPayout.isPending ? "Processing…" : `Withdraw ${fmt(pending)}`}
            </Button>
            {!hasBank && (
              <p className="text-xs text-muted-foreground mt-2 text-center">Link the platform bank above to enable withdrawals</p>
            )}
            {hasBank && pending <= 0 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">No platform revenue pending yet</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform Payout History</CardTitle>
        </CardHeader>
        <CardContent>
          {!payouts || payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No platform payouts yet.</p>
          ) : (
            <div className="space-y-2">
              {payouts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-md bg-card/50 border"
                  data-testid={`row-platform-payout-${p.id}`}
                >
                  <div>
                    <p className="font-semibold">{fmt(Number(p.amount))}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.createdAt).toLocaleString()} • •••{p.bankLast4}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-green-500 text-green-500 capitalize">{p.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BankForm({
  form, setForm, onSubmit, loading,
}: {
  form: { bankName: string; accountNumber: string; routingNumber: string; accountHolderName: string };
  setForm: (f: any) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <DialogContent data-testid="dialog-platform-bank">
      <DialogHeader>
        <DialogTitle>Link Platform Bank</DialogTitle>
        <DialogDescription>This is where your 40% platform revenue will be deposited.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Bank Name</Label>
          <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })}
            placeholder="Chase, Bank of America…" data-testid="input-platform-bank-name" />
        </div>
        <div>
          <Label>Account Holder Name</Label>
          <Input value={form.accountHolderName} onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })}
            placeholder="Business or legal name" data-testid="input-platform-holder" />
        </div>
        <div>
          <Label>Routing Number</Label>
          <Input value={form.routingNumber} onChange={(e) => setForm({ ...form, routingNumber: e.target.value })}
            placeholder="9 digits" data-testid="input-platform-routing" />
        </div>
        <div>
          <Label>Account Number</Label>
          <Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
            placeholder="Account number" data-testid="input-platform-account" />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onSubmit} disabled={loading} data-testid="button-submit-platform-bank">
          {loading ? "Linking…" : "Link Account"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
