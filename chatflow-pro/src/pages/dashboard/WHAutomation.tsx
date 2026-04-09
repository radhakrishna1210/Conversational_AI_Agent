import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Zap, Plus, Pencil, Trash2, Workflow, Link as LinkIcon, CheckCircle2, XCircle, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { whapi } from "@/lib/whapi";

interface Trigger {
  id: string;
  keyword: string;
  responseTemplate: string;
  isActive: boolean;
}

const integrations = [
  { name: "Shopify", connected: true },
  { name: "WooCommerce", connected: false },
  { name: "Zapier", connected: true },
  { name: "Google Sheets", connected: true },
  { name: "HubSpot", connected: false },
  { name: "Razorpay", connected: false },
];

const WHAutomation = () => {
  const [editing, setEditing] = useState<Trigger | null>(null);
  const [creating, setCreating] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [newResponse, setNewResponse] = useState("");
  const queryClient = useQueryClient();

  const { data: triggers = [], isLoading } = useQuery<Trigger[]>({
    queryKey: ["automation", "triggers"],
    queryFn: () => whapi.get<Trigger[]>("/automation/triggers"),
  });

  const createMutation = useMutation({
    mutationFn: () => whapi.post<Trigger>("/automation/triggers", { keyword: newKeyword, responseTemplate: newResponse, isActive: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation", "triggers"] });
      setCreating(false);
      setNewKeyword("");
      setNewResponse("");
      toast.success("Trigger created");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Trigger> }) =>
      whapi.patch<Trigger>(`/automation/triggers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation", "triggers"] });
      setEditing(null);
      toast.success("Trigger updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => whapi.del(`/automation/triggers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation", "triggers"] });
      toast.success("Trigger deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActive = (t: Trigger) =>
    updateMutation.mutate({ id: t.id, data: { isActive: !t.isActive } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Automation</h1>
        <p className="text-sm text-muted-foreground">Build automated workflows and triggers</p>
      </div>

      {/* Visual Flow Builder Preview */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="font-display text-base flex items-center gap-2">
            <Workflow className="w-4 h-4 text-primary" /> Visual Flow Builder
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-border/50 rounded-xl p-12 text-center">
            <Workflow className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">Design complex automation flows visually</p>
            <p className="text-xs text-muted-foreground mb-4">Drag and drop triggers, conditions, and actions</p>
            <Button className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" /> Create New Flow
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Keyword Triggers */}
      <Card className="bg-card border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> Keyword Triggers
          </CardTitle>
          <Button size="sm" className="bg-primary/10 text-primary hover:bg-primary/20" onClick={() => setCreating(true)}>
            <Plus className="w-3 h-3 mr-1" /> Add Trigger
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading triggers...
            </div>
          ) : triggers.length === 0 && !creating ? (
            <p className="text-sm text-muted-foreground text-center py-4">No keyword triggers yet.</p>
          ) : null}

          {/* Create form */}
          {creating && (
            <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
              <div className="flex gap-3">
                <Input
                  placeholder="Keyword (e.g. STOP)"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value.toUpperCase())}
                  className="w-40 bg-muted/50 border-border/50 font-mono text-sm"
                />
                <Textarea
                  placeholder="Auto-reply message..."
                  value={newResponse}
                  onChange={(e) => setNewResponse(e.target.value)}
                  className="flex-1 bg-muted/50 border-border/50 min-h-[60px]"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm" className="bg-gradient-primary text-primary-foreground hover:opacity-90"
                  onClick={() => createMutation.mutate()}
                  disabled={!newKeyword || !newResponse || createMutation.isPending}
                >
                  {createMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Save Trigger
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setCreating(false)}>
                  <X className="w-3 h-3 mr-1" /> Cancel
                </Button>
              </div>
            </div>
          )}

          {triggers.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-border transition-colors">
              {editing?.id === t.id ? (
                <div className="flex-1 flex gap-3 mr-3">
                  <Input
                    value={editing.keyword}
                    onChange={(e) => setEditing({ ...editing, keyword: e.target.value.toUpperCase() })}
                    className="w-36 bg-muted/50 border-border/50 font-mono text-sm"
                  />
                  <Textarea
                    value={editing.responseTemplate}
                    onChange={(e) => setEditing({ ...editing, responseTemplate: e.target.value })}
                    className="flex-1 bg-muted/50 border-border/50 min-h-[60px]"
                  />
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm" className="bg-gradient-primary text-primary-foreground hover:opacity-90"
                      onClick={() => updateMutation.mutate({ id: editing.id, data: { keyword: editing.keyword, responseTemplate: editing.responseTemplate } })}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setEditing(null)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <Badge variant="outline" className="font-mono text-xs border-border/50 text-muted-foreground flex-shrink-0">{t.keyword}</Badge>
                  <p className="text-sm text-muted-foreground truncate max-w-md">{t.responseTemplate}</p>
                </div>
              )}
              <div className="flex items-center gap-3 flex-shrink-0">
                <Switch
                  checked={t.isActive}
                  onCheckedChange={() => toggleActive(t)}
                  disabled={updateMutation.isPending}
                />
                <Button
                  variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground w-7 h-7"
                  onClick={() => setEditing(t)}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive w-7 h-7"
                  onClick={() => deleteMutation.mutate(t.id)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="font-display text-base flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-primary" /> Integrations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-3">
            {integrations.map((int) => (
              <div key={int.name} className="flex items-center justify-between p-4 rounded-lg border border-border/50">
                <div className="flex items-center gap-3">
                  {int.connected ? (
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  ) : (
                    <XCircle className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-sm text-foreground">{int.name}</span>
                </div>
                <Badge className={int.connected ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground border-border"}>
                  {int.connected ? "Connected" : "Connect"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WHAutomation;
