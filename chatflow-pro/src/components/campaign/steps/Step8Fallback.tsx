import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Mail, Phone, MessageSquare, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step8Props {
  retryEnabled: boolean;
  fallbackEnabled: boolean;
  onFallbackEnabledChange: (v: boolean) => void;
}

const channels = [
  { key: "sms", icon: MessageSquare, label: "SMS", available: false },
  { key: "email", icon: Mail, label: "Email", available: false },
  { key: "voice", icon: Phone, label: "Voice Call", available: false },
];

const Step8Fallback = ({ retryEnabled, fallbackEnabled, onFallbackEnabledChange }: Step8Props) => {
  const [delay, setDelay] = useState("24");
  const [messageOption, setMessageOption] = useState<"same" | "custom">("same");
  const [customMessage, setCustomMessage] = useState("");

  if (retryEnabled) {
    return (
      <div className="flex items-start gap-2 p-4 rounded-lg bg-warning/5 border border-warning/20">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-warning">Retries and Fallbacks cannot both be active</p>
          <p className="text-xs text-muted-foreground mt-1">Disable retries in Step 6 to configure fallback channels.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Enable Fallback</p>
          <p className="text-xs text-muted-foreground">Send via alternate channel if WhatsApp fails</p>
        </div>
        <Switch checked={fallbackEnabled} onCheckedChange={onFallbackEnabledChange} />
      </div>

      {fallbackEnabled && (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            {channels.map((ch) => (
              <div key={ch.key} className="p-4 rounded-xl border border-border/50 text-center opacity-60">
                <ch.icon className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs font-medium text-muted-foreground">{ch.label}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Coming soon</p>
              </div>
            ))}
          </div>

          <div>
            <Label className="text-muted-foreground text-xs mb-1 block">Delay (hours)</Label>
            <Input
              type="number"
              min={1}
              max={168}
              value={delay}
              onChange={(e) => setDelay(e.target.value)}
              className="bg-muted/50 border-border/50 w-32"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Send fallback after {delay}h of WhatsApp delivery failure</p>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs block">Fallback Message</Label>
            <div className="flex gap-3">
              <button
                onClick={() => setMessageOption("same")}
                className={cn("px-3 py-1.5 rounded-lg border text-xs", messageOption === "same" ? "border-primary bg-primary/5 text-primary" : "border-border/50 text-muted-foreground")}
              >
                Use same template
              </button>
              <button
                onClick={() => setMessageOption("custom")}
                className={cn("px-3 py-1.5 rounded-lg border text-xs", messageOption === "custom" ? "border-primary bg-primary/5 text-primary" : "border-border/50 text-muted-foreground")}
              >
                Custom message
              </button>
            </div>
            {messageOption === "custom" && (
              <Textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Enter fallback message..."
                className="bg-muted/50 border-border/50 min-h-[80px]"
              />
            )}
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-info/5 border border-info/20">
            <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
            <p className="text-xs text-info">When WhatsApp delivery fails after the specified delay, the fallback channel will automatically send the message.</p>
          </div>

          <Button size="sm" className="bg-gradient-primary text-primary-foreground hover:opacity-90">
            Save Fallback Config
          </Button>
        </>
      )}
    </div>
  );
};

export default Step8Fallback;
