import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Loader2, AlertCircle, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function CheckoutSuccess() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, login } = useCurrentUser();
  const [status, setStatus] = useState<"loading" | "ok" | "error" | "needs-login">("loading");
  const [error, setError] = useState<string>("");
  const [isCoins, setIsCoins] = useState(false);
  const [coinsAdded, setCoinsAdded] = useState<number | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const coins = params.get("type") === "coins";
    setIsCoins(coins);
    if (!sessionId) {
      setStatus("error");
      setError("Missing session_id");
      return;
    }
    if (!isAuthenticated) {
      setStatus("needs-login");
      return;
    }
    const base = import.meta.env.BASE_URL;
    const endpoint = coins ? "api/checkout/coins/confirm" : "api/checkout/gift/confirm";
    fetch(`${base}${endpoint}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (r) => {
        if (r.status === 401) { setStatus("needs-login"); return; }
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
        if (coins && typeof data.coinsAdded === "number") setCoinsAdded(data.coinsAdded);
        setStatus("ok");
      })
      .catch((e) => {
        setStatus("error");
        setError(String(e?.message ?? e));
      });
  }, [isLoading, isAuthenticated]);

  return (
    <div className="min-h-full w-full flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-card border border-border rounded-lg p-8 text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
            <h2 className="text-xl font-bold">{isCoins ? "Adding your coins…" : "Confirming your gift…"}</h2>
            <p className="text-muted-foreground text-sm">Hang tight — we're recording the transaction.</p>
          </>
        )}
        {status === "ok" && (
          <>
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-500" data-testid="text-checkout-success" />
            {isCoins ? (
              <>
                <h2 className="text-xl font-bold">Coins added! 🪙</h2>
                <p className="text-muted-foreground" data-testid="text-coins-added">
                  {coinsAdded != null ? `${coinsAdded.toLocaleString()} coins are now in your wallet.` : "Your coins are now in your wallet."}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold">Gift sent! 🎁</h2>
                <p className="text-muted-foreground">Thank you for supporting the creator.</p>
              </>
            )}
            <Button onClick={() => setLocation("/")} className="w-full" data-testid="button-back-home">Back to feed</Button>
          </>
        )}
        {status === "needs-login" && (
          <>
            <LogIn className="w-12 h-12 mx-auto text-primary" />
            <h2 className="text-xl font-bold">Sign in to finish</h2>
            <p className="text-muted-foreground text-sm">Your payment went through. Sign in so we can credit the creator.</p>
            <Button onClick={login} className="w-full" data-testid="button-login-confirm">Sign in</Button>
          </>
        )}
        {status === "error" && (
          <>
            <AlertCircle className="w-12 h-12 mx-auto text-destructive" />
            <h2 className="text-xl font-bold">Couldn't confirm gift</h2>
            <p className="text-sm text-destructive">{error}</p>
            <Button onClick={() => setLocation("/")} variant="outline" className="w-full">Back to feed</Button>
          </>
        )}
      </div>
    </div>
  );
}
