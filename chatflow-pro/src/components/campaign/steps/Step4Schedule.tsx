import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Clock, Zap, Rocket, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step4Props {
  scheduleType: "immediately" | "custom";
  onScheduleChange: (t: "immediately" | "custom") => void;
  scheduledAt: string;
  onScheduledAtChange: (v: string) => void;
  campaignName: string;
  campaignType: string;
  templateName: string | null;
  contactCount: number;
  canLaunch: boolean;
  onLaunch: () => void;
}

const Step4Schedule = ({
  scheduleType, onScheduleChange, scheduledAt, onScheduledAtChange,
  campaignName, campaignType, templateName, contactCount, canLaunch, onLaunch
}: Step4Props) => {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);
  const minDateTime = now.toISOString().slice(0, 16);

  const isReady = canLaunch;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <button
          onClick={() => onScheduleChange("immediately")}
          className={cn(
            "p-4 rounded-xl border-2 text-left transition-all",
            scheduleType === "immediately" ? "border-primary bg-primary/5" : "border-border/50 hover:border-border"
          )}
        >
          <Zap className={cn("w-5 h-5 mb-2", scheduleType === "immediately" ? "text-primary" : "text-muted-foreground")} />
          <p className="font-display font-semibold text-foreground text-sm">Immediately</p>
          <p className="text-xs text-muted-foreground mt-1">Send when you hit "Go Live"</p>
        </button>
        <button
          onClick={() => onScheduleChange("custom")}
          className={cn(
            "p-4 rounded-xl border-2 text-left transition-all",
            scheduleType === "custom" ? "border-primary bg-primary/5" : "border-border/50 hover:border-border"
          )}
        >
          <Clock className={cn("w-5 h-5 mb-2", scheduleType === "custom" ? "text-primary" : "text-muted-foreground")} />
          <p className="font-display font-semibold text-foreground text-sm">Schedule for Later</p>
          <p className="text-xs text-muted-foreground mt-1">Pick a date and time</p>
        </button>
      </div>

      {scheduleType === "custom" && (
        <Input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => onScheduledAtChange(e.target.value)}
          min={minDateTime}
          className="bg-muted/50 border-border/50 w-fit"
        />
      )}

      {/* Campaign Summary */}
      <div className="p-4 rounded-xl border border-border/50 bg-muted/20">
        <p className="font-display font-semibold text-foreground text-sm mb-3">Campaign Summary</p>
        <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-xs">
          <span className="text-muted-foreground">Campaign Name</span>
          <span className="text-foreground">{campaignName || "--"}</span>
          <span className="text-muted-foreground">Type</span>
          <span className="text-foreground capitalize">{campaignType}</span>
          <span className="text-muted-foreground">Template</span>
          <span className="text-foreground">{templateName || "--"}</span>
          <span className="text-muted-foreground">Contacts</span>
          <span className="text-foreground">{contactCount}</span>
          <span className="text-muted-foreground">Send Time</span>
          <span className="text-foreground">{scheduleType === "immediately" ? "On Go Live" : scheduledAt || "--"}</span>
          <span className="text-muted-foreground">Status</span>
          <Badge variant="outline" className={cn("w-fit text-[10px]", isReady ? "border-primary/30 text-primary" : "border-warning/30 text-warning")}>
            {isReady ? <><CheckCircle className="w-3 h-3 mr-1" /> Ready</> : <><AlertCircle className="w-3 h-3 mr-1" /> Incomplete</>}
          </Badge>
        </div>
      </div>

      <Button
        onClick={onLaunch}
        disabled={!canLaunch}
        className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90 w-full disabled:opacity-40 disabled:shadow-none"
      >
        <Rocket className="w-4 h-4 mr-2" /> Launch Campaign
      </Button>
    </div>
  );
};

export default Step4Schedule;
