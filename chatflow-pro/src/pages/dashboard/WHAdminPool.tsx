import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Phone, Loader2, Eye, EyeOff, ShieldCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token") ?? "";
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error ?? `Request failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
  });
}

const adminApi = {
  get: <T,>(path: string) => adminRequest<T>(path),
  post: <T,>(path: string, body: unknown) =>
    adminRequest<T>(path, { method: "POST", body: JSON.stringify(body) }),
};

interface PoolEntry {
  id: string;
  phoneNumber: string;
  phoneNumberId: string;
  wabaId: string;
  displayName?: string;
  status: string;
  assignedTo?: string;
  registeredAt: string;
  createdAt: string;
}

interface PoolSummary {
  total: number;
  available: number;
  assigned: number;
  banned: number;
}

interface PoolResponse {
  summary: PoolSummary;
  pool: PoolEntry[];
}

interface WabaNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  status: string;
  code_verification_status?: string;
}

const statusColor: Record<string, string> = {
  AVAILABLE: "bg-primary/10 text-primary border-primary/20",
  ASSIGNED: "bg-info/10 text-info border-info/20",
  BANNED: "bg-destructive/10 text-destructive border-destructive/20",
};

const wabaStatusColor: Record<string, string> = {
  CONNECTED: "bg-primary/10 text-primary border-primary/20",
  PENDING: "bg-warning/10 text-warning border-warning/20",
  FLAGGED: "bg-destructive/10 text-destructive border-destructive/20",
};

const emptyForm = {
  phoneNumber: "",
  phoneNumberId: "",
  wabaId: "",
  accessToken: "",
  displayName: "",
};

const emptyOtpForm = {
  phoneNumber: "",
  metaPhoneNumberId: "",
  otp: "",
  displayName: "",
};

export default function WHAdminPool() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [showToken, setShowToken] = useState(false);
  const [search, setSearch] = useState("");
  const [otpForm, setOtpForm] = useState(emptyOtpForm);
  const [otpSent, setOtpSent] = useState(false);

  const { data, isLoading } = useQuery<PoolResponse>({
    queryKey: ["admin", "pool"],
    queryFn: () => adminApi.get<PoolResponse>("/admin/numbers/pool"),
  });

  const { data: wabaData, isFetching: wabaFetching, refetch: refetchWaba } = useQuery<{ numbers: WabaNumber[] }>({
    queryKey: ["admin", "waba-numbers"],
    queryFn: () => adminApi.get("/admin/waba/numbers"),
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: () => adminApi.post("/admin/numbers/add", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "pool"] });
      setForm(emptyForm);
      toast.success("Number added to pool");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const requestOtpMutation = useMutation({
    mutationFn: () =>
      adminApi.post("/admin/numbers/request-otp", {
        metaPhoneNumberId: otpForm.metaPhoneNumberId,
        method: "SMS",
      }),
    onSuccess: () => {
      setOtpSent(true);
      toast.success("OTP sent! Check your Twilio number inbox or Twilio console.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const verifyOtpMutation = useMutation({
    mutationFn: () => adminApi.post("/admin/numbers/verify-otp", otpForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "pool"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "waba-numbers"] });
      setOtpForm(emptyOtpForm);
      setOtpSent(false);
      toast.success("Number verified and added to pool!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const fillFromWaba = (n: WabaNumber) => {
    setOtpForm((p) => ({
      ...p,
      phoneNumber: n.display_phone_number.replace(/\s/g, ""),
      metaPhoneNumberId: n.id,
      displayName: n.verified_name,
    }));
    setOtpSent(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setOtpForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const formValid =
    form.phoneNumber.trim().length >= 7 &&
    form.phoneNumberId.trim().length > 0 &&
    form.wabaId.trim().length > 0 &&
    form.accessToken.trim().length >= 10;

  const filtered = (data?.pool ?? []).filter(
    (e) =>
      !search ||
      e.phoneNumber.includes(search) ||
      (e.displayName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Number Pool</h1>
        <p className="text-sm text-muted-foreground">Manage WhatsApp numbers available to end users</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: summary?.total ?? 0 },
          { label: "Available", value: summary?.available ?? 0 },
          { label: "Assigned", value: summary?.assigned ?? 0 },
          { label: "Banned", value: summary?.banned ?? 0 },
        ].map((s) => (
          <Card key={s.label} className="bg-card border-border/50">
            <CardContent className="pt-6">
              <p className="font-display text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* WABA Numbers + Manual OTP Verify */}
      <Card className="bg-card border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" /> Verify via Meta OTP
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-border/50"
            onClick={() => refetchWaba()}
            disabled={wabaFetching}
          >
            {wabaFetching ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Refresh WABA
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* WABA numbers list */}
          {wabaData?.numbers && wabaData.numbers.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Numbers in your Meta WABA — click to prefill:</p>
              <div className="flex flex-wrap gap-2">
                {wabaData.numbers.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => fillFromWaba(n)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 text-xs transition-colors"
                  >
                    <span className="font-mono">{n.display_phone_number}</span>
                    <Badge
                      className={`text-[10px] px-1.5 py-0 ${wabaStatusColor[n.status] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {n.status}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* OTP form */}
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Phone Number" hint="E.164 format e.g. +16624394273">
              <Input
                name="phoneNumber"
                placeholder="+16624394273"
                value={otpForm.phoneNumber}
                onChange={handleOtpChange}
                className="bg-muted/50 border-border/50"
              />
            </Field>
            <Field label="Meta Phone Number ID" hint="From WABA numbers list above (id field)">
              <Input
                name="metaPhoneNumberId"
                placeholder="1027575077112045"
                value={otpForm.metaPhoneNumberId}
                onChange={handleOtpChange}
                className="bg-muted/50 border-border/50"
              />
            </Field>
            <Field label="Display Name" hint="Optional label for this number">
              <Input
                name="displayName"
                placeholder="Whabridge"
                value={otpForm.displayName}
                onChange={handleOtpChange}
                className="bg-muted/50 border-border/50"
              />
            </Field>
            <Field label="OTP Code" hint="6-digit code from SMS / voice call">
              <Input
                name="otp"
                placeholder="123456"
                maxLength={6}
                value={otpForm.otp}
                onChange={handleOtpChange}
                className="bg-muted/50 border-border/50"
                disabled={!otpSent}
              />
            </Field>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="border-border/50"
              disabled={!otpForm.metaPhoneNumberId || requestOtpMutation.isPending}
              onClick={() => requestOtpMutation.mutate()}
            >
              {requestOtpMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send OTP
            </Button>
            <Button
              className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
              disabled={
                !otpSent ||
                otpForm.otp.length !== 6 ||
                !otpForm.phoneNumber ||
                !otpForm.metaPhoneNumberId ||
                verifyOtpMutation.isPending
              }
              onClick={() => verifyOtpMutation.mutate()}
            >
              {verifyOtpMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <ShieldCheck className="w-4 h-4 mr-2" /> Verify & Add to Pool
            </Button>
          </div>
          {otpSent && (
            <p className="text-xs text-primary">
              OTP sent! Check your Twilio console → Messaging → Logs for the inbound SMS, or listen for a voice call. Enter the 6-digit code above.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Add Number Form (manual, no Meta) */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="font-display text-base flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Add Number Manually
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Phone Number" hint="With country code e.g. +91 98765 43210">
              <Input
                name="phoneNumber"
                placeholder="+91 98765 43210"
                value={form.phoneNumber}
                onChange={handleChange}
                className="bg-muted/50 border-border/50"
              />
            </Field>
            <Field label="Phone Number ID" hint="From Meta Business Manager → WhatsApp → Phone Numbers">
              <Input
                name="phoneNumberId"
                placeholder="921047971092757"
                value={form.phoneNumberId}
                onChange={handleChange}
                className="bg-muted/50 border-border/50"
              />
            </Field>
            <Field label="WABA ID" hint="WhatsApp Business Account ID this number belongs to">
              <Input
                name="wabaId"
                placeholder="1245027851170014"
                value={form.wabaId}
                onChange={handleChange}
                className="bg-muted/50 border-border/50"
              />
            </Field>
            <Field label="Display Name" hint="Optional friendly name shown to clients">
              <Input
                name="displayName"
                placeholder="My Business"
                value={form.displayName}
                onChange={handleChange}
                className="bg-muted/50 border-border/50"
              />
            </Field>
          </div>

          <Field label="Access Token" hint="System User token or permanent token for this number">
            <div className="relative">
              <Input
                name="accessToken"
                type={showToken ? "text" : "password"}
                placeholder="EAAxxxxx…"
                value={form.accessToken}
                onChange={handleChange}
                className="bg-muted/50 border-border/50 pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowToken((p) => !p)}
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>

          <Button
            className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
            disabled={!formValid || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            {addMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Plus className="w-4 h-4 mr-2" /> Add to Pool
          </Button>
        </CardContent>
      </Card>

      {/* Pool Table */}
      <Card className="bg-card border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display text-base flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary" /> Pool Numbers
          </CardTitle>
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 bg-muted/50 border-border/50 h-8 text-sm"
          />
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading pool...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground text-xs">Phone Number</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Display Name</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Phone Number ID</TableHead>
                  <TableHead className="text-muted-foreground text-xs">WABA ID</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Status</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Assigned To</TableHead>
                  <TableHead className="text-muted-foreground text-xs">Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {data?.pool.length === 0 ? "No numbers in pool yet." : "No results match your search."}
                    </TableCell>
                  </TableRow>
                ) : filtered.map((e) => (
                  <TableRow key={e.id} className="border-border/50 hover:bg-muted/30">
                    <TableCell className="font-medium text-foreground font-mono text-sm">{e.phoneNumber}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{e.displayName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">{e.phoneNumberId}</TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">{e.wabaId}</TableCell>
                    <TableCell>
                      <Badge className={statusColor[e.status] ?? "bg-muted text-muted-foreground"}>
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {e.assignedTo ? e.assignedTo.slice(0, 8) + "…" : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(e.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
