import { useListLivestreams, getListLivestreamsQueryKey, useStartLivestream } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import { Radio, Users, Video } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function LiveBrowser() {
  const { userId, isAuthenticated, login } = useCurrentUser();
  const { data: streams, isLoading } = useListLivestreams(undefined, { query: { queryKey: getListLivestreamsQueryKey() } });
  const startMutation = useStartLivestream();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [groupMode, setGroupMode] = useState(false);
  const [starting, setStarting] = useState(false);

  const handleGoLive = async () => {
    if (!isAuthenticated || !userId) { login(); return; }
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setStarting(true);
    try {
      // Use plain fetch so we can pass `mode` (not in generated client types yet)
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}api/livestreams`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          title: title.trim(),
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          mode: groupMode ? "group" : "solo",
        }),
      });
      const stream = await res.json();
      if (!res.ok) throw new Error(stream?.error || "Failed");
      queryClient.invalidateQueries({ queryKey: getListLivestreamsQueryKey() });
      setOpen(false);
      setTitle(""); setDescription(""); setCategory(""); setGroupMode(false);
      toast({ title: groupMode ? "Group Live started! 👥" : "You're live! 🔴", description: stream.title });
      setLocation(`/live/${stream.id}`);
    } catch (e: any) {
      toast({ title: "Couldn't start stream", description: e?.message, variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };
  // Keep ref to satisfy unused-var lint
  void startMutation;

  return (
    <div className="w-full min-h-full bg-background p-4 md:p-8 space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap sticky top-0 z-30 bg-background/95 backdrop-blur -mx-4 md:-mx-8 px-4 md:px-8 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center border border-secondary/20">
            <Radio className="w-6 h-6 text-secondary animate-pulse" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Live Now</h1>
            <p className="text-muted-foreground">Join the conversation</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              size="lg"
              className="bg-secondary hover:bg-secondary/80 text-white font-extrabold gap-2 rounded-full shadow-[0_0_20px_rgba(244,63,94,0.45)] animate-pulse"
              data-testid="button-go-live"
            >
              <Video className="w-5 h-5" /> Go Live
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-white">Start your live stream</DialogTitle>
              <DialogDescription>Set up your stream and connect with viewers in real time.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" data-testid="input-stream-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's the vibe tonight?" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea id="desc" data-testid="input-stream-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell viewers what to expect..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat">Category</Label>
                <Input id="cat" data-testid="input-stream-category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Gaming, Music, IRL..." />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div>
                  <Label htmlFor="group" className="text-white font-semibold">👥 Group Live</Label>
                  <p className="text-xs text-muted-foreground">Up to 15 co-hosts in a grid + group games</p>
                </div>
                <Switch id="group" checked={groupMode} onCheckedChange={setGroupMode} data-testid="switch-group-mode" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleGoLive} disabled={starting} className="bg-secondary hover:bg-secondary/80 text-white" data-testid="button-confirm-go-live">
                {starting ? "Starting..." : groupMode ? "Start Group Live" : "Go Live"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-xl" />
          ))}
        </div>
      ) : streams && streams.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {streams.map((stream) => (
            <Link key={stream.id} href={`/live/${stream.id}`}>
              <div className="group rounded-xl overflow-hidden relative cursor-pointer border border-border hover:border-secondary transition-colors aspect-video bg-black flex items-center justify-center">
                <img
                  src={stream.thumbnailUrl || "https://images.unsplash.com/photo-1511512578047-dfb367046420"}
                  alt={stream.title}
                  className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity group-hover:scale-105 duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/40" />
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <div className="px-2 py-0.5 rounded bg-secondary text-white text-xs font-bold uppercase tracking-wider animate-pulse">Live</div>
                  <div className="px-2 py-0.5 rounded bg-black/60 backdrop-blur text-white text-xs font-medium flex items-center gap-1">
                    <Users className="w-3 h-3 text-primary" />
                    {stream.viewerCount}
                  </div>
                  {stream.battleOpponentId ? (
                    <div className="px-2 py-0.5 rounded bg-accent text-black text-xs font-bold uppercase">⚔️ Battle</div>
                  ) : null}
                </div>
                <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3">
                  <img src={stream.user?.avatarUrl || "/assets/avatar1.png"} alt="" className="w-10 h-10 rounded-full border border-secondary/50 object-cover" />
                  <div className="flex-1 overflow-hidden">
                    <h3 className="font-semibold text-white text-sm truncate">{stream.title}</h3>
                    <p className="text-xs text-muted-foreground truncate">{stream.user?.displayName}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-24 text-muted-foreground">
          <Radio className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg">No live streams right now</p>
          <p className="text-sm">Be the first to go live!</p>
        </div>
      )}
    </div>
  );
}
