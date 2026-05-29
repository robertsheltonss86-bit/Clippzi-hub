import { Coins, CreditCard, Plus } from "lucide-react";
import { BuyCoinsSheet } from "@/components/buy-coins-sheet";

export function GiftPayBar({
  payWithCoins,
  setPayWithCoins,
  balance,
  compact,
}: {
  payWithCoins: boolean;
  setPayWithCoins: (v: boolean) => void;
  balance: number;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${compact ? "mb-1" : "mb-3"}`}>
      <div className="flex items-center gap-1 rounded-full bg-black/60 border border-white/15 p-0.5">
        <button
          type="button"
          onClick={() => setPayWithCoins(true)}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            payWithCoins ? "bg-amber-400 text-black" : "text-white/70 hover:text-white"
          }`}
          data-testid="button-pay-coins"
        >
          <Coins className="w-3 h-3" /> Coins
        </button>
        <button
          type="button"
          onClick={() => setPayWithCoins(false)}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            !payWithCoins ? "bg-primary text-black" : "text-white/70 hover:text-white"
          }`}
          data-testid="button-pay-card"
        >
          <CreditCard className="w-3 h-3" /> Card
        </button>
      </div>
      <BuyCoinsSheet
        trigger={
          <button
            className="flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-2.5 py-1 text-[11px] font-bold text-black shadow-[0_0_10px_rgba(251,191,36,0.5)] active:scale-95 transition-transform"
            data-testid="button-open-buy-coins"
          >
            <Coins className="w-3 h-3" /> {balance.toLocaleString()} <Plus className="w-3 h-3" />
          </button>
        }
      />
    </div>
  );
}
