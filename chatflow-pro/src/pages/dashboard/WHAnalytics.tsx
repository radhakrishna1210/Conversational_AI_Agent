import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { BarChart3, TrendingUp, TrendingDown, Download, MessageSquare, Ban, Users, Loader2 } from "lucide-react";
import { whapi } from "@/lib/whapi";

interface Overview {
  totalMessages: number;
  totalCampaigns: number;
  totalContacts: number;
  optOuts: number;
  deliveryRate: string;
  optOutRate: string;
}

interface DeliveryDay {
  date: string;
  sent: number;
  delivered: number;
  rate: number;
}

interface CampaignPerf {
  id: string;
  name: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  totalContacts: number;
}

interface AgentPerf {
  agentId: string;
  name: string;
  chatsHandled: number;
}

const barColor = (rate: number) => rate > 97 ? "bg-primary" : rate > 93 ? "bg-warning" : "bg-destructive";

const WHAnalytics = () => {
  const { data: overview, isLoading: loadingOverview } = useQuery<Overview>({
    queryKey: ["analytics", "overview"],
    queryFn: () => whapi.get<Overview>("/analytics/overview"),
  });

  const { data: deliveryData = [], isLoading: loadingDelivery } = useQuery<DeliveryDay[]>({
    queryKey: ["analytics", "delivery"],
    queryFn: () => whapi.get<DeliveryDay[]>("/analytics/delivery"),
  });

  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery<CampaignPerf[]>({
    queryKey: ["analytics", "campaigns"],
    queryFn: () => whapi.get<CampaignPerf[]>("/analytics/campaigns"),
  });

  const { data: agents = [], isLoading: loadingAgents } = useQuery<AgentPerf[]>({
    queryKey: ["analytics", "agents"],
    queryFn: () => whapi.get<AgentPerf[]>("/analytics/agents"),
  });

  const kpis = [
    { label: "Messages Sent", value: overview?.totalMessages?.toLocaleString() ?? "—", up: true, icon: MessageSquare },
    { label: "Delivery Rate", value: overview ? `${overview.deliveryRate}%` : "—", up: true, icon: BarChart3 },
    { label: "Opt-out Rate", value: overview ? `${overview.optOutRate}%` : "—", up: false, icon: Ban },
    { label: "Total Contacts", value: overview?.totalContacts?.toLocaleString() ?? "—", up: true, icon: Users },
  ];

  const dayLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { weekday: "short" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground">Track performance and optimize your campaigns</p>
      </div>

      {/* KPI Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-card border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <k.icon className="w-4 h-4 text-muted-foreground" />
                {loadingOverview ? (
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                ) : (
                  <span className={`text-xs flex items-center gap-0.5 ${k.up ? "text-primary" : "text-destructive"}`}>
                    {k.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  </span>
                )}
              </div>
              <p className="font-display text-2xl font-bold text-foreground">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Delivery Rate Chart */}
      <Card className="bg-card border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display text-base">7-Day Message Delivery Rate</CardTitle>
          <Button variant="outline" size="sm" className="border-border/50 text-muted-foreground"><Download className="w-3 h-3 mr-1" /> CSV</Button>
        </CardHeader>
        <CardContent>
          {loadingDelivery ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading chart...
            </div>
          ) : deliveryData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground">No delivery data yet.</div>
          ) : (
            <>
              <div className="flex items-end gap-4 h-40">
                {deliveryData.map((d) => {
                  const height = d.sent > 0 ? Math.max((d.rate - 90) * 10, 2) : 2;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">{d.sent > 0 ? `${d.rate}%` : "—"}</span>
                      <div className="w-full relative rounded-t" style={{ height: `${height}%` }}>
                        <div className={`absolute inset-0 rounded-t ${barColor(d.rate)}`} />
                      </div>
                      <span className="text-xs text-muted-foreground">{dayLabel(d.date)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-4 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary" /> &gt;97% Excellent</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-warning" /> 93-97% Warning</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-destructive" /> &lt;93% Critical</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Campaign Performance */}
        <Card className="bg-card border-border/50">
          <CardHeader><CardTitle className="font-display text-base">Campaign Performance</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {loadingCampaigns ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </div>
            ) : campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No campaign data yet.</p>
            ) : campaigns.map((c) => {
              const pct = c.sent > 0 ? Math.round((c.delivered / c.sent) * 100) : 0;
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-foreground">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.sent > 0 ? `${pct}% delivered` : "—"}</span>
                  </div>
                  <Progress value={pct} className="h-2 bg-muted" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Agent Performance */}
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display text-base">Agent Performance</CardTitle>
            <Button variant="outline" size="sm" className="border-border/50 text-muted-foreground"><Download className="w-3 h-3 mr-1" /> PDF</Button>
          </CardHeader>
          <CardContent>
            {loadingAgents ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </div>
            ) : agents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No agent data yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-muted-foreground text-xs">Agent</TableHead>
                    <TableHead className="text-muted-foreground text-xs text-right">Chats Handled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((a) => (
                    <TableRow key={a.agentId} className="border-border/50">
                      <TableCell className="text-sm text-foreground">{a.name}</TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-primary/10 text-primary border-primary/20">{a.chatsHandled}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default WHAnalytics;
