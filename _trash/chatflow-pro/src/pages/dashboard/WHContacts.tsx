import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, MessageSquare, Send, Filter, Columns, Loader2 } from "lucide-react";
import { whapi } from "@/lib/whapi";

interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
  email?: string;
  tags?: string[];
  optedOut: boolean;
  createdAt: string;
}

interface ContactsResponse {
  data: Contact[];
  total: number;
}

const WHContacts = () => {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const { data, isLoading } = useQuery<ContactsResponse>({
    queryKey: ["contacts", search],
    queryFn: () => whapi.get<ContactsResponse>(`/contacts${search ? `?search=${encodeURIComponent(search)}` : ""}`),
    placeholderData: (prev) => prev,
  });

  const contacts = data?.data ?? [];
  const total = data?.total ?? 0;

  const allSelected = selected.length > 0 && selected.length === contacts.length;
  const toggleAll = () => setSelected(allSelected ? [] : contacts.map((c) => c.id));
  const toggle = (id: string) => setSelected((p) => p.includes(id) ? p.filter((i) => i !== id) : [...p, id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground">{total} total contacts</p>
        </div>
        {selected.length > 0 && (
          <Button className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
            <Send className="mr-2 w-4 h-4" /> Send Notification ({selected.length})
          </Button>
        )}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/50 border-border/50"
          />
        </div>
        <Button variant="outline" size="sm" className="border-border/50 text-muted-foreground"><Filter className="w-4 h-4 mr-1" /> Filter</Button>
        <Button variant="outline" size="sm" className="border-border/50 text-muted-foreground"><Columns className="w-4 h-4 mr-1" /> Columns</Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading contacts...
        </div>
      ) : (
        <Card className="bg-card border-border/50">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="w-12">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Phone</TableHead>
                <TableHead className="text-muted-foreground">Email</TableHead>
                <TableHead className="text-muted-foreground">Created</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Tags</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {search ? "No contacts match your search." : "No contacts yet."}
                  </TableCell>
                </TableRow>
              ) : contacts.map((c) => (
                <TableRow key={c.id} className="border-border/50 hover:bg-muted/30">
                  <TableCell><Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} /></TableCell>
                  <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phoneNumber}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {c.optedOut ? (
                      <Badge variant="outline" className="text-xs border-destructive/30 text-destructive">Opted Out</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs border-primary/30 text-primary">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(c.tags ?? []).map((t) => (
                        <Badge key={t} className="text-[10px] bg-primary/10 text-primary border-primary/20">{t}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                      <MessageSquare className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
};

export default WHContacts;
