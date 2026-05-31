import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LifeBuoy, Bot, Mail, Send, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { apiFetch } from "@/lib/api-fetch";

const CATEGORIES = ["Going live", "Coins & payments", "Gifts", "Earnings & payouts", "My account", "Uploading", "Other"];
const SUPPORT_EMAIL = "Clippziapp@gmail.com";

export default function Support() {
  const { isAuthenticated, login } = useCurrentUser();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [category, setCategory] = useState("Going live");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [latest, setLatest] = useState<any | null>(null);

  const { data: mine } = useQuery<any[]>({
    queryKey: ["my-problem-reports"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const r = await apiFetch("api/support/reports/mine");
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });

  const submit = async () => {
    if (!isAuthenticated) { login(); return; }
    if (message.trim().length < 5) {
      toast({ title: "Tell us a bit more", description: "Describe the problem in a few words.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const r = await apiFetch("api/support/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message: message.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Failed to send");
      setLatest(d);
      setMessage("");
      qc.invalidateQueries({ queryKey: ["my-problem-reports"] });
      toast({ title: "Report sent ✅", description: "We've logged it and our team can see it." });
    } catch (e: any) {
      toast({ title: "Couldn't send", description: e?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-3xl mx-auto" data-testid="page-support">
      <div className="flex items-center gap-3 mb-2">
        <LifeBuoy className="w-7 h-7 text-primary" />
        <h1 className="text-3xl font-bold text-white">Report a Problem</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Having trouble? Tell us what's going on and get instant help. Our team sees every report.</p>

      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">What's the problem about?</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                  category === c ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`chip-category-${c.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              >
                {c}
              </button>
            ))}
          </div>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe what happened. The more detail, the better we can help."
            className="bg-input border-border min-h-[120px]"
            data-testid="input-problem-message"
          />
          <Button onClick={submit} disabled={submitting} className="w-full bg-primary text-black font-bold hover:bg-primary/90 gap-2" data-testid="button-submit-problem">
            <Send className="w-4 h-4" /> {submitting ? "Sending…" : "Send & get help"}
          </Button>
        </CardContent>
      </Card>

      {latest && (
        <Card className="mb-6 border-primary/40">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bot className="w-5 h-5 text-primary" /> Instant help</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {latest.aiResponse ? (
              <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed" data-testid="text-ai-response">{latest.aiResponse}</p>
            ) : (
              <p className="text-sm text-white/90">Thanks — your report is logged. For a faster hands-on fix, email us below.</p>
            )}
            <div className="rounded-lg bg-card/60 border border-border p-3 flex items-start gap-3">
              <Mail className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-white font-medium">Still stuck?</p>
                <p className="text-muted-foreground">Email <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">{SUPPORT_EMAIL}</a> to reach a live technician.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {mine && mine.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Your past reports</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {mine.map((r) => (
              <div key={r.id} className="p-3 rounded-lg border border-border bg-card/40" data-testid={`my-report-${r.id}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <Badge variant="outline" className="border-border">{r.category}</Badge>
                  {r.status === "resolved" ? (
                    <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Resolved</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Open</span>
                  )}
                </div>
                <p className="text-sm text-white/80">{r.message}</p>
                {r.aiResponse && <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap border-t border-border pt-2">{r.aiResponse}</p>}
                <p className="text-[11px] text-muted-foreground mt-1">{new Date(r.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!isAuthenticated && (
        <p className="text-sm text-muted-foreground text-center mt-4">
          Please <button onClick={login} className="text-primary underline">log in</button> to send a report.
        </p>
      )}
    </div>
  );
}
