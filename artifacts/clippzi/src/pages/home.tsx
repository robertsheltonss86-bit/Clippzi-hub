import { useGetFeed, getGetFeedQueryKey, useListLivestreams, useLikePost, useSharePost } from "@workspace/api-client-react";
import { Heart, MessageCircle, Share2, Play } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function Home() {
  const { userId, isAuthenticated, login } = useCurrentUser();
  const { data: posts, isLoading } = useGetFeed(undefined, { query: { queryKey: getGetFeedQueryKey() } });
  const { data: streams } = useListLivestreams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const likeMutation = useLikePost();
  const shareMutation = useSharePost();

  const [likedMap, setLikedMap] = useState<Record<number, boolean>>({});
  const [likeDeltas, setLikeDeltas] = useState<Record<number, number>>({});
  const [shareDeltas, setShareDeltas] = useState<Record<number, number>>({});

  const handleLike = (postId: number) => {
    if (!isAuthenticated || !userId) { login(); return; }
    const liked = !likedMap[postId];
    setLikedMap((m) => ({ ...m, [postId]: liked }));
    setLikeDeltas((d) => ({ ...d, [postId]: (d[postId] ?? 0) + (liked ? 1 : -1) }));
    likeMutation.mutate(
      { id: postId, data: { userId, liked } },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
          setLikeDeltas((d) => ({ ...d, [postId]: 0 }));
        },
        onError: () => {
          setLikedMap((m) => ({ ...m, [postId]: !liked }));
          setLikeDeltas((d) => ({ ...d, [postId]: (d[postId] ?? 0) - (liked ? 1 : -1) }));
          toast({ title: "Couldn't like post", variant: "destructive" });
        },
      },
    );
  };

  const handleShare = (postId: number) => {
    setShareDeltas((d) => ({ ...d, [postId]: (d[postId] ?? 0) + 1 }));
    shareMutation.mutate(
      { id: postId },
      {
        onSuccess: async (data) => {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(data.shareUrl).catch(() => {});
          }
          toast({ title: "Link copied!", description: data.shareUrl });
          await queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
          setShareDeltas((d) => ({ ...d, [postId]: 0 }));
        },
        onError: () => {
          setShareDeltas((d) => ({ ...d, [postId]: Math.max(0, (d[postId] ?? 0) - 1) }));
          toast({ title: "Couldn't share post", variant: "destructive" });
        },
      },
    );
  };

  if (isLoading) {
    return <div className="h-full w-full flex items-center justify-center"><Skeleton className="w-full h-full" /></div>;
  }

  return (
    <div className="relative h-full w-full bg-black overflow-y-scroll snap-y snap-mandatory scrollbar-hide">
      <div className="absolute top-0 left-0 w-full z-10 bg-gradient-to-b from-black/80 to-transparent p-4 flex flex-col gap-4">
        {streams && streams.length > 0 && (
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {streams.map((stream) => (
              <Link href={`/live/${stream.id}`} key={stream.id}>
                <div className="flex flex-col items-center gap-1 cursor-pointer group">
                  <div className="w-16 h-16 rounded-full border-2 border-secondary p-[2px] relative">
                    <img
                      src={stream.user?.avatarUrl || "/assets/avatar1.png"}
                      alt={stream.user?.displayName}
                      className="w-full h-full rounded-full object-cover"
                    />
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-secondary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                      LIVE
                    </div>
                  </div>
                  <span className="text-xs text-white/90 truncate w-16 text-center">{stream.user?.displayName}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {posts?.map((post) => {
        const liked = likedMap[post.id] ?? false;
        const likeCount = (post.likeCount ?? 0) + (likeDeltas[post.id] ?? 0);
        const shareCount = (post.shareCount ?? 0) + (shareDeltas[post.id] ?? 0);
        return (
          <div
            key={post.id}
            className="relative h-full w-full snap-start snap-always flex items-center justify-center bg-black/90"
          >
            <div className="absolute inset-0 w-full h-full">
              {post.type === "video" && post.mediaUrl ? (
                <video
                  src={post.mediaUrl}
                  className="w-full h-full object-cover"
                  loop
                  playsInline
                  controls
                  autoPlay
                  data-testid={`video-post-${post.id}`}
                />
              ) : (
                <img
                  src={post.mediaUrl || "https://images.unsplash.com/photo-1549490349-8643362247b5"}
                  alt={post.title || ""}
                  className="w-full h-full object-cover opacity-80"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent pointer-events-none" />
            </div>

            <div className="absolute right-4 bottom-24 flex flex-col items-center gap-6">
              <Link href={`/profile/${post.userId}`}>
                <div className="cursor-pointer relative">
                  <img src={post.user?.avatarUrl || "/assets/avatar2.png"} alt="" className="w-12 h-12 rounded-full border-2 border-white object-cover" />
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-black font-bold">
                    +
                  </div>
                </div>
              </Link>

              <button onClick={() => handleLike(post.id)} className="flex flex-col items-center gap-1 group" data-testid={`button-like-${post.id}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${liked ? "bg-secondary/30" : "bg-black/40 group-hover:bg-black/60"}`}>
                  <Heart className={`w-7 h-7 transition-all duration-300 ${liked ? "fill-secondary text-secondary scale-110" : "text-white group-hover:text-secondary group-hover:scale-110"}`} />
                </div>
                <span className="text-sm font-semibold text-white drop-shadow-md">{likeCount}</span>
              </button>

              <button className="flex flex-col items-center gap-1 group">
                <div className="w-12 h-12 rounded-full bg-black/40 flex items-center justify-center group-hover:bg-black/60 transition-colors">
                  <MessageCircle className="w-7 h-7 text-white group-hover:scale-110 transition-all duration-300" />
                </div>
                <span className="text-sm font-semibold text-white drop-shadow-md">{post.commentCount}</span>
              </button>

              <button onClick={() => handleShare(post.id)} className="flex flex-col items-center gap-1 group" data-testid={`button-share-${post.id}`}>
                <div className="w-12 h-12 rounded-full bg-black/40 flex items-center justify-center group-hover:bg-black/60 transition-colors">
                  <Share2 className="w-7 h-7 text-white group-hover:scale-110 transition-all duration-300" />
                </div>
                <span className="text-sm font-semibold text-white drop-shadow-md">{shareCount > 0 ? shareCount : "Share"}</span>
              </button>
            </div>

            <div className="absolute bottom-4 left-4 right-20 flex flex-col gap-2">
              <h3 className="font-bold text-lg text-white drop-shadow-md">@{post.user?.username}</h3>
              <p className="text-sm text-white/90 font-medium">{post.title}</p>
              {post.tags && post.tags.length > 0 && (
                <p className="text-primary font-semibold text-sm">
                  {post.tags.map((t) => `#${t}`).join(" ")}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-2 bg-black/40 rounded-full px-3 py-1.5 backdrop-blur-sm">
                  <Play className="w-4 h-4 text-white" />
                  <span className="text-xs text-white font-medium marquee-text">
                    {post.musicTitle} - {post.musicArtist}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
