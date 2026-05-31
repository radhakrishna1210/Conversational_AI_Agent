import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Send, Bot, User, Clock, MessageSquare, StickyNote, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { whapi } from "@/lib/whapi";

interface ConvContact {
  id: string;
  name: string;
  phoneNumber: string;
}

interface ConvLastMessage {
  body: string;
  sentAt: string;
  direction: string;
}

interface Conversation {
  id: string;
  status: string;
  unreadCount: number;
  label?: string;
  lastMessageAt: string;
  contact: ConvContact;
  messages: ConvLastMessage[];
}

interface ConversationsResponse {
  data: Conversation[];
  total: number;
}

interface Message {
  id: string;
  body: string;
  direction: string;
  sentAt: string;
  senderUser?: { id: string; name: string } | null;
}

const labelColor: Record<string, string> = {
  urgent: "bg-destructive/10 text-destructive border-destructive/20",
  resolved: "bg-primary/10 text-primary border-primary/20",
  billing: "bg-warning/10 text-warning border-warning/20",
};

const WHInbox = () => {
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [isBot, setIsBot] = useState(false);
  const [msgInput, setMsgInput] = useState("");
  const [chatTab, setChatTab] = useState("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: convsData, isLoading: loadingConvs } = useQuery<ConversationsResponse>({
    queryKey: ["conversations"],
    queryFn: () => whapi.get<ConversationsResponse>("/conversations"),
  });

  const conversations = convsData?.data ?? [];

  // Auto-select first conversation
  useEffect(() => {
    if (!activeConvId && conversations.length > 0) {
      setActiveConvId(conversations[0].id);
    }
  }, [conversations, activeConvId]);

  const { data: messages = [], isLoading: loadingMessages } = useQuery<Message[]>({
    queryKey: ["messages", activeConvId],
    queryFn: () => whapi.get<Message[]>(`/conversations/${activeConvId}/messages`),
    enabled: !!activeConvId,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      whapi.post(`/conversations/${activeConvId}/messages`, { type: "TEXT", body }),
    onSuccess: () => {
      setMsgInput("");
      queryClient.invalidateQueries({ queryKey: ["messages", activeConvId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const activeConv = conversations.find((c) => c.id === activeConvId);

  const handleSend = () => {
    if (!msgInput.trim() || !activeConvId) return;
    sendMutation.mutate(msgInput.trim());
  };

  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Inbox</h1>
        <p className="text-sm text-muted-foreground">Manage customer conversations</p>
      </div>

      <div className="grid grid-cols-[320px,1fr] gap-4 h-[calc(100vh-180px)]">
        {/* Conversations List */}
        <Card className="bg-card border-border/50 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-border/50">
            <Input placeholder="Search conversations..." className="bg-muted/50 border-border/50" />
          </div>
          <div className="flex-1 overflow-auto">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">No conversations yet.</p>
            ) : conversations.map((c) => (
              <div
                key={c.id}
                className={`p-3 border-b border-border/30 cursor-pointer transition-colors ${activeConvId === c.id ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/30"}`}
                onClick={() => setActiveConvId(c.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground flex-shrink-0">
                    {initials(c.contact?.name ?? "?")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground truncate">{c.contact?.name ?? c.contact?.phoneNumber}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.messages?.[0]?.body ?? "No messages"}</p>
                    <div className="flex gap-1 mt-1">
                      {c.label && <Badge className={`text-[9px] px-1.5 py-0 ${labelColor[c.label] ?? ""}`}>{c.label}</Badge>}
                      {c.unreadCount > 0 && <Badge className="text-[9px] px-1.5 py-0 bg-primary text-primary-foreground">{c.unreadCount}</Badge>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Active Chat */}
        <Card className="bg-card border-border/50 overflow-hidden flex flex-col">
          {!activeConv ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p>Select a conversation</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="p-3 border-b border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground">
                    {initials(activeConv.contact?.name ?? "?")}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{activeConv.contact?.name ?? activeConv.contact?.phoneNumber}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{activeConv.contact?.phoneNumber}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Select defaultValue="unassigned">
                    <SelectTrigger className="w-32 h-8 text-xs bg-muted/50 border-border/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                    <Switch checked={isBot} onCheckedChange={setIsBot} />
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <Tabs value={chatTab} onValueChange={setChatTab} className="flex-1 flex flex-col">
                <div className="px-3 pt-2">
                  <TabsList className="bg-muted/50 border border-border/50 h-8">
                    <TabsTrigger value="chat" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-6">
                      <MessageSquare className="w-3 h-3 mr-1" /> Chat
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary h-6">
                      <StickyNote className="w-3 h-3 mr-1" /> Internal Notes
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="chat" className="flex-1 flex flex-col mt-0">
                  <div className="flex-1 overflow-auto p-4 space-y-3">
                    {loadingMessages ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading messages...
                      </div>
                    ) : messages.map((m) => {
                      const isInbound = m.direction === "INBOUND";
                      return (
                        <div key={m.id} className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
                          <div className={`max-w-[70%] rounded-xl p-3 ${isInbound ? "bg-muted/50" : "bg-primary/10"}`}>
                            <div className="flex items-center gap-1 mb-1">
                              {!isInbound && m.senderUser && (
                                <>
                                  <User className="w-3 h-3 text-primary" />
                                  <span className="text-[10px] text-muted-foreground">{m.senderUser.name}</span>
                                </>
                              )}
                              {isInbound && (
                                <span className="text-[10px] text-muted-foreground capitalize">customer</span>
                              )}
                            </div>
                            <p className="text-sm text-foreground">{m.body}</p>
                            <p className="text-[10px] text-muted-foreground text-right mt-1">
                              {new Date(m.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="p-3 border-t border-border/50 flex gap-2">
                    <Button variant="outline" size="sm" className="border-border/50 text-muted-foreground text-xs flex-shrink-0">Quick Reply</Button>
                    <Input
                      value={msgInput}
                      onChange={(e) => setMsgInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                      placeholder="Type a message..."
                      className="bg-muted/50 border-border/50"
                    />
                    <Button
                      size="icon"
                      className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90 flex-shrink-0"
                      onClick={handleSend}
                      disabled={sendMutation.isPending || !msgInput.trim()}
                    >
                      {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="notes" className="flex-1 p-4">
                  <div className="text-center text-muted-foreground text-sm mt-10">
                    <StickyNote className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p>No internal notes yet. Add a note for your team.</p>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default WHInbox;
