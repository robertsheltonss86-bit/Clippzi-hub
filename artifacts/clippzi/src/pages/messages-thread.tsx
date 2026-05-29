import {
  useListMessages,
  getListMessagesQueryKey,
  useSendMessage,
  getListConversationsQueryKey,
  useGetUser,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send } from "lucide-react";

export default function MessagesThread() {
  const params = useParams<{ userId: string }>();
  const otherUserId = Number(params.userId);
  const { userId: meId, isAuthenticated, login } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  const { data: other } = useGetUser(otherUserId);
  const { data: messages, isLoading } = useListMessages(
    { otherUserId },
    {
      query: {
        enabled: isAuthenticated && Number.isFinite(otherUserId),
        queryKey: getListMessagesQueryKey({ otherUserId }),
        refetchInterval: 3000,
      },
    },
  );
  const sendMessage = useSendMessage();

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  const send = () => {
    if (!isAuthenticated || !meId) { login(); return; }
    const t = text.trim();
    if (!t) return;
    setText("");
    sendMessage.mutate(
      { data: { recipientId: otherUserId, text: t } },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey({ otherUserId }) });
          await queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        },
        onError: (e: any) => {
          setText(t);
          toast({ title: "Couldn't send", description: e?.data?.error ?? e?.message ?? String(e), variant: "destructive" });
        },
      },
    );
  };

  const initials = (other?.displayName || other?.username || "?").slice(0, 2).toUpperCase();

  return (
    <div className="h-full flex flex-col max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-3 px-3 py-3 border-b border-border bg-background/95 backdrop-blur">
        <Link href="/messages">
          <button className="p-1.5 rounded-full hover:bg-muted active:scale-95 transition" data-testid="button-back-inbox" aria-label="Back to messages">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
        </Link>
        <Link href={`/profile/${otherUserId}`}>
          <div className="flex items-center gap-2.5 cursor-pointer">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-muted flex items-center justify-center text-xs font-bold text-foreground">
              {other?.avatarUrl ? <img src={other.avatarUrl} alt="" className="w-full h-full object-cover" /> : initials}
            </div>
            <div className="leading-tight">
              <p className="font-semibold text-white text-sm">{other?.displayName || other?.username || "User"}</p>
              {other?.username && <p className="text-xs text-muted-foreground">@{other.username}</p>}
            </div>
          </div>
        </Link>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2" data-testid="messages-list">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
        ) : !messages || messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No messages yet. Send the first one!</p>
        ) : (
          messages.map((m: any) => {
            const mine = m.senderId === meId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm break-words ${
                    mine ? "bg-primary text-black rounded-br-sm" : "bg-muted text-white rounded-bl-sm"
                  }`}
                  data-testid={`message-${m.id}`}
                >
                  {m.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="p-3 border-t border-border bg-card flex gap-2 items-center"
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isAuthenticated ? "Message…" : "Log in to message"}
          maxLength={1000}
          className="bg-input border-none rounded-full flex-1"
          data-testid="input-message"
        />
        <Button
          type="submit"
          size="icon"
          disabled={sendMessage.isPending || !text.trim()}
          className="rounded-full bg-primary hover:bg-primary/80 shrink-0 disabled:opacity-50"
          data-testid="button-send-message"
        >
          <Send className="w-4 h-4 text-black" />
        </Button>
      </form>
    </div>
  );
}
