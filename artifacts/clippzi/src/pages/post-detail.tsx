import { useGetPost } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { useState, useRef } from "react";
import { Heart, MessageCircle, Play, Volume2, VolumeX, ArrowLeft, Gift } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { GiftSheet } from "@/components/coins/gift-sheet";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function PostDetail() {
  const params = useParams<{ id: string }>();
  const postId = Number(params.id);
  const { data: post, isLoading, isError } = useGetPost(postId);
  const { userId } = useCurrentUser();

  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    const video = videoRef.current;
    if (video) {
      video.muted = next;
      video.play().catch(() => {});
    }
  };

  if (isLoading) {
    return <div className="h-full w-full flex items-center justify-center bg-black"><Skeleton className="w-full h-full" /></div>;
  }

  if (isError || !post) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 bg-black px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Play className="w-9 h-9 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-white">Post not available</h2>
        <p className="text-sm text-white/60 max-w-xs">This post may have been removed or the link is no longer valid.</p>
        <Link href="/">
          <button className="mt-2 px-6 py-3 rounded-full bg-primary text-black font-semibold">Open Clippzi</button>
        </Link>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black flex items-center justify-center">
      <Link href="/">
        <button
          className="absolute top-4 left-4 z-30 flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur-sm px-3 py-2 text-white active:scale-95 transition"
          data-testid="button-back-feed"
          aria-label="Open Clippzi feed"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </Link>

      <div className="absolute inset-0 w-full h-full">
        {post.type === "video" && post.mediaUrl ? (
          <>
            <video
              ref={(el) => {
                if (el) {
                  el.muted = muted;
                  videoRef.current = el;
                }
              }}
              onClick={toggleMute}
              src={post.mediaUrl}
              className="w-full h-full object-contain cursor-pointer"
              loop
              playsInline
              autoPlay
              data-testid={`video-post-${post.id}`}
            />
            <button
              onClick={toggleMute}
              className="absolute top-4 right-4 z-30 flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur-sm px-3 py-2 text-white active:scale-95 transition"
              data-testid={`button-mute-${post.id}`}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              {muted && <span className="text-xs font-semibold">Tap for sound</span>}
            </button>
          </>
        ) : (
          <img
            src={post.mediaUrl || "https://images.unsplash.com/photo-1549490349-8643362247b5"}
            alt={post.title || ""}
            className="w-full h-full object-contain opacity-90"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent pointer-events-none" />
      </div>

      <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-2">
        <Link href={`/profile/${post.userId}`}>
          <h3 className="font-bold text-lg text-white drop-shadow-md cursor-pointer">@{post.user?.username}</h3>
        </Link>
        {post.title && <p className="text-sm text-white/90 font-medium">{post.title}</p>}
        {post.tags && post.tags.length > 0 && (
          <p className="text-primary font-semibold text-sm">{post.tags.map((t) => `#${t}`).join(" ")}</p>
        )}
        <div className="flex items-center gap-4 mt-2 text-white/90">
          <span className="flex items-center gap-1.5 text-sm"><Heart className="w-5 h-5" /> {post.likeCount}</span>
          <span className="flex items-center gap-1.5 text-sm"><MessageCircle className="w-5 h-5" /> {post.commentCount}</span>
          {(post.musicTitle || post.musicArtist) && (
            <span className="flex items-center gap-1.5 bg-black/40 rounded-full px-3 py-1.5 backdrop-blur-sm text-xs">
              <Play className="w-4 h-4" /> {post.musicTitle}{post.musicArtist ? ` - ${post.musicArtist}` : ""}
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Link href="/">
            <button className="px-6 py-3 rounded-full bg-primary text-black font-semibold" data-testid="button-open-clippzi">
              Open in Clippzi
            </button>
          </Link>
          {post.userId !== userId && (
            <GiftSheet receiverId={post.userId}>
              <button
                className="px-6 py-3 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-black font-bold flex items-center gap-2 shadow-[0_0_14px_rgba(251,191,36,0.6)] active:scale-95 transition"
                data-testid="button-gift-post"
              >
                <Gift className="w-5 h-5" /> Send Gift
              </button>
            </GiftSheet>
          )}
        </div>
      </div>
    </div>
  );
}
