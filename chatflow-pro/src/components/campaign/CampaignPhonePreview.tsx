import { Button } from "@/components/ui/button";
import { Smartphone, Send, Phone, MoreVertical, ArrowLeft } from "lucide-react";

interface CampaignPhonePreviewProps {
  templateBody: string;
  templateName?: string;
}

const CampaignPhonePreview = ({ templateBody, templateName }: CampaignPhonePreviewProps) => {
  return (
    <div className="lg:sticky lg:top-24 h-fit space-y-3">
      <Button size="sm" className="bg-primary/10 text-primary hover:bg-primary/20 w-full">
        <Send className="w-3 h-3 mr-1" /> Send Test Message
      </Button>

      <div className="flex justify-center gap-2 mb-2">
        <Button size="sm" variant="default" className="bg-primary/10 text-primary text-xs h-7">
          <Smartphone className="w-3 h-3 mr-1" /> Android
        </Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground text-xs h-7 opacity-50 cursor-not-allowed">
          iOS
        </Button>
      </div>

      {/* Phone shell */}
      <div className="mx-auto w-[280px] rounded-[2rem] border-[3px] border-[hsl(var(--border))] bg-[hsl(222,47%,4%)] overflow-hidden shadow-card">
        {/* Status bar */}
        <div className="h-6 bg-muted/30 flex items-center justify-between px-4">
          <span className="text-[9px] text-muted-foreground">1:42</span>
          <div className="flex gap-1">
            <div className="w-3 h-2 rounded-sm bg-muted-foreground/30" />
            <div className="w-3 h-2 rounded-sm bg-muted-foreground/30" />
          </div>
        </div>

        {/* WhatsApp header */}
        <div className="bg-[hsl(160,74%,18%)] px-3 py-2 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4 text-[hsl(var(--foreground))]" />
          <div className="w-7 h-7 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center">
            <span className="text-[9px] text-muted-foreground font-bold">WB</span>
          </div>
          <div className="flex-1">
            <p className="text-[11px] text-[hsl(var(--foreground))] font-medium">
              {templateName || "Your Business"}
            </p>
            <p className="text-[8px] text-[hsl(var(--foreground))]/60">online</p>
          </div>
          <Phone className="w-3.5 h-3.5 text-[hsl(var(--foreground))]/70" />
          <MoreVertical className="w-3.5 h-3.5 text-[hsl(var(--foreground))]/70" />
        </div>

        {/* Chat area */}
        <div className="bg-[hsl(30,15%,85%)] p-3 min-h-[380px]">
          {/* Date pill */}
          <div className="flex justify-center mb-3">
            <span className="bg-[hsl(var(--card))]/70 text-[9px] text-muted-foreground px-3 py-0.5 rounded-full">
              Today
            </span>
          </div>

          {templateBody ? (
            <div className="bg-white rounded-lg rounded-tl-none p-3 max-w-[90%] shadow-sm">
              <p className="text-[11px] text-[hsl(222,47%,10%)] leading-relaxed whitespace-pre-line">
                {templateBody}
              </p>
              <p className="text-[8px] text-[hsl(222,25%,50%)] text-right mt-1">11:49 am</p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground text-center mt-32">
              Select a template to preview
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CampaignPhonePreview;
