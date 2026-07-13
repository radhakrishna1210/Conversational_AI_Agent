import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Smartphone, RefreshCw, CheckCircle2, AlertTriangle, AlertCircle,
  Loader2, Plus, Eye, EyeOff, Sparkles, Plug,
} from "lucide-react";
import { toast } from "sonner";
import { whapi } from "@/lib/whapi";
import MetaEmbeddedSignup from "@/components/MetaEmbeddedSignup";

interface WaNumber {
  id: string;
  phoneNumber: string;
  displayName: string;
  quality?: string;
  status: string;
  messagingLimit?: string;
}

interface PoolNumber {
  id: string;
  phoneNumber: string;
  displayName: string;
}

interface GetNumberResult {
  phoneNumber: string;
  displayName: string;
}

const qualityColor: Record<string, string> = {
  High:   "bg-primary/10 text-primary border-primary/20",
  GREEN:  "bg-primary/10 text-primary border-primary/20",
  Medium: "bg-warning/10 text-warning border-warning/20",
  YELLOW: "bg-warning/10 text-warning border-warning/20",
  Low:    "bg-destructive/10 text-destructive border-destructive/20",
  RED:    "bg-destructive/10 text-destructive border-destructive/20",
};

const emptyForm = {
  phoneNumber: "", metaPhoneNumberId: "", wabaId: "", accessToken: "", displayName: "",
};

export default function WHNumberSetup() {
  const queryClient = useQueryClient();

  // Get-number dialog
  const [getOpen, setGetOpen]         = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [gotNumber, setGotNumber]     = useState<GetNumberResult | null>(null);

  // Connect-own dialog
  const [connectOpen, setConnectOpen] = useState(false);
  const [form, setForm]               = useState(emptyForm);
  const [showToken, setShowToken]     = useState(false);

  /* ── Queries ── */
  const { data: numbers, isLoading, refetch, isFetching } = useQuery<WaNumber[]>({
    queryKey: ["whatsapp", "numbers"],
    queryFn:  () => whapi.get<WaNumber[]>("/whatsapp/numbers"),
  });

  const { data: poolNumbers, isLoading: poolLoading } = useQuery<PoolNumber[]>({
    queryKey: ["whatsapp", "pool"],
    queryFn:  () => whapi.get<PoolNumber[]>("/whatsapp/numbers/pool"),
    enabled:  getOpen && !gotNumber,
  });

  const numberData = numbers?.[0];
  const isConnected = ["Approved", "approved", "ACTIVE", "CONNECTED"].includes(numberData?.status ?? "");

  /* ── Get number from pool ── */
  const getNumberMutation = useMutation({
    mutationFn: (poolEntryId: string) =>
      whapi.post<GetNumberResult>("/whatsapp/onboard", { poolEntryId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "numbers"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "pool"] });
      setGotNumber(data);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  /* ── Connect own number ── */
  const connectMutation = useMutation({
    mutationFn: () => whapi.post("/whatsapp/numbers/connect-own", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "numbers"] });
      toast.success("Number connected!");
      setConnectOpen(false);
      setForm(emptyForm);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const formValid =
    form.phoneNumber.trim().length >= 7 &&
    form.metaPhoneNumberId.trim().length > 0 &&
    form.wabaId.trim().length > 0 &&
    form.accessToken.trim().length >= 10;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Number Setup</h1>
        <p className="text-sm text-muted-foreground">Manage your WhatsApp Business number</p>
      </div>

      {/* ── Current number status ── */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="font-display text-base flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" /> WhatsApp Number Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : numberData ? (
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                {isConnected
                  ? <CheckCircle2 className="w-8 h-8 text-primary" />
                  : <AlertCircle className="w-8 h-8 text-warning" />}
              </div>
              <div>
                <p className="font-display text-2xl font-bold text-foreground">{numberData.phoneNumber}</p>
                <div className="flex items-center gap-3 mt-1">
                  {numberData.quality && (
                    <Badge className={qualityColor[numberData.quality] ?? "bg-muted text-muted-foreground"}>
                      Quality: {numberData.quality}
                    </Badge>
                  )}
                  <Badge variant="outline" className="border-border/50 text-muted-foreground">
                    {numberData.status}
                  </Badge>
                  {numberData.messagingLimit && (
                    <Badge variant="outline" className="border-border/50 text-muted-foreground">
                      Limit: {numberData.messagingLimit}
                    </Badge>
                  )}
                </div>
                {numberData.displayName && (
                  <p className="text-xs text-muted-foreground mt-1">{numberData.displayName}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No WhatsApp number connected yet.</p>
          )}

          <Button
            variant="outline"
            className="border-border/50 text-muted-foreground"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh Status
          </Button>
        </CardContent>
      </Card>

      {/* ── Meta Embedded Signup ── */}
      <Card className="bg-card border-primary/30 border-2">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-display font-semibold text-foreground">Connect via Meta</p>
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Recommended</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Log in with your Facebook/Meta account. We'll automatically import all your WhatsApp Business numbers — no credentials needed.
              </p>
            </div>
          </div>
          <ul className="space-y-1">
            {[
              "No Phone Number ID or tokens to copy",
              "All numbers imported automatically",
              "Works with existing Meta Business accounts",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0" /> {f}
              </li>
            ))}
          </ul>
          <MetaEmbeddedSignup />
        </CardContent>
      </Card>

      {/* ── Three options ── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Get number from platform */}
        <Card className="bg-card border-border/50 hover:border-primary/30 transition-colors">
          <CardContent className="pt-6 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-display font-semibold text-foreground">Get a Number</p>
              <p className="text-sm text-muted-foreground mt-1">
                We'll assign you a ready-to-use WhatsApp Business number instantly from our pool.
              </p>
            </div>
            <ul className="space-y-1">
              {["Instant setup", "No Meta approval needed", "Managed by platform"].map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <Button
              className="w-full bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
              onClick={() => { setGotNumber(null); setSelectedPoolId(null); setGetOpen(true); }}
            >
              <Smartphone className="w-4 h-4 mr-2" />
              {isConnected ? "Get Another Number" : "Get My WhatsApp Number"}
            </Button>
          </CardContent>
        </Card>

        {/* Connect own number */}
        <Card className="bg-card border-border/50 hover:border-primary/30 transition-colors">
          <CardContent className="pt-6 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
              <Plug className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <p className="font-display font-semibold text-foreground">Connect Your Own</p>
              <p className="text-sm text-muted-foreground mt-1">
                Already have a number approved on Meta? Connect it using your Phone Number ID and access token.
              </p>
            </div>
            <ul className="space-y-1">
              {["Use your existing number", "Full control over WABA", "Keep your Meta account"].map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              className="w-full border-border/50 text-foreground hover:bg-secondary"
              onClick={() => setConnectOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" /> Connect My Number
            </Button>
          </CardContent>
        </Card>

      </div>

      {/* Quality warning */}
      <Card className="bg-card border-border/50 border-l-4 border-l-warning">
        <CardContent className="pt-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Keep your quality rating high</p>
            <p className="text-xs text-muted-foreground mt-1">
              Avoid sending promotional messages without consent. High opt-out rates lower your quality and messaging limits.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Get Number Dialog ── */}
      <Dialog open={getOpen} onOpenChange={(v) => { if (!getNumberMutation.isPending) setGetOpen(v); }}>
        <DialogContent className="bg-card border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground">Get a WhatsApp Number</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Select a number from our pool. It will be assigned to your account instantly.
            </DialogDescription>
          </DialogHeader>

          {gotNumber ? (
            /* Success state */
            <div className="py-4 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <p className="font-display text-xl font-bold text-foreground">{gotNumber.phoneNumber}</p>
              <p className="text-sm text-muted-foreground">Your number is live and ready to use.</p>
              <Button
                className="w-full bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
                onClick={() => setGetOpen(false)}
              >
                Done
              </Button>
            </div>
          ) : poolLoading ? (
            /* Loading state */
            <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading available numbers…</span>
            </div>
          ) : !poolNumbers?.length ? (
            /* Empty state */
            <div className="py-8 text-center space-y-2">
              <Smartphone className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm font-medium text-foreground">No numbers available</p>
              <p className="text-xs text-muted-foreground">Please contact support to add numbers to the pool.</p>
              <Button variant="outline" className="mt-2 border-border/50" onClick={() => setGetOpen(false)}>
                Close
              </Button>
            </div>
          ) : (
            /* Pick a number */
            <>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1 py-1">
                {poolNumbers.map((num) => (
                  <button
                    key={num.id}
                    type="button"
                    onClick={() => setSelectedPoolId(num.id)}
                    className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                      selectedPoolId === num.id
                        ? "border-primary bg-primary/5"
                        : "border-border/50 hover:border-primary/40 hover:bg-secondary/50"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      selectedPoolId === num.id ? "bg-primary/10" : "bg-muted"
                    }`}>
                      <Smartphone className={`w-4 h-4 ${selectedPoolId === num.id ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${selectedPoolId === num.id ? "text-primary" : "text-foreground"}`}>
                        {num.phoneNumber}
                      </p>
                      {num.displayName && num.displayName !== num.phoneNumber && (
                        <p className="text-xs text-muted-foreground truncate">{num.displayName}</p>
                      )}
                    </div>
                    {selectedPoolId === num.id && (
                      <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  className="border-border/50"
                  onClick={() => setGetOpen(false)}
                  disabled={getNumberMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
                  disabled={!selectedPoolId || getNumberMutation.isPending}
                  onClick={() => selectedPoolId && getNumberMutation.mutate(selectedPoolId)}
                >
                  {getNumberMutation.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Assigning…</>
                    : <><Smartphone className="w-4 h-4 mr-2" /> Get This Number</>}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Connect Own Dialog ── */}
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="bg-card border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground">Connect Your Meta Number</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field label="Phone Number" required hint="Include country code e.g. +91…">
              <Input name="phoneNumber" placeholder="+91 98765 43210"
                value={form.phoneNumber} onChange={handleFormChange}
                className="bg-muted/50 border-border/50" />
            </Field>

            <Field label="Phone Number ID" required hint="Meta Business Manager → WhatsApp → Phone Numbers → your number → Info">
              <Input name="metaPhoneNumberId" placeholder="921047971092757"
                value={form.metaPhoneNumberId} onChange={handleFormChange}
                className="bg-muted/50 border-border/50" />
            </Field>

            <Field label="WABA ID" required hint="Business Settings → Accounts → WhatsApp Accounts">
              <Input name="wabaId" placeholder="1475318980618872"
                value={form.wabaId} onChange={handleFormChange}
                className="bg-muted/50 border-border/50" />
            </Field>

            <Field label="Access Token" required hint="System Users → Generate token (or Temporary token from API Setup)">
              <div className="relative">
                <Input name="accessToken" type={showToken ? "text" : "password"}
                  placeholder="EAAxxxxx…" value={form.accessToken} onChange={handleFormChange}
                  className="bg-muted/50 border-border/50 pr-10" />
                <button type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowToken((p) => !p)}>
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>

            <Field label="Display Name" hint="Optional — shown to contacts">
              <Input name="displayName" placeholder="My Business"
                value={form.displayName} onChange={handleFormChange}
                className="bg-muted/50 border-border/50" />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" className="border-border/50" onClick={() => setConnectOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
              disabled={!formValid || connectMutation.isPending}
              onClick={() => connectMutation.mutate()}
            >
              {connectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Connect Number
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── tiny helper ── */
function Field({
  label, required, hint, children,
}: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
