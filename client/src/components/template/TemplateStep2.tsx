import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, X, Plus, Minus, Upload, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TemplateType, HeaderType, UrlButton } from "@/lib/types";

const langMap: Record<string, string> = { en: "English", hi: "Hindi", ta: "Tamil", te: "Telugu", mr: "Marathi" };
const headerOptions: HeaderType[] = ["None", "Text", "Image", "Video", "Document"];

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  templateName: string;
  onTemplateNameChange: (v: string) => void;
  selectedLangs: string[];
  onRemoveLang: (l: string) => void;
  activeLang: string;
  onActiveLangChange: (l: string) => void;
  headerType: HeaderType;
  onHeaderTypeChange: (h: HeaderType) => void;
  headerText: string;
  onHeaderTextChange: (v: string) => void;
  bodyText: string;
  onBodyTextChange: (v: string) => void;
  footerText: string;
  onFooterTextChange: (v: string) => void;
  templateType: TemplateType;
  couponEnabled: boolean;
  onCouponEnabledChange: (v: boolean) => void;
  couponText: string;
  onCouponTextChange: (v: string) => void;
  urlEnabled: boolean;
  onUrlEnabledChange: (v: boolean) => void;
  urlButtons: UrlButton[];
  onUrlButtonsChange: (v: UrlButton[]) => void;
  phoneEnabled: boolean;
  onPhoneEnabledChange: (v: boolean) => void;
  phoneNumber: string;
  onPhoneNumberChange: (v: string) => void;
  quickReplies: string[];
  onQuickRepliesChange: (v: string[]) => void;
  totalButtons: number;
  formFields: string[];
  onFormFieldsChange: (v: string[]) => void;
}

const TemplateStep2 = (props: Props) => {
  const {
    isOpen, onToggle, templateName, onTemplateNameChange,
    selectedLangs, onRemoveLang, activeLang, onActiveLangChange,
    headerType, onHeaderTypeChange, headerText, onHeaderTextChange,
    bodyText, onBodyTextChange, footerText, onFooterTextChange,
    templateType,
    couponEnabled, onCouponEnabledChange, couponText, onCouponTextChange,
    urlEnabled, onUrlEnabledChange, urlButtons, onUrlButtonsChange,
    phoneEnabled, onPhoneEnabledChange, phoneNumber, onPhoneNumberChange,
    quickReplies, onQuickRepliesChange, totalButtons,
    formFields, onFormFieldsChange,
  } = props;

  const addUrlButton = () => {
    if (totalButtons >= 10) return;
    onUrlButtonsChange([...urlButtons, { id: Date.now().toString(), urlType: "static", url: "", buttonText: "" }]);
  };

  const removeUrlButton = (id: string) => {
    if (urlButtons.length <= 1) return;
    onUrlButtonsChange(urlButtons.filter((b) => b.id !== id));
  };

  const updateUrlButton = (id: string, patch: Partial<UrlButton>) => {
    onUrlButtonsChange(urlButtons.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const addQuickReply = () => {
    if (totalButtons >= 10) return;
    onQuickRepliesChange([...quickReplies, ""]);
  };

  return (
    <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors">
        <p className="font-display font-semibold text-foreground text-sm">Step 2: Name, Language & Content</p>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="px-5 pb-5 space-y-5 border-t border-border/30 pt-4">
          {/* Name + Language row */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground text-xs mb-1 block">Template Name</Label>
              <Input
                value={templateName}
                onChange={(e) => onTemplateNameChange(e.target.value)}
                placeholder="e.g. welcome_message"
                className="bg-muted/50 border-border/50"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Only lowercase letters, numbers, underscores</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs mb-1 block">Languages</Label>
              <div className="flex flex-wrap gap-1.5 p-2 border border-border/50 rounded-lg bg-muted/50 min-h-[40px]">
                {selectedLangs.map((l) => (
                  <Badge key={l} variant="outline" className="border-primary/30 text-primary text-xs gap-1">
                    {langMap[l] || l}
                    {selectedLangs.length > 1 && (
                      <button onClick={() => onRemoveLang(l)}><X className="w-3 h-3" /></button>
                    )}
                  </Badge>
                ))}
                <span className="text-xs text-muted-foreground/50 self-center">Add more languages ▾</span>
              </div>
            </div>
          </div>

          {/* Language tabs */}
          <div className="flex gap-0 border-b border-border/30">
            {selectedLangs.map((l) => (
              <button
                key={l}
                onClick={() => onActiveLangChange(l)}
                className={cn(
                  "px-4 py-2 text-xs font-medium border-b-2 transition-colors",
                  activeLang === l ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {langMap[l] || l}
              </button>
            ))}
          </div>

          {/* Header */}
          <div>
            <p className="text-sm font-medium text-foreground mb-1">Header <span className="text-muted-foreground text-xs font-normal">(Optional)</span></p>
            <p className="text-[11px] text-muted-foreground mb-2">Add a header to your template</p>
            <div className="flex gap-2 flex-wrap">
              {headerOptions.map((h) => (
                <label key={h} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="headerType" checked={headerType === h} onChange={() => onHeaderTypeChange(h)} className="accent-[hsl(var(--primary))]" />
                  <span className="text-xs text-muted-foreground">{h}</span>
                </label>
              ))}
            </div>
            {headerType === "Text" && (
              <div className="mt-2">
                <Input
                  value={headerText}
                  onChange={(e) => e.target.value.length <= 60 && onHeaderTextChange(e.target.value)}
                  placeholder="Header text"
                  className="bg-muted/50 border-border/50"
                />
                <p className="text-[10px] text-muted-foreground text-right">{headerText.length}/60</p>
              </div>
            )}
            {(headerType === "Image" || headerType === "Video" || headerType === "Document") && (
              <div className="mt-2 border-2 border-dashed border-border/50 rounded-xl p-6 text-center cursor-pointer hover:border-primary/30 transition-colors">
                <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Click to upload {headerType.toLowerCase()} file</p>
              </div>
            )}
          </div>

          {/* Body */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <p className="text-sm font-medium text-foreground">Body <span className="text-destructive">*</span></p>
            </div>
            <Textarea
              value={bodyText}
              onChange={(e) => e.target.value.length <= 1024 && onBodyTextChange(e.target.value)}
              placeholder="Enter your message body..."
              className="bg-muted/50 border-border/50 min-h-[110px] resize-y"
            />
            <p className="text-[10px] text-muted-foreground text-right">{bodyText.length}/1024</p>
          </div>

          {/* Footer */}
          <div>
            <p className="text-sm font-medium text-foreground mb-1">Footer <span className="text-muted-foreground text-xs font-normal">(Optional)</span></p>
            <Input
              value={footerText}
              onChange={(e) => e.target.value.length <= 60 && onFooterTextChange(e.target.value)}
              placeholder="e.g. Not interested? Tap Stop promotions"
              className="bg-muted/50 border-border/50"
            />
            <p className="text-[10px] text-muted-foreground text-right">{footerText.length}/60</p>
          </div>

          {/* Buttons section */}
          {templateType === "buttons" && (
            <div className="space-y-4 pt-2 border-t border-border/30">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Buttons</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Info className="w-3 h-3" />
                  Total buttons cannot exceed 10 — <span className="text-primary font-semibold">{totalButtons}/10</span>
                </div>
              </div>

              {/* Coupon Code */}
              <div className="border border-border/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">Coupon Code</p>
                  <button onClick={() => onCouponEnabledChange(!couponEnabled)}>
                    {couponEnabled ? (
                      <div className="w-5 h-5 rounded bg-primary flex items-center justify-center"><span className="text-primary-foreground text-xs">✓</span></div>
                    ) : (
                      <div className="w-5 h-5 rounded bg-destructive/20 flex items-center justify-center"><Minus className="w-3 h-3 text-destructive" /></div>
                    )}
                  </button>
                </div>
                {couponEnabled && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-primary/30 text-primary text-[10px] whitespace-nowrap">Copy Code</Badge>
                    <div className="flex-1 relative">
                      <Input
                        value={couponText}
                        onChange={(e) => e.target.value.length <= 15 && onCouponTextChange(e.target.value)}
                        placeholder="Coupon code"
                        className="bg-muted/50 border-border/50 pr-12"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{couponText.length}/15</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Website URL */}
              <div className="border border-border/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">Website URL</p>
                  <button onClick={() => onUrlEnabledChange(!urlEnabled)}>
                    {urlEnabled ? (
                      <div className="w-5 h-5 rounded bg-primary flex items-center justify-center"><span className="text-primary-foreground text-xs">✓</span></div>
                    ) : (
                      <div className="w-5 h-5 rounded bg-destructive/20 flex items-center justify-center"><Minus className="w-3 h-3 text-destructive" /></div>
                    )}
                  </button>
                </div>
                {urlEnabled && (
                  <>
                    {urlButtons.map((btn) => (
                      <div key={btn.id} className="space-y-2 p-2 rounded-lg bg-muted/20">
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <Label className="text-[10px] text-muted-foreground">URL Type</Label>
                            <div className="flex gap-1 mt-1">
                              {(["static", "dynamic"] as const).map((t) => (
                                <button
                                  key={t}
                                  onClick={() => updateUrlButton(btn.id, { urlType: t })}
                                  className={cn(
                                    "px-3 py-1 rounded text-xs border transition-colors",
                                    btn.urlType === t ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                                  )}
                                >
                                  {t.charAt(0).toUpperCase() + t.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>
                          {urlButtons.length > 1 && (
                            <button onClick={() => removeUrlButton(btn.id)} className="self-start mt-5">
                              <div className="w-5 h-5 rounded bg-destructive/20 flex items-center justify-center"><Minus className="w-3 h-3 text-destructive" /></div>
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <Input
                            value={btn.url}
                            onChange={(e) => e.target.value.length <= 2000 && updateUrlButton(btn.id, { url: e.target.value })}
                            placeholder="https://example.com"
                            className="bg-muted/50 border-border/50 pr-14"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{btn.url.length}/2000</span>
                        </div>
                        <button className="text-primary text-[11px] hover:underline">+ Add UTM Parameters</button>
                        <div className="relative">
                          <Input
                            value={btn.buttonText}
                            onChange={(e) => e.target.value.length <= 25 && updateUrlButton(btn.id, { buttonText: e.target.value })}
                            placeholder="Button text"
                            className="bg-muted/50 border-border/50 pr-12"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{btn.buttonText.length}/25</span>
                        </div>
                      </div>
                    ))}
                    {totalButtons < 10 && (
                      <button onClick={addUrlButton} className="text-primary text-xs hover:underline">
                        + Add Another Website URL
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Phone Number */}
              <div className="border border-border/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">Phone Number</p>
                  <button onClick={() => onPhoneEnabledChange(!phoneEnabled)}>
                    {phoneEnabled ? (
                      <div className="w-5 h-5 rounded bg-primary flex items-center justify-center"><span className="text-primary-foreground text-xs">✓</span></div>
                    ) : (
                      <div className="w-5 h-5 rounded bg-destructive/20 flex items-center justify-center"><Minus className="w-3 h-3 text-destructive" /></div>
                    )}
                  </button>
                </div>
                {phoneEnabled && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-border/50 text-muted-foreground text-xs whitespace-nowrap">+91</Badge>
                    <Input
                      value={phoneNumber}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "");
                        if (v.length <= 20) onPhoneNumberChange(v);
                      }}
                      placeholder="Phone number"
                      className="bg-muted/50 border-border/50"
                    />
                  </div>
                )}
              </div>

              {/* Quick Replies */}
              <div className="space-y-2">
                {quickReplies.map((qr, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Quick Reply {i + 1}</Label>
                    <div className="flex-1 relative">
                      <Input
                        value={qr}
                        onChange={(e) => {
                          if (e.target.value.length <= 25) {
                            const next = [...quickReplies];
                            next[i] = e.target.value;
                            onQuickRepliesChange(next);
                          }
                        }}
                        placeholder="Reply text"
                        className="bg-muted/50 border-border/50 pr-12"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{qr.length}/25</span>
                    </div>
                    <button onClick={() => onQuickRepliesChange(quickReplies.filter((_, j) => j !== i))}>
                      <div className="w-5 h-5 rounded bg-destructive/20 flex items-center justify-center"><Minus className="w-3 h-3 text-destructive" /></div>
                    </button>
                  </div>
                ))}
                {totalButtons < 10 && (
                  <button
                    onClick={addQuickReply}
                    className="w-full border-2 border-dashed border-border/50 rounded-lg py-2 text-xs text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
                  >
                    <Plus className="w-3 h-3 inline mr-1" /> Add Quick Reply
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Form fields */}
          {templateType === "form" && (
            <div className="space-y-3 pt-2 border-t border-border/30">
              <p className="text-sm font-medium text-foreground">Form Fields</p>
              {formFields.map((field, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={field} readOnly className="bg-muted/50 border-border/50" />
                  <button onClick={() => onFormFieldsChange(formFields.filter((_, j) => j !== i))}>
                    <div className="w-5 h-5 rounded bg-destructive/20 flex items-center justify-center"><Minus className="w-3 h-3 text-destructive" /></div>
                  </button>
                </div>
              ))}
              <button className="w-full border-2 border-dashed border-border/50 rounded-lg py-2 text-xs text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors">
                <Plus className="w-3 h-3 inline mr-1" /> Add Field
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TemplateStep2;
