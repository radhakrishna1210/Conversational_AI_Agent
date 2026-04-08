import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, AlertTriangle } from "lucide-react";

const sampleTemplates = [
  { id: "sample_1", name: "Welcome Message", body: "Hello {{1}}! Welcome to our platform. We're excited to have you on board!", category: "Marketing" },
  { id: "sample_2", name: "Order Confirmation", body: "Hi {{1}}, your order #{{2}} has been confirmed and is being processed.", category: "Utility" },
  { id: "sample_3", name: "Flash Sale", body: "🔥 Flash Sale! Get up to {{1}}% off on everything. Shop now: {{2}}", category: "Marketing" },
  { id: "sample_4", name: "Appointment Reminder", body: "Hi {{1}}, your appointment is scheduled for {{2}} at {{3}}. Reply YES to confirm.", category: "Utility" },
  { id: "sample_5", name: "Payment Receipt", body: "Payment of ₹{{1}} received. Transaction ID: {{2}}. Thank you!", category: "Utility" },
  { id: "sample_6", name: "Feedback Request", body: "Hi {{1}}, how was your experience? Reply 1-5 to rate us.", category: "Marketing" },
  { id: "sample_7", name: "OTP Verification", body: "Your OTP is {{1}}. Valid for 10 minutes. Do not share.", category: "Authentication" },
  { id: "sample_8", name: "Shipping Update", body: "Hi {{1}}, your order has been shipped! Track: {{2}}", category: "Utility" },
  { id: "sample_9", name: "Re-engagement", body: "Hey {{1}}, we miss you! Here's 15% off on your next purchase: {{2}}", category: "Marketing" },
  { id: "sample_10", name: "Event Invite", body: "You're invited! Join us for {{1}} on {{2}}. RSVP now!", category: "Marketing" },
];

const approvedTemplates = [
  { id: "t_1", name: "welcome_message", body: "Hello {{1}}! Welcome to our store. Use code FIRST10 for 10% off.", status: "APPROVED" },
  { id: "t_2", name: "promo_diwali_sale", body: "🎉 Diwali Sale! Get up to 50% off on all products. Shop now at {{1}}", status: "APPROVED" },
  { id: "t_3", name: "cart_abandoned", body: "Hey {{1}}, you left items in your cart! Complete your purchase and get free shipping.", status: "APPROVED" },
];

const categoryColors: Record<string, string> = {
  Marketing: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Utility: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Authentication: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

interface Step2Props {
  selectedTemplateId: string | null;
  templateBody: string;
  onSelect: (id: string, body: string, isSample: boolean) => void;
  onBodyChange: (body: string) => void;
  onNext: () => void;
}

const Step2Template = ({ selectedTemplateId, templateBody, onSelect, onBodyChange, onNext }: Step2Props) => {
  const [showPicker, setShowPicker] = useState(!selectedTemplateId);

  const isSample = selectedTemplateId?.startsWith("sample_") ?? false;
  const selectedName = [...approvedTemplates, ...sampleTemplates].find(t => t.id === selectedTemplateId)?.name;

  if (!showPicker && selectedTemplateId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <p className="font-display font-semibold text-foreground text-sm">{selectedName}</p>
          <Badge variant="outline" className={isSample ? "border-warning/30 text-warning text-xs" : "border-primary/30 text-primary text-xs"}>
            {isSample ? "Sample – reference only" : "Approved"}
          </Badge>
        </div>

        {isSample && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/5 border border-warning/20">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-warning">Sample templates cannot be used for live campaigns. Create an approved template based on this idea.</p>
          </div>
        )}

        <Textarea
          value={templateBody}
          onChange={(e) => onBodyChange(e.target.value)}
          className="bg-muted/50 border-border/50 min-h-[110px]"
          placeholder="Template body with {{1}}, {{2}} placeholders..."
        />

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowPicker(true)}>
            <ArrowLeft className="w-3 h-3 mr-1" /> Choose Another Template
          </Button>
          {!isSample && (
            <Button size="sm" onClick={onNext} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
              Save & Next
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Tabs defaultValue="approved" className="space-y-3">
      <TabsList className="bg-muted/50 border border-border/50">
        <TabsTrigger value="approved" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
          Approved Templates
        </TabsTrigger>
        <TabsTrigger value="samples" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
          Sample Ideas
        </TabsTrigger>
      </TabsList>

      <TabsContent value="approved" className="space-y-2">
        {approvedTemplates.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No approved templates yet.</p>
            <Button size="sm" variant="link" className="text-primary mt-1">Create one →</Button>
          </div>
        ) : (
          approvedTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => { onSelect(t.id, t.body, false); setShowPicker(false); }}
              className="w-full p-3 rounded-lg border border-border/50 hover:border-primary/30 text-left transition-all"
            >
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{t.name}</p>
                <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">Approved</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body}</p>
            </button>
          ))
        )}
      </TabsContent>

      <TabsContent value="samples" className="space-y-2">
        {sampleTemplates.map((t) => (
          <button
            key={t.id}
            onClick={() => { onSelect(t.id, t.body, true); setShowPicker(false); }}
            className="w-full p-3 rounded-lg border border-border/50 hover:border-border text-left transition-all"
          >
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">{t.name}</p>
              <Badge variant="outline" className={`text-[10px] ${categoryColors[t.category] || ""}`}>{t.category}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body}</p>
          </button>
        ))}
      </TabsContent>
    </Tabs>
  );
};

export default Step2Template;
