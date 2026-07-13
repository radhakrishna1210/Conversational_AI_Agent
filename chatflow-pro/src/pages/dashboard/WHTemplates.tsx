import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Copy, Pencil, Trash2, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { whapi } from "@/lib/whapi";

interface Template {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
}

const statusColor: Record<string, string> = {
  APPROVED: "bg-primary/10 text-primary border-primary/20",
  PENDING: "bg-warning/10 text-warning border-warning/20",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/20",
};

const WHTemplates = () => {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");

  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["templates"],
    queryFn: () => whapi.get<Template[]>("/templates"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => whapi.del(`/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => whapi.post(`/templates/${id}/duplicate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template duplicated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filtered = templates.filter((t) => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (category !== "all" && t.category !== category) return false;
    if (status !== "all" && t.status !== status) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Templates</h1>
          <p className="text-sm text-muted-foreground">Manage your WhatsApp message templates</p>
        </div>
        <Link to="/dashboard/templates/create">
          <Button className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
            <Plus className="mr-2 w-4 h-4" /> Create Template
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search templates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-muted/50 border-border/50" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40 bg-muted/50 border-border/50"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="MARKETING">Marketing</SelectItem>
            <SelectItem value="UTILITY">Utility</SelectItem>
            <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36 bg-muted/50 border-border/50"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading templates...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {templates.length === 0 ? "No templates yet. Create your first one!" : "No templates match your filters."}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((t) => (
            <Card key={t.id} className="bg-card border-border/50 hover:border-primary/30 transition-colors group">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <Badge className={statusColor[t.status] ?? "bg-muted text-muted-foreground"}>{t.status}</Badge>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></Button>
                    <Button
                      variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground"
                      onClick={() => duplicateMutation.mutate(t.id)}
                      disabled={duplicateMutation.isPending}
                    >
                      {duplicateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMutation.mutate(t.id)}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
                <h3 className="font-display font-semibold text-foreground mb-1 truncate">{t.name}</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{t.category}</span>
                  <span>·</span>
                  <span>{t.language}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default WHTemplates;
