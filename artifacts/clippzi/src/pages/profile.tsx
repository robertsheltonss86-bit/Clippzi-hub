import { useGetUser, useGetUserStats, useUpdateUser, useListPosts, useFollowUser, useDeletePost } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useParams, useLocation } from "wouter";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Camera, Edit2, CheckCircle, Heart, Play, Users, Video, Eye, BadgeCheck, DollarSign, Trash2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xl font-bold text-white">{typeof value === "number" ? value.toLocaleString() : value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function UploadableImage({
  src,
  fallback,
  onUploaded,
  className,
  overlayLabel,
}: {
  src?: string | null;
  fallback: string;
  onUploaded: (objectPath: string) => void;
  className?: string;
  overlayLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { uploadFile, isUploading, progress } = useUpload({
    onSuccess: (res) => onUploaded(res.objectPath),
    onError: (err) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Images only", description: "Please select a JPG, PNG, GIF or WebP file.", variant: "destructive" });
      return;
    }
    await uploadFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={`relative group cursor-pointer ${className}`} onClick={() => !isUploading && inputRef.current?.click()}>
      {src ? (
        <img src={src} alt={overlayLabel} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted text-4xl font-bold text-muted-foreground">
          {fallback}
        </div>
      )}

      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 rounded-[inherit]">
        {isUploading ? (
          <>
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span className="text-white text-xs font-medium">{progress}%</span>
          </>
        ) : (
          <>
            <Camera className="w-5 h-5 text-white" />
            <span className="text-white text-xs font-medium">{overlayLabel}</span>
          </>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
    </div>
  );
}

export default function Profile() {
  const params = useParams<{ id: string }>();
  const { userId: meId, isAuthenticated, login } = useCurrentUser();
  const userId = Number(params.id) || meId || 0;
  const isOwnProfile = !!meId && userId === meId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");

  const { data: user, isLoading: userLoading, refetch: refetchUser } = useGetUser(userId);
  const { data: stats } = useGetUserStats(userId);
  const { data: posts, refetch: refetchPosts } = useListPosts({ userId });

  const updateUser = useUpdateUser();
  const followUser = useFollowUser();
  const deletePost = useDeletePost();
  const [postToDelete, setPostToDelete] = useState<number | null>(null);

  const confirmDelete = () => {
    if (postToDelete == null) return;
    deletePost.mutate(
      { id: postToDelete },
      {
        onSuccess: () => {
          toast({ title: "Post deleted" });
          setPostToDelete(null);
          refetchPosts();
          refetchUser();
        },
        onError: (e: any) => {
          toast({ title: "Couldn't delete post", description: e?.message ?? String(e), variant: "destructive" });
          setPostToDelete(null);
        },
      }
    );
  };

  const openEdit = () => {
    setEditDisplayName(user?.displayName ?? "");
    setEditBio(user?.bio ?? "");
    setEditOpen(true);
  };

  const saveEdit = () => {
    updateUser.mutate(
      { id: userId, data: { displayName: editDisplayName, bio: editBio } },
      {
        onSuccess: () => { toast({ title: "Profile updated!" }); setEditOpen(false); refetchUser(); },
        onError: (e) => toast({ title: "Failed to update", description: String(e), variant: "destructive" }),
      }
    );
  };

  const handleAvatarUploaded = (objectPath: string) => {
    const avatarUrl = `/api/storage${objectPath}`;
    updateUser.mutate(
      { id: userId, data: { avatarUrl } },
      {
        onSuccess: () => { toast({ title: "Profile photo updated!" }); refetchUser(); },
        onError: (e) => toast({ title: "Failed to save photo", description: String(e), variant: "destructive" }),
      }
    );
  };

  const handleBannerUploaded = (objectPath: string) => {
    const bannerUrl = `/api/storage${objectPath}`;
    updateUser.mutate(
      { id: userId, data: { bannerUrl } },
      {
        onSuccess: () => { toast({ title: "Banner updated!" }); refetchUser(); },
        onError: (e) => toast({ title: "Failed to save banner", description: String(e), variant: "destructive" }),
      }
    );
  };

  const handleFollow = () => {
    if (!isAuthenticated || !meId) { login(); return; }
    followUser.mutate(
      { id: userId, data: { followerId: meId, action: "follow" } },
      { onSuccess: () => { toast({ title: `Following @${user?.username}` }); refetchUser(); } }
    );
  };

  if (userLoading) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full gap-4">
        <span className="text-4xl">👤</span>
        <p className="text-white font-bold text-xl">User not found</p>
        <Button onClick={() => setLocation("/")} variant="outline">Go Home</Button>
      </div>
    );
  }

  const initials = user.displayName?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <div className="w-full min-h-full bg-background">
      {/* Banner */}
      <div className="relative w-full h-44 md:h-56 bg-gradient-to-br from-primary/30 via-black to-red-900/30 overflow-hidden">
        {user.bannerUrl && (
          <img src={user.bannerUrl} alt="Banner" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {isOwnProfile && (
          <UploadableImage
            src={user.bannerUrl}
            fallback=""
            onUploaded={handleBannerUploaded}
            className="absolute inset-0 w-full h-full rounded-none"
            overlayLabel="Change Banner"
          />
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4">
        {/* Avatar + actions row */}
        <div className="flex items-end justify-between -mt-14 mb-4">
          <div className="relative">
            {isOwnProfile ? (
              <UploadableImage
                src={user.avatarUrl}
                fallback={initials}
                onUploaded={handleAvatarUploaded}
                className="w-24 h-24 md:w-28 md:h-28 rounded-full border-4 border-background overflow-hidden"
                overlayLabel="Change Photo"
              />
            ) : (
              <div className="w-24 h-24 md:w-28 md:h-28 rounded-full border-4 border-background overflow-hidden bg-muted flex items-center justify-center text-3xl font-bold text-muted-foreground">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                ) : initials}
              </div>
            )}
          </div>

          <div className="flex gap-2 pb-1">
            {isOwnProfile ? (
              <Button onClick={openEdit} variant="outline" size="sm" className="gap-1.5 border-border">
                <Edit2 className="w-3.5 h-3.5" /> Edit Profile
              </Button>
            ) : (
              <Button onClick={handleFollow} size="sm" className="bg-primary text-black font-bold hover:bg-primary/90">
                Follow
              </Button>
            )}
            {isOwnProfile && (
              <Button onClick={() => setLocation(`/profile/${userId}/earnings`)} variant="outline" size="sm" className="gap-1.5 border-border">
                <DollarSign className="w-3.5 h-3.5" /> Earnings
              </Button>
            )}
          </div>
        </div>

        {/* Name + badges */}
        <div className="mb-3 space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">{user.displayName}</h1>
            {user.isVerified && <BadgeCheck className="w-5 h-5 text-primary" />}
            {user.role === "admin" && <Badge className="bg-red-600 text-white text-xs">Admin</Badge>}
            {user.role === "streamer" && <Badge className="bg-primary/20 text-primary text-xs border border-primary/40">Streamer</Badge>}
          </div>
          <p className="text-muted-foreground text-sm">@{user.username}</p>
          {user.bio && <p className="text-white/80 text-sm mt-2 leading-relaxed">{user.bio}</p>}
        </div>

        {/* Stats */}
        <div className="flex gap-6 mb-6 border-b border-border pb-5">
          <StatBox label="Followers" value={user.followerCount ?? 0} />
          <StatBox label="Following" value={user.followingCount ?? 0} />
          <StatBox label="Posts" value={user.postCount ?? 0} />
          {stats && <StatBox label="Total Views" value={stats.totalViews ?? 0} />}
          {stats && <StatBox label="Gifts Received" value={`$${Number(stats.totalGiftsReceived ?? 0).toFixed(2)}`} />}
        </div>

        {/* Posts grid */}
        <div className="mb-8">
          <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Video className="w-4 h-4 text-primary" /> Posts
          </h2>
          {!posts || posts.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
              <Video className="w-10 h-10 opacity-30" />
              <p className="text-sm">No posts yet</p>
              {isOwnProfile && (
                <Button onClick={() => setLocation("/upload")} size="sm" className="bg-primary text-black font-bold">
                  Upload your first clip
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="relative aspect-[9/16] bg-muted rounded overflow-hidden group cursor-pointer"
                  onClick={() => setLocation("/")}
                >
                  {post.thumbnailUrl ? (
                    <img src={post.thumbnailUrl} alt={post.title ?? ""} className="w-full h-full object-cover" />
                  ) : post.type === "image" && post.mediaUrl ? (
                    <img src={post.mediaUrl} alt={post.title ?? ""} className="w-full h-full object-cover" />
                  ) : post.type === "video" && post.mediaUrl ? (
                    <video src={post.mediaUrl} className="w-full h-full object-cover" muted />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/20 to-black flex items-center justify-center">
                      <Play className="w-8 h-8 text-primary/60" />
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <span className="flex items-center gap-1 text-white text-sm font-medium">
                      <Heart className="w-4 h-4 fill-white" />
                      {(post.likeCount ?? 0).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-white text-sm font-medium">
                      <Eye className="w-4 h-4" />
                      {(post.viewCount ?? 0).toLocaleString()}
                    </span>
                  </div>

                  {post.type === "video" && (
                    <div className="absolute top-1.5 right-1.5">
                      <Play className="w-3.5 h-3.5 text-white drop-shadow" />
                    </div>
                  )}

                  {isOwnProfile && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setPostToDelete(post.id); }}
                      className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-black/70 hover:bg-red-600 flex items-center justify-center text-white border border-white/20 active:scale-95 transition"
                      aria-label="Delete post"
                      data-testid={`button-delete-post-${post.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Post Confirmation */}
      <AlertDialog open={postToDelete !== null} onOpenChange={(open) => { if (!open) setPostToDelete(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the post and all of its likes & comments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deletePost.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-confirm-delete-post"
            >
              {deletePost.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Profile Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex justify-center">
              <UploadableImage
                src={user.avatarUrl}
                fallback={initials}
                onUploaded={handleAvatarUploaded}
                className="w-20 h-20 rounded-full overflow-hidden"
                overlayLabel="Change"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white">Display Name</Label>
              <Input
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                className="bg-input border-border"
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white">Bio</Label>
              <Textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="bg-input border-border min-h-[90px]"
                placeholder="Tell everyone about yourself..."
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={() => setEditOpen(false)} variant="outline" className="flex-1 border-border">Cancel</Button>
              <Button
                onClick={saveEdit}
                className="flex-1 bg-primary text-black font-bold hover:bg-primary/90"
                disabled={updateUser.isPending}
              >
                {updateUser.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
