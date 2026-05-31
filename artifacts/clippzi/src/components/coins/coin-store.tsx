import { useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";

// 1 coin = $0.01. Stripe's minimum charge is $0.50, so the smallest custom
// top-up is 50 coins. Largest package / custom amount is 250,000 coins ($2,500).
const MIN_COINS = 50;
const MAX_COINS = 250_000;
const PACKAGES = [100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 250_000];

function priceLabel(coins: number): string {
  return (coins / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function CoinStore({
  open,
  onOpenChange,
  balance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balance?: number;
}) {
  const { toast } = useToast();
  const [custom, setCustom] = useState("");
  const [pending, setPending] = useState<number | null>(null);

  const startCheckout = async (coins: number) => {
    if (pending != null) return;
    if (!Number.isFinite(coins) || coins < MIN_COINS || coins > MAX_COINS) {
      toast({
        title: "Pick a valid amount",
        description: `Choose between ${MIN_COINS.toLocaleString()} and ${MAX_COINS.toLocaleString()} coins.`,
        variant: "destructive",
      });
      return;
    }
    setPending(coins);
    try {
      const r = await apiFetch("api/coins/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coins }),
      });
      const data = await r.json();
      if (!r.ok || !data.url) {
        toast({ title: "Couldn't start checkout", description: data.error ?? `HTTP ${r.status}`, variant: "destructive" });
        setPending(null);
        return;
      }
      window.location.href = data.url;
    } catch (e: any) {
      toast({ title: "Couldn't start checkout", description: String(e?.message ?? e), variant: "destructive" });
      setPending(null);
    }
  };

  const customCoins = Math.floor(Number(custom));
  const customValid = Number.isFinite(customCoins) && customCoins >= MIN_COINS && customCoins <= MAX_COINS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" /> Get Coins
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg bg-black/40 border border-border px-3 py-2 mb-1">
          <span className="text-xs text-muted-foreground">Your balance</span>
          <span className="text-sm font-bold text-amber-400 flex items-center gap-1">
            <Coins className="w-4 h-4" /> {(balance ?? 0).toLocaleString()}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">1 coin = $0.01. Use coins to send gifts to creators.</p>

        <ScrollArea className="max-h-[46vh] -mx-1 px-1">
          <div className="grid grid-cols-2 gap-2 py-1">
            {PACKAGES.map((coins) => (
              <button
                key={coins}
                onClick={() => startCheckout(coins)}
                disabled={pending != null}
                data-testid={`button-coin-pack-${coins}`}
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg bg-black/60 border border-border hover:border-amber-400/70 hover:bg-zinc-800 transition-all active:scale-95 disabled:opacity-50"
              >
                <span className="flex items-center gap-1 text-white font-bold">
                  {pending === coins ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4 text-amber-400" />}
                  {coins.toLocaleString()}
                </span>
                <span className="text-[11px] text-muted-foreground">{priceLabel(coins)}</span>
              </button>
            ))}
          </div>
        </ScrollArea>

        <div className="space-y-2 pt-1">
          <span className="text-xs text-muted-foreground">Or enter a custom amount</span>
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={MIN_COINS}
              max={MAX_COINS}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={`${MIN_COINS}–${MAX_COINS.toLocaleString()} coins`}
              className="bg-input border-border"
              data-testid="input-custom-coins"
            />
            <Button
              onClick={() => startCheckout(customCoins)}
              disabled={!customValid || pending != null}
              className="bg-amber-500 text-black font-bold hover:bg-amber-400 shrink-0"
              data-testid="button-buy-custom-coins"
            >
              {pending === customCoins ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buy"}
            </Button>
          </div>
          {custom !== "" && customValid && (
            <p className="text-[11px] text-muted-foreground">
              {customCoins.toLocaleString()} coins · {priceLabel(customCoins)}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
