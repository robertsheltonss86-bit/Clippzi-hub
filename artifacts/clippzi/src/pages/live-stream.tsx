import { useGetLivestream, getGetLivestreamQueryKey, useListGifts, getListGiftsQueryKey, useSendGift, useListLivestreams, useStartBattle, useEndBattle, useAddBattleScore } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Gift as GiftIcon, Heart, Send, Sparkles, Filter, Swords, Share2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const CURRENT_USER_ID = 1;

export default function LiveStream() {
  const { id } = useParams();
  const streamId = parseInt(id || "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stream, isLoading: streamLoading } = useGetLivestream(streamId, {
    query: { enabled: !!streamId, queryKey: getGetLivestreamQueryKey(streamId), refetchInterval: 3000 },
  });
  const { data: gifts } = useListGifts(undefined, { query: { queryKey: getListGiftsQueryKey() } });
  const { data: allStreams } = useListLivestreams();

  const sendGiftMutation = useSendGift();
  const startBattle = useStartBattle();
  const endBattle = useEndBattle();
  const addBattleScore = useAddBattleScore();

  const [activeFilter, setActiveFilter] = useState("None");
  const [battleOpen, setBattleOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const filters = ["None", "Beauty", "Vintage", "Neon", "Blur", "Cartoon"];

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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

  const refreshStream = () => queryClient.invalidateQueries({ queryKey: getGetLivestreamQueryKey(streamId) });

  const handleSendGift = (giftId: number, name: string, price: number) => {
    sendGiftMutation.mutate(
      { data: { giftId, senderId: CURRENT_USER_ID, receiverId: stream?.userId || 0, streamId, quantity: 1 } },
      {
        onSuccess: () => {
          toast({ title: "Gift Sent! 🎁", description: `You sent a ${name} to ${stream?.user?.displayName}` });
          if (battleActive) {
            addBattleScore.mutate(
              { id: streamId, data: { points: price } },
              {
                onSuccess: refreshStream,
                onError: () => toast({ title: "Score not added", description: "Battle may have just ended.", variant: "destructive" }),
              },
            );
          }
        },
      },
    );
  };

  const handleStartBattle = (opponentStreamId: number) => {
    startBattle.mutate(
      { id: streamId, data: { opponentStreamId, durationSeconds: 180 } },
      {
        onSuccess: () => {
          setBattleOpen(false);
          toast({ title: "⚔️ Battle started!", description: "3-minute gift battle is on. Gifts add to your score." });
          refreshStream();
        },
        onError: () => toast({ title: "Couldn't start battle", variant: "destructive" }),
      },
    );
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
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url).catch(() => {});
    }
    toast({ title: "Stream link copied!", description: url });
  };

  const getRarityColor = (rarity?: string) => {
    switch (rarity) {
      case "legendary": return "border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]";
      case "epic": return "border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]";
      case "rare": return "border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]";
      default: return "border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]";
    }
  };

  if (streamLoading) {
    return <div className="h-full w-full flex items-center justify-center bg-black"><Skeleton className="w-full h-full" /></div>;
  }

  const otherStreams = allStreams?.filter((s) => s.id !== streamId && s.status === "live") ?? [];

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-black overflow-hidden relative">
      <div className="flex-1 relative bg-black flex flex-col justify-center items-center h-[50vh] lg:h-full">
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
        ) : (
          <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
            <img src={stream?.thumbnailUrl || "https://images.unsplash.com/photo-1511512578047-dfb367046420"} alt="" className="w-full h-full object-cover opacity-50 blur-sm" />
            <div className="absolute flex items-center justify-center">
              <Radio className="w-16 h-16 text-secondary animate-pulse opacity-50" />
            </div>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/80 pointer-events-none flex flex-col justify-between p-4">
          <div className="flex justify-between items-start pointer-events-auto">
            <div className="flex items-center gap-3 bg-black/40 backdrop-blur p-2 rounded-full border border-white/10">
              <img src={stream?.user?.avatarUrl || "/assets/avatar1.png"} alt="" className="w-10 h-10 rounded-full object-cover" />
              <div>
                <h3 className="font-bold text-white text-sm leading-tight">{stream?.user?.displayName}</h3>
                <p className="text-xs text-muted-foreground">{stream?.title}</p>
              </div>
              <Button size="sm" className="rounded-full bg-secondary hover:bg-secondary/80 text-white h-7 px-3 text-xs ml-2">Follow</Button>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={handleShare} size="icon" variant="ghost" className="rounded-full bg-black/60 backdrop-blur border border-white/10 h-8 w-8 text-white hover:bg-black/80" data-testid="button-share-stream">
                <Share2 className="w-4 h-4" />
              </Button>
              {battleActive ? (
                <Button onClick={handleEndBattle} size="sm" className="rounded-full bg-red-600 hover:bg-red-700 text-white h-8 px-3 text-xs gap-1" data-testid="button-end-battle">
                  <Swords className="w-3.5 h-3.5" /> End Battle
                </Button>
              ) : (
                <Button onClick={() => setBattleOpen(true)} size="sm" className="rounded-full bg-accent hover:bg-accent/80 text-black h-8 px-3 text-xs gap-1 font-bold" data-testid="button-start-battle">
                  <Swords className="w-3.5 h-3.5" /> Battle
                </Button>
              )}
              <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 text-white font-medium text-sm">
                <Users className="w-4 h-4 text-primary" />
                {stream?.viewerCount}
              </div>
              <div className="px-3 py-1.5 rounded-full bg-secondary text-white text-xs font-bold uppercase tracking-wider animate-pulse">Live</div>
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

          {!battleActive && (
            <div className="pointer-events-auto self-start flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-2 bg-black/40 backdrop-blur px-3 py-1.5 rounded-full w-fit">
                <Filter className="w-4 h-4 text-accent" />
                <span className="text-xs text-white font-medium">Filters</span>
              </div>
              <div className="flex flex-col gap-2">
                {filters.map((f) => (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      activeFilter === f ? "bg-accent text-black scale-110 origin-left" : "bg-black/40 text-white border border-white/10 hover:bg-black/60"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="w-full lg:w-[400px] h-[50vh] lg:h-full flex flex-col bg-card border-l border-border relative z-10">
        <div className="p-3 border-b border-border bg-black/20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="w-4 h-4" /> Top Gifters
          </div>
          <div className="flex -space-x-2">
            {[1, 2, 3].map((i) => (
              <img key={i} src={`/assets/avatar${i}.png`} alt="" className="w-6 h-6 rounded-full border border-black z-10" />
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <span className="font-bold text-accent text-sm">System:</span>
              <span className="text-sm text-white/90">Welcome to the chat! Please be respectful.</span>
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-2">
                <img src={`/assets/avatar${(i % 3) + 1}.png`} alt="" className="w-6 h-6 rounded-full" />
                <div>
                  <span className="font-bold text-white text-sm mr-2">User{i}</span>
                  <span className="text-sm text-white/80">This is so cool! 🔥</span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="h-48 border-t border-border bg-black/40 p-2 flex flex-col gap-2">
          <div className="flex items-center justify-between px-2 text-xs font-semibold text-muted-foreground uppercase">
            <span>Send Gifts {battleActive ? "(adds to battle score)" : ""}</span>
            <span className="text-primary flex items-center gap-1"><GiftIcon className="w-3 h-3" /> 1,240 Coins</span>
          </div>
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-4 gap-2 pb-2">
              {gifts?.map((gift) => (
                <button
                  key={gift.id}
                  onClick={() => handleSendGift(gift.id, gift.name, Number(gift.price))}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg bg-black/60 border-2 transition-all hover:scale-105 hover:bg-zinc-800 ${getRarityColor(gift.rarity)}`}
                  data-testid={`button-gift-${gift.id}`}
                >
                  <span className="text-2xl mb-1 filter drop-shadow-md">{gift.emoji}</span>
                  <span className="text-[10px] text-white font-medium truncate w-full text-center">{gift.name}</span>
                  <span className="text-[10px] text-primary font-bold">${Number(gift.price).toFixed(2)}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="p-3 border-t border-border bg-card flex gap-2 items-center">
          <div className="relative flex-1">
            <Input placeholder="Say something..." className="bg-input border-none rounded-full pr-10" />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Heart className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
          <Button size="icon" className="rounded-full bg-primary hover:bg-primary/80 shrink-0">
            <Send className="w-4 h-4 text-black" />
          </Button>
        </div>
      </div>

      <Dialog open={battleOpen} onOpenChange={setBattleOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2"><Swords className="w-5 h-5 text-accent" /> Pick a Battle Opponent</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {otherStreams.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No other streamers available right now.</p>
            ) : otherStreams.map((s) => (
              <button
                key={s.id}
                onClick={() => handleStartBattle(s.id)}
                disabled={startBattle.isPending}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-black/40 hover:bg-black/60 transition-colors border border-border hover:border-accent text-left"
                data-testid={`button-opponent-${s.id}`}
              >
                <img src={s.user?.avatarUrl || "/assets/avatar1.png"} alt="" className="w-10 h-10 rounded-full object-cover" />
                <div className="flex-1 overflow-hidden">
                  <p className="text-white font-semibold text-sm truncate">{s.user?.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.title}</p>
                </div>
                <Users className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs text-white">{s.viewerCount}</span>
              </button>
            ))}
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
