import {
  useGetLivestream,
  getGetLivestreamQueryKey,
  useListGifts,
  getListGiftsQueryKey,
  useListLivestreams,
  useStartBattle,
  useEndBattle,
  useLikeLivestream,
  useListLiveChat,
  getListLiveChatQueryKey,
  useSendLiveChat,
} from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Gift as GiftIcon, Heart, Send, Sparkles, Filter, Swords, Share2, X, Check, ArrowLeft, ShieldCheck } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/use-current-user";
import { LiveKitBroadcaster, LiveKitViewer } from "@/components/live/livekit-stage";
import { GroupRoomProvider, LiveKitGroupStage } from "@/components/live/livekit-group-room";
import { CohostPanel } from "@/components/live/cohost-panel";
import { GamesPanel } from "@/components/live/games-panel";

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function colorForUser(id: number) {
  const colors = [
    "text-primary",
    "text-accent",
    "text-secondary",
    "text-yellow-400",
    "text-pink-400",
    "text-cyan-300",
    "text-orange-400",
    "text-violet-300",
  ];
  return colors[Math.abs(id) % colors.length];
}

export default function LiveStream() {
  const { userId: CURRENT_USER_ID, isAuthenticated, login } = useCurrentUser();
  const { id } = useParams();
  const streamId = parseInt(id || "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [endingStream, setEndingStream] = useState(false);

  const endLiveStream = async (silent = false) => {
    if (!streamId) return;
    try {
      const base = import.meta.env.BASE_URL;
      await fetch(`${base}api/livestreams/${streamId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ended" }),
        keepalive: true,
      });
      if (!silent) {
        toast({ title: "Live ended 👋", description: "Your stream is now offline." });
        setLocation("/live");
      }
    } catch (e: any) {
      if (!silent) toast({ title: "Couldn't end stream", description: String(e?.message ?? e), variant: "destructive" });
    }
  };

  const handleEndLive = async () => {
    if (endingStream) return;
    if (!window.confirm("End your live stream? Viewers will be disconnected.")) return;
    setEndingStream(true);
    await endLiveStream();
    setEndingStream(false);
  };

  const { data: stream, isLoading: streamLoading } = useGetLivestream(streamId, {
    query: { enabled: !!streamId, queryKey: getGetLivestreamQueryKey(streamId), refetchInterval: 3000 },
  });
  const { data: gifts } = useListGifts(undefined, { query: { queryKey: getListGiftsQueryKey() } });
  const { data: allStreams } = useListLivestreams();
  const { data: chatMessages } = useListLiveChat(streamId, {
    query: { enabled: !!streamId, queryKey: getListLiveChatQueryKey(streamId), refetchInterval: 2000 },
  });

  const startBattle = useStartBattle();
  const endBattle = useEndBattle();
  const likeMutation = useLikeLivestream();
  const sendChatMutation = useSendLiveChat();

  const [activeFilter, setActiveFilter] = useState("None");
  const FILTER_CSS: Record<string, string> = {
    "None": "",
    "Beauty": "contrast(1.1) brightness(1.15) saturate(1.35)",
    "Vintage": "sepia(0.75) contrast(0.9) brightness(1.05) saturate(0.7)",
    "Neon": "saturate(2.5) contrast(1.45) hue-rotate(30deg) brightness(1.15)",
    "Blur": "blur(6px)",
    "Cartoon": "contrast(1.6) saturate(2.2) brightness(1.05)",
    "B&W": "grayscale(1) contrast(1.15)",
    "Cool": "hue-rotate(180deg) saturate(1.3)",
    "Warm": "sepia(0.35) saturate(1.5) brightness(1.05)",
  };
  const filterCss = FILTER_CSS[activeFilter] || "";
  const [battleOpen, setBattleOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [chatInput, setChatInput] = useState("");
  const [likeDelta, setLikeDelta] = useState(0);
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const heartIdRef = useRef(0);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const filters = ["None", "Beauty", "Vintage", "Neon", "Blur", "Cartoon", "B&W", "Cool", "Warm"];

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Safety net: if host closes the tab without tapping End Live, end the stream via sendBeacon.
  useEffect(() => {
    if (!streamId || !stream || !CURRENT_USER_ID || stream.userId !== CURRENT_USER_ID || stream.status !== "live") return;
    const handler = () => {
      try {
        const base = import.meta.env.BASE_URL;
        const blob = new Blob([JSON.stringify({ status: "ended" })], { type: "application/json" });
        navigator.sendBeacon?.(`${base}api/livestreams/${streamId}`, blob);
      } catch {}
    };
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, [streamId, stream?.userId, stream?.status, CURRENT_USER_ID]);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const target = el.querySelector("[data-chat-end]") as HTMLElement | null;
    target?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages?.length]);

  const opponent = useMemo(
    () => allStreams?.find((s) => s.id === stream?.battleOpponentId),
    [allStreams, stream?.battleOpponentId],
  );

  const battleActive = !!stream?.battleOpponentId && !!stream?.battleEndsAt && new Date(stream.battleEndsAt).getTime() > now;
  const battleSecondsLeft = stream?.battleEndsAt ? Math.max(0, Math.floor((new Date(stream.battleEndsAt).getTime() - now) / 1000)) : 0;
  const myScore = Number(stream?.battleScore ?? 0);
  const oppScore = Number(stream?.battleOpponentScore ?? 0);
  const totalScore = myScore + oppScore;
  const myPct = totalScore > 0 ? Math.round((myScore / totalScore) * 100) : 50;
  const totalLikes = Number(stream?.likeCount ?? 0) + likeDelta;

  const refreshStream = () => queryClient.invalidateQueries({ queryKey: getGetLivestreamQueryKey(streamId) });

  // Tap-to-like: spawn floating heart + increment like (pointerdown handles touch + mouse)
  const handleViewportTap = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newId = ++heartIdRef.current;
    setHearts((prev) => [...prev, { id: newId, x, y }]);
    window.setTimeout(() => setHearts((prev) => prev.filter((h) => h.id !== newId)), 1400);

    setLikeDelta((d) => d + 1);
    likeMutation.mutate({ id: streamId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetLivestreamQueryKey(streamId) });
        setLikeDelta((d) => Math.max(0, d - 1));
      },
      onError: () => setLikeDelta((d) => Math.max(0, d - 1)),
    });
  };

  const handleSendGift = async (giftId: number, name: string, price: number) => {
    if (!isAuthenticated || !CURRENT_USER_ID) { login(); return; }
    if (!stream?.userId) return;
    try {
      const base = import.meta.env.BASE_URL;
      const r = await fetch(`${base}api/checkout/gift`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ giftId, receiverId: stream.userId, streamId, quantity: 1 }),
      });
      const data = await r.json();
      if (!r.ok || !data.url) {
        toast({ title: "Checkout failed", description: data.error ?? `HTTP ${r.status}`, variant: "destructive" });
        return;
      }
      toast({ title: "Opening Stripe Checkout…", description: `Pay $${price.toFixed(2)} to send ${name}` });
      window.location.href = data.url;
    } catch (e: any) {
      toast({ title: "Checkout failed", description: String(e?.message ?? e), variant: "destructive" });
    }
  };

  const handleSendChat = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    if (!isAuthenticated || !CURRENT_USER_ID) { login(); return; }
    setChatInput("");
    sendChatMutation.mutate(
      { id: streamId, data: { message: msg } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLiveChatQueryKey(streamId) });
        },
        onError: (err: any) => {
          const m = err?.data?.error ?? err?.message ?? String(err);
          if (err?.status !== 422) setChatInput(msg);
          toast({ title: err?.status === 422 ? "Message blocked" : "Couldn't send", description: m, variant: "destructive" });
        },
      },
    );
  };

  // Send a battle REQUEST (other host must accept)
  const handleRequestBattle = async (opponentStreamId: number) => {
    try {
      const base = import.meta.env.BASE_URL;
      const r = await fetch(`${base}api/livestreams/${streamId}/battle/request`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opponentStreamId, durationSeconds: 180 }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Couldn't send battle request", description: data?.error ?? `HTTP ${r.status}`, variant: "destructive" });
        return;
      }
      setBattleOpen(false);
      toast({ title: "⚔️ Battle request sent", description: "Waiting for the other host to accept." });
    } catch (e: any) {
      toast({ title: "Couldn't send battle request", description: String(e?.message ?? e), variant: "destructive" });
    }
  };

  // Battle requests: poll incoming/outgoing — host only (endpoint is host-gated)
  const [battleReqs, setBattleReqs] = useState<{ incoming: any[]; outgoing: any[] }>({ incoming: [], outgoing: [] });
  const isOwnStreamPoll = !!CURRENT_USER_ID && stream?.userId === CURRENT_USER_ID;
  useEffect(() => {
    if (!streamId || !stream || stream.battleOpponentId || !isOwnStreamPoll) return;
    let alive = true;
    const tick = async () => {
      try {
        const base = import.meta.env.BASE_URL;
        const r = await fetch(`${base}api/livestreams/${streamId}/battle/requests`, { credentials: "include" });
        if (!r.ok) return;
        const data = await r.json();
        if (alive) setBattleReqs({ incoming: data.incoming ?? [], outgoing: data.outgoing ?? [] });
      } catch {}
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [streamId, stream?.battleOpponentId, isOwnStreamPoll]);

  const acceptBattleRequest = async (requestId: number) => {
    try {
      const base = import.meta.env.BASE_URL;
      const r = await fetch(`${base}api/livestreams/${streamId}/battle/requests/${requestId}/accept`, {
        method: "POST", credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) { toast({ title: "Couldn't accept", description: data?.error, variant: "destructive" }); return; }
      toast({ title: "⚔️ Battle started!", description: "3-minute gift battle is on." });
      setBattleReqs({ incoming: [], outgoing: [] });
      refreshStream();
    } catch (e: any) {
      toast({ title: "Couldn't accept", description: String(e?.message ?? e), variant: "destructive" });
    }
  };

  const rejectBattleRequest = async (requestId: number) => {
    try {
      const base = import.meta.env.BASE_URL;
      await fetch(`${base}api/livestreams/${streamId}/battle/requests/${requestId}/reject`, {
        method: "POST", credentials: "include",
      });
      setBattleReqs((prev) => ({ ...prev, incoming: prev.incoming.filter((r) => r.id !== requestId) }));
    } catch {}
  };

  const cancelBattleRequest = async (requestId: number) => {
    try {
      const base = import.meta.env.BASE_URL;
      await fetch(`${base}api/livestreams/${streamId}/battle/requests/${requestId}`, {
        method: "DELETE", credentials: "include",
      });
      setBattleReqs((prev) => ({ ...prev, outgoing: prev.outgoing.filter((r) => r.id !== requestId) }));
    } catch {}
  };

  const handleEndBattle = () => {
    endBattle.mutate({ id: streamId }, {
      onSuccess: () => {
        toast({ title: "Battle ended", description: myScore > oppScore ? "You won! 🏆" : myScore < oppScore ? "You lost — get 'em next round." : "It's a tie!" });
        refreshStream();
      },
    });
  };

  const handleShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}`;
    const title = stream?.title ? `🔴 ${stream.title} on Clippzi` : "🔴 Live on Clippzi";
    const text = stream?.user?.displayName
      ? `Watch ${stream.user.displayName} live on Clippzi 🔥`
      : "Catch this live stream on Clippzi 🔥";
    // Native share sheet (iMessage, WhatsApp, Messenger, etc.) when available
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err: any) {
        // User cancelled — don't fall through to clipboard
        if (err?.name === "AbortError") return;
        // Otherwise fall through to clipboard as backup
      }
    }
    // Desktop / unsupported browsers: copy as backup
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url).catch(() => {});
      toast({ title: "Stream link copied!", description: url });
    } else {
      toast({ title: "Couldn't share", description: "Sharing isn't supported on this browser.", variant: "destructive" });
    }
  };

  const getRarityColor = (rarity?: string) => {
    switch (rarity) {
      case "legendary": return "border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]";
      case "epic": return "border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]";
      case "rare": return "border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]";
      default: return "border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]";
    }
  };

  const mobileChatRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = mobileChatRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatMessages?.length]);

  if (streamLoading) {
    return <div className="h-full w-full flex items-center justify-center bg-black"><Skeleton className="w-full h-full" /></div>;
  }

  const otherStreams = allStreams?.filter((s) => s.id !== streamId && s.status === "live") ?? [];
  const isOwnStream = !!CURRENT_USER_ID && stream?.userId === CURRENT_USER_ID;
  const isGroup = (stream as any)?.mode === "group";

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-black overflow-hidden relative">
      <div className="flex-1 relative bg-black flex flex-col justify-center items-center h-full">
        {battleActive ? (
          <div className="absolute inset-0 grid grid-cols-2 gap-0">
            <div className="relative bg-zinc-900 overflow-hidden">
              <img src={stream?.thumbnailUrl || "https://images.unsplash.com/photo-1511512578047-dfb367046420"} alt="" className="w-full h-full object-cover opacity-60" />
              <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/70 rounded-full px-3 py-1.5">
                <img src={stream?.user?.avatarUrl || "/assets/avatar1.png"} alt="" className="w-7 h-7 rounded-full" />
                <span className="text-white text-sm font-semibold">{stream?.user?.displayName}</span>
              </div>
            </div>
            <div className="relative bg-zinc-900 overflow-hidden border-l-2 border-secondary">
              <img src={opponent?.thumbnailUrl || "https://images.unsplash.com/photo-1511512578047-dfb367046420"} alt="" className="w-full h-full object-cover opacity-60" />
              <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/70 rounded-full px-3 py-1.5">
                <span className="text-white text-sm font-semibold">{opponent?.user?.displayName ?? "Opponent"}</span>
                <img src={opponent?.user?.avatarUrl || "/assets/avatar2.png"} alt="" className="w-7 h-7 rounded-full" />
              </div>
            </div>
          </div>
        ) : isGroup ? (
          <GroupRoomProvider streamId={streamId}>
            <LiveKitGroupStage filterCss={filterCss} />
            <GamesPanel />
          </GroupRoomProvider>
        ) : isOwnStream ? (
          <div className="absolute inset-0 bg-black">
            <LiveKitBroadcaster streamId={streamId} filterCss={filterCss} />
          </div>
        ) : (
          <div className="absolute inset-0 bg-black">
            <LiveKitViewer streamId={streamId} posterUrl={stream?.thumbnailUrl ?? undefined} />
          </div>
        )}

        {/* Tap-to-like layer — only covers the TOP 60% so it never fights with chat/chest */}
        <div
          className="absolute inset-x-0 top-0 z-10 select-none touch-manipulation"
          style={{ height: "60%" }}
          onPointerDown={handleViewportTap}
          data-testid="tap-to-like"
          aria-label="Tap to like"
        >
          {hearts.map((h) => (
            <Heart
              key={h.id}
              className="absolute w-10 h-10 text-secondary fill-secondary pointer-events-none drop-shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-[float-up_1.4s_ease-out_forwards]"
              style={{ left: h.x - 20, top: h.y - 20 }}
            />
          ))}
        </div>

        <div className="absolute inset-0 z-20 bg-gradient-to-b from-black/80 via-transparent to-black/80 pointer-events-none flex flex-col justify-between px-3 sm:px-4 pb-3 sm:pb-4" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <div className="flex justify-between items-start gap-2 pointer-events-auto">
            {/* LEFT: back + streamer info (viewer) OR compact LIVE badge (host) */}
            <div className="flex items-start gap-1.5 min-w-0 flex-1">
              <Button
                onClick={() => setLocation("/live")}
                size="icon"
                variant="ghost"
                className="rounded-full bg-black/60 backdrop-blur border border-white/10 h-8 w-8 text-white hover:bg-black/80 shrink-0"
                data-testid="button-back-live"
                title="Back to Live"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              {isOwnStream ? (
                <div className="flex items-center gap-1 bg-black/55 backdrop-blur px-2 py-1 rounded-full border border-white/10">
                  <span className="px-1.5 py-0.5 rounded-full bg-secondary text-white text-[9px] font-bold uppercase tracking-wider">Live</span>
                  <span className="flex items-center gap-0.5 text-white text-[11px] font-semibold" data-testid="text-viewer-count">
                    <Users className="w-3 h-3 text-primary" /> {stream?.viewerCount ?? 0}
                  </span>
                  <span className="flex items-center gap-0.5 text-white text-[11px] font-semibold" data-testid="text-like-count">
                    <Heart className="w-3 h-3 text-secondary fill-secondary" /> {formatCount(totalLikes)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-black/50 backdrop-blur p-1.5 pr-2 rounded-full border border-white/10 min-w-0 flex-1">
                  <img src={stream?.user?.avatarUrl || "/assets/avatar1.png"} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-white text-xs leading-tight truncate">{stream?.user?.displayName}</h3>
                    <p className="text-[10px] text-white/70 truncate">{stream?.viewerCount ?? 0} watching</p>
                  </div>
                  <Button size="sm" className="rounded-full bg-secondary hover:bg-secondary/80 text-white h-6 px-2.5 text-[11px] font-bold shrink-0">Follow</Button>
                </div>
              )}
            </div>

            {/* RIGHT: just End Live (host) — everything else moved to right rail */}
            <div className="flex items-center gap-1.5 shrink-0">
              {isOwnStream && (
                <Button
                  onClick={handleEndLive}
                  disabled={endingStream}
                  size="sm"
                  className="rounded-full bg-red-600 hover:bg-red-700 text-white h-8 px-3 text-xs gap-1 font-bold disabled:opacity-50"
                  data-testid="button-end-live"
                >
                  <X className="w-3.5 h-3.5" /> {endingStream ? "Ending…" : "End"}
                </Button>
              )}
            </div>
          </div>

          {battleActive && (
            <div className="pointer-events-auto mx-auto w-full max-w-xl">
              <div className="bg-black/70 backdrop-blur rounded-xl p-3 border border-accent/40">
                <div className="flex items-center justify-between text-xs text-white mb-2 font-bold">
                  <span className="text-primary">{stream?.user?.displayName} • ${myScore.toFixed(2)}</span>
                  <span className="text-accent flex items-center gap-1"><Swords className="w-3 h-3" /> {Math.floor(battleSecondsLeft / 60)}:{String(battleSecondsLeft % 60).padStart(2, "0")}</span>
                  <span className="text-secondary">${oppScore.toFixed(2)} • {opponent?.user?.displayName ?? "Opponent"}</span>
                </div>
                <div className="h-3 w-full rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-500" style={{ width: `${myPct}%` }} />
                </div>
              </div>
            </div>
          )}

          <div />
        </div>

        {/* TIKTOK-STYLE RIGHT RAIL — vertical action stack, above chat overlay */}
        <div className="pointer-events-auto absolute right-2 z-40 flex flex-col items-center gap-3" style={{ bottom: "42%" }}>
          {!isOwnStream && (
            <button onClick={handleShare} className="flex flex-col items-center gap-0.5 group" data-testid="button-share-stream" title="Share">
              <div className="w-11 h-11 rounded-full bg-black/60 backdrop-blur border border-white/10 flex items-center justify-center group-active:scale-95 transition-transform">
                <Share2 className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] text-white font-semibold drop-shadow">Share</span>
            </button>
          )}
          {(isOwnStream || isGroup) && (
            <CohostPanel streamId={streamId} isHost={isOwnStream} />
          )}
          {isOwnStream && !battleActive && (
            <button onClick={() => setBattleOpen(true)} className="flex flex-col items-center gap-0.5 group" data-testid="button-start-battle" title={battleReqs.outgoing.length > 0 ? "Waiting…" : "Battle"}>
              <div className="w-11 h-11 rounded-full bg-accent flex items-center justify-center group-active:scale-95 transition-transform shadow-[0_0_12px_rgba(34,197,94,0.5)]">
                <Swords className="w-5 h-5 text-black" />
              </div>
              <span className="text-[10px] text-white font-semibold drop-shadow">{battleReqs.outgoing.length > 0 ? "Waiting" : "Battle"}</span>
            </button>
          )}
          {isOwnStream && battleActive && (
            <button onClick={handleEndBattle} className="flex flex-col items-center gap-0.5 group" data-testid="button-end-battle" title="End battle">
              <div className="w-11 h-11 rounded-full bg-red-600 flex items-center justify-center group-active:scale-95 transition-transform">
                <Swords className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] text-white font-semibold drop-shadow">End battle</span>
            </button>
          )}
          {isOwnStream && !battleActive && (
            <Sheet>
              <SheetTrigger asChild>
                <button className="flex flex-col items-center gap-0.5 group" data-testid="button-open-filters" title="Filters">
                  <div className={`w-11 h-11 rounded-full backdrop-blur border flex items-center justify-center group-active:scale-95 transition-transform ${activeFilter !== "None" ? "bg-accent border-accent shadow-[0_0_12px_rgba(34,197,94,0.5)]" : "bg-black/60 border-white/10"}`}>
                    <Filter className={`w-5 h-5 ${activeFilter !== "None" ? "text-black" : "text-white"}`} />
                  </div>
                  <span className="text-[10px] text-white font-semibold drop-shadow truncate max-w-[60px]">{activeFilter === "None" ? "Filter" : activeFilter}</span>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="bg-card border-border h-auto max-h-[60vh]">
                <SheetHeader>
                  <SheetTitle className="text-white flex items-center gap-2"><Filter className="w-5 h-5 text-accent" /> Face Filters</SheetTitle>
                </SheetHeader>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Only you see the filter — viewers see your raw camera. Tap one to preview.</p>
                <div className="grid grid-cols-3 gap-2 pb-4">
                  {filters.map((f) => (
                    <button
                      key={f}
                      onClick={() => setActiveFilter(f)}
                      className={`px-3 py-3 rounded-xl text-sm font-bold transition-all border-2 ${
                        activeFilter === f
                          ? "bg-accent text-black border-accent scale-[1.03]"
                          : "bg-black/40 text-white border-white/10 hover:bg-black/60"
                      }`}
                      data-testid={`button-filter-${f.toLowerCase().replace("&", "and")}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>

        {/* INCOMING BATTLE REQUESTS BANNER */}
        {!battleActive && isOwnStream && battleReqs.incoming.length > 0 && (
          <div className="pointer-events-auto absolute top-20 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-sm space-y-2" data-testid="battle-requests-incoming">
            {battleReqs.incoming.map((r) => (
              <div key={r.id} className="bg-black/90 backdrop-blur border-2 border-accent rounded-2xl p-3 shadow-[0_0_20px_rgba(34,197,94,0.4)]">
                <div className="flex items-center gap-3">
                  <img src={r.otherStream?.user?.avatarUrl || "/assets/avatar1.png"} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-accent" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-accent font-bold uppercase tracking-wider">⚔️ Battle request</p>
                    <p className="text-sm text-white font-semibold truncate">{r.otherStream?.user?.displayName || "Someone"} wants to battle you</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-2.5">
                  <Button onClick={() => acceptBattleRequest(r.id)} size="sm" className="flex-1 bg-accent text-black font-bold hover:bg-accent/80" data-testid={`button-accept-battle-${r.id}`}>
                    <Check className="w-4 h-4 mr-1" /> Accept
                  </Button>
                  <Button onClick={() => rejectBattleRequest(r.id)} size="sm" variant="secondary" className="flex-1" data-testid={`button-reject-battle-${r.id}`}>
                    <X className="w-4 h-4 mr-1" /> Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* OUTGOING REQUEST PILL */}
        {!battleActive && isOwnStream && battleReqs.outgoing.length > 0 && battleReqs.incoming.length === 0 && (
          <div className="pointer-events-auto absolute top-20 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-sm space-y-2">
            {battleReqs.outgoing.map((r) => (
              <div key={r.id} className="bg-black/85 backdrop-blur border border-accent/50 rounded-full pl-1.5 pr-3 py-1.5 flex items-center gap-2">
                <img src={r.otherStream?.user?.avatarUrl || "/assets/avatar1.png"} alt="" className="w-6 h-6 rounded-full object-cover" />
                <span className="text-xs text-white flex-1 truncate">Waiting on <b>{r.otherStream?.user?.displayName}</b>…</span>
                <button onClick={() => cancelBattleRequest(r.id)} className="text-[11px] text-secondary font-semibold" data-testid={`button-cancel-battle-${r.id}`}>Cancel</button>
              </div>
            ))}
          </div>
        )}

        {/* TIKTOK-STYLE MOBILE CHAT OVERLAY — bottom 3/8 of video */}
        <div className="lg:hidden absolute inset-x-0 bottom-0 h-[38%] z-30 flex flex-col pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
          <div ref={mobileChatRef} className="relative flex-1 overflow-y-auto px-2 pt-2 space-y-1.5 pointer-events-auto scrollbar-none" data-testid="mobile-chat-list" style={{ scrollbarWidth: "none" }}>
            {(!chatMessages || chatMessages.length === 0) ? (
              <div className="text-xs text-white/70 bg-black/40 backdrop-blur px-2.5 py-1.5 rounded-full w-fit">Be the first to say hi 👋</div>
            ) : (
              chatMessages.map((m) => {
                const name = m.user?.displayName || m.user?.username || `User${m.userId}`;
                const isMe = m.userId === CURRENT_USER_ID;
                return (
                  <div key={m.id} className="flex items-start gap-1.5 max-w-[88%]" data-testid={`mobile-chat-message-${m.id}`}>
                    <img src={m.user?.avatarUrl || `/assets/avatar${(m.userId % 3) + 1}.png`} alt="" className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5" />
                    <div className="bg-black/60 backdrop-blur px-2 py-1 rounded-xl">
                      <span className={`font-bold text-xs mr-1.5 ${isMe ? "text-primary" : colorForUser(m.userId)}`}>{name}{isMe ? " (you)" : ""}</span>
                      <span className="text-xs text-white/95 break-words">{m.message}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="relative pointer-events-auto p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex gap-2 items-center">
            <form onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} className="flex-1 min-w-0 flex gap-2 items-center">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={isAuthenticated ? "Say something..." : "Log in to chat"}
                maxLength={500}
                className="flex-1 min-w-0 bg-black/60 backdrop-blur border-white/20 text-white placeholder:text-white/60 rounded-full h-10"
                data-testid="input-mobile-chat-message"
              />
              <Button type="submit" size="icon" disabled={sendChatMutation.isPending || !chatInput.trim()} className="rounded-full bg-primary hover:bg-primary/80 shrink-0 h-10 w-10 disabled:opacity-50" data-testid="button-send-mobile-chat">
                <Send className="w-4 h-4 text-black" />
              </Button>
            </form>
            <Sheet>
              <SheetTrigger asChild>
                <button
                  className="shrink-0 h-11 w-11 rounded-full bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-700 hover:from-amber-300 hover:to-amber-600 shadow-[0_0_16px_rgba(251,191,36,0.8)] border-2 border-amber-300 flex items-center justify-center overflow-hidden active:scale-95 transition-transform"
                  data-testid="button-gifts-mobile"
                  title="Open gift chest"
                  aria-label="Open gift chest"
                >
                  <img src={`${import.meta.env.BASE_URL}gifts/treasure-chest.png`} alt="" className="w-9 h-9 object-contain pointer-events-none" />
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="bg-card border-border h-[65vh] flex flex-col">
                <SheetHeader>
                  <SheetTitle className="text-white flex items-center gap-2"><span className="text-xl">🎁</span> Gift Chest</SheetTitle>
                </SheetHeader>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  {isOwnStream
                    ? `Send gifts to your co-hosts to hype them up${battleActive ? " • adds to battle score" : ""}`
                    : `60/40 split — creator keeps 60%${battleActive ? " • adds to battle score" : ""}`}
                </p>
                  <ScrollArea className="flex-1">
                    <div className="grid grid-cols-3 gap-2 pb-4">
                      {gifts?.map((gift) => (
                        <button key={gift.id} onClick={() => handleSendGift(gift.id, gift.name, Number(gift.price))} className={`flex flex-col items-center justify-center p-2 rounded-lg bg-black/60 border-2 transition-all hover:scale-105 hover:bg-zinc-800 ${getRarityColor(gift.rarity)}`} data-testid={`button-gift-mobile-${gift.id}`}>
                          {gift.iconUrl ? (
                            <img src={gift.iconUrl} alt={gift.name} className="w-16 h-16 object-contain mb-1 drop-shadow-[0_0_8px_rgba(0,0,0,0.6)]" loading="lazy" />
                          ) : (
                            <span className="text-4xl mb-1 drop-shadow-md">{gift.emoji}</span>
                          )}
                          <span className="text-[10px] text-white font-medium truncate w-full text-center">{gift.name}</span>
                          <span className="text-[10px] text-primary font-bold">${Number(gift.price).toFixed(2)}</span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
          </div>
        </div>
      </div>

      {/* DESKTOP CHAT SIDEBAR */}
      <div className="hidden lg:flex h-full w-[400px] flex-col bg-card border-l border-border">
        <div className="p-3 border-b border-border bg-black/20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="w-4 h-4" /> Live Chat
          </div>
          <div className="text-xs text-muted-foreground" data-testid="text-chat-count">
            {chatMessages?.length ?? 0} message{(chatMessages?.length ?? 0) === 1 ? "" : "s"}
          </div>
        </div>

        <div ref={chatScrollRef} className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-3" data-testid="list-chat-messages">
            <div className="flex items-start gap-2 text-xs text-muted-foreground border-l-2 border-accent/40 pl-2">
              Welcome to the chat — keep it kind. 💚
            </div>
            {(!chatMessages || chatMessages.length === 0) ? (
              <div className="text-center text-sm text-muted-foreground py-8">Be the first to say hi 👋</div>
            ) : (
              chatMessages.map((m) => {
                const name = m.user?.displayName || m.user?.username || `User${m.userId}`;
                const isMe = m.userId === CURRENT_USER_ID;
                return (
                  <div key={m.id} className="flex items-start gap-2" data-testid={`chat-message-${m.id}`}>
                    <img src={m.user?.avatarUrl || `/assets/avatar${(m.userId % 3) + 1}.png`} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className={`font-bold text-sm mr-2 ${isMe ? "text-primary" : colorForUser(m.userId)}`}>{name}{isMe ? " (you)" : ""}</span>
                      <span className="text-sm text-white/90 break-words">{m.message}</span>
                    </div>
                  </div>
                );
              })
            )}
            <div data-chat-end />
          </div>
        </div>

        {isOwnStream ? (
          <div className="h-20 border-t border-border bg-black/40 px-3 py-2 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">💝 Gifts received this stream</div>
            <div className="text-lg font-bold text-primary">${Number(stream?.totalGiftsReceived ?? 0).toFixed(2)}</div>
          </div>
        ) : (
          <div className="h-44 border-t border-border bg-black/40 p-2 flex flex-col gap-2">
            <div className="flex items-center justify-between px-2 text-xs font-semibold text-muted-foreground uppercase">
              <span>Send Gifts {battleActive ? "(adds to battle score)" : ""}</span>
              <span className="text-primary flex items-center gap-1"><GiftIcon className="w-3 h-3" /> 60/40 split</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="grid grid-cols-4 gap-2 pb-2">
                {gifts?.map((gift) => (
                  <button key={gift.id} onClick={() => handleSendGift(gift.id, gift.name, Number(gift.price))} className={`flex flex-col items-center justify-center p-2 rounded-lg bg-black/60 border-2 transition-all hover:scale-105 hover:bg-zinc-800 ${getRarityColor(gift.rarity)}`} data-testid={`button-gift-${gift.id}`}>
                    {gift.iconUrl ? (
                      <img src={gift.iconUrl} alt={gift.name} className="w-12 h-12 object-contain mb-1 drop-shadow-[0_0_8px_rgba(0,0,0,0.6)]" loading="lazy" />
                    ) : (
                      <span className="text-2xl mb-1 drop-shadow-md">{gift.emoji}</span>
                    )}
                    <span className="text-[10px] text-white font-medium truncate w-full text-center">{gift.name}</span>
                    <span className="text-[10px] text-primary font-bold">${Number(gift.price).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="px-3 pt-2 bg-card">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-primary shrink-0" />
            Chat is auto-moderated. Be kind — follow our Community Guidelines.
          </p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); handleSendChat(); }} className="p-3 pt-2 border-t-0 bg-card flex gap-2 items-center">
          <div className="relative flex-1">
            <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder={isAuthenticated ? "Say something..." : "Log in to chat"} maxLength={500} className="bg-input border-none rounded-full pr-10" data-testid="input-chat-message" />
            <div className="absolute right-3 top-1/2 -translate-y-1/2"><Heart className="w-4 h-4 text-muted-foreground" /></div>
          </div>
          <Button type="submit" size="icon" disabled={sendChatMutation.isPending || !chatInput.trim()} className="rounded-full bg-primary hover:bg-primary/80 shrink-0 disabled:opacity-50" data-testid="button-send-chat">
            <Send className="w-4 h-4 text-black" />
          </Button>
        </form>
      </div>

      <Dialog open={battleOpen} onOpenChange={setBattleOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2"><Swords className="w-5 h-5 text-accent" /> Send a Battle Request</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2 mb-1">Pick another live streamer — they have to accept before the battle starts.</p>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {otherStreams.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No other streamers available right now.</p>
            ) : otherStreams.map((s) => {
              const alreadyRequested = battleReqs.outgoing.some((r) => r.otherStream?.id === s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => !alreadyRequested && handleRequestBattle(s.id)}
                  disabled={alreadyRequested}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-black/40 hover:bg-black/60 transition-colors border border-border hover:border-accent text-left disabled:opacity-60 disabled:cursor-not-allowed"
                  data-testid={`button-opponent-${s.id}`}
                >
                  <img src={s.user?.avatarUrl || "/assets/avatar1.png"} alt="" className="w-10 h-10 rounded-full object-cover" />
                  <div className="flex-1 overflow-hidden">
                    <p className="text-white font-semibold text-sm truncate">{s.user?.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.title}</p>
                  </div>
                  {alreadyRequested ? (
                    <span className="text-[10px] text-accent font-bold uppercase">Pending</span>
                  ) : (
                    <>
                      <Users className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs text-white">{s.viewerCount}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBattleOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Radio(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
      <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
    </svg>
  );
}
