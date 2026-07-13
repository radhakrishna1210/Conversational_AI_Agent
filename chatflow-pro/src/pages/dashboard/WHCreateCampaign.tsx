import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { whapi } from "@/lib/whapi";
import CampaignTopBar from "@/components/campaign/CampaignTopBar";
import StepHeader from "@/components/campaign/StepHeader";
import CampaignPhonePreview from "@/components/campaign/CampaignPhonePreview";
import Step1CampaignType from "@/components/campaign/steps/Step1CampaignType";
import Step2Template from "@/components/campaign/steps/Step2Template";
import Step3Audience from "@/components/campaign/steps/Step3Audience";
import Step4Schedule from "@/components/campaign/steps/Step4Schedule";
import Step5ReplyFlows, { FlowNode, defaultNodes } from "@/components/campaign/steps/Step5ReplyFlows";
import Step6Retries from "@/components/campaign/steps/Step6Retries";
import Step7Tracking from "@/components/campaign/steps/Step7Tracking";
import Step8Fallback from "@/components/campaign/steps/Step8Fallback";
import { HelpCircle } from "lucide-react";

const stepConfig = [
  { num: 1, title: "Campaign Type", icon: "📋" },
  { num: 2, title: "Message Template", icon: "📝" },
  { num: 3, title: "Audience", icon: "👥" },
  { num: 4, title: "Schedule", icon: "🚀" },
  { num: 5, title: "Reply Flows", icon: "💬" },
  { num: 6, title: "Retries", icon: "🔄" },
  { num: 7, title: "Conversion Tracking", icon: "📊" },
  { num: 8, title: "Fallback Channels", icon: "📡" },
];

const WHCreateCampaign = () => {
  const navigate = useNavigate();
  const [openStep, setOpenStep] = useState(1);
  const [campaignName, setCampaignName] = useState("");

  // Step 1
  const [campaignType, setCampaignType] = useState<"onetime" | "ongoing">("onetime");
  const [selectedNumberId, setSelectedNumberId] = useState<string | null>(null);
  const [step1Done, setStep1Done] = useState(false);

  // Step 2
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateBody, setTemplateBody] = useState("");
  const [isSampleTemplate, setIsSampleTemplate] = useState(false);
  const [step2Done, setStep2Done] = useState(false);

  // Step 3
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [step3Done, setStep3Done] = useState(false);

  // Step 4
  const [scheduleType, setScheduleType] = useState<"immediately" | "custom">("immediately");
  const [scheduledAt, setScheduledAt] = useState("");
  const [step4Done, setStep4Done] = useState(false);

  // Step 5
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>(defaultNodes);

  // Step 6
  const [retryEnabled, setRetryEnabled] = useState(false);
  const [retryPattern, setRetryPattern] = useState<"smart" | "hourly">("smart");

  // Step 7
  const [trackUtm, setTrackUtm] = useState(false);
  const [trackEvents, setTrackEvents] = useState(false);

  // Step 8
  const [fallbackEnabled, setFallbackEnabled] = useState(false);

  // Fetch whatsapp numbers
  const { data: waNumbers = [], isLoading: loadingNumbers } = useQuery<{ id: string; phoneNumber: string; displayName?: string; status: string }[]>({
    queryKey: ["whatsapp", "numbers"],
    queryFn: () => whapi.get("/whatsapp/numbers"),
  });

  const canLaunch = !!(
    campaignName &&
    selectedNumberId &&
    selectedTemplateId &&
    !isSampleTemplate &&
    selectedContactIds.size > 0 &&
    (scheduleType === "immediately" || scheduledAt)
  );

  const launchMutation = useMutation({
    mutationFn: async () => {
      const whatsappNumberId = selectedNumberId;
      if (!whatsappNumberId) throw new Error("No WhatsApp number selected");
      // 1. Create campaign
      const campaign = await whapi.post<{ id: string }>("/campaigns", {
        name: campaignName,
        templateId: selectedTemplateId,
        whatsappNumberId,
      });
      // 2. Add recipients
      await whapi.post(`/campaigns/${campaign.id}/recipients`, {
        contactIds: Array.from(selectedContactIds),
      });
      // 3. Launch campaign
      await whapi.post(`/campaigns/${campaign.id}/launch`, {
        ...(scheduleType === "custom" && scheduledAt ? { scheduledAt } : {}),
      });
      return campaign;
    },
    onSuccess: () => {
      toast.success("Campaign launched successfully!");
      navigate("/dashboard/campaigns");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleLaunch = useCallback(() => {
    if (!canLaunch) return;
    launchMutation.mutate();
  }, [canLaunch, launchMutation]);

  const toggleContact = (id: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getSubtitle = (step: number): string => {
    switch (step) {
      case 1: return step1Done
        ? `${campaignType === "onetime" ? "One Time" : "Ongoing"} · ${waNumbers.find(n => n.id === selectedNumberId)?.phoneNumber ?? ""}`
        : "Select type & number";
      case 2: return step2Done ? "Template selected" : "Choose a message template";
      case 3: return step3Done ? `${selectedContactIds.size} contacts` : "Select your audience";
      case 4: return step4Done ? (scheduleType === "immediately" ? "Send immediately" : scheduledAt) : "Set schedule";
      case 5: return `${flowNodes.filter(n => n.enabled).length} active rules`;
      case 6: return retryEnabled ? `${retryPattern} retries` : "Disabled";
      case 7: return [trackUtm && "UTM", trackEvents && "Events"].filter(Boolean).join(" + ") || "Not configured";
      case 8: return fallbackEnabled ? "Enabled" : "Disabled";
      default: return "";
    }
  };

  const templateName = selectedTemplateId ? "Selected Template" : null;

  return (
    <div className="space-y-0">
      <CampaignTopBar
        campaignName={campaignName}
        onNameChange={setCampaignName}
        canLaunch={canLaunch}
        onLaunch={handleLaunch}
      />

      <div className="grid lg:grid-cols-[1fr,360px] gap-6 max-w-[1440px] mx-auto">
        {/* Left: Accordion Steps */}
        <div className="space-y-3">
          {stepConfig.map((step) => {
            const isOpen = openStep === step.num;
            const isDone = step.num === 1 ? step1Done : step.num === 2 ? step2Done : step.num === 3 ? step3Done : step.num === 4 ? step4Done : false;

            return (
              <div key={step.num} className="bg-card border border-border/50 rounded-xl overflow-hidden">
                <StepHeader
                  stepNumber={step.num}
                  title={`${step.num}. ${step.title}`}
                  subtitle={getSubtitle(step.num)}
                  isActive={isOpen}
                  isDone={isDone}
                  onClick={() => setOpenStep(isOpen ? 0 : step.num)}
                />
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-border/30 pt-4">
                    {step.num === 1 && (
                      <Step1CampaignType
                        campaignType={campaignType}
                        onChange={setCampaignType}
                        selectedNumberId={selectedNumberId}
                        onNumberChange={setSelectedNumberId}
                        numbers={waNumbers}
                        loadingNumbers={loadingNumbers}
                        onNext={() => { setStep1Done(true); setOpenStep(2); }}
                      />
                    )}
                    {step.num === 2 && (
                      <Step2Template
                        selectedTemplateId={selectedTemplateId}
                        templateBody={templateBody}
                        onSelect={(id, body, isSample) => {
                          setSelectedTemplateId(id);
                          setTemplateBody(body);
                          setIsSampleTemplate(isSample);
                        }}
                        onBodyChange={setTemplateBody}
                        onNext={() => { setStep2Done(true); setOpenStep(3); }}
                      />
                    )}
                    {step.num === 3 && (
                      <Step3Audience
                        selectedContactIds={selectedContactIds}
                        onToggleContact={toggleContact}
                        onNext={() => { setStep3Done(true); setOpenStep(4); }}
                      />
                    )}
                    {step.num === 4 && (
                      <Step4Schedule
                        scheduleType={scheduleType}
                        onScheduleChange={setScheduleType}
                        scheduledAt={scheduledAt}
                        onScheduledAtChange={setScheduledAt}
                        campaignName={campaignName}
                        campaignType={campaignType}
                        templateName={templateName}
                        contactCount={selectedContactIds.size}
                        canLaunch={canLaunch}
                        onLaunch={handleLaunch}
                      />
                    )}
                    {step.num === 5 && (
                      <Step5ReplyFlows flowNodes={flowNodes} onChange={setFlowNodes} />
                    )}
                    {step.num === 6 && (
                      <Step6Retries
                        retryEnabled={retryEnabled}
                        onRetryEnabledChange={setRetryEnabled}
                        retryPattern={retryPattern}
                        onRetryPatternChange={setRetryPattern}
                      />
                    )}
                    {step.num === 7 && (
                      <Step7Tracking
                        trackUtm={trackUtm}
                        onTrackUtmChange={setTrackUtm}
                        trackEvents={trackEvents}
                        onTrackEventsChange={setTrackEvents}
                      />
                    )}
                    {step.num === 8 && (
                      <Step8Fallback
                        retryEnabled={retryEnabled}
                        fallbackEnabled={fallbackEnabled}
                        onFallbackEnabledChange={setFallbackEnabled}
                      />
                    )}
                  </div>
                )}

                {/* Advanced label for steps 5-8 */}
                {step.num === 5 && !isOpen && openStep < 5 && (
                  <div className="px-4 pb-2">
                    <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Advanced Settings</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: Phone Preview */}
        <CampaignPhonePreview
          templateBody={templateBody}
          templateName={templateName || undefined}
        />
      </div>

      {/* Floating Help */}
      <button className="fixed bottom-6 right-6 bg-[hsl(240,60%,55%)] hover:bg-[hsl(240,60%,50%)] text-white rounded-full px-4 py-2.5 shadow-lg flex items-center gap-2 z-50 transition-colors">
        <HelpCircle className="w-4 h-4" />
        <span className="text-sm font-medium">Help</span>
      </button>
    </div>
  );
};

export default WHCreateCampaign;
