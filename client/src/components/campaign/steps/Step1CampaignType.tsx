import { Button } from "@/components/ui/button";
import { Send, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step1Props {
  campaignType: "onetime" | "ongoing";
  onChange: (type: "onetime" | "ongoing") => void;
  onNext: () => void;
}

const options = [
  {
    key: "onetime" as const,
    icon: Send,
    title: "One Time Campaign",
    desc: "Broadcast a message to many contacts at once",
  },
  {
    key: "ongoing" as const,
    icon: Zap,
    title: "Ongoing Campaign",
    desc: "Triggered automatically on pre-defined events",
  },
];

const Step1CampaignType = ({ campaignType, onChange, onNext }: Step1Props) => (
  <div className="space-y-4">
    <div className="grid sm:grid-cols-2 gap-3">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "p-4 rounded-xl border-2 text-left transition-all",
            campaignType === o.key
              ? "border-primary bg-primary/5"
              : "border-border/50 hover:border-border"
          )}
        >
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center mb-3",
              campaignType === o.key ? "bg-primary/20" : "bg-muted"
            )}
          >
            <o.icon className={cn("w-5 h-5", campaignType === o.key ? "text-primary" : "text-muted-foreground")} />
          </div>
          <p className="font-display font-semibold text-foreground text-sm">{o.title}</p>
          <p className="text-xs text-muted-foreground mt-1">{o.desc}</p>
        </button>
      ))}
    </div>
    <Button size="sm" onClick={onNext} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
      Save & Next
    </Button>
  </div>
);

export default Step1CampaignType;
