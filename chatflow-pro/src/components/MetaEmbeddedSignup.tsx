import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { whapi } from "@/lib/whapi";

declare global {
  interface Window {
    FB: {
      init: (opts: object) => void;
      login: (cb: (resp: { authResponse?: { code: string } }) => void, opts: object) => void;
    };
    fbAsyncInit: () => void;
  }
}

interface ConnectResult {
  wabaCount: number;
  numbers: { phoneNumber: string; displayName: string; status: string }[];
}

interface Props {
  onSuccess?: (result: ConnectResult) => void;
}

const API_BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

type SdkState = "fetching" | "loading" | "ready" | "failed" | "unconfigured";

export default function MetaEmbeddedSignup({ onSuccess }: Props) {
  const queryClient = useQueryClient();
  const appIdRef = useRef<string | null>(null);
  const [sdkState, setSdkState] = useState<SdkState>("fetching");

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // 1. Fetch app ID from backend
      try {
        const res = await fetch(`${API_BASE}/config`);
        const data = await res.json();
        if (cancelled) return;

        if (!data.metaAppId) {
          setSdkState("unconfigured");
          return;
        }
        appIdRef.current = data.metaAppId;
      } catch {
        if (!cancelled) setSdkState("failed");
        return;
      }

      // 2. SDK already loaded from a previous render
      if (window.FB) {
        setSdkState("ready");
        return;
      }

      setSdkState("loading");

      // 3. SDK script already injected — poll until ready
      if (document.getElementById("facebook-jssdk")) {
        const interval = setInterval(() => {
          if (window.FB) { setSdkState("ready"); clearInterval(interval); }
        }, 100);
        const timeout = setTimeout(() => {
          clearInterval(interval);
          if (!window.FB && !cancelled) setSdkState("failed");
        }, 8000);
        return () => { clearInterval(interval); clearTimeout(timeout); };
      }

      // 4. Inject FB SDK
      window.fbAsyncInit = () => {
        window.FB.init({
          appId: appIdRef.current!,
          autoLogAppEvents: true,
          xfbml: false,
          version: "v19.0",
        });
        if (!cancelled) setSdkState("ready");
      };

      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      script.onerror = () => { if (!cancelled) setSdkState("failed"); };
      document.body.appendChild(script);

      const timeout = setTimeout(() => {
        if (!window.FB && !cancelled) setSdkState("failed");
      }, 8000);
      return () => clearTimeout(timeout);
    };

    init();
    return () => { cancelled = true; };
  }, []);

  const callbackMutation = useMutation({
    mutationFn: (code: string) =>
      whapi.post<ConnectResult>("/meta/oauth/callback", { code }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "numbers"] });
      const count = data.numbers?.length ?? 0;
      toast.success(
        count > 0
          ? `${count} WhatsApp number${count > 1 ? "s" : ""} connected!`
          : "Meta account connected — no numbers found on this account."
      );
      onSuccess?.(data);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleClick = () => {
    if (sdkState === "unconfigured") {
      toast.error("META_APP_ID is not configured on the server.");
      return;
    }
    if (sdkState === "failed") {
      toast.error("Facebook SDK failed to load. Try disabling your ad blocker.");
      return;
    }
    if (sdkState !== "ready" || !window.FB) {
      toast.error("Facebook SDK is still loading. Please wait.");
      return;
    }

    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          callbackMutation.mutate(response.authResponse.code);
        }
      },
      {
        scope: "whatsapp_business_management,whatsapp_business_messaging",
        response_type: "code",
        override_default_response_type: true,
        extras: {
          feature: "whatsapp_embedded_signup",
          setup: {},
        },
      }
    );
  };

  if (sdkState === "unconfigured") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
        <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
        <p className="text-xs text-warning">
          Meta Embedded Signup is not configured. Set <code className="font-mono">META_APP_ID</code> in the server <code className="font-mono">.env</code>.
        </p>
      </div>
    );
  }

  const busy = sdkState === "fetching" || sdkState === "loading" || callbackMutation.isPending;

  return (
    <Button
      onClick={handleClick}
      disabled={callbackMutation.isPending}
      className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white font-semibold"
    >
      {busy ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          {callbackMutation.isPending ? "Connecting…" : "Loading…"}
        </>
      ) : (
        <>
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          {sdkState === "failed" ? "Retry with Facebook" : "Continue with Facebook"}
        </>
      )}
    </Button>
  );
}
