import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step6Props {
  retryEnabled: boolean;
  onRetryEnabledChange: (v: boolean) => void;
  retryPattern: "smart" | "hourly";
  onRetryPatternChange: (v: "smart" | "hourly") => void;
}

const smartIntervals = ["1h 1m", "2h 32m", "4h 48m", "8h 15m", "14h 30m", "24h"];

const Step6Retries = ({ retryEnabled, onRetryEnabledChange, retryPattern, onRetryPatternChange }: Step6Props) => {
  const [endDate, setEndDate] = useState("");
  const [noRetryStart, setNoRetryStart] = useState("22");
  const [noRetryStartMin, setNoRetryStartMin] = useState("00");
  const [noRetryStartPeriod, setNoRetryStartPeriod] = useState("PM");
  const [noRetryEnd, setNoRetryEnd] = useState("08");
  const [noRetryEndMin, setNoRetryEndMin] = useState("00");
  const [noRetryEndPeriod, setNoRetryEndPeriod] = useState("AM");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Activate Retries</p>
          <p className="text-xs text-muted-foreground">Automatically retry failed messages</p>
        </div>
        <Switch checked={retryEnabled} onCheckedChange={onRetryEnabledChange} />
      </div>

      {retryEnabled && (
        <>
          <div>
            <Label className="text-muted-foreground text-xs mb-1 flex items-center gap-1">
              <CalendarDays className="w-3 h-3" /> Retry End Date
            </Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-muted/50 border-border/50 w-48" />
          </div>

          <div>
            <Label className="text-muted-foreground text-xs mb-2 block">Retry Pattern</Label>
            <div className="grid sm:grid-cols-2 gap-3">
              <button
                onClick={() => onRetryPatternChange("smart")}
                className={cn("p-3 rounded-xl border-2 text-left", retryPattern === "smart" ? "border-primary bg-primary/5" : "border-border/50")}
              >
                <p className="text-sm font-medium text-foreground">Smart Retries</p>
                <p className="text-[10px] text-muted-foreground mt-1">Recommended — variable intervals</p>
              </button>
              <button
                onClick={() => onRetryPatternChange("hourly")}
                className={cn("p-3 rounded-xl border-2 text-left", retryPattern === "hourly" ? "border-primary bg-primary/5" : "border-border/50")}
              >
                <p className="text-sm font-medium text-foreground">24 Hourly Retries</p>
                <p className="text-[10px] text-muted-foreground mt-1">Retry every hour for 24 hours</p>
              </button>
            </div>
          </div>

          {/* No-Retry Window */}
          <div>
            <Label className="text-muted-foreground text-xs mb-2 block">No-Retry Window</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <Input value={noRetryStart} onChange={(e) => setNoRetryStart(e.target.value)} className="w-12 h-8 text-xs bg-muted/50 border-border/50 text-center" />
                <span className="text-muted-foreground text-xs">:</span>
                <Input value={noRetryStartMin} onChange={(e) => setNoRetryStartMin(e.target.value)} className="w-12 h-8 text-xs bg-muted/50 border-border/50 text-center" />
                <Select value={noRetryStartPeriod} onValueChange={setNoRetryStartPeriod}>
                  <SelectTrigger className="w-16 h-8 text-xs bg-muted/50 border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <span className="text-muted-foreground text-xs">to</span>
              <div className="flex items-center gap-1">
                <Input value={noRetryEnd} onChange={(e) => setNoRetryEnd(e.target.value)} className="w-12 h-8 text-xs bg-muted/50 border-border/50 text-center" />
                <span className="text-muted-foreground text-xs">:</span>
                <Input value={noRetryEndMin} onChange={(e) => setNoRetryEndMin(e.target.value)} className="w-12 h-8 text-xs bg-muted/50 border-border/50 text-center" />
                <Select value={noRetryEndPeriod} onValueChange={setNoRetryEndPeriod}>
                  <SelectTrigger className="w-16 h-8 text-xs bg-muted/50 border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Schedule table */}
          {retryPattern === "smart" && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left text-muted-foreground py-2 font-normal">Attempt</th>
                    <th className="text-left text-muted-foreground py-2 font-normal">Interval</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/20">
                    <td className="py-1.5 text-foreground">Original</td>
                    <td className="py-1.5 text-muted-foreground">—</td>
                  </tr>
                  {smartIntervals.map((interval, i) => (
                    <tr key={i} className="border-b border-border/20">
                      <td className="py-1.5 text-foreground">Retry {i + 1}</td>
                      <td className="py-1.5 text-muted-foreground">+ {interval}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-lg bg-info/5 border border-info/20">
            <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
            <p className="text-xs text-info">Retries are free and only apply to Meta frequency-capping failures, not permanent blocks.</p>
          </div>

          <Button size="sm" className="bg-gradient-primary text-primary-foreground hover:opacity-90">
            Save Retry Config
          </Button>
        </>
      )}
    </div>
  );
};

export default Step6Retries;
