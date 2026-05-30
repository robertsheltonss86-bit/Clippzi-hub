import { useEffect, useRef, useState, useCallback } from "react";
import { X } from "lucide-react";
import { useMarkStoryViewed, getListStoriesQueryKey } from "@workspace/api-client-react";
import type { StoryGroup } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const IMAGE_DURATION_MS = 5000;

type Props = {
  groups: StoryGroup[];
  initialGroupIndex: number;
  onClose: () => void;
};

export function StoryViewer({ groups, initialGroupIndex, onClose }: Props) {
  const queryClient = useQueryClient();
  const markViewed = useMarkStoryViewed();
  const [groupIdx, setGroupIdx] = useState(initialGroupIndex);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const viewedRef = useRef<Set<number>>(new Set());
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const group = groups[groupIdx];
  const story = group?.stories[storyIdx];

  const goNext = useCallback(() => {
    setProgress(0);
    if (!group) return onClose();
    if (storyIdx < group.stories.length - 1) {
      setStoryIdx((i) => i + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx((g) => g + 1);
      setStoryIdx(0);
    } else {
      onClose();
    }
  }, [group, groupIdx, groups.length, storyIdx, onClose]);

  const goPrev = useCallback(() => {
    setProgress(0);
    if (storyIdx > 0) {
      setStoryIdx((i) => i - 1);
    } else if (groupIdx > 0) {
      const prev = groups[groupIdx - 1];
      setGroupIdx((g) => g - 1);
      setStoryIdx(prev.stories.length - 1);
    }
  }, [storyIdx, groupIdx, groups]);

  // Mark each story viewed once, and refresh the bar's unseen state on close.
  useEffect(() => {
    if (!story || story.viewed || viewedRef.current.has(story.id)) return;
    viewedRef.current.add(story.id);
    markViewed.mutate({ id: story.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListStoriesQueryKey() });
      },
    });
  }, [story, markViewed, queryClient]);

  // Image stories auto-advance on a timer; video stories advance on `ended`.
  useEffect(() => {
    if (!story) return;
    if (story.type !== "image") return;
    startRef.current = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const pct = Math.min(100, (elapsed / IMAGE_DURATION_MS) * 100);
      setProgress(pct);
      if (pct >= 100) {
        goNext();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [story, goNext]);

  if (!group || !story) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" data-testid="story-viewer">
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 p-3">
        {group.stories.map((s, i) => (
          <div key={s.id} className="flex-1 h-1 rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full bg-white rounded-full"
              style={{ width: i < storyIdx ? "100%" : i === storyIdx ? `${progress}%` : "0%" }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-6 left-0 right-0 z-20 flex items-center gap-3 px-4">
        <img
          src={group.user.avatarUrl || "/assets/avatar1.png"}
          alt=""
          className="w-9 h-9 rounded-full object-cover border border-white/50"
        />
        <span className="text-sm font-semibold text-white drop-shadow">{group.user.displayName}</span>
        <button
          onClick={onClose}
          className="ml-auto text-white p-1 active:scale-95"
          aria-label="Close"
          data-testid="button-close-story"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Media */}
      <div className="relative w-full h-full max-w-md mx-auto">
        {story.type === "video" ? (
          <video
            key={story.id}
            src={story.mediaUrl}
            className="w-full h-full object-contain"
            autoPlay
            playsInline
            onEnded={goNext}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress((v.currentTime / v.duration) * 100);
            }}
          />
        ) : (
          <img src={story.mediaUrl} alt="" className="w-full h-full object-contain" />
        )}

        {/* Tap zones: left third = previous, right two-thirds = next */}
        <button
          className="absolute inset-y-0 left-0 w-1/3"
          onClick={goPrev}
          aria-label="Previous"
          data-testid="story-prev"
        />
        <button
          className="absolute inset-y-0 right-0 w-2/3"
          onClick={goNext}
          aria-label="Next"
          data-testid="story-next"
        />
      </div>
    </div>
  );
}
