import { useListComments, getListCommentsQueryKey, useCreateComment, getGetFeedQueryKey } from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";

export function CommentsSheet({ postId, count, children }: { postId: number; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { userId, isAuthenticated, login } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  const { data: comments, isLoading } = useListComments(
    { postId },
    { query: { enabled: open, queryKey: getListCommentsQueryKey({ postId }), refetchInterval: open ? 4000 : false } },
  );
  const createComment = useCreateComment();

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments?.length, open]);

  const send = () => {
    if (!isAuthenticated || !userId) { login(); return; }
    const t = text.trim();
    if (!t) return;
    createComment.mutate(
      { data: { postId, userId, text: t } as any },
      {
        onSuccess: async () => {
          setText("");
          await queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey({ postId }) });
          await queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
        },
        onError: (e: any) => toast({ title: "Couldn't post comment", description: String(e?.message ?? e), variant: "destructive" }),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="bottom" className="bg-card border-border h-[75vh] flex flex-col p-0">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="text-white flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" /> {count} comment{count === 1 ? "" : "s"}
          </SheetTitle>
        </SheetHeader>
        <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="comments-list">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading comments…</p>
          ) : !comments || comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No comments yet. Be the first!</p>
          ) : (
            comments.slice().reverse().map((c: any) => (
              <div key={c.id} className="flex items-start gap-2.5" data-testid={`comment-${c.id}`}>
                <img
                  src={c.user?.avatarUrl || `/assets/avatar${(c.userId % 3) + 1}.png`}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm text-white truncate">{c.user?.displayName || c.user?.username || `User${c.userId}`}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-white/90 break-words mt-0.5">{c.text}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="p-3 border-t border-border bg-card flex gap-2 items-center"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={isAuthenticated ? "Add a comment…" : "Log in to comment"}
            maxLength={500}
            className="bg-input border-none rounded-full flex-1"
            data-testid="input-comment"
          />
          <Button
            type="submit"
            size="icon"
            disabled={createComment.isPending || !text.trim()}
            className="rounded-full bg-primary hover:bg-primary/80 shrink-0 disabled:opacity-50"
            data-testid="button-send-comment"
          >
            <Send className="w-4 h-4 text-black" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
