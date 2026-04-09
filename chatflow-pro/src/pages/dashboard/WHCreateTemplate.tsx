import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { whapi } from "@/lib/whapi";
import TemplateStep1 from "@/components/template/TemplateStep1";
import TemplateStep2 from "@/components/template/TemplateStep2";
import TemplatePhonePreview from "@/components/template/TemplatePhonePreview";

export type Category = "Marketing" | "Utility" | "Authentication";
export type TemplateType = "buttons" | "simple" | "checkout" | "carousel" | "catalog" | "form";
export type HeaderType = "None" | "Text" | "Image" | "Video" | "Document";

export interface UrlButton {
  id: string;
  urlType: "static" | "dynamic";
  url: string;
  buttonText: string;
}

const WHCreateTemplate = () => {
  const navigate = useNavigate();

  // Step 1
  const [category, setCategory] = useState<Category>("Marketing");
  const [templateType, setTemplateType] = useState<TemplateType>("buttons");
  const [step1Open, setStep1Open] = useState(true);

  // Step 2
  const [step2Open, setStep2Open] = useState(true);
  const [templateName, setTemplateName] = useState("");
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["en"]);
  const [activeLang, setActiveLang] = useState("en");
  const [headerType, setHeaderType] = useState<HeaderType>("None");
  const [headerText, setHeaderText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [osPreview, setOsPreview] = useState<"android" | "ios">("android");

  // Button state
  const [couponEnabled, setCouponEnabled] = useState(true);
  const [couponText, setCouponText] = useState("");
  const [urlEnabled, setUrlEnabled] = useState(true);
  const [urlButtons, setUrlButtons] = useState<UrlButton[]>([
    { id: "1", urlType: "static", url: "", buttonText: "" },
  ]);
  const [phoneEnabled, setPhoneEnabled] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [quickReplies, setQuickReplies] = useState<string[]>([]);

  // Form fields
  const [formFields, setFormFields] = useState(["Full Name", "Email Address", "Phone Number"]);

  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: () => {
      const buttons = [
        ...(couponEnabled && couponText ? [{ type: "QUICK_REPLY" as const, text: couponText }] : []),
        ...(urlEnabled ? urlButtons.filter(b => b.buttonText).map(b => ({ type: "URL" as const, text: b.buttonText, url: b.url })) : []),
        ...(phoneEnabled && phoneNumber ? [{ type: "PHONE_NUMBER" as const, text: "Call Us", phone_number: phoneNumber }] : []),
        ...quickReplies.map(r => ({ type: "QUICK_REPLY" as const, text: r })),
      ];
      return whapi.post("/templates", {
        name: templateName,
        category: category.toUpperCase(),
        language: selectedLangs[0] ?? "en",
        bodyText,
        ...(headerType !== "None" && headerText ? { headerText } : {}),
        ...(footerText ? { footerText } : {}),
        ...(buttons.length > 0 ? { buttons } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template submitted for approval!");
      navigate("/dashboard/templates");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const totalButtons = (couponEnabled ? 1 : 0) + (urlEnabled ? urlButtons.length : 0) + (phoneEnabled ? 1 : 0) + quickReplies.length;
  const isValid = templateName.length >= 2 && bodyText.length > 0;

  const removeLang = (lang: string) => {
    if (selectedLangs.length <= 1) return;
    setSelectedLangs((p) => p.filter((l) => l !== lang));
    if (activeLang === lang) setActiveLang(selectedLangs.find((l) => l !== lang) || "en");
  };

  return (
    <div className="space-y-0">
      {/* Top Nav */}
      <div className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b border-border/50 -mx-6 -mt-6 px-6 py-3 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => navigate("/dashboard/templates")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="font-display text-lg font-bold text-foreground">Create New Template</h1>
            <span className="text-muted-foreground/40">|</span>
            <div className="flex items-center gap-1.5 text-primary">
              <MessageCircle className="w-4 h-4" />
              <span className="text-sm font-medium">WhatsApp</span>
            </div>
          </div>
          <Button
            disabled={!isValid || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
            className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
          >
            {submitMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Submit for Approval
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.3fr,380px] gap-6">
        {/* Left: Form */}
        <div className="space-y-4">
          <TemplateStep1
            category={category}
            onCategoryChange={setCategory}
            templateType={templateType}
            onTemplateTypeChange={setTemplateType}
            isOpen={step1Open}
            onToggle={() => setStep1Open(!step1Open)}
          />
          <TemplateStep2
            isOpen={step2Open}
            onToggle={() => setStep2Open(!step2Open)}
            templateName={templateName}
            onTemplateNameChange={(v) => setTemplateName(v.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            selectedLangs={selectedLangs}
            onRemoveLang={removeLang}
            activeLang={activeLang}
            onActiveLangChange={setActiveLang}
            headerType={headerType}
            onHeaderTypeChange={setHeaderType}
            headerText={headerText}
            onHeaderTextChange={setHeaderText}
            bodyText={bodyText}
            onBodyTextChange={setBodyText}
            footerText={footerText}
            onFooterTextChange={setFooterText}
            templateType={templateType}
            couponEnabled={couponEnabled}
            onCouponEnabledChange={setCouponEnabled}
            couponText={couponText}
            onCouponTextChange={setCouponText}
            urlEnabled={urlEnabled}
            onUrlEnabledChange={setUrlEnabled}
            urlButtons={urlButtons}
            onUrlButtonsChange={setUrlButtons}
            phoneEnabled={phoneEnabled}
            onPhoneEnabledChange={setPhoneEnabled}
            phoneNumber={phoneNumber}
            onPhoneNumberChange={setPhoneNumber}
            quickReplies={quickReplies}
            onQuickRepliesChange={setQuickReplies}
            totalButtons={totalButtons}
            formFields={formFields}
            onFormFieldsChange={setFormFields}
          />
        </div>

        {/* Right: Preview */}
        <div className="lg:sticky lg:top-24 h-fit">
          <TemplatePhonePreview
            osPreview={osPreview}
            onOsChange={setOsPreview}
            headerType={headerType}
            headerText={headerText}
            bodyText={bodyText}
            footerText={footerText}
            templateType={templateType}
            couponEnabled={couponEnabled}
            urlEnabled={urlEnabled}
            urlButtons={urlButtons}
            phoneEnabled={phoneEnabled}
            quickReplies={quickReplies}
          />
        </div>
      </div>
    </div>
  );
};

export default WHCreateTemplate;
