import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";
import { useInvalidatePayoutMethod } from "@/hooks/use-payout-method";

const METHODS = [
  { value: "paypal", label: "PayPal", hint: "Your PayPal email", icon: "🅿️" },
  { value: "cashapp", label: "Cash App", hint: "Your $Cashtag", icon: "💵" },
  { value: "venmo", label: "Venmo", hint: "Your @username", icon: "🔵" },
  { value: "zelle", label: "Zelle", hint: "Your email or phone", icon: "⚡" },
  { value: "other", label: "Other", hint: "Tell us how to pay you", icon: "✍️" },
];

export function PayoutSetup({
  userId,
  currentMethod,
  currentHandle,
  onSaved,
}: {
  userId: number;
  currentMethod?: string | null;
  currentHandle?: string | null;
  onSaved?: () => void;
}) {
  const [method, setMethod] = useState(currentMethod ?? "");
  const [handle, setHandle] = useState(currentHandle ?? "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const invalidate = useInvalidatePayoutMethod();
  const selected = METHODS.find((m) => m.value === method);

  const save = async () => {
    if (!method) {
      toast({ title: "Pick a payout method", description: "Choose where you'd like to get paid.", variant: "destructive" });
      return;
    }
    if (handle.trim().length < 3) {
      toast({ title: "Enter your payout details", description: selected?.hint ?? "", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch(`api/users/${userId}/payout-method`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, handle: handle.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Failed to save");
      invalidate(userId);
      toast({ title: "Payout method saved! 💸", description: "You're all set to get paid." });
      onSaved?.();
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {METHODS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMethod(m.value)}
            className={`flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition ${
              method === m.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
            }`}
            data-testid={`button-payout-${m.value}`}
          >
            <span className="text-lg">{m.icon}</span>
            <span className="text-sm font-semibold text-white">{m.label}</span>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <Label className="text-white">{selected ? selected.hint : "Your payout details"}</Label>
        <Input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder={selected?.hint ?? "e.g. your PayPal email"}
          className="bg-input border-border"
          data-testid="input-payout-handle"
        />
        <p className="text-xs text-muted-foreground">This is where Clippzi sends your earnings. You can update it anytime.</p>
      </div>
      <Button
        onClick={save}
        disabled={saving}
        className="w-full bg-primary text-black font-bold hover:bg-primary/90"
        data-testid="button-save-payout"
      >
        {saving ? "Saving…" : "Save payout method"}
      </Button>
    </div>
  );
}
