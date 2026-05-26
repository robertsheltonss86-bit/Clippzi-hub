import { useGetLivestream, getGetLivestreamQueryKey, useListGifts, getListGiftsQueryKey, useSendGift } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Gift as GiftIcon, Heart, Send, Sparkles, Filter, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

export default function LiveStream() {
  const { id } = useParams();
  const streamId = parseInt(id || "0");
  const { toast } = useToast();

  const { data: stream, isLoading: streamLoading } = useGetLivestream(streamId, { 
    query: { enabled: !!streamId, queryKey: getGetLivestreamQueryKey(streamId) } 
  });
  
  const { data: gifts } = useListGifts(undefined, { 
    query: { queryKey: getListGiftsQueryKey() } 
  });

  const sendGiftMutation = useSendGift();
  const [activeFilter, setActiveFilter] = useState("None");
  const filters = ["None", "Beauty", "Vintage", "Neon", "Blur", "Cartoon"];

  const handleSendGift = (giftId: number, name: string) => {
    // In a real app, senderId would be the current logged in user
    const senderId = 1; 
    
    sendGiftMutation.mutate(
      { data: { giftId, senderId, receiverId: stream?.userId || 0, streamId, quantity: 1 } },
      {
        onSuccess: () => {
          toast({
            title: "Gift Sent! 🎁",
            description: `You sent a ${name} to ${stream?.user?.displayName}`,
          });
        }
      }
    );
  };

  const getRarityColor = (rarity?: string) => {
    switch(rarity) {
      case 'legendary': return 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]';
      case 'epic': return 'border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]';
      case 'rare': return 'border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]';
      default: return 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]';
    }
  };

  if (streamLoading) {
    return <div className="h-full w-full flex items-center justify-center bg-black"><Skeleton className="w-full h-full" /></div>;
  }

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-black overflow-hidden relative">
      {/* Video Area */}
      <div className="flex-1 relative bg-black flex flex-col justify-center items-center h-[50vh] lg:h-full">
        {/* Placeholder for video player */}
        <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
          <img src={stream?.thumbnailUrl || "https://images.unsplash.com/photo-1511512578047-dfb367046420"} alt="" className="w-full h-full object-cover opacity-50 blur-sm" />
          <div className="absolute flex items-center justify-center">
            <Radio className="w-16 h-16 text-secondary animate-pulse opacity-50" />
          </div>
        </div>

        {/* Stream Overlay UI */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/80 pointer-events-none flex flex-col justify-between p-4">
          {/* Top Bar */}
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
              <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 text-white font-medium text-sm">
                <Users className="w-4 h-4 text-primary" />
                {stream?.viewerCount}
              </div>
              <div className="px-3 py-1.5 rounded-full bg-secondary text-white text-xs font-bold uppercase tracking-wider animate-pulse">
                Live
              </div>
            </div>
          </div>

          {/* Filters Bar (Streamer tools simulation) */}
          <div className="pointer-events-auto self-start flex flex-col gap-2">
             <div className="flex items-center gap-2 mb-2 bg-black/40 backdrop-blur px-3 py-1.5 rounded-full w-fit">
                <Filter className="w-4 h-4 text-accent" />
                <span className="text-xs text-white font-medium">Filters</span>
             </div>
             <div className="flex flex-col gap-2">
               {filters.map(f => (
                 <button 
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    activeFilter === f 
                      ? "bg-accent text-black scale-110 origin-left" 
                      : "bg-black/40 text-white border border-white/10 hover:bg-black/60"
                  }`}
                 >
                   {f}
                 </button>
               ))}
             </div>
          </div>
        </div>
      </div>

      {/* Chat & Interaction Panel */}
      <div className="w-full lg:w-[400px] h-[50vh] lg:h-full flex flex-col bg-card border-l border-border relative z-10">
        
        {/* Leaderboard snippet */}
        <div className="p-3 border-b border-border bg-black/20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="w-4 h-4" /> Top Gifters
          </div>
          <div className="flex -space-x-2">
            {[1,2,3].map(i => (
              <img key={i} src={`/assets/avatar${i}.png`} alt="" className="w-6 h-6 rounded-full border border-black z-10" />
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <span className="font-bold text-accent text-sm">System:</span>
              <span className="text-sm text-white/90">Welcome to the chat! Please be respectful.</span>
            </div>
            {/* Mock chat messages */}
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-2">
                <img src={`/assets/avatar${(i%3)+1}.png`} alt="" className="w-6 h-6 rounded-full" />
                <div>
                  <span className="font-bold text-white text-sm mr-2">User{i}</span>
                  <span className="text-sm text-white/80">This is so cool! 🔥</span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Gift Panel */}
        <div className="h-48 border-t border-border bg-black/40 p-2 flex flex-col gap-2">
          <div className="flex items-center justify-between px-2 text-xs font-semibold text-muted-foreground uppercase">
            <span>Send Gifts</span>
            <span className="text-primary flex items-center gap-1"><GiftIcon className="w-3 h-3"/> 1,240 Coins</span>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-4 gap-2 pb-2">
              {gifts?.map((gift) => (
                <button 
                  key={gift.id}
                  onClick={() => handleSendGift(gift.id, gift.name)}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg bg-black/60 border-2 transition-all hover:scale-105 hover:bg-zinc-800 ${getRarityColor(gift.rarity)}`}
                >
                   <span className="text-2xl mb-1 filter drop-shadow-md">{gift.emoji}</span>
                   <span className="text-[10px] text-white font-medium truncate w-full text-center">{gift.name}</span>
                   <span className="text-[10px] text-primary font-bold">${Number(gift.price).toFixed(2)}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Chat Input */}
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
    </div>
  );
}

// Temporary Radio icon for placeholder
function Radio(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/></svg>;
}