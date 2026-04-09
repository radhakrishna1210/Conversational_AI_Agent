import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Key, Copy, RotateCcw, Trash2, Send, Webhook, Eye, EyeOff, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { whapi } from "@/lib/whapi";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  environment: string;
  lastUsedAt?: string;
  createdAt: string;
  rawKey?: string;
}

const webhookEvents = [
  { id: "messages", label: "Messages", checked: true },
  { id: "reactions", label: "Reactions", checked: true },
  { id: "deliveries", label: "Deliveries", checked: true },
  { id: "reads", label: "Reads", checked: false },
  { id: "referrals", label: "Referrals", checked: false },
];

const WHApiManagement = () => {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [newKeyName, setNewKeyName] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testTemplate, setTestTemplate] = useState("");
  const [testBody, setTestBody] = useState("");
  const queryClient = useQueryClient();

  const { data: apiKeys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: () => whapi.get<ApiKey[]>("/api-keys"),
  });

  const createMutation = useMutation({
    mutationFn: () => whapi.post<ApiKey>("/api-keys", { name: newKeyName || "My API Key", environment: "live" }),
    onSuccess: (key) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setNewKeyName("");
      toast.success(`New API key created. Copy it now — it won't be shown again.`);
      // Show raw key temporarily
      if (key.rawKey) {
        setShowKeys((p) => ({ ...p, [key.id]: true }));
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rotateMutation = useMutation({
    mutationFn: (keyId: string) => whapi.post<ApiKey>(`/api-keys/${keyId}/rotate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key rotated. Copy the new key now.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => whapi.del(`/api-keys/${keyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key revoked");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">API Management</h1>
        <p className="text-sm text-muted-foreground">Manage API keys, webhooks, and test endpoints</p>
      </div>

      {/* API Keys */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="font-display text-base flex items-center gap-2"><Key className="w-4 h-4 text-primary" /> API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading keys...
            </div>
          ) : apiKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          ) : apiKeys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 p-4 rounded-lg border border-border/50 bg-muted/30">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium mb-1">{k.name} · <span className="text-primary">{k.environment}</span></p>
                <code className="text-sm text-foreground font-mono">
                  {showKeys[k.id] && k.rawKey ? k.rawKey : `${k.keyPrefix}••••••••••••••••`}
                </code>
              </div>
              <Button
                variant="ghost" size="icon" className="text-muted-foreground flex-shrink-0"
                onClick={() => setShowKeys((p) => ({ ...p, [k.id]: !p[k.id] }))}
              >
                {showKeys[k.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
              {k.rawKey && (
                <Button variant="ghost" size="icon" className="text-muted-foreground flex-shrink-0" onClick={() => copyToClipboard(k.rawKey!)}>
                  <Copy className="w-4 h-4" />
                </Button>
              )}
              <Button
                size="icon" variant="ghost" className="text-muted-foreground flex-shrink-0"
                onClick={() => rotateMutation.mutate(k.id)}
                disabled={rotateMutation.isPending}
              >
                {rotateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              </Button>
              <Button
                size="icon" variant="ghost" className="text-destructive/70 hover:text-destructive flex-shrink-0"
                onClick={() => revokeMutation.mutate(k.id)}
                disabled={revokeMutation.isPending}
              >
                {revokeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </Button>
            </div>
          ))}

          <div className="flex gap-2 items-center pt-2">
            <Input
              placeholder="Key name (optional)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="max-w-xs bg-muted/50 border-border/50"
            />
            <Button
              size="sm"
              className="bg-primary/10 text-primary hover:bg-primary/20"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
              Generate New
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Config */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="font-display text-base flex items-center gap-2"><Webhook className="w-4 h-4 text-primary" /> Webhook Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-muted-foreground text-xs">Webhook URL</Label>
            <Input placeholder="https://your-server.com/webhook" className="bg-muted/50 border-border/50" />
          </div>
          <div>
            <Label className="text-muted-foreground text-xs mb-2 block">Subscribe to Events</Label>
            <div className="flex flex-wrap gap-4">
              {webhookEvents.map((e) => (
                <div key={e.id} className="flex items-center gap-2">
                  <Checkbox defaultChecked={e.checked} />
                  <span className="text-sm text-muted-foreground">{e.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">Save</Button>
            <Button size="sm" variant="outline" className="border-border/50 text-muted-foreground">Test Webhook</Button>
          </div>
        </CardContent>
      </Card>

      {/* API Playground */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="font-display text-base flex items-center gap-2"><Send className="w-4 h-4 text-primary" /> API Playground</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground text-xs">Phone Number</Label>
              <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+91 98765 43210" className="bg-muted/50 border-border/50" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Template ID</Label>
              <Input value={testTemplate} onChange={(e) => setTestTemplate(e.target.value)} placeholder="welcome_message" className="bg-muted/50 border-border/50" />
            </div>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Message Body</Label>
            <Textarea value={testBody} onChange={(e) => setTestBody(e.target.value)} placeholder="Enter test message..." className="bg-muted/50 border-border/50" />
          </div>
          <Button className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
            <Send className="w-4 h-4 mr-2" /> Send Test Message
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default WHApiManagement;
