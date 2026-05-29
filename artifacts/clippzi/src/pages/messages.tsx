import { useListConversations, getListConversationsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { MessageCircle, ChevronRight } from "lucide-react";

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function Messages() {
  const { isAuthenticated, login, isLoading: authLoading } = useCurrentUser();

  const { data: conversations, isLoading } = useListConversations({
    query: {
      enabled: isAuthenticated,
      queryKey: getListConversationsQueryKey(),
      refetchInterval: 5000,
    },
  });

  if (!authLoading && !isAuthenticated) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <MessageCircle className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-white">Your messages</h2>
        <p className="text-sm text-muted-foreground max-w-xs">Log in to send and receive private messages.</p>
        <Button onClick={login} className="bg-primary text-black font-semibold">Log in</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="px-4 py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-primary" /> Messages
        </h1>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
      ) : !conversations || conversations.length === 0 ? (
        <div className="text-center py-16 px-8">
          <p className="text-muted-foreground">No messages yet.</p>
          <p className="text-sm text-muted-foreground mt-1">Visit someone's profile and tap <span className="text-primary font-semibold">Message</span> to start a chat.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {conversations.map((c: any) => {
            const u = c.otherUser;
            const initials = (u?.displayName || u?.username || "?").slice(0, 2).toUpperCase();
            return (
              <Link key={c.id} href={`/messages/${u.id}`}>
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors" data-testid={`conversation-${u.id}`}>
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex items-center justify-center text-sm font-bold text-foreground shrink-0">
                    {u?.avatarUrl ? <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" /> : initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white truncate">{u?.displayName || u?.username}</span>
                      <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(c.lastMessageAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${c.unreadCount > 0 ? "text-white font-medium" : "text-muted-foreground"}`}>
                        {c.lastMessageText || "Say hi 👋"}
                      </p>
                      {c.unreadCount > 0 && (
                        <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-primary text-black text-xs font-bold flex items-center justify-center">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
