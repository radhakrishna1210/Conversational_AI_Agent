import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, AlertTriangle, Loader2 } from "lucide-react";
import { whapi } from "@/lib/whapi";

interface Template {
  id: string;
  name: string;
  bodyText: string;
  category: string;
  status: string;
}

const categoryColors: Record<string, string> = {
  MARKETING: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  UTILITY: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  AUTHENTICATION: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

interface Step2Props {
  selectedTemplateId: string | null;
  templateBody: string;
  onSelect: (id: string, body: string, isSample: boolean) => void;
  onBodyChange: (body: string) => void;
  onNext: () => void;
}

const Step2Template = ({ selectedTemplateId, templateBody, onSelect, onBodyChange, onNext }: Step2Props) => {
  const [showPicker, setShowPicker] = useState(!selectedTemplateId);

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["templates"],
    queryFn: () => whapi.get<Template[]>("/templates"),
  });

  const approvedTemplates = templates.filter((t) => t.status === "APPROVED");
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  if (!showPicker && selectedTemplateId && selectedTemplate) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <p className="font-display font-semibold text-foreground text-sm">{selectedTemplate.name}</p>
          <Badge variant="outline" className="border-primary/30 text-primary text-xs">Approved</Badge>
        </div>

        <Textarea
          value={templateBody}
          onChange={(e) => onBodyChange(e.target.value)}
          className="bg-muted/50 border-border/50 min-h-[110px]"
          placeholder="Template body with {{1}}, {{2}} placeholders..."
        />

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowPicker(true)}>
            <ArrowLeft className="w-3 h-3 mr-1" /> Choose Another Template
          </Button>
          <Button size="sm" onClick={onNext} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
            Save & Next
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading templates...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {approvedTemplates.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <AlertTriangle className="w-8 h-8 text-warning mx-auto" />
          <p className="text-sm text-muted-foreground">No approved templates yet.</p>
          <p className="text-xs text-muted-foreground">Create and submit a template for approval first.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Approved Templates</p>
          {approvedTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => { onSelect(t.id, t.bodyText, false); setShowPicker(false); }}
              className="w-full p-3 rounded-lg border border-border/50 hover:border-primary/30 text-left transition-all"
            >
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{t.name}</p>
                <Badge variant="outline" className={`text-[10px] ${categoryColors[t.category] ?? ""}`}>{t.category}</Badge>
                <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">Approved</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.bodyText}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Step2Template;
