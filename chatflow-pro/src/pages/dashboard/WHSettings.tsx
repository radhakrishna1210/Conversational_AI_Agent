import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Webhook, Shield, Users, CreditCard, Bell, Download, Trash2, Plus, Eye, Loader2 } from "lucide-react";
import { whapi } from "@/lib/whapi";

interface WorkspaceSettings {
  webhookUrl?: string;
  webhookVerifyToken?: string;
  notifyNewConversation?: boolean;
  notifyTemplateApproved?: boolean;
  notifyTemplateRejected?: boolean;
  notifyCampaignCompleted?: boolean;
  notifyHighOptout?: boolean;
  notifyRateLimit?: boolean;
}

interface Invoice {
  id: string;
  invoiceDate: string;
  amount: number;
  currency: string;
  status: string;
}

interface Member {
  userId: string;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

const WHSettings = () => {
  const { data: settings, isLoading: loadingSettings } = useQuery<WorkspaceSettings>({
    queryKey: ["settings"],
    queryFn: () => whapi.get<WorkspaceSettings>("/settings"),
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery<Invoice[]>({
    queryKey: ["settings", "invoices"],
    queryFn: () => whapi.get<Invoice[]>("/settings/invoices"),
  });

  const { data: members = [], isLoading: loadingMembers } = useQuery<Member[]>({
    queryKey: ["members"],
    queryFn: () => whapi.get<Member[]>("/members"),
  });

  const notifications = [
    { id: "notifyNewConversation", label: "New Conversation", enabled: settings?.notifyNewConversation ?? true },
    { id: "notifyTemplateApproved", label: "Template Approved", enabled: settings?.notifyTemplateApproved ?? true },
    { id: "notifyTemplateRejected", label: "Template Rejected", enabled: settings?.notifyTemplateRejected ?? true },
    { id: "notifyCampaignCompleted", label: "Campaign Completed", enabled: settings?.notifyCampaignCompleted ?? false },
    { id: "notifyHighOptout", label: "High Opt-out Alert", enabled: settings?.notifyHighOptout ?? true },
    { id: "notifyRateLimit", label: "Rate Limit Warning", enabled: settings?.notifyRateLimit ?? true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your WhaBridge platform</p>
      </div>

      {/* Webhook */}
      <Card className="bg-card border-border/50">
        <CardHeader><CardTitle className="font-display text-base flex items-center gap-2"><Webhook className="w-4 h-4 text-primary" /> Webhook</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {loadingSettings ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
          ) : (
            <>
              <div>
                <Label className="text-muted-foreground text-xs">Webhook URL</Label>
                <Input defaultValue={settings?.webhookUrl ?? ""} placeholder="https://your-server.com/webhook" className="bg-muted/50 border-border/50" />
              </div>
              {settings?.webhookVerifyToken && (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/30">
                  <Label className="text-muted-foreground text-xs">Verify Token:</Label>
                  <code className="text-xs text-foreground font-mono flex-1">{settings.webhookVerifyToken}</code>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground"><Eye className="w-3 h-3" /></Button>
                </div>
              )}
            </>
          )}
          <div className="flex gap-2">
            <Button size="sm" className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">Save</Button>
            <Button size="sm" variant="outline" className="border-border/50 text-muted-foreground">Test</Button>
          </div>
        </CardContent>
      </Card>

      {/* Rate Limit */}
      <Card className="bg-card border-border/50">
        <CardHeader><CardTitle className="font-display text-base flex items-center gap-2"><Shield className="w-4 h-4 text-primary" /> Rate Limit Monitor</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Daily Usage</span>
              <span className="text-foreground">— / 10,000</span>
            </div>
            <Progress value={0} className="h-3 bg-muted" />
            <p className="text-xs text-muted-foreground">Connect your WhatsApp number to track usage</p>
          </div>
        </CardContent>
      </Card>

      {/* Team Members */}
      <Card className="bg-card border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display text-base flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Team Members</CardTitle>
          <Button size="sm" className="bg-primary/10 text-primary hover:bg-primary/20"><Plus className="w-3 h-3 mr-1" /> Invite</Button>
        </CardHeader>
        <CardContent>
          {loadingMembers ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading members...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground text-xs">Name</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Email</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Role</TableHead>
                  <TableHead className="text-muted-foreground text-xs w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No members yet.</TableCell></TableRow>
                ) : members.map((m) => (
                  <TableRow key={m.userId} className="border-border/50">
                    <TableCell className="text-foreground text-sm">{m.user.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{m.user.email}</TableCell>
                    <TableCell>
                      <Select defaultValue={m.role.toLowerCase()}>
                        <SelectTrigger className="w-28 h-8 text-xs bg-muted/50 border-border/50"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="agent">Agent</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Billing */}
      <Card className="bg-card border-border/50">
        <CardHeader><CardTitle className="font-display text-base flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" /> Billing</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-muted/30">
            <div>
              <p className="text-sm font-medium text-foreground">Growth Plan</p>
              <p className="text-xs text-muted-foreground">Manage your subscription</p>
            </div>
            <Button size="sm" className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">Upgrade</Button>
          </div>
          {loadingInvoices ? (
            <div className="flex items-center gap-2 text-muted-foreground py-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground text-xs">Invoice</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Date</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Amount</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Status</TableHead>
                  <TableHead className="text-muted-foreground text-xs w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id} className="border-border/50">
                    <TableCell className="text-foreground text-sm font-mono">{inv.id.slice(0, 8).toUpperCase()}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-foreground text-sm">{inv.currency} {inv.amount}</TableCell>
                    <TableCell><Badge className="bg-primary/10 text-primary border-primary/20">{inv.status}</Badge></TableCell>
                    <TableCell><Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground"><Download className="w-3 h-3" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="bg-card border-border/50">
        <CardHeader><CardTitle className="font-display text-base flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loadingSettings ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
          ) : notifications.map((n) => (
            <div key={n.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
              <span className="text-sm text-foreground">{n.label}</span>
              <Switch defaultChecked={n.enabled} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default WHSettings;
