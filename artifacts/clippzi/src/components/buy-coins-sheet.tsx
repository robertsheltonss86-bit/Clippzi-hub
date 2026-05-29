import { useState } from "react";
import { Loader2, Coins, Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  useCoinBalance,
  useCoinPacks,
  useCoinActions,
  type CoinPack,
} from "@/hooks/use-coins";

export function BuyCoinsSheet({ trigger }: { trigger: React.ReactNode }) {
  const { isAuthenticated, login } = useCurrentUser();
  const { data: balance } = useCoinBalance();
  const { data: packsData, isLoading } = useCoinPacks();
  const { buyPack } = useCoinActions();
  const { toast } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleBuy = async (pack: CoinPack) => {
    if (!isAuthenticated) {
      login();
      return;
    }
    setPendingId(pack.id);
    try {
      const { url } = await buyPack(pack.id);
      toast({ title: "Opening Stripe Checkout…", description: `${pack.coins.toLocaleString()} coins for $${pack.priceUsd.toFixed(2)}` });
      window.location.href = url;
    } catch (e: any) {
      setPendingId(null);
      toast({ title: "Couldn't start checkout", description: String(e?.message ?? e), variant: "destructive" });
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="bg-card border-border h-[70vh] flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-400" /> Buy Coins
            </span>
            {isAuthenticated && (
              <span className="text-sm font-bold text-amber-400 flex items-center gap-1" data-testid="text-coin-balance-sheet">
                <Coins className="w-4 h-4" /> {(balance ?? 0).toLocaleString()}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>
        <p className="text-xs text-muted-foreground mt-1 mb-3">
          Coins let you send gifts instantly — no card needed each time. 1 coin = $0.01.
        </p>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-4">
              {packsData?.packs.map((pack) => {
                const total = pack.coins + (pack.bonus ?? 0);
                const busy = pendingId === pack.id;
                return (
                  <button
                    type="button"
                    key={pack.id}
                    onClick={() => handleBuy(pack)}
                    disabled={busy}
                    className={`relative flex flex-col items-center justify-center gap-1 p-4 rounded-xl border-2 bg-gradient-to-b from-zinc-800/80 to-black/80 transition-all hover:scale-[1.03] active:scale-95 disabled:opacity-60 ${
                      pack.popular
                        ? "border-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.5)]"
                        : "border-white/15 hover:border-amber-400/60"
                    }`}
                    data-testid={`button-coin-pack-${pack.id}`}
                  >
                    {pack.popular && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wide bg-amber-400 text-black px-2 py-0.5 rounded-full flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5" /> Popular
                      </span>
                    )}
                    <Coins className="w-8 h-8 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                    <span className="text-lg font-extrabold text-white leading-none">{total.toLocaleString()}</span>
                    {pack.bonus ? (
                      <span className="text-[10px] text-emerald-400 font-semibold">+{pack.bonus} bonus</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">coins</span>
                    )}
                    <span className="mt-1 text-sm font-bold text-amber-300">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `$${pack.priceUsd.toFixed(2)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
