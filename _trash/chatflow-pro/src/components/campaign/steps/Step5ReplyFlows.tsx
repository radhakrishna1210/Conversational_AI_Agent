import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, X, ArrowUp, ArrowDown } from "lucide-react";

export interface FlowNode {
  id: string;
  trigger: "contains" | "exact" | "any";
  keyword: string;
  action: "reply" | "assign" | "optout";
  replyText: string;
  enabled: boolean;
  priority: number;
}

const defaultNodes: FlowNode[] = [
  { id: "1", trigger: "exact", keyword: "STOP", action: "optout", replyText: "You've been opted out. Reply START to re-subscribe.", enabled: true, priority: 1 },
  { id: "2", trigger: "exact", keyword: "YES", action: "reply", replyText: "Great! We'll keep you updated.", enabled: true, priority: 2 },
  { id: "3", trigger: "exact", keyword: "HELP", action: "reply", replyText: "Need help? Contact us at support@business.com", enabled: true, priority: 3 },
  { id: "4", trigger: "any", keyword: "", action: "reply", replyText: "Thanks for your message! We'll get back to you soon.", enabled: true, priority: 99 },
];

const priorityColors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500", "bg-blue-500", "bg-purple-500", "bg-muted"];

interface Step5Props {
  flowNodes: FlowNode[];
  onChange: (nodes: FlowNode[]) => void;
}

const Step5ReplyFlows = ({ flowNodes, onChange }: Step5Props) => {
  const [nodes, setNodes] = useState<FlowNode[]>(flowNodes.length ? flowNodes : defaultNodes);

  const update = (updated: FlowNode[]) => {
    setNodes(updated);
    onChange(updated);
  };

  const addRule = () => {
    const fallbackIdx = nodes.findIndex((n) => n.trigger === "any");
    const newNode: FlowNode = {
      id: Date.now().toString(),
      trigger: "contains",
      keyword: "",
      action: "reply",
      replyText: "",
      enabled: true,
      priority: fallbackIdx >= 0 ? fallbackIdx + 1 : nodes.length + 1,
    };
    const updated = [...nodes];
    if (fallbackIdx >= 0) updated.splice(fallbackIdx, 0, newNode);
    else updated.push(newNode);
    update(updated);
  };

  const removeNode = (id: string) => update(nodes.filter((n) => n.id !== id));

  const moveNode = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= nodes.length) return;
    if (nodes[target].trigger === "any" || nodes[idx].trigger === "any") return;
    const updated = [...nodes];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    update(updated);
  };

  const updateNode = (id: string, patch: Partial<FlowNode>) => {
    update(nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  return (
    <div className="grid lg:grid-cols-[1fr,210px] gap-4">
      <div className="space-y-3">
        {/* Vertical list with priority line */}
        <div className="relative">
          <div className="absolute left-[18px] top-4 bottom-4 w-0.5 bg-border/50" />
          {nodes.map((node, idx) => (
            <div key={node.id} className="relative pl-10 pb-3">
              <div className={`absolute left-2.5 top-4 w-4 h-4 rounded-full ${priorityColors[Math.min(idx, priorityColors.length - 1)]} border-2 border-card z-10`} />
              <div className="p-3 rounded-lg border border-border/50 bg-card/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {node.trigger === "any" ? "FALLBACK" : `P${idx + 1}`}
                  </span>
                  <div className="flex items-center gap-1">
                    <Switch checked={node.enabled} onCheckedChange={(v) => updateNode(node.id, { enabled: v })} />
                    {node.trigger !== "any" && (
                      <>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveNode(idx, -1)}><ArrowUp className="w-3 h-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveNode(idx, 1)}><ArrowDown className="w-3 h-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeNode(node.id)}><X className="w-3 h-3" /></Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Select value={node.trigger} onValueChange={(v) => updateNode(node.id, { trigger: v as FlowNode["trigger"] })}>
                    <SelectTrigger className="h-8 text-xs bg-muted/50 border-border/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="exact">Exact</SelectItem>
                      <SelectItem value="any">Any</SelectItem>
                    </SelectContent>
                  </Select>
                  {node.trigger !== "any" && (
                    <Input
                      value={node.keyword}
                      onChange={(e) => updateNode(node.id, { keyword: e.target.value })}
                      placeholder="Keyword"
                      className="h-8 text-xs bg-muted/50 border-border/50"
                    />
                  )}
                  <Select value={node.action} onValueChange={(v) => updateNode(node.id, { action: v as FlowNode["action"] })}>
                    <SelectTrigger className="h-8 text-xs bg-muted/50 border-border/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reply">Reply</SelectItem>
                      <SelectItem value="assign">Assign to agent</SelectItem>
                      <SelectItem value="optout">Opt-out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {node.action === "reply" && (
                  <Textarea
                    value={node.replyText}
                    onChange={(e) => updateNode(node.id, { replyText: e.target.value })}
                    placeholder="Reply message..."
                    className="text-xs bg-muted/50 border-border/50 min-h-[60px]"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="border-border/50 text-muted-foreground" onClick={addRule}>
          <Plus className="w-3 h-3 mr-1" /> Add Rule
        </Button>
        <Button size="sm" className="bg-gradient-primary text-primary-foreground hover:opacity-90 ml-2">
          Save Flow
        </Button>
      </div>

      {/* Mini preview */}
      <div className="hidden lg:block">
        <div className="w-[210px] rounded-2xl border-2 border-border bg-[hsl(30,15%,85%)] overflow-hidden">
          <div className="bg-[hsl(160,74%,18%)] px-2 py-1.5">
            <p className="text-[9px] text-white">Preview</p>
          </div>
          <div className="p-2 min-h-[200px] space-y-2">
            <div className="bg-[hsl(120,20%,90%)] rounded-lg rounded-tl-none p-2">
              <p className="text-[9px] text-[hsl(222,47%,10%)]">User: "STOP"</p>
            </div>
            <div className="bg-white rounded-lg rounded-tr-none p-2 ml-auto max-w-[80%]">
              <p className="text-[9px] text-[hsl(222,47%,10%)]">{nodes.find(n => n.keyword === "STOP")?.replyText || "..."}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export { defaultNodes };
export default Step5ReplyFlows;
