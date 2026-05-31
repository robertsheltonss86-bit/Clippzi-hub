import { useState } from "react";
import { Link } from "wouter";
import { Radio, Eye } from "lucide-react";
import { useListLivestreams, getListLivestreamsQueryKey } from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

// A persistent "who's live" pill. Lives in the global layout so it stays pinned
// on the right of every page while you scroll — tap it to see everyone who is
// live right now and jump straight into a stream. Renders nothing when nobody
// is live.
export function WhosLiveButton({ className = "" }: { className?: string }) {
  const { data: streams } = useListLivestreams(undefined, {
    query: { queryKey: getListLivestreamsQueryKey() },
  });
  const [open, setOpen] = useState(false);

  if (!streams || streams.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className={`flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 shadow-lg shadow-secondary/30 active:scale-95 transition ${className}`}
          data-testid="button-whos-live"
          aria-label="See who's live"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-white">Live</span>
          <span className="rounded-full bg-black/30 px-1.5 text-xs font-bold text-white">{streams.length}</span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="bg-card border-white/10 rounded-t-2xl max-h-[70%] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-white">
            <Radio className="w-5 h-5 text-secondary" /> Live now
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-2 pb-4">
          {streams.map((stream) => (
            <Link href={`/live/${stream.id}`} key={stream.id}>
              <button
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-2.5 text-left active:bg-white/10 transition"
                data-testid={`live-row-${stream.id}`}
              >
                <div className="relative shrink-0">
                  <img
                    src={stream.user?.avatarUrl || "/assets/avatar1.png"}
                    alt={stream.user?.displayName || ""}
                    className="w-12 h-12 rounded-full object-cover border-2 border-secondary"
                  />
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-secondary text-white text-[9px] font-bold px-1.5 rounded-sm uppercase tracking-wider">
                    Live
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{stream.user?.displayName || stream.user?.username || "Creator"}</p>
                  <p className="truncate text-xs text-white/60">{stream.title}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-white/70">
                  <Eye className="w-3.5 h-3.5" />
                  {stream.viewerCount ?? 0}
                </div>
              </button>
            </Link>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
