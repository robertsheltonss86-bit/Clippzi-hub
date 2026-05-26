import { useState } from "react";
import { useParams } from "wouter";
import {
  useGetUserEarnings,
  useGetUserBankAccount,
  useLinkBankAccount,
  useRequestUserPayout,
  useListUserPayouts,
  getGetUserEarningsQueryKey,
  getGetUserBankAccountQueryKey,
  getListUserPayoutsQueryKey,
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
import { Banknote, Wallet, TrendingUp, ArrowDownToLine, Lock } from "lucide-react";

const fmt = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Earnings() {
  const params = useParams<{ id: string }>();
  const userId = Number(params.id);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: earnings } = useGetUserEarnings(userId);
  const { data: bank } = useGetUserBankAccount(userId, {
    query: { retry: false },
  });
  const { data: payouts } = useListUserPayouts(userId);

  const linkBank = useLinkBankAccount();
  const requestPayout = useRequestUserPayout();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ bankName: "", accountNumber: "", routingNumber: "", accountHolderName: "" });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetUserEarningsQueryKey(userId) });
    qc.invalidateQueries({ queryKey: getGetUserBankAccountQueryKey(userId) });
    qc.invalidateQueries({ queryKey: getListUserPayoutsQueryKey(userId) });
  };

  const submitBank = async () => {
    if (!form.bankName || !form.accountNumber || !form.routingNumber || !form.accountHolderName) {
      toast({ title: "Fill all fields", variant: "destructive" });
      return;
    }
    try {
      await linkBank.mutateAsync({ id: userId, data: form });
      toast({ title: "Bank linked!", description: `Account ending in •••${form.accountNumber.slice(-4)}` });
      setOpen(false);
      setForm({ bankName: "", accountNumber: "", routingNumber: "", accountHolderName: "" });
      invalidate();
    } catch (e: any) {
      toast({ title: "Couldn't link bank", description: String(e?.message ?? e), variant: "destructive" });
    }
  };

  const withdraw = async () => {
    try {
      const p = await requestPayout.mutateAsync({ id: userId });
      toast({ title: "Withdrawal sent!", description: `${fmt(Number(p.amount))} to •••${p.bankLast4}` });
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
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto" data-testid="page-earnings">
      <div className="flex items-center gap-3 mb-6">
        <Wallet className="w-7 h-7 text-primary" />
        <h1 className="text-3xl font-bold">Earnings & Payouts</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card data-testid="card-pending">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4" /> Pending Payout
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[hsl(var(--neon-green,142_76%_50%))]" data-testid="text-pending">
              {fmt(pending)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Your 60% streamer share, ready to withdraw</p>
          </CardContent>
        </Card>

        <Card data-testid="card-paidout">
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

        <Card data-testid="card-gross">
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
            <span>Bank Account</span>
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
                <p className="font-semibold" data-testid="text-bank-name">{(bank as any).bankName}</p>
                <p className="text-sm text-muted-foreground">
                  {(bank as any).accountHolderName} • Account ending in •••{(bank as any).last4}
                </p>
              </div>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-replace-bank">Replace</Button>
                </DialogTrigger>
                <BankForm form={form} setForm={setForm} onSubmit={submitBank} loading={linkBank.isPending} />
              </Dialog>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Link a bank account to withdraw your {fmt(pending)} in pending earnings.
              </p>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-link-bank" className="bg-primary">Link Bank Account</Button>
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
              data-testid="button-withdraw"
            >
              <ArrowDownToLine className="w-4 h-4 mr-2" />
              {requestPayout.isPending ? "Processing…" : `Withdraw ${fmt(pending)}`}
            </Button>
            {!hasBank && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Link a bank account above to enable withdrawals
              </p>
            )}
            {hasBank && pending <= 0 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                No pending earnings — keep streaming to earn gifts!
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payout History</CardTitle>
        </CardHeader>
        <CardContent>
          {!payouts || payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-payouts">No payouts yet.</p>
          ) : (
            <div className="space-y-2">
              {payouts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-md bg-card/50 border"
                  data-testid={`row-payout-${p.id}`}
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
    <DialogContent data-testid="dialog-bank">
      <DialogHeader>
        <DialogTitle>Link Bank Account</DialogTitle>
        <DialogDescription>Enter your bank details to receive payouts.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Bank Name</Label>
          <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })}
            placeholder="Chase, Bank of America…" data-testid="input-bank-name" />
        </div>
        <div>
          <Label>Account Holder Name</Label>
          <Input value={form.accountHolderName} onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })}
            placeholder="Full legal name" data-testid="input-account-holder" />
        </div>
        <div>
          <Label>Routing Number</Label>
          <Input value={form.routingNumber} onChange={(e) => setForm({ ...form, routingNumber: e.target.value })}
            placeholder="9 digits" data-testid="input-routing" />
        </div>
        <div>
          <Label>Account Number</Label>
          <Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
            placeholder="Account number" data-testid="input-account-number" />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onSubmit} disabled={loading} data-testid="button-submit-bank">
          {loading ? "Linking…" : "Link Account"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
