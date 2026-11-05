Brief ingest: research on pulling email (and similar) into Hold My Brief

Research date: November 5, 2026. Status: research only. No code was changed, no mail provider was contacted, and no OAuth app was registered.

## Question

Could Hold My Brief sync in email (and similar sources such as meeting notes), then put together a brief you read in the floating window?

## Short answer

Yes, but the app should not do the syncing. Keep Hold My Brief a reader. Let something outside it write a Markdown brief into a folder, and have the reader pick that folder up and stay current. That gives you the feature with no change to the privacy promise, no OAuth review, no stored mail credentials and no summarisation model inside the app.

Building mail sync into the app is possible, but it is the most expensive option. It breaks three things the product currently promises, and Gmail's review process alone could cost more than the rest of the feature.

## What the app is today, and what that rules out

- **Local and offline by design.** The README promises "No account, no cloud, no analytics. It works offline." PRD requirement REL-01 says reading works without a network and needs no account or cloud upload. Agent setup tells installers that the app "needs no account and no network connection".
- **Locked-down shell.** The CSP's `connect-src` allows only `'self'`, `ipc:` and `http://ipc.localhost`. The Tauri capability file (`src-tauri/capabilities/main.json`) grants no filesystem, shell or HTTP permissions. Native code has no HTTP client (the only crates are `rusqlite`, `sha2`, `image`, `rfd`, `webbrowser` and `tempfile`).
- **What already helps:**
  - **Markdown rendering is safe.** `src/adapters/text.ts` uses markdown-it with `html: false`, so a generated brief can't inject markup.
  - **Folder sources exist, but only for PDFs.** `src-tauri/src/folder_index.rs` gives stable ids, keeps the source folder read-only and marks removed files as missing, but `find_pdfs` collects only PDFs. Nothing watches a folder; indexing happens when you add the folder.
  - **There is an importer pattern to reuse.** `catalog::merge_import` refreshes one scope from a source. It records an `ImportReceipt` (source id + revision) and `Provenance` on each document, and it keeps your favorites, tags, notes and personal collections across refreshes. Items gone from the source are marked removed, not deleted. That's the right behaviour for a brief that's regenerated every morning.

## Options

| | Option | How it works | Fits the product? | Main cost / risk |
|---|---|---|---|---|
| **A** | **Watched brief folder** (recommended) | Something outside the app (a Claude scheduled task with a mail connector, a script, a mail rule) writes `brief-YYYY-MM-DD.md` into a folder. Hold My Brief indexes Markdown in that folder, refreshes when files change and can open the newest one. | Yes. Read-only, offline, no account. | Small: extend `find_pdfs` to `.md`/`.txt`, add a file watcher (`notify` crate) or a refresh on focus, and add an "open latest" action. The quality of the brief depends on the outside tool. |
| B | Local mail files | You export or drag in `.eml`/`.mbox` files (Apple Mail, Thunderbird and Outlook can all save them). The app turns them into readable text and a digest. | Mostly. Still offline, but it needs an email parser and safe HTML-to-text conversion (mail HTML is hostile input). | Medium: a new parser plus sanitising. You still have to export the mail by hand, and a digest without a model is just a list. |
| C | Built-in IMAP sync | The app logs in over IMAP and pulls the most recent messages. | No. Needs network, stored credentials (OS keychain) and a sync engine. | High. Gmail IMAP now needs OAuth or an app password, app passwords require 2-Step Verification, and Workspace admins can disable them. |
| D | Built-in provider APIs (Gmail API / Microsoft Graph) | OAuth sign-in from the desktop app, then calls to the provider API. | No. Needs an account and cloud access, and breaks REL-01. | Highest. Every Gmail read scope (`gmail.readonly`, `gmail.metadata`) is *restricted*, so a public app needs full verification plus an annual CASA security assessment. Graph `Mail.Read` lets each user consent for themselves, but whether it works for personal Microsoft accounts is unconfirmed. |

The briefing step (summarising) is the same problem in options B to D: either a cloud model (which breaks "no cloud") or a local model (a large download and slow on a laptop). Option A pushes that step outside the app as well.

## Recommended shape (option A)

```
Mail / calendar / Wispr Flow notes
        │  (outside the app: Claude scheduled task + connectors, or your own script)
        ▼
~/Briefs/brief-2026-11-05.md   ← plain Markdown, with source links per item
        │  (read-only folder root, as with PDF folders today)
        ▼
Hold My Brief: "Briefs" collection → opens the newest brief, pinned, remembers your place
```

Work inside the app, smallest first:

1. **Markdown/text in folder roots.** Generalise `find_pdfs` to the formats the reader already supports. Keep `safe_relative`, read-only roots and missing-file handling.
2. **Refresh.** Re-index a root when the window gets focus or on a `notify` watch, debounced. Watching needs no new Tauri permission because it runs in native code.
3. **"Open latest" for a root.** Newest by name or modified time, available from the library and the command palette. Optionally show a small "new brief" badge.
4. **Brief conventions (optional).** Front matter such as `generated`, `sources` and `period`, shown in the footer. Per-item source links already open in the browser only when clicked.

The outside writer (Claude Gmail/Calendar connectors, the Wispr Flow meeting tools, or a script) is a separate project. It can run on a schedule and be changed without shipping a new reader.

## If built-in sync is ever wanted

- Ship it as an off-by-default "Sources" setting with its own Tauri capability, its own CSP `connect-src` entries per provider, and keychain-only credential storage. Update REL-01 and the README privacy section deliberately. Don't let it creep in.
- Start with IMAP and app passwords (no Google review) or Microsoft Graph. Leave the Gmail API until the CASA cost is justified.
- Reuse `merge_import`'s source/revision/removed semantics so that re-syncing never touches your own notes or collections.

## Open questions

- Which sources matter most: Gmail, Outlook/Exchange, Wispr Flow meetings, or calendar?
- Is a brief of links plus one-line summaries enough, or do you want the full message text available in the reader?
- Mac and Windows both? Option A's watcher works on both; options B to D add per-OS keychain work.

## Sources

- [Gmail OAuth scopes reference (Nylas)](https://developer.nylas.com/docs/cookbook/use-cases/build/google-oauth-scopes/) and [unified.to Gmail OAuth notes](https://docs.unified.to/skills/gmail-oauth-app/SKILL.md): restricted scopes and CASA. These are vendor docs; check Google's own verification pages before relying on them.
- [Gmail app password setup (Nylas CLI)](https://cli.nylas.com/guides/gmail-app-password-setup.md) and [Mailbird on 2026 Gmail OAuth changes](https://www.getmailbird.com/gmail-oauth-authentication-changes-user-guide/): IMAP needs OAuth or an app password. These sources disagree on whether personal accounts still accept legacy passwords.
- [Microsoft Graph permissions overview](https://learn.microsoft.com/nb-no/graph/permissions-overview) and [Q&A on personal-account consent](https://learn.microsoft.com/en-us/answers/questions/1189293/microsoft-graph-api-missing-permissions-scopes-on): delegated permissions, and limits for personal accounts.
