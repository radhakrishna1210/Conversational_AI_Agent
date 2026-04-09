import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Info } from "lucide-react";

interface Step7Props {
  trackUtm: boolean;
  onTrackUtmChange: (v: boolean) => void;
  trackEvents: boolean;
  onTrackEventsChange: (v: boolean) => void;
}

const Step7Tracking = ({ trackUtm, onTrackUtmChange, trackEvents, onTrackEventsChange }: Step7Props) => {
  return (
    <div className="space-y-5">
      {/* UTM */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox checked={trackUtm} onCheckedChange={(v) => onTrackUtmChange(!!v)} />
          <Label className="text-foreground text-sm font-medium cursor-pointer">Via UTM Parameters</Label>
        </div>
        {trackUtm && (
          <>
            <div className="grid grid-cols-2 gap-3 pl-6">
              {[
                { key: "source", required: true },
                { key: "medium", required: true },
                { key: "campaign", required: true },
                { key: "content", required: false },
                { key: "term", required: false },
              ].map((f) => (
                <div key={f.key}>
                  <Label className="text-muted-foreground text-xs mb-1 block">
                    utm_{f.key} {!f.required && <span className="text-muted-foreground/50">(optional)</span>}
                  </Label>
                  <Input placeholder={`utm_${f.key}`} className="bg-muted/50 border-border/50" />
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 pl-6">
              <Info className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground">UTM parameters will be appended to all links at send time.</p>
            </div>
          </>
        )}
      </div>

      {/* Custom Events */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox checked={trackEvents} onCheckedChange={(v) => onTrackEventsChange(!!v)} />
          <Label className="text-foreground text-sm font-medium cursor-pointer">Via Custom Events</Label>
        </div>
        {trackEvents && (
          <>
            <div className="pl-6">
              <Label className="text-muted-foreground text-xs mb-1 block">Conversion Event Name</Label>
              <Input placeholder="e.g. purchase, signup" className="bg-muted/50 border-border/50 w-64" />
            </div>
            <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 pl-6">
              <Info className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground">Event fires when a recipient replies after receiving the campaign message.</p>
            </div>
          </>
        )}
      </div>

      <Button size="sm" className="bg-gradient-primary text-primary-foreground hover:opacity-90">
        Save Tracking
      </Button>
    </div>
  );
};

export default Step7Tracking;
