import {
  Home, FileText, Send, Users, MessageSquare, Zap,
  BarChart3, Smartphone, Key, Settings, MessageCircle, Database,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Home", url: "/dashboard", icon: Home },
  { title: "Templates", url: "/dashboard/templates", icon: FileText },
  { title: "Campaigns", url: "/dashboard/campaigns", icon: Send },
  { title: "Contacts", url: "/dashboard/contacts", icon: Users },
  { title: "Inbox", url: "/dashboard/inbox", icon: MessageSquare },
  { title: "Automation", url: "/dashboard/automation", icon: Zap },
  { title: "Analytics", url: "/dashboard/analytics", icon: BarChart3 },
  { title: "Number Setup", url: "/dashboard/number-setup", icon: Smartphone },
  { title: "API Management", url: "/dashboard/api", icon: Key },
  { title: "Settings", url: "/dashboard/settings", icon: Settings },
  { title: "Number Pool", url: "/dashboard/admin/pool", icon: Database },
];

export function DashboardSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarContent className="bg-sidebar">
        <div className={`p-4 flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
          <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && <span className="font-display font-bold text-foreground">WhaBridge</span>}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground/60 text-[10px] uppercase tracking-widest">
            {!collapsed && "WhatsApp"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="hover:bg-sidebar-accent/50 text-sidebar-foreground"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
