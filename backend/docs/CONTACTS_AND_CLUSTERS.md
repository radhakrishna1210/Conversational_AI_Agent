# Contacts and clusters

The address book behind bulk calling. Campaigns dial a **cluster** (a named
list), never a file.

Before this, a bulk campaign swallowed its own CSV: the numbers went straight
into `CampaignRecipient` rows and the list ceased to exist as anything reusable.
Running the same list next month meant finding the same spreadsheet, and a
person who said "stop calling me" was only ever removed from one campaign.

---

## The model

| Table | What it is |
|---|---|
| `Contact` | One person. Unique on `(workspaceId, phoneNumber)`. |
| `ContactCluster` | A named list. Unique on `(workspaceId, name)`. |
| `ContactClusterMember` | Membership. Many-to-many. |

`Campaign.clusterIds` records what was chosen; `CampaignRecipient.contactId`
links each dialled row back to the person.

Three consequences worth stating, because they are the whole design:

1. **One row per person per workspace.** Re-importing a list updates contacts
   instead of duplicating them, so a campaign can never dial the same handset
   twice because the same number arrived on two spreadsheets.
2. **Membership is many-to-many.** A contact sits in several lists without being
   copied, which makes cross-cluster dedupe at launch a matter of counting rows
   rather than reconciling people.
3. **Status lives on the contact, not the list.** `OPTED_OUT` therefore outlives
   every list the person is on, and survives the next CSV upload.

---

## The two paths into a campaign

Both end at the same place. The CSV path just creates a cluster on the way
through.

```
Saved clusters ──┐
                 ├─→ resolveClusterContacts() ─→ CampaignRecipient rows
CSV upload ──────┘   (ACTIVE only, deduped)
   └─ importContacts() → new ContactCluster (source = CAMPAIGN_CSV)
```

The cluster an upload creates is named after the campaign by default — that is
how people look for it later — and is renameable from the Contacts page. A name
clash gets a numeric suffix rather than an error, because auto-created lists must
never fail a launch.

## Rules the dispatcher relies on

- **Recipients are a snapshot.** Editing a cluster does not change a campaign
  already built from it. `POST /campaigns/:id/sync-list` pulls in contacts added
  since, and never re-adds anyone already dialled (`skipDuplicates` on
  `(campaignId, phoneNumber)`).
- **Opt-outs are re-checked mid-flight.** One query per 50-row batch, not per
  call. Someone who opts out on call 300 is skipped at call 3,000 with
  `failureReason = contact_not_callable`.
- **Only `ACTIVE` contacts are ever dialled.** `OPTED_OUT` and `INVALID` are
  excluded at list build time *and* at dial time.

## Phone numbers

Everything reaching `Contact` goes through `lib/phone.js → toE164()` first: the
unique key depends on it, so an un-normalised write silently creates a duplicate
person. `9876543210`, `09876543210` and `+91 98765 43210` are one contact.

Bare 10-digit numbers are assumed to be Indian (`DEFAULT_COUNTRY_CODE`, default
`+91`). Unparseable rows are **rejected and reported**, never best-guessed —
a bad row in a 10,000-row upload should come back to whoever uploaded it.

## API

```
GET    /workspaces/:id/contacts            ?search&status&clusterId&page&pageSize
GET    /workspaces/:id/contacts/summary
POST   /workspaces/:id/contacts            create one
POST   /workspaces/:id/contacts/import     multipart CSV → cluster
POST   /workspaces/:id/contacts/add-to-clusters
POST   /workspaces/:id/contacts/status     the opt-out switch
POST   /workspaces/:id/contacts/delete
PATCH  /workspaces/:id/contacts/:contactId
DELETE /workspaces/:id/contacts/:contactId

GET    /workspaces/:id/clusters
GET    /workspaces/:id/clusters/preview    ?clusterIds=[...] — dedupe + opt-out counts
POST   /workspaces/:id/clusters
PATCH  /workspaces/:id/clusters/:clusterId rename / describe
DELETE /workspaces/:id/clusters/:clusterId ?deleteContacts=true (default: keeps them)
GET    /workspaces/:id/clusters/:clusterId/export
POST   /workspaces/:id/clusters/:clusterId/remove
```

`clusters/preview` is what the campaign modal reads before launch, so
"12,000 rows" and "9,140 people we may legally call" are never confused.

## Relationship to `DIALING_HYGIENE_PLAN.md`

Contact `status` is a **workspace-scoped, list-level** control: this workspace
will not call this person. `SuppressionEntry` in the hygiene plan is a
**platform-wide** one, and it is still unbuilt. They are complementary, and the
plan's phase 2 should read contact opt-outs as one of its sources rather than
replacing them.
