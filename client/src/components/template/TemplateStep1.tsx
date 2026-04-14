import { ChevronDown, Tag, Bell, Shield, LayoutTemplate, Type, ShoppingCart, GalleryHorizontal, BookOpen, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category, TemplateType } from "@/pages/wh/WHCreateTemplate";

const categories: { key: Category; icon: typeof Tag; label: string }[] = [
  { key: "Marketing", icon: Tag, label: "Marketing" },
  { key: "Utility", icon: Bell, label: "Utility" },
  { key: "Authentication", icon: Shield, label: "Authentication" },
];

const templateTypes: { key: TemplateType; icon: typeof Type; title: string; desc: string }[] = [
  { key: "buttons", icon: LayoutTemplate, title: "Template with Buttons", desc: "Quick Reply, URL, Copy Code etc" },
  { key: "simple", icon: Type, title: "Simple template", desc: "Header / body / footer only" },
  { key: "checkout", icon: ShoppingCart, title: "WhatsApp Pay Checkout", desc: "Customers can pay via message" },
  { key: "carousel", icon: GalleryHorizontal, title: "Carousel", desc: "Images/videos carousel" },
  { key: "catalog", icon: BookOpen, title: "Catalog", desc: "Connect product catalog" },
  { key: "form", icon: FileText, title: "Template with Form", desc: "Capture customer data / surveys" },
];

interface Props {
  category: Category;
  onCategoryChange: (c: Category) => void;
  templateType: TemplateType;
  onTemplateTypeChange: (t: TemplateType) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const TemplateStep1 = ({ category, onCategoryChange, templateType, onTemplateTypeChange, isOpen, onToggle }: Props) => (
  <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
    <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors">
      <p className="font-display font-semibold text-foreground text-sm">Step 1: Category & Type</p>
      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
    </button>
    {isOpen && (
      <div className="px-5 pb-5 space-y-5 border-t border-border/30 pt-4">
        {/* Category */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Template Category</p>
          <div className="flex gap-2">
            {categories.map((c) => (
              <button
                key={c.key}
                onClick={() => onCategoryChange(c.key)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full border text-sm transition-all",
                  category === c.key
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border/50 text-muted-foreground hover:border-border"
                )}
              >
                <c.icon className="w-3.5 h-3.5" />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Type */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Template Type</p>
          <div className="space-y-2">
            {templateTypes.map((t) => (
              <button
                key={t.key}
                onClick={() => onTemplateTypeChange(t.key)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                  templateType === t.key
                    ? "border-primary bg-primary/5"
                    : "border-border/50 hover:border-border"
                )}
              >
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", templateType === t.key ? "bg-primary/20" : "bg-muted")}>
                  <t.icon className={cn("w-4 h-4", templateType === t.key ? "text-primary" : "text-muted-foreground")} />
                </div>
                <div className="flex-1">
                  <p className={cn("text-sm font-medium", templateType === t.key ? "text-foreground" : "text-muted-foreground")}>{t.title}</p>
                  <p className="text-[11px] text-muted-foreground">{t.desc}</p>
                </div>
                <div className={cn("w-4 h-4 rounded-full border-2 shrink-0", templateType === t.key ? "border-primary bg-primary" : "border-muted-foreground/30")} />
              </button>
            ))}
          </div>
        </div>
      </div>
    )}
  </div>
);

export default TemplateStep1;
