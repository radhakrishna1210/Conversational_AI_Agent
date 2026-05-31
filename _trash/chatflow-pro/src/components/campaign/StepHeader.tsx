import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepHeaderProps {
  stepNumber: number;
  title: string;
  subtitle: string;
  isActive: boolean;
  isDone: boolean;
  onClick: () => void;
}

const StepHeader = ({ stepNumber, title, subtitle, isActive, isDone, onClick }: StepHeaderProps) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 py-4 text-left hover:bg-muted/20 transition-colors rounded-lg px-2"
  >
    <div
      className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shrink-0",
        isDone
          ? "bg-primary text-primary-foreground"
          : isActive
          ? "bg-primary/20 text-primary border-2 border-primary"
          : "bg-muted text-muted-foreground"
      )}
    >
      {isDone ? <Check className="w-4 h-4" /> : stepNumber}
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-display font-semibold text-foreground text-sm">{title}</p>
      <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
    </div>
  </button>
);

export default StepHeader;
