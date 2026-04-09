import { Button } from "@/components/ui/button";
import { Send, Zap, Smartphone, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface WaNumber {
  id: string;
  phoneNumber: string;
  displayName?: string;
  status: string;
}

interface Step1Props {
  campaignType: "onetime" | "ongoing";
  onChange: (type: "onetime" | "ongoing") => void;
  selectedNumberId: string | null;
  onNumberChange: (id: string) => void;
  numbers: WaNumber[];
  loadingNumbers: boolean;
  onNext: () => void;
}

const typeOptions = [
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

const Step1CampaignType = ({
  campaignType,
  onChange,
  selectedNumberId,
  onNumberChange,
  numbers,
  loadingNumbers,
  onNext,
}: Step1Props) => (
  <div className="space-y-6">
    {/* Campaign type */}
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Campaign Type</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {typeOptions.map((o) => (
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
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center mb-3",
              campaignType === o.key ? "bg-primary/20" : "bg-muted"
            )}>
              <o.icon className={cn("w-5 h-5", campaignType === o.key ? "text-primary" : "text-muted-foreground")} />
            </div>
            <p className="font-display font-semibold text-foreground text-sm">{o.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{o.desc}</p>
          </button>
        ))}
      </div>
    </div>

    {/* WhatsApp number selector */}
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Send From</p>

      {loadingNumbers ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading numbers…
        </div>
      ) : numbers.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border/50 p-4 text-center space-y-2">
          <Smartphone className="w-6 h-6 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No WhatsApp number connected yet.</p>
          <Link to="/dashboard/number-setup">
            <Button size="sm" variant="outline" className="border-border/50 text-foreground">
              Set up a number
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {numbers.map((n) => {
            const active = selectedNumberId === n.id;
            return (
              <button
                key={n.id}
                onClick={() => onNumberChange(n.id)}
                className={cn(
                  "p-3 rounded-xl border-2 text-left transition-all flex items-center gap-3",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border/50 hover:border-border"
                )}
              >
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                  active ? "bg-primary/20" : "bg-muted"
                )}>
                  <Smartphone className={cn("w-4 h-4", active ? "text-primary" : "text-muted-foreground")} />
                </div>
                <div className="min-w-0">
                  <p className={cn("text-sm font-semibold truncate", active ? "text-primary" : "text-foreground")}>
                    {n.phoneNumber}
                  </p>
                  {n.displayName && n.displayName !== n.phoneNumber && (
                    <p className="text-xs text-muted-foreground truncate">{n.displayName}</p>
                  )}
                  <p className={cn(
                    "text-[10px] mt-0.5",
                    ["Approved", "approved", "ACTIVE"].includes(n.status) ? "text-primary" : "text-warning"
                  )}>
                    {n.status}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>

    <Button
      size="sm"
      onClick={onNext}
      disabled={!selectedNumberId}
      className="bg-gradient-primary text-primary-foreground hover:opacity-90"
    >
      Save & Next
    </Button>
  </div>
);

export default Step1CampaignType;
