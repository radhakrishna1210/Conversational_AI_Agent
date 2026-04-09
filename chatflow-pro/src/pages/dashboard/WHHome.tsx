import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Users, FileText, Send, Instagram, ArrowUpRight, Sparkles, Loader2, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { whapi } from "@/lib/whapi";

interface Overview {
  totalMessages: number;
  totalCampaigns: number;
  totalContacts: number;
  optOuts: number;
  deliveryRate: string;
  optOutRate: string;
}

interface WaNumber {
  id: string;
  phoneNumber: string;
  displayName: string;
  quality: string;
  status: string;
}

const WHHome = () => {
  const { data: overview, isLoading: loadingOverview } = useQuery<Overview>({
    queryKey: ["analytics", "overview"],
    queryFn: () => whapi.get<Overview>("/analytics/overview"),
  });

  const { data: numbers, isLoading: loadingNumbers } = useQuery<WaNumber[]>({
    queryKey: ["whatsapp", "numbers"],
    queryFn: () => whapi.get<WaNumber[]>("/whatsapp/numbers"),
  });

  const number = numbers?.[0];
  const isConnected = number?.status === "Approved" || number?.status === "approved";

  const stats = [
    { label: "Total Conversations", value: overview?.totalMessages?.toLocaleString() ?? "—", icon: Send },
    { label: "Messages Sent", value: overview?.totalMessages?.toLocaleString() ?? "—", icon: Send },
    { label: "Active Contacts", value: overview?.totalContacts?.toLocaleString() ?? "—", icon: Users },
    { label: "Campaigns", value: overview?.totalCampaigns?.toLocaleString() ?? "—", icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome back! Here's your WhatsApp overview.</p>
      </div>

      {/* Upgrade Banner */}
      <div className="rounded-xl bg-gradient-primary p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-primary-foreground" />
          <div>
            <p className="font-display font-semibold text-primary-foreground">Unlock AI Smart Replies & A/B Testing</p>
            <p className="text-sm text-primary-foreground/80">Upgrade to Growth plan for advanced features.</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" className="bg-primary-foreground text-primary hover:bg-primary-foreground/90">
          Upgrade Plan
        </Button>
      </div>

      {/* Status Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">WhatsApp Number</CardTitle>
            {loadingNumbers ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : number ? (
              <Badge className={isConnected ? "bg-primary/10 text-primary border-primary/20" : "bg-warning/10 text-warning border-warning/20"}>
                {isConnected ? "Connected" : number.status}
              </Badge>
            ) : null}
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              {isConnected ? (
                <CheckCircle2 className="w-8 h-8 text-primary" />
              ) : (
                <AlertCircle className="w-8 h-8 text-muted-foreground" />
              )}
              <div>
                <p className="font-display text-lg font-bold text-foreground">
                  {loadingNumbers ? "Loading..." : number?.phoneNumber ?? "No number connected"}
                </p>
                {number && (
                  <p className="text-xs text-muted-foreground">Quality: {number.quality} · {number.displayName}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Instagram</CardTitle>
            <Badge variant="outline" className="text-muted-foreground border-border">Coming Soon</Badge>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Instagram className="w-8 h-8 text-muted-foreground" />
              <div>
                <p className="font-display text-lg font-bold text-foreground">Connect Account</p>
                <p className="text-xs text-muted-foreground">Link your Instagram business account</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="whatsapp" className="w-full">
        <TabsList className="bg-muted/50 border border-border/50">
          <TabsTrigger value="whatsapp" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">WhatsApp</TabsTrigger>
          <TabsTrigger value="instagram" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Instagram</TabsTrigger>
        </TabsList>
        <TabsContent value="whatsapp" className="mt-4">
          <div className="grid md:grid-cols-4 gap-4">
            {stats.map((s) => (
              <Card key={s.label} className="bg-card border-border/50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <s.icon className="w-4 h-4 text-muted-foreground" />
                    {loadingOverview && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                    {!loadingOverview && <ArrowUpRight className="w-3 h-3 text-primary" />}
                  </div>
                  <p className="font-display text-2xl font-bold text-foreground">
                    {loadingOverview ? "—" : s.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex gap-3 mt-6">
            <Link to="/dashboard/contacts">
              <Button className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
                <Users className="mr-2 w-4 h-4" /> Add Customers
              </Button>
            </Link>
            <Link to="/dashboard/templates/create">
              <Button variant="outline" className="border-border/50 text-foreground hover:bg-secondary">
                <FileText className="mr-2 w-4 h-4" /> Create Template
              </Button>
            </Link>
          </div>
        </TabsContent>
        <TabsContent value="instagram" className="mt-4">
          <Card className="bg-card border-border/50">
            <CardContent className="py-12 text-center">
              <Instagram className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Instagram integration coming soon. Stay tuned!</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WHHome;
