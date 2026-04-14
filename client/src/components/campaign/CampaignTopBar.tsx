import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Rocket } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface CampaignTopBarProps {
  campaignName: string;
  onNameChange: (name: string) => void;
  canLaunch: boolean;
  onLaunch: () => void;
}

const CampaignTopBar = ({ campaignName, onNameChange, canLaunch, onLaunch }: CampaignTopBarProps) => {
  const navigate = useNavigate();

  return (
    <div className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b border-border/50 -mx-6 -mt-6 px-6 py-3 mb-6">
      <div className="flex items-center justify-between max-w-[1440px] mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Input
            value={campaignName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Enter Campaign Name"
            className="w-[280px] bg-muted/50 border-border/50 font-display font-semibold"
          />
          <Badge variant="outline" className="border-border/50 text-muted-foreground text-xs">
            Balance Needed: --
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-primary/30 text-primary hover:bg-primary/10">
            <Save className="w-3 h-3 mr-1" /> Save as Draft
          </Button>
          <Button
            size="sm"
            disabled={!canLaunch}
            onClick={onLaunch}
            className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
          >
            <Rocket className="w-3 h-3 mr-1" /> Go Live
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CampaignTopBar;
