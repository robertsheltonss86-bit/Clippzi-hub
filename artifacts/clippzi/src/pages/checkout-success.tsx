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

  useEffect(() => {
    if (isLoading) return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
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
    fetch(`${base}api/checkout/gift/confirm`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (r) => {
        if (r.status === 401) { setStatus("needs-login"); return; }
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
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
            <h2 className="text-xl font-bold">Confirming your gift…</h2>
            <p className="text-muted-foreground text-sm">Hang tight — we're recording the transaction.</p>
          </>
        )}
        {status === "ok" && (
          <>
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-500" data-testid="text-checkout-success" />
            <h2 className="text-xl font-bold">Gift sent! 🎁</h2>
            <p className="text-muted-foreground">Thank you for supporting the creator.</p>
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
