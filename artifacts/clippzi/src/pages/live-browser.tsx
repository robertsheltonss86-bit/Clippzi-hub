import { useListLivestreams, getListLivestreamsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Radio, Users } from "lucide-react";

export default function LiveBrowser() {
  const { data: streams, isLoading } = useListLivestreams(undefined, { query: { queryKey: getListLivestreamsQueryKey() } });

  return (
    <div className="w-full min-h-full bg-background p-4 md:p-8 space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center border border-secondary/20">
          <Radio className="w-6 h-6 text-secondary animate-pulse" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Live Now</h1>
          <p className="text-muted-foreground">Join the conversation</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {streams?.map((stream) => (
            <Link key={stream.id} href={`/live/${stream.id}`}>
              <div className="group rounded-xl overflow-hidden relative cursor-pointer border border-border hover:border-secondary transition-colors aspect-video bg-black flex items-center justify-center">
                <img 
                  src={stream.thumbnailUrl || "https://images.unsplash.com/photo-1511512578047-dfb367046420"} 
                  alt={stream.title} 
                  className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity group-hover:scale-105 duration-500" 
                />
                
                {/* Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/40" />
                
                {/* Top badges */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <div className="px-2 py-0.5 rounded bg-secondary text-white text-xs font-bold uppercase tracking-wider animate-pulse">
                    Live
                  </div>
                  <div className="px-2 py-0.5 rounded bg-black/60 backdrop-blur text-white text-xs font-medium flex items-center gap-1">
                    <Users className="w-3 h-3 text-primary" />
                    {stream.viewerCount}
                  </div>
                </div>

                {/* Bottom info */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3">
                  <img 
                    src={stream.user?.avatarUrl || "/assets/avatar1.png"} 
                    alt="" 
                    className="w-10 h-10 rounded-full border border-secondary/50 object-cover" 
                  />
                  <div className="flex-1 overflow-hidden">
                    <h3 className="font-semibold text-white text-sm truncate">{stream.title}</h3>
                    <p className="text-xs text-muted-foreground truncate">{stream.user?.displayName}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}