-- Custom WhatsApp templates: a workspace-level library, not just the shipped presets.
--
-- Until now a binding always pointed at one of three constants in
-- constants/whatsappTemplatePresets.js, so the wording lived in code and the row
-- only needed a presetId. A template someone writes (or has drafted for them) has
-- no constant to point at, so it carries its own wording here.
--
-- Written by hand and kept additive on purpose. Every column is nullable or has a
-- default, so existing rows need no backfill, and IF NOT EXISTS makes the whole
-- thing safe to re-run.

ALTER TABLE "WhatsAppTemplateBinding" ADD COLUMN IF NOT EXISTS "origin"          TEXT NOT NULL DEFAULT 'preset';
ALTER TABLE "WhatsAppTemplateBinding" ADD COLUMN IF NOT EXISTS "label"           TEXT;
ALTER TABLE "WhatsAppTemplateBinding" ADD COLUMN IF NOT EXISTS "bodyText"        TEXT;
ALTER TABLE "WhatsAppTemplateBinding" ADD COLUMN IF NOT EXISTS "placeholders"    JSONB;
ALTER TABLE "WhatsAppTemplateBinding" ADD COLUMN IF NOT EXISTS "category"        TEXT;
-- Added now, while the table is already being altered, so the eventual
-- archive/delete feature does not need a second migration against a live table.
ALTER TABLE "WhatsAppTemplateBinding" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

-- presetId becomes nullable: a custom template has no preset to name.
--
-- The existing UNIQUE(workspaceId, presetId) is deliberately left in place.
-- Postgres treats every NULL as distinct, so it goes completely inert for custom
-- rows while still guaranteeing one row per preset — which is what stops the same
-- preset being submitted to Meta twice.
ALTER TABLE "WhatsAppTemplateBinding" ALTER COLUMN "presetId" DROP NOT NULL;

-- The real duplicate guard for the library, covering both origins. Sends resolve a
-- template by name + language (ChatFlow's sendPublicMessage does a findFirst on
-- exactly that), so two rows sharing them would make the sender ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppTemplateBinding_workspaceId_chatflowName_language_key"
  ON "WhatsAppTemplateBinding"("workspaceId", "chatflowName", "language");
