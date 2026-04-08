import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Upload, UserPlus, Users, List, Search, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const mockContacts = [
  { id: "c1", name: "Rahul Sharma", phone: "+91 98765 43210" },
  { id: "c2", name: "Priya Patel", phone: "+91 87654 32109" },
  { id: "c3", name: "Amit Kumar", phone: "+91 76543 21098" },
  { id: "c4", name: "Sneha Reddy", phone: "+91 65432 10987" },
  { id: "c5", name: "Vikram Singh", phone: "+91 54321 09876" },
  { id: "c6", name: "Anjali Gupta", phone: "+91 43210 98765" },
  { id: "c7", name: "Rohan Mehta", phone: "+91 32109 87654" },
];

const methods = [
  { key: "csv", icon: Upload, label: "Upload CSV" },
  { key: "manual", icon: UserPlus, label: "Enter Manually" },
  { key: "segment", icon: Users, label: "Select Segment" },
  { key: "list", icon: List, label: "Select from List" },
] as const;

type Method = typeof methods[number]["key"];

interface Step3Props {
  selectedContactIds: Set<string>;
  onToggleContact: (id: string) => void;
  onNext: () => void;
}

const Step3Audience = ({ selectedContactIds, onToggleContact, onNext }: Step3Props) => {
  const [method, setMethod] = useState<Method>("list");
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const filteredContacts = mockContacts.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  return (
    <div className="space-y-4">
      {/* Method picker */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {methods.map((m) => (
          <button
            key={m.key}
            onClick={() => setMethod(m.key)}
            className={cn(
              "p-3 rounded-xl border text-center transition-all",
              method === m.key
                ? "border-primary bg-primary/5"
                : "border-border/50 hover:border-border"
            )}
          >
            <m.icon className={cn("w-5 h-5 mx-auto mb-1", method === m.key ? "text-primary" : "text-muted-foreground")} />
            <p className={cn("text-xs font-medium", method === m.key ? "text-primary" : "text-muted-foreground")}>{m.label}</p>
            <div className={cn(
              "w-3 h-3 rounded-full border-2 mx-auto mt-2",
              method === m.key ? "border-primary bg-primary" : "border-muted-foreground/30"
            )} />
          </button>
        ))}
      </div>

      {/* CSV */}
      {method === "csv" && (
        <div className="border-2 border-dashed border-border/50 rounded-xl p-8 text-center cursor-pointer hover:border-primary/30 transition-colors">
          <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-foreground font-medium">Drop CSV file or click to browse</p>
          <p className="text-xs text-muted-foreground mt-1">Required columns: name, phone</p>
        </div>
      )}

      {/* Manual */}
      {method === "manual" && (
        <div className="space-y-3 p-4 rounded-xl border border-border/50">
          <div>
            <Label className="text-muted-foreground text-xs">Name (optional)</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="John Doe" className="bg-muted/50 border-border/50" />
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Phone (required)</Label>
            <Input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value.replace(/[^\d+\s]/g, ""))}
              placeholder="+91 98765 43210"
              className="bg-muted/50 border-border/50"
            />
          </div>
          <Button size="sm" className="bg-primary/10 text-primary hover:bg-primary/20">
            <UserPlus className="w-3 h-3 mr-1" /> Add Contact
          </Button>
        </div>
      )}

      {/* Segment */}
      {method === "segment" && (
        <div className="p-8 text-center rounded-xl border border-border/50">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Segments coming soon</p>
        </div>
      )}

      {/* List */}
      {method === "list" && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts..." className="pl-9 bg-muted/50 border-border/50" />
          </div>
          <div className="max-h-[260px] overflow-y-auto space-y-1 pr-1">
            {filteredContacts.map((c) => (
              <div
                key={c.id}
                onClick={() => onToggleContact(c.id)}
                className={cn(
                  "flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors",
                  selectedContactIds.has(c.id) ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/30"
                )}
              >
                <Checkbox checked={selectedContactIds.has(c.id)} />
                <div>
                  <p className="text-sm text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.phone}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <div className="flex items-center gap-4">
          <p className="text-xs text-muted-foreground">
            <span className="text-primary font-semibold">{selectedContactIds.size}</span> contacts selected
          </p>
          <button className="text-xs text-primary flex items-center gap-1 hover:underline">
            <ExternalLink className="w-3 h-3" /> Build audience via Ads
          </button>
        </div>
        <Button size="sm" onClick={onNext} disabled={selectedContactIds.size === 0} className="bg-gradient-primary text-primary-foreground hover:opacity-90 disabled:opacity-40">
          Save & Next
        </Button>
      </div>
    </div>
  );
};

export default Step3Audience;
