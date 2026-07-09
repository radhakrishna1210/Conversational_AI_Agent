-- CreateTable: ContactSubmission
CREATE TABLE IF NOT EXISTS "ContactSubmission" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "email"       TEXT NOT NULL,
    "phone"       TEXT NOT NULL,
    "callVolume"  TEXT NOT NULL,
    "helpWith"    TEXT NOT NULL,
    "useCase"     TEXT NOT NULL,
    "heardAbout"  TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AppointmentBooking
CREATE TABLE IF NOT EXISTS "AppointmentBooking" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "email"       TEXT NOT NULL,
    "phone"       TEXT NOT NULL,
    "projectType" TEXT NOT NULL,
    "role"        TEXT NOT NULL,
    "reason"      TEXT NOT NULL,
    "callVolume"  TEXT NOT NULL,
    "userType"    TEXT NOT NULL,
    "industry"    TEXT NOT NULL,
    "useCase"     TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ReportIssue
CREATE TABLE IF NOT EXISTS "ReportIssue" (
    "id"            TEXT NOT NULL,
    "issueTitle"    TEXT NOT NULL,
    "description"   TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportIssue_pkey" PRIMARY KEY ("id")
);
