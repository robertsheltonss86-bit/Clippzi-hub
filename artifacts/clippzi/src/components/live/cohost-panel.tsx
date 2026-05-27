import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Users, Copy, Check, X, UserPlus, KeyRound, Loader2 } from "lucide-react";

type CohostUser = { id: number; displayName?: string | null; username?: string | null; avatarUrl?: string | null };
type CohostRow = { id: number; userId: number; status: "pending" | "approved" | "rejected"; createdAt: string; user: CohostUser | null };
type CohostsResp = {
  mode: string;
  maxCohosts: number;
  inviteCode: string | null;
  approved: CohostRow[];
  pending: CohostRow[];
};

const base = () => import.meta.env.BASE_URL;

async function apiGet(path: string) {
  const r = await fetch(`${base()}api${path}`, { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function apiPost(path: string, body?: any) {
  const r = await fetch(`${base()}api${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}
async function apiDelete(path: string) {
  const r = await fetch(`${base()}api${path}`, { method: "DELETE", credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function CohostPanel({ streamId, isHost, onChanged }: { streamId: number; isHost: boolean; onChanged?: () => void }) {
  const { userId, isAuthenticated, login } = useCurrentUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CohostsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [myStatus, setMyStatus] = useState<"none" | "pending" | "approved" | "rejected">("none");
  const isGroup = data?.mode === "group";

  const enableGroup = async () => {
    setEnabling(true);
    try {
      await apiPost(`/livestreams/${streamId}/enable-group`);
      toast({ title: "Group live enabled 🎉", description: "Up to 15 co-hosts can now join your camera grid." });
      // Reload so the page re-mounts with GroupRoomProvider
      setTimeout(() => window.location.reload(), 600);
    } catch (e: any) {
      toast({ title: "Couldn't enable", description: e.message, variant: "destructive" });
      setEnabling(false);
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const d: CohostsResp = await apiGet(`/livestreams/${streamId}/cohosts`);
      setData(d);
      if (userId) {
        const mine = [...d.approved, ...d.pending].find((r) => r.userId === userId);
        const next = mine ? mine.status : "none";
        // Auto-reload when a pending viewer just got approved so we re-mint a publisher token
        if (!isHost && myStatus === "pending" && next === "approved") {
          toast({ title: "You're in! 🎉", description: "Joining the grid…" });
          setTimeout(() => window.location.reload(), 700);
        }
        setMyStatus(next);
      }
      onChanged?.();
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    const id = setInterval(refresh, 4000); // poll for new requests
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, streamId]);

  const copy = async () => {
    if (!data?.inviteCode) return;
    await navigator.clipboard.writeText(data.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const approve = async (uid: number) => {
    try { await apiPost(`/livestreams/${streamId}/cohosts/${uid}/approve`); refresh(); }
    catch (e: any) { toast({ title: "Couldn't approve", description: e.message, variant: "destructive" }); }
  };
  const reject = async (uid: number) => {
    try { await apiPost(`/livestreams/${streamId}/cohosts/${uid}/reject`); refresh(); }
    catch { /* noop */ }
  };
  const remove = async (uid: number) => {
    try {
      await apiDelete(`/livestreams/${streamId}/cohosts/${uid}`);
      // If I removed myself, reload so my client drops publish rights & rejoins as viewer
      if (uid === userId) { window.location.reload(); return; }
      refresh();
    } catch { /* noop */ }
  };

  const request = async () => {
    if (!isAuthenticated) { login(); return; }
    try {
      const r = await apiPost(`/livestreams/${streamId}/cohosts/request`);
      setMyStatus(r.status);
      toast({ title: r.status === "approved" ? "You're in!" : "Request sent ✋", description: r.status === "approved" ? "Your camera will join the grid." : "Host will approve shortly." });
      refresh();
    } catch (e: any) {
      toast({ title: "Couldn't request", description: e.message, variant: "destructive" });
    }
  };
  const joinByCode = async () => {
    if (!isAuthenticated) { login(); return; }
    if (!code.trim()) return;
    try {
      await apiPost(`/livestreams/${streamId}/cohosts/join-by-code`, { code: code.trim().toUpperCase() });
      setMyStatus("approved");
      toast({ title: "Joined the group 🎉", description: "Reload to publish your camera." });
      refresh();
      // soft refresh to re-mint publisher token
      setTimeout(() => window.location.reload(), 800);
    } catch (e: any) {
      toast({ title: "Invalid code", description: e.message, variant: "destructive" });
    }
  };

  const approved = data?.approved ?? [];
  const pending = data?.pending ?? [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          className="rounded-full bg-primary/90 hover:bg-primary text-black h-8 px-3 text-xs gap-1 font-bold"
          data-testid="button-cohost-panel"
        >
          <UserPlus className="w-3.5 h-3.5" /> {isHost ? "Co-hosts" : "Join"}
          {isHost && pending.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-secondary text-white text-[10px]">{pending.length}</span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="bg-card border-border w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-white flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> Group Live</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pt-3">
          {isHost && data && !isGroup && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-center space-y-3">
              <div className="text-sm text-white font-semibold">This is a solo live stream.</div>
              <p className="text-xs text-muted-foreground">Switch to group live to invite up to 15 co-hosts onto your camera grid. Plays games, do duets, host shows together.</p>
              <Button onClick={enableGroup} disabled={enabling} className="w-full bg-primary text-black font-bold" data-testid="button-enable-group">
                {enabling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                Enable group live
              </Button>
            </div>
          )}

          {isHost && isGroup && (
            <div className="rounded-lg border border-accent/30 bg-accent/10 p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Invite code</div>
              <div className="flex items-center gap-2">
                <div className="font-mono text-2xl font-extrabold text-accent tracking-widest flex-1" data-testid="text-invite-code">
                  {data?.inviteCode || "––––––"}
                </div>
                <Button onClick={copy} size="icon" variant="secondary" className="h-9 w-9" data-testid="button-copy-code">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Anyone with this code joins the grid instantly.</p>
            </div>
          )}

          {!isHost && isGroup && (
            <div className="space-y-3">
              {myStatus === "approved" ? (
                <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-400">
                  ✅ You're a co-host. Your camera is in the grid.
                </div>
              ) : myStatus === "pending" ? (
                <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm text-accent">
                  ⏳ Waiting for host to approve your request…
                </div>
              ) : (
                <>
                  <Button onClick={request} className="w-full bg-primary hover:bg-primary/80 text-black font-bold" data-testid="button-request-join">
                    <UserPlus className="w-4 h-4 mr-2" /> Request to join
                  </Button>
                  <div className="text-xs text-center text-muted-foreground">— or —</div>
                  <div className="flex gap-2">
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="ENTER CODE"
                      maxLength={6}
                      className="font-mono uppercase tracking-widest text-center"
                      data-testid="input-invite-code"
                    />
                    <Button onClick={joinByCode} className="bg-accent text-black font-bold" data-testid="button-join-by-code">
                      <KeyRound className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {!isHost && !isGroup && data && (
            <div className="rounded-lg border border-border bg-black/40 p-3 text-sm text-muted-foreground text-center">
              This is a solo live stream — only the host can broadcast.
            </div>
          )}

          {isHost && isGroup && (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center justify-between">
                <span>Pending requests</span>
                <span className="text-secondary">{pending.length}</span>
              </div>
              {pending.length === 0 ? (
                <div className="text-xs text-muted-foreground py-3">No requests yet.</div>
              ) : (
                <div className="space-y-2">
                  {pending.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 bg-black/40 rounded-lg p-2 border border-border" data-testid={`pending-${r.userId}`}>
                      <img src={r.user?.avatarUrl || "/assets/avatar1.png"} className="w-8 h-8 rounded-full object-cover" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{r.user?.displayName || r.user?.username}</div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-green-500 hover:bg-green-500/10" onClick={() => approve(r.userId)} data-testid={`button-approve-${r.userId}`}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-secondary hover:bg-secondary/10" onClick={() => reject(r.userId)} data-testid={`button-reject-${r.userId}`}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isGroup && (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center justify-between">
              <span>In the group</span>
              <span className="text-primary">{approved.length + 1}/{(data?.maxCohosts ?? 15) + 1}</span>
            </div>
            <div className="space-y-2">
              {approved.length === 0 && <div className="text-xs text-muted-foreground py-2">Just the host so far.</div>}
              {approved.map((r) => (
                <div key={r.id} className="flex items-center gap-2 bg-black/40 rounded-lg p-2 border border-border" data-testid={`cohost-${r.userId}`}>
                  <img src={r.user?.avatarUrl || "/assets/avatar1.png"} className="w-8 h-8 rounded-full object-cover" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{r.user?.displayName || r.user?.username}</div>
                  </div>
                  {(isHost || r.userId === userId) && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-secondary hover:bg-secondary/10" onClick={() => remove(r.userId)} data-testid={`button-remove-${r.userId}`}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}

          {loading && <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
