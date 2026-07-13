import { MessageSquare } from "lucide-react";

export const Footer = () => (
  <footer className="border-t border-border/30 py-12 bg-background">
    <div className="container mx-auto px-4">
      <div className="grid md:grid-cols-4 gap-8 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg text-foreground">WhaBridge</span>
          </div>
          <p className="text-sm text-muted-foreground">The WhatsApp Business API platform built for revenue, not hidden fees.</p>
        </div>
        {[
          { title: "Product", links: ["Features", "Pricing", "Integrations", "API Docs", "Changelog"] },
          { title: "Solutions", links: ["E-commerce", "Education", "Healthcare", "Real Estate", "Marketing Agencies"] },
          { title: "Company", links: ["About", "Blog", "Careers", "Contact", "Privacy Policy"] },
        ].map((col) => (
          <div key={col.title}>
            <h4 className="font-display font-semibold text-foreground mb-4">{col.title}</h4>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l}>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{l}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border/30 pt-8 text-center text-xs text-muted-foreground">
        © 2026 WhaBridge. All rights reserved. Official Meta WhatsApp Business API Partner.
      </div>
    </div>
  </footer>
);
