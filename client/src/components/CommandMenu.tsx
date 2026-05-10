import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";
import {
  Bot,
  Mic,
  Folder,
  Plug,
  Phone,
  PhoneCall,
  FileText,
  BarChart3,
  MessageCircle,
  Settings,
  CreditCard,
  Key,
} from "lucide-react";
import { loadAgents, AgentConfig } from "../lib/agentStore";

export function CommandMenu({ open, setOpen }: { open: boolean, setOpen: (open: boolean) => void }) {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setAgents(loadAgents());
    }
  }, [open]);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          
          <CommandGroup heading="Suggested">
            <CommandItem onSelect={() => runCommand(() => navigate("/dashboard"))}>
              <Bot className="mr-2 h-4 w-4" />
              <span>Create New Assistant</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/billing"))}>
              <CreditCard className="mr-2 h-4 w-4" />
              <span>Upgrade Plan</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/api_keys"))}>
              <Key className="mr-2 h-4 w-4" />
              <span>Manage API Keys</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => runCommand(() => navigate("/dashboard"))}>
              <Bot className="mr-2 h-4 w-4" />
              <span>Voice AI Assistants</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/clone_voice"))}>
              <Mic className="mr-2 h-4 w-4" />
              <span>Clone Voice</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/files"))}>
              <Folder className="mr-2 h-4 w-4" />
              <span>Files</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/integrations"))}>
              <Plug className="mr-2 h-4 w-4" />
              <span>Integrations</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Operations">
            <CommandItem onSelect={() => runCommand(() => navigate("/phone_numbers"))}>
              <Phone className="mr-2 h-4 w-4" />
              <span>Phone Numbers</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/bulk_call"))}>
              <PhoneCall className="mr-2 h-4 w-4" />
              <span>Bulk Call</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/call_logs"))}>
              <FileText className="mr-2 h-4 w-4" />
              <span>Call Logs</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/analytics"))}>
              <BarChart3 className="mr-2 h-4 w-4" />
              <span>Analytics</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Settings & Account">
            <CommandItem onSelect={() => runCommand(() => navigate("/billing"))}>
              <CreditCard className="mr-2 h-4 w-4" />
              <span>Billing</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/api_keys"))}>
              <Key className="mr-2 h-4 w-4" />
              <span>API Keys</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate("/settings"))}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </CommandItem>
          </CommandGroup>
          {agents.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Voice Assistants">
                {agents.map((agent) => (
                  <CommandItem
                    key={agent.id}
                    onSelect={() => runCommand(() => navigate(`/agent/${agent.id}`))}
                    value={`${agent.name} ${agent.language} ${agent.llm}`}
                  >
                    <div className="flex items-center w-full">
                      <Bot className="mr-2 h-4 w-4" />
                      <div className="flex flex-col">
                        <span>{agent.name}</span>
                        <span className="text-[10px] text-muted-foreground">{agent.language} • {agent.llm}</span>
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
