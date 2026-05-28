import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Users, Copy, Check, X, UserPlus, KeyRound, Loader2, Plus, Clock } from "lucide-react";

type CohostUser = { id?: number; displayName?: string | null; username?: string | null; avatarUrl?: string | null };
type CohostRow = { id: number; userId: number; status: "pending" | "approved" | "rejected"; createdAt: string; user: CohostUser | null };
type CohostsResp = {
  mode: string;
  maxCohosts: number;
  inviteCode: string | null;
  approved: CohostRow[];
  pending: CohostRow[];
  me?: { status: "none" | "pending" | "approved" | "rejected" } | null;
};

const AVATAR_FALLBACK = "/assets/avatar1.png";
const TOTAL_SLOTS = 12;

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

const nameOf = (u: CohostUser | null | undefined, fallback = "Guest") =>
  u?.displayName || u?.username || fallback;

type Slot =
  | { kind: "host"; user: CohostUser | null }
  | { kind: "approved"; row: CohostRow }
  | { kind: "pending"; row: CohostRow }
  | { kind: "mine-pending"; user: CohostUser | null }
  | { kind: "empty"; index: number };

export function CohostPanel({
  streamId,
  isHost,
  hostUser,
  onChanged,
}: {
  streamId: number;
  isHost: boolean;
  hostUser?: CohostUser | null;
  onChanged?: () => void;
}) {
  const { user, userId, isAuthenticated, login } = useCurrentUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CohostsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [myStatus, setMyStatus] = useState<"none" | "pending" | "approved" | "rejected">("none");
  // Mirror of myStatus so refresh()/polling closures read the latest value
  // (effect deps are [open, streamId], so the captured state would be stale).
  const myStatusRef = useRef(myStatus);
  const setStatus = (s: "none" | "pending" | "approved" | "rejected") => {
    myStatusRef.current = s;
    setMyStatus(s);
  };
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
        const prev = myStatusRef.current;
        const mineApproved = d.approved.some((r) => r.userId === userId);
        const minePending = d.pending.some((r) => r.userId === userId); // only populated for the host
        let next: "none" | "pending" | "approved" | "rejected";
        if (d.me) {
          // Server tells us our own status authoritatively. A "rejected" row means
          // the host declined us — surface it once, then treat as "none" so the
          // viewer can request again (no permanent pending lock).
          if (d.me.status === "rejected") {
            if (prev === "pending") {
              toast({ title: "Request declined", description: "The host didn't add you this time." });
            }
            next = "none";
          } else {
            next = d.me.status;
          }
        } else {
          // Fallback for older API responses without `me`: derive from lists, and
          // don't downgrade a locally-known "pending" (non-hosts get no pending row).
          if (mineApproved) next = "approved";
          else if (minePending) next = "pending";
          else if (!isHost && prev === "pending") next = "pending";
          else next = "none";
        }
        // Auto-reload when a pending viewer just got approved so we re-mint a publisher token
        if (!isHost && prev === "pending" && next === "approved") {
          toast({ title: "You're in! 🎉", description: "Joining the grid…" });
          setTimeout(() => window.location.reload(), 700);
        }
        setStatus(next);
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

  // Viewer withdraws their own pending request. Non-hosts never get their pending
  // row back from the API, so the local "pending" lock can only be cleared here.
  const cancelRequest = async () => {
    if (!userId) return;
    try {
      await apiDelete(`/livestreams/${streamId}/cohosts/${userId}`);
    } catch { /* noop — clear locally regardless */ }
    setStatus("none");
    refresh();
    toast({ title: "Request withdrawn", description: "You can tap a slot to request again." });
  };

  const request = async () => {
    if (!isAuthenticated) { login(); return; }
    try {
      const r = await apiPost(`/livestreams/${streamId}/cohosts/request`);
      setStatus(r.status);
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
      setStatus("approved");
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

  const myUser: CohostUser | null = user
    ? { id: userId ?? undefined, displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || null, username: null, avatarUrl: user.profileImageUrl }
    : null;
  const iAmApproved = !!userId && approved.some((r) => r.userId === userId);

  // Build exactly 12 slots: host → approved → pending → (my own pending) → empty.
  const slots = useMemo<Slot[]>(() => {
    const arr: Slot[] = [{ kind: "host", user: hostUser ?? null }];
    for (const r of approved) arr.push({ kind: "approved", row: r });
    for (const r of pending) arr.push({ kind: "pending", row: r });
    // Viewers don't receive others' pending rows from the API, so surface their own.
    if (!isHost && myStatus === "pending" && !iAmApproved) {
      arr.push({ kind: "mine-pending", user: myUser });
    }
    let emptyIdx = 0;
    while (arr.length < TOTAL_SLOTS) arr.push({ kind: "empty", index: emptyIdx++ });
    return arr.slice(0, TOTAL_SLOTS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approved, pending, isHost, myStatus, iAmApproved, hostUser, userId, user]);

  const canTapEmpty = !isHost && myStatus === "none";

  const renderTile = (slot: Slot, key: number) => {
    if (slot.kind === "host") {
      return (
        <div key={key} className="relative aspect-square rounded-xl overflow-hidden border border-secondary/50 bg-black/40" data-testid="slot-host">
          <img src={slot.user?.avatarUrl || AVATAR_FALLBACK} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-secondary text-white text-[9px] font-bold uppercase tracking-wider">Host</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.9)] animate-pulse" />
          <span className="absolute bottom-1 left-1 right-1 text-[10px] text-white font-semibold truncate drop-shadow">{nameOf(slot.user, "Host")}</span>
        </div>
      );
    }

    if (slot.kind === "approved") {
      const r = slot.row;
      const canRemove = isHost || r.userId === userId;
      return (
        <div key={key} className="relative aspect-square rounded-xl overflow-hidden border border-primary/50 bg-black/40" data-testid={`slot-cohost-${r.userId}`}>
          <img src={r.user?.avatarUrl || AVATAR_FALLBACK} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.9)] animate-pulse" />
          <span className="absolute bottom-1 left-1 right-1 text-[10px] text-white font-semibold truncate drop-shadow">{nameOf(r.user)}</span>
          {canRemove && (
            <button
              onClick={() => remove(r.userId)}
              className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/70 text-secondary flex items-center justify-center active:scale-90"
              data-testid={`button-remove-${r.userId}`}
              title="Remove"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      );
    }

    if (slot.kind === "pending") {
      const r = slot.row;
      return (
        <div key={key} className="relative aspect-square rounded-xl overflow-hidden border border-accent/50 bg-black/40" data-testid={`slot-pending-${r.userId}`}>
          <img src={r.user?.avatarUrl || AVATAR_FALLBACK} alt="" className="w-full h-full object-cover opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-accent/90 text-black text-[8px] font-bold uppercase">
            <Clock className="w-2.5 h-2.5" />
          </span>
          <span className="absolute bottom-7 left-1 right-1 text-[10px] text-white font-semibold truncate drop-shadow">{nameOf(r.user)}</span>
          {isHost && (
            <div className="absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1.5">
              <button
                onClick={() => approve(r.userId)}
                className="w-6 h-6 rounded-full bg-green-500 text-black flex items-center justify-center active:scale-90"
                data-testid={`button-approve-${r.userId}`}
                title="Approve"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => reject(r.userId)}
                className="w-6 h-6 rounded-full bg-secondary text-white flex items-center justify-center active:scale-90"
                data-testid={`button-reject-${r.userId}`}
                title="Reject"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      );
    }

    if (slot.kind === "mine-pending") {
      return (
        <div key={key} className="relative aspect-square rounded-xl overflow-hidden border border-accent/60 bg-black/40 ring-1 ring-accent/40" data-testid="slot-mine-pending">
          <img src={slot.user?.avatarUrl || AVATAR_FALLBACK} alt="" className="w-full h-full object-cover opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-accent/90 text-black text-[8px] font-bold uppercase">
            <Clock className="w-2.5 h-2.5" />
          </span>
          <button
            onClick={cancelRequest}
            className="absolute top-1 right-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-black/70 text-white/90 hover:bg-destructive hover:text-white transition-colors"
            aria-label="Withdraw request"
            data-testid="button-cancel-request"
          >
            <X className="w-3 h-3" />
          </button>
          <span className="absolute bottom-1 left-1 right-1 text-[10px] text-accent font-semibold truncate drop-shadow">Pending…</span>
        </div>
      );
    }

    // empty
    return (
      <button
        key={key}
        onClick={canTapEmpty ? request : undefined}
        disabled={!canTapEmpty}
        className={`relative aspect-square rounded-xl flex flex-col items-center justify-center gap-1 border-2 border-dashed transition-colors ${
          canTapEmpty
            ? "border-primary/60 bg-primary/5 active:scale-95 hover:border-primary hover:bg-primary/10 cursor-pointer"
            : "border-white/10 bg-black/20 cursor-default"
        }`}
        data-testid={`slot-empty-${slot.index}`}
      >
        <span className={`w-9 h-9 rounded-full border-2 border-dashed flex items-center justify-center ${canTapEmpty ? "border-primary text-primary shadow-[0_0_12px_rgba(34,197,94,0.4)]" : "border-white/20 text-white/30"}`}>
          <Plus className="w-5 h-5" />
        </span>
        {canTapEmpty && <span className="text-[9px] text-primary font-semibold">Tap to join</span>}
      </button>
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="flex flex-col items-center gap-0.5 group relative"
          data-testid="button-cohost-panel"
          title={isHost ? "Co-hosts" : "Join"}
        >
          <div className="w-11 h-11 rounded-full bg-primary/90 flex items-center justify-center group-active:scale-95 transition-transform">
            <UserPlus className="w-5 h-5 text-black" />
          </div>
          <span className="text-[10px] text-white font-semibold drop-shadow">{isHost ? "Co-hosts" : "Join"}</span>
          {isHost && pending.length > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-secondary text-white text-[10px] font-bold border-2 border-black">{pending.length}</span>
          )}
          {!isHost && myStatus === "pending" && (
            <span className="absolute -top-1 -right-1 inline-flex items-center gap-0.5 px-1.5 h-4 rounded-full bg-accent text-black text-[8px] font-bold border border-black" data-testid="badge-pending">
              <Clock className="w-2.5 h-2.5" />
            </span>
          )}
        </button>
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

          {!isHost && !isGroup && data && (
            <div className="rounded-lg border border-border bg-black/40 p-3 text-sm text-muted-foreground text-center">
              This is a solo live stream — only the host can broadcast.
            </div>
          )}

          {isGroup && (
            <>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center justify-between">
                  <span>On the grid</span>
                  <span className="text-primary">{approved.length + 1}/{TOTAL_SLOTS}</span>
                </div>
                <div className="grid grid-cols-3 gap-2" data-testid="cohost-slot-grid">
                  {slots.map((slot, i) => renderTile(slot, i))}
                </div>
                {!isHost && myStatus === "approved" && (
                  <div className="mt-3 rounded-lg border border-green-500/40 bg-green-500/10 p-2.5 text-xs text-green-400 text-center">
                    ✅ You're a co-host — your camera is in the grid.
                  </div>
                )}
                {!isHost && myStatus === "pending" && (
                  <div className="mt-3 rounded-lg border border-accent/40 bg-accent/10 p-2.5 text-xs text-accent text-center">
                    ⏳ Waiting for the host to approve your request…
                  </div>
                )}
              </div>

              {/* Secondary: invite code */}
              <div className="border-t border-border pt-4">
                {isHost ? (
                  <div className="rounded-lg border border-accent/30 bg-accent/10 p-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Invite code</div>
                    <div className="flex items-center gap-2">
                      <div className="font-mono text-xl font-extrabold text-accent tracking-widest flex-1" data-testid="text-invite-code">
                        {data?.inviteCode || "––––––"}
                      </div>
                      <Button onClick={copy} size="icon" variant="secondary" className="h-8 w-8" data-testid="button-copy-code">
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">Share this code — anyone who enters it joins the grid instantly.</p>
                  </div>
                ) : myStatus === "none" ? (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Have an invite code?</div>
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
                  </div>
                ) : null}
              </div>
            </>
          )}

          {loading && <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
