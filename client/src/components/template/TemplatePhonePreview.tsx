import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Smartphone, Circle, ArrowLeft, Phone, MoreVertical, ExternalLink, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TemplateType, HeaderType, UrlButton } from "@/lib/types";

interface Props {
  osPreview: "android" | "ios";
  onOsChange: (os: "android" | "ios") => void;
  headerType: HeaderType;
  headerText: string;
  bodyText: string;
  footerText: string;
  templateType: TemplateType;
  urlEnabled: boolean;
  urlButtons: UrlButton[];
  phoneEnabled: boolean;
}

const TemplatePhonePreview = ({
  osPreview, onOsChange,
  headerType, headerText, bodyText, footerText,
  templateType, urlEnabled, urlButtons, phoneEnabled,
}: Props) => {
  return (
    <div className="bg-card border border-border/50 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Badge className="bg-muted text-foreground text-xs border-0">Actual Preview</Badge>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={osPreview === "android" ? "default" : "ghost"}
            className={cn("text-xs h-7", osPreview === "android" ? "bg-primary/10 text-primary" : "text-muted-foreground")}
            onClick={() => onOsChange("android")}
          >
            <Smartphone className="w-3 h-3 mr-1" /> Android
          </Button>
          <Button
            size="sm"
            variant={osPreview === "ios" ? "default" : "ghost"}
            className={cn("text-xs h-7", osPreview === "ios" ? "bg-primary/10 text-primary" : "text-muted-foreground")}
            onClick={() => onOsChange("ios")}
          >
            <Circle className="w-3 h-3 mr-1" /> iOS
          </Button>
        </div>
      </div>

      {/* Phone */}
      <div className={cn(
        "mx-auto w-[280px] border-[3px] border-[hsl(var(--border))] bg-[hsl(222,47%,4%)] overflow-hidden",
        osPreview === "ios" ? "rounded-[2.5rem]" : "rounded-[2rem]"
      )}>
        {/* Status bar */}
        <div className="h-6 bg-muted/30 flex items-center justify-between px-4">
          <span className="text-[9px] text-muted-foreground">1:42</span>
          <div className="flex gap-1">
            <div className="w-3 h-2 rounded-sm bg-muted-foreground/30" />
            <div className="w-3 h-2 rounded-sm bg-muted-foreground/30" />
          </div>
        </div>

        {/* WhatsApp header */}
        <div className="bg-[hsl(160,74%,18%)] px-3 py-2 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4 text-[hsl(var(--foreground))]" />
          <div className="w-7 h-7 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center">
            <span className="text-[9px] text-muted-foreground font-bold">AC</span>
          </div>
          <div className="flex-1">
            <p className="text-[11px] text-[hsl(var(--foreground))] font-medium">Accred</p>
          </div>
          <Phone className="w-3.5 h-3.5 text-[hsl(var(--foreground))]/70" />
          <MoreVertical className="w-3.5 h-3.5 text-[hsl(var(--foreground))]/70" />
        </div>

        {/* Chat */}
        <div className="bg-[hsl(30,15%,85%)] min-h-[440px] p-3">
          {/* Date pill */}
          <div className="flex justify-center mb-3">
            <span className="bg-[hsl(var(--card))]/70 text-[9px] text-muted-foreground px-3 py-0.5 rounded-full">Today</span>
          </div>

          {/* Message bubble */}
          <div className="bg-white rounded-lg rounded-tl-none p-3 max-w-[90%] shadow-sm">
            {/* Header */}
            {headerType === "Text" && headerText && (
              <p className="text-[11px] font-bold text-[hsl(222,47%,10%)] mb-1">{headerText}</p>
            )}
            {headerType === "Image" && (
              <div className="w-full h-28 bg-gray-200 rounded mb-2 flex items-center justify-center">
                <span className="text-[10px] text-gray-400">📷 Image</span>
              </div>
            )}
            {headerType === "Video" && (
              <div className="w-full h-28 bg-gray-200 rounded mb-2 flex items-center justify-center">
                <span className="text-[10px] text-gray-400">🎬 Video</span>
              </div>
            )}
            {headerType === "Document" && (
              <div className="flex items-center gap-2 p-2 bg-gray-100 rounded mb-2">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="text-[10px] text-gray-500">Document</span>
              </div>
            )}

            {/* Body */}
            <p className="text-[11px] text-[hsl(222,47%,10%)] leading-relaxed whitespace-pre-line">
              {bodyText || <span className="text-gray-400">Your message body will appear here...</span>}
            </p>

            {/* Footer */}
            {footerText && (
              <p className="text-[9px] text-gray-400 mt-2">{footerText}</p>
            )}

            <p className="text-[8px] text-gray-400 text-right mt-1">11:49 am</p>
          </div>

          {/* Button previews */}
          {templateType === "buttons" && (
            <div className="mt-1 space-y-0.5 -mx-1">
              {urlEnabled && urlButtons.filter(b => b.buttonText).map((b, i) => (
                <div key={i} className="bg-white rounded-lg px-3 py-2 text-center text-[11px] text-[hsl(217,91%,60%)] font-medium flex items-center justify-center gap-1 shadow-sm">
                  <ExternalLink className="w-3 h-3" /> {b.buttonText}
                </div>
              ))}
              {urlEnabled && urlButtons.filter(b => !b.buttonText).length > 0 && !urlButtons.some(b => b.buttonText) && (
                <div className="bg-white rounded-lg px-3 py-2 text-center text-[11px] text-[hsl(217,91%,60%)] font-medium flex items-center justify-center gap-1 shadow-sm">
                  <ExternalLink className="w-3 h-3" /> Explore Courses
                </div>
              )}
              {phoneEnabled && (
                <div className="bg-white rounded-lg px-3 py-2 text-center text-[11px] text-[hsl(217,91%,60%)] font-medium shadow-sm">
                  Get Fee Details
                </div>
              )}
            </div>
          )}

          {templateType === "checkout" && (
            <div className="mt-1 -mx-1">
              <div className="bg-white rounded-lg px-3 py-2 text-center text-[11px] text-[hsl(142,70%,35%)] font-medium shadow-sm">
                Proceed to Pay
              </div>
            </div>
          )}

          {templateType === "form" && (
            <div className="mt-1 -mx-1">
              <div className="bg-white rounded-lg px-3 py-2 text-center text-[11px] text-[hsl(217,91%,60%)] font-medium flex items-center justify-center gap-1 shadow-sm">
                <FileText className="w-3 h-3" /> Fill out form
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplatePhonePreview;
