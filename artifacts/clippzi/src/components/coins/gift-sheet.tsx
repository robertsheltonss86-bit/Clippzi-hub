import { useState } from "react";
import { Coins, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useListGifts, getListGiftsQueryKey } from "@workspace/api-client-react";
import { useCoinBalance } from "@/hooks/use-coin-balance";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";
import { formatPoints } from "@/lib/points";
import { CoinStore } from "./coin-store";

function getRarityColor(rarity?: string) {
  switch (rarity) {
    case "legendary": return "border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]";
    case "epic": return "border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]";
    case "rare": return "border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]";
    default: return "border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]";
  }
}

// A self-contained "send a gift" chest that works on any content — feed posts,
// post detail, or anywhere a creator can be tipped. Pass the creator's user id
// as `receiverId` and (optionally) a `streamId` when used inside a live stream.
// It deducts coins from the sender's wallet via /api/coins/gift; if the wallet
// is short it pops the CoinStore so they can top up without leaving the page.
export function GiftSheet({
  receiverId,
  streamId,
  subtitle,
  onSent,
  children,
}: {
  receiverId: number;
  streamId?: number;
  subtitle?: string;
  onSent?: () => void;
  children: React.ReactNode;
}) {
  const { userId, isAuthenticated, login } = useCurrentUser();
  const { toast } = useToast();
  const { balance: coinBalance, refetch: refetchBalance } = useCoinBalance();
  const { data: gifts } = useListGifts(undefined, { query: { queryKey: getListGiftsQueryKey() } });

  const [open, setOpen] = useState(false);
  const [coinStoreOpen, setCoinStoreOpen] = useState(false);
  const [sendingGiftId, setSendingGiftId] = useState<number | null>(null);

  const handleSendGift = async (giftId: number, name: string, price: number) => {
    if (!isAuthenticated || !userId) { login(); return; }
    if (sendingGiftId != null) return;
    const coinCost = Math.round(price * 100);
    if (coinBalance < coinCost) {
      toast({ title: "Not enough coins", description: `${name} costs ${coinCost.toLocaleString()} coins. Top up to keep gifting.` });
      setCoinStoreOpen(true);
      return;
    }
    setSendingGiftId(giftId);
    try {
      const r = await apiFetch("api/coins/gift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ giftId, receiverId, quantity: 1, ...(streamId ? { streamId } : {}) }),
      });
      const data = await r.json();
      if (r.status === 402) {
        toast({ title: "Not enough coins", description: "Top up to keep gifting." });
        await refetchBalance();
        setCoinStoreOpen(true);
        return;
      }
      if (!r.ok) {
        toast({ title: "Couldn't send gift", description: data.error ?? `HTTP ${r.status}`, variant: "destructive" });
        return;
      }
      toast({ title: `Sent ${name}! 🎁`, description: `−${coinCost.toLocaleString()} coins • ${formatPoints(price)} pts to the creator` });
      await refetchBalance();
      onSent?.();
    } catch (e: any) {
      toast({ title: "Couldn't send gift", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setSendingGiftId(null);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (next && (!isAuthenticated || !userId)) { login(); return; }
          setOpen(next);
        }}
      >
        <SheetTrigger asChild>{children}</SheetTrigger>
        <SheetContent side="bottom" className="bg-card border-border h-[65vh] flex flex-col">
          <SheetHeader>
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="text-white flex items-center gap-2"><span className="text-xl">🎁</span> Gift Chest</SheetTitle>
              <button
                onClick={() => (isAuthenticated ? setCoinStoreOpen(true) : login())}
                className="flex items-center gap-1.5 rounded-full bg-black/50 border border-amber-400/50 pl-2.5 pr-1.5 py-1 text-sm font-bold text-amber-400 hover:bg-black/70 active:scale-95 transition"
                data-testid="button-open-coin-store"
              >
                <Coins className="w-4 h-4" />
                {coinBalance.toLocaleString()}
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-black"><Plus className="w-3.5 h-3.5" /></span>
              </button>
            </div>
          </SheetHeader>
          <p className="text-xs text-muted-foreground mt-1 mb-3">{subtitle ?? "Spend coins • creator keeps 70%"}</p>
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-3 gap-2 pb-4">
              {gifts?.map((gift) => (
                <button
                  key={gift.id}
                  disabled={sendingGiftId != null}
                  onClick={() => handleSendGift(gift.id, gift.name, Number(gift.price))}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg bg-black/60 border-2 transition-all hover:scale-105 hover:bg-zinc-800 disabled:opacity-50 ${getRarityColor(gift.rarity)}`}
                  data-testid={`button-gift-content-${gift.id}`}
                >
                  {gift.iconUrl ? (
                    <img src={gift.iconUrl} alt={gift.name} className="w-16 h-16 object-contain mb-1 drop-shadow-[0_0_8px_rgba(0,0,0,0.6)]" loading="lazy" />
                  ) : (
                    <span className="text-4xl mb-1 drop-shadow-md">{gift.emoji}</span>
                  )}
                  <span className="text-[10px] text-white font-medium truncate w-full text-center">{gift.name}</span>
                  <span className="text-[10px] text-amber-400 font-bold flex items-center gap-0.5"><Coins className="w-2.5 h-2.5" />{Math.round(Number(gift.price) * 100).toLocaleString()}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
      <CoinStore open={coinStoreOpen} onOpenChange={setCoinStoreOpen} balance={coinBalance} />
    </>
  );
}
