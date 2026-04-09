import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Download, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { whapi } from "@/lib/whapi";

interface Campaign {
  id: string;
  name: string;
  status: string;
  totalContacts: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  template?: { name: string };
  createdAt: string;
}

interface CampaignsResponse {
  data: Campaign[];
  total: number;
}

const statusColor: Record<string, string> = {
  RUNNING: "bg-primary/10 text-primary border-primary/20",
  COMPLETED: "bg-info/10 text-info border-info/20",
  DRAFT: "bg-muted text-muted-foreground border-border",
  SCHEDULED: "bg-warning/10 text-warning border-warning/20",
  PAUSED: "bg-warning/10 text-warning border-warning/20",
  CANCELLED: "bg-muted text-muted-foreground border-border",
  FAILED: "bg-destructive/10 text-destructive border-destructive/20",
};

const deliveryPct = (c: Campaign) => {
  if (!c.sent || c.sent === 0) return 0;
  return Math.round((c.delivered / c.sent) * 100);
};

const WHCampaigns = () => {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<Campaign[] | CampaignsResponse>({
    queryKey: ["campaigns"],
    queryFn: () => whapi.get<Campaign[] | CampaignsResponse>("/campaigns"),
  });

  const campaigns: Campaign[] = Array.isArray(data) ? data : (data as CampaignsResponse)?.data ?? [];

  const filtered = campaigns.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Campaigns</h1>
          <p className="text-sm text-muted-foreground">Create and manage your WhatsApp campaigns</p>
        </div>
        <Link to="/dashboard/campaigns/create">
          <Button className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
            <Plus className="mr-2 w-4 h-4" /> Create Campaign
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-muted/50 border-border/50" />
        </div>
        <Button variant="outline" size="sm" className="border-border/50 text-muted-foreground">
          <Download className="w-4 h-4 mr-1" /> Export
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading campaigns...
        </div>
      ) : (
        <Card className="bg-card border-border/50">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Campaign</TableHead>
                <TableHead className="text-muted-foreground">Template</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground text-right">Total</TableHead>
                <TableHead className="text-muted-foreground text-right">Sent</TableHead>
                <TableHead className="text-muted-foreground text-right">Delivered</TableHead>
                <TableHead className="text-muted-foreground text-right">Read</TableHead>
                <TableHead className="text-muted-foreground text-right">Failed</TableHead>
                <TableHead className="text-muted-foreground">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {campaigns.length === 0 ? "No campaigns yet. Create your first one!" : "No campaigns match your search."}
                  </TableCell>
                </TableRow>
              ) : filtered.map((c) => {
                const pct = deliveryPct(c);
                return (
                  <TableRow key={c.id} className="border-border/50 hover:bg-muted/30">
                    <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{c.template?.name ?? "—"}</TableCell>
                    <TableCell><Badge className={statusColor[c.status] ?? "bg-muted text-muted-foreground"}>{c.status}</Badge></TableCell>
                    <TableCell className="text-right text-muted-foreground">{(c.totalContacts ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{(c.sent ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <span className={pct > 97 ? "text-primary" : pct > 93 ? "text-warning" : pct > 0 ? "text-destructive" : "text-muted-foreground"}>
                        {c.sent > 0 ? `${pct}%` : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{c.sent > 0 ? `${Math.round((c.read / c.sent) * 100)}%` : "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{(c.failed ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
};

export default WHCampaigns;
