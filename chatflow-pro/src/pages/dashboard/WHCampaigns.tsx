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

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

const WHCampaigns = () => {
  const [search, setSearch] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [stats, setStats] = useState<{
    campaign: Campaign & { whatsappNumber?: { phoneNumber: string } };
    breakdown: { status: string; _count: { status: number } }[];
  } | null>(null);

  const { data, isLoading, refetch } = useQuery<Campaign[] | CampaignsResponse>({
    queryKey: ["campaigns"],
    queryFn: () => whapi.get<Campaign[] | CampaignsResponse>("/campaigns"),
  });

  const campaigns: Campaign[] = Array.isArray(data) ? data : (data as CampaignsResponse)?.data ?? [];

  const filtered = campaigns.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleViewCampaign = async (id: string) => {
    setSelectedCampaignId(id);
    setViewDialogOpen(true);
    setLoadingStats(true);
    setStats(null);
    try {
      const data = await whapi.get<any>(`/campaigns/${id}/stats`);
      setStats(data);
    } catch (err) {
      toast.error("Failed to load campaign statistics.");
    } finally {
      setLoadingStats(false);
    }
  };

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
                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
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
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewCampaign(c.id)}
                        className="text-primary hover:text-primary hover:bg-primary/10 border border-primary/20"
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Campaign Stats Modal */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-xl bg-card border-border/50 text-foreground">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold flex items-center gap-2">
              <span>Campaign Metrics</span>
              {stats?.campaign?.status && (
                <Badge className={statusColor[stats.campaign.status] ?? "bg-muted text-muted-foreground"}>
                  {stats.campaign.status}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Detailed transmission and read statistics for this campaign.
            </DialogDescription>
          </DialogHeader>

          {loadingStats ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Fetching metrics from database...</p>
            </div>
          ) : stats ? (
            <div className="space-y-6">
              {/* Info panel */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-muted/20 border border-border/50 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Campaign Name</p>
                  <p className="font-semibold">{stats.campaign.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Template Name</p>
                  <p className="font-semibold">{stats.campaign.template?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Send From Number</p>
                  <p className="font-semibold">{stats.campaign.whatsappNumber?.phoneNumber ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created At</p>
                  <p className="font-semibold">{new Date(stats.campaign.createdAt).toLocaleString()}</p>
                </div>
              </div>

              {/* Stat grid */}
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center">
                  <p className="text-2xl font-bold text-foreground">{stats.campaign.totalContacts}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center">
                  <p className="text-2xl font-bold text-primary">{stats.campaign.sent}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Sent</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center">
                  <p className="text-2xl font-bold text-info">{stats.campaign.delivered}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Delivered</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center">
                  <p className="text-2xl font-bold text-destructive">{stats.campaign.failed}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Failed</p>
                </div>
              </div>

              {/* Progress bars */}
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Delivery Rate</span>
                    <span className="font-semibold text-foreground">
                      {stats.campaign.sent > 0 ? `${Math.round((stats.campaign.delivered / stats.campaign.sent) * 100)}%` : "0%"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-info"
                      style={{
                        width: stats.campaign.sent > 0 ? `${(stats.campaign.delivered / stats.campaign.sent) * 100}%` : "0%"
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Read Rate</span>
                    <span className="font-semibold text-foreground">
                      {stats.campaign.sent > 0 ? `${Math.round((stats.campaign.read / stats.campaign.sent) * 100)}%` : "0%"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: stats.campaign.sent > 0 ? `${(stats.campaign.read / stats.campaign.sent) * 100}%` : "0%"
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Failed to load metrics.
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-border/50">
            <Button onClick={() => setViewDialogOpen(false)} variant="outline" className="border-border/50 text-foreground">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WHCampaigns;
