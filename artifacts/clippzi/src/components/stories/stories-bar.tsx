import { useRef, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import {
  useListStories,
  useCreateStory,
  getListStoriesQueryKey,
} from "@workspace/api-client-react";
import type { StoryGroup } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { StoryViewer } from "./story-viewer";

export function StoriesBar() {
  const { userId, isAuthenticated, login } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: groups } = useListStories({ query: { queryKey: getListStoriesQueryKey() } });
  const createStory = useCreateStory();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const { uploadFile, isUploading } = useUpload({
    onError: (err) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const allGroups: StoryGroup[] = groups ?? [];
  const myGroupIndex = allGroups.findIndex((g) => g.user.id === userId);

  const handlePick = useCallback(() => {
    if (!isAuthenticated || !userId) {
      toast({ title: "Login required", description: "Sign in to add a story." });
      login();
      return;
    }
    fileInputRef.current?.click();
  }, [isAuthenticated, userId, login, toast]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      toast({ title: "Invalid file", description: "Pick a video or image.", variant: "destructive" });
      return;
    }
    const result = await uploadFile(file);
    if (!result?.objectPath) return;
    const mediaUrl = `/api/storage${result.objectPath}`;
    createStory.mutate(
      { data: { type: isVideo ? "video" : "image", mediaUrl } },
      {
        onSuccess: () => {
          toast({ title: "Story added! ✨", description: "Live for the next 24 hours." });
          queryClient.invalidateQueries({ queryKey: getListStoriesQueryKey() });
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? err?.message ?? String(err);
          toast({ title: "Couldn't post story", description: msg, variant: "destructive" });
        },
      },
    );
  }, [uploadFile, createStory, queryClient, toast]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFile}
        data-testid="input-story-file"
      />

      {/* Your story / add */}
      <button
        onClick={handlePick}
        disabled={isUploading || createStory.isPending}
        className="flex flex-col items-center gap-1 shrink-0"
        data-testid="button-add-story"
      >
        <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center relative bg-white/5">
          <Plus className="w-6 h-6 text-white/80" />
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center text-black">
            <Plus className="w-4 h-4" />
          </div>
        </div>
        <span className="text-xs text-white/90 w-16 text-center truncate">
          {isUploading || createStory.isPending ? "Adding…" : "Your story"}
        </span>
      </button>

      {allGroups.map((g, i) => (
        <button
          key={g.user.id}
          onClick={() => setViewerIndex(i)}
          className="flex flex-col items-center gap-1 shrink-0"
          data-testid={`button-story-${g.user.id}`}
        >
          <div
            className={`w-16 h-16 rounded-full p-[2px] ${
              g.hasUnseen
                ? "bg-gradient-to-tr from-primary to-primary"
                : "bg-white/20"
            }`}
          >
            <img
              src={g.user.avatarUrl || "/assets/avatar1.png"}
              alt={g.user.displayName}
              className="w-full h-full rounded-full object-cover border-2 border-black"
            />
          </div>
          <span className="text-xs text-white/90 w-16 text-center truncate">
            {g.user.id === userId ? "You" : g.user.displayName}
          </span>
        </button>
      ))}

      {viewerIndex !== null && (
        <StoryViewer
          groups={allGroups}
          initialGroupIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}
