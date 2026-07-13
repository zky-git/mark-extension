# Chrome Web Store Listing — MarkBuddy

> Last Updated: 2026-07-12

## Store Listing

**Extension Name** [REQUIRED]
MarkBuddy

**Short Description** [REQUIRED]
Highlight useful web passages, find them later, rediscover key excerpts, and export your data.

**Detailed Description** [REQUIRED]
MarkBuddy is a browser reading companion for people who learn and research on the web. It helps you highlight useful passages, find the original source later, rediscover selected excerpts at the right time, and keep your data portable.

FEATURES
• Text Highlighting — Highlight text on any page using the floating toolbar, context menu, or keyboard shortcut.
• Find-Back Library — Search page titles, URLs, highlight text, and notes from the side panel.
• Highlight Color Customization — Choose from a palette of highlighting colors.
• Side Panel Organizer — View saved pages, highlights, tags, notes, and reminder status in a three-tab side panel.
• Auto-Restore — Highlights are automatically re-applied when you visit the webpage again.
• Light Recovery — If page text shifts slightly, MarkBuddy can recover highlights from the saved text snapshot.
• Optional Rediscovery Reminders — Add only important highlights to a lightweight SM-2 reminder queue.
• Due Count Badges — See how many highlights are ready to revisit on the Today tab, extension icon, and floating page trigger.
• Markdown Export — Export all, filtered, or single-page highlights to Markdown for note apps from the Data Assets area or each page card.
• JSON Backup — Back up and restore local MarkBuddy data.
• Optional GitHub Sync — Sync MarkBuddy data to a user-owned GitHub repository file for backup and version history, with a quick sync button when configured.
• Keyboard Shortcuts — Open the side panel or save the current selection quickly.
• Domain Grouping — Group saved highlights and bookmarks by website domains for easier navigation.

HOW TO USE
1. Click the extension icon or press Alt+Shift+M to open the MarkBuddy side panel.
2. Select text on a webpage, then use the floating toolbar, right-click menu, or Alt+Shift+H to save a highlight.
3. Use the side panel to search, filter, add notes, jump back to the source, revisit selected highlights, or manage exports from the Data Assets tab.

PRIVACY
By default, all your data (bookmarks, highlights, notes, colors, reminder state, and settings) is stored locally on your device using Chrome's extension storage API. MarkBuddy does not collect, transmit, or share your personal data or browsing history with the developer or third-party analytics services.

If you explicitly configure GitHub Sync, MarkBuddy sends the selected MarkBuddy data file to GitHub API using your own token and your chosen repository. The GitHub token and repository connection settings stay in local extension storage and are not written into the synced data file. MarkBuddy skips GitHub writes when the synced business data has not changed, avoiding empty commits caused only by export timestamps.

PERMISSIONS
• "sidePanel" — Needed to display the side panel where you organize highlights.
• "storage" — Needed to save your highlights and bookmarks locally.
• "tabs" — Needed to get the current tab's URL and title to save/restore highlights.
• "contextMenus" — Needed to add the "Highlight" option to your right-click context menu.
• "scripting" — Needed to apply highlights to the text on webpages.
• "activeTab" — Needed to temporarily access the current tab when you perform a highlight action.
• "webNavigation" — Needed to detect single-page app route changes and restore highlights after navigation.
• "alarms" — Needed to refresh due-highlight reminder badges periodically.
• "https://api.github.com/*" — Needed only for the optional GitHub Sync feature when the user chooses to upload or restore data through their own GitHub repository.
• Content script access on webpages — Needed to restore your saved highlights on websites you visit.

SUPPORT
If you have any questions or feedback, please contact us at support@example.com or open an issue on our project repository.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Saves highlighted web passages locally so users can find, revisit, rediscover, and export useful webpage excerpts.

**Primary Language** [REQUIRED]
Chinese (Simplified) / English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | icons/icon-128.png |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |

### Screenshot Notes
- **Screenshot 1**: Side panel open on a highlighted article, demonstrating search, tags, inline reminders, per-card export, notes, and source jump.
- **Screenshot 2**: Review mode showing an opt-in highlight review card.
- **Screenshot 3**: Export/backup controls showing Markdown export and JSON backup.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `sidePanel` | permissions | Displays the extension UI in Chrome's side panel for side-by-side reading and annotation list management. |
| `storage` | permissions | Saves page highlights, settings, and bookmarks locally on the user's browser. |
| `tabs` | permissions | Retrieves tab URLs and titles to associate highlights with the correct page when loading. |
| `contextMenus` | permissions | Adds right-click options to highlight the currently selected text. |
| `scripting` | permissions | Injects styles and highlighting scripts into pages dynamically. |
| `activeTab` | permissions | Obtains temporary host access on user action to perform page manipulations. |
| `webNavigation` | permissions | Detects same-tab SPA route changes so highlights can be restored after navigation. |
| `alarms` | permissions | Refreshes the due-highlight reminder count badge on a lightweight hourly schedule. |
| `https://api.github.com/*` | host_permissions | Allows optional GitHub Sync requests to read/write a MarkBuddy JSON file in the user's configured GitHub repository. |
| `<all_urls>` | content_scripts.matches | Runs the content script on webpages so saved highlights can be restored when the user returns. |
| `commands` | manifest key | Defines keyboard shortcuts. This is not a permissions entry. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

*(MarkBuddy stores all bookmarks and highlights locally by default. If the user enables GitHub Sync, MarkBuddy sends the synced JSON data file to the user's chosen GitHub repository through GitHub API. The developer does not receive this data.)*

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [RECOMMENDED]
*(Create a public file on GitHub or a static page detailing that no user data is collected or transmitted outside the local device.)*

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free

## Developer Info

**Publisher Name** [REQUIRED]
[Your Name/Developer Account Name]

**Contact Email** [REQUIRED]
[Your Email]

**Support URL / Email** [RECOMMENDED]
[Your GitHub Issues page or Support Email]

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.4.0 | 2026-07-12 | Polishes the side panel information architecture: due review count appears in the Today tab, export actions are moved out of the global tab bar, per-card export sits on the tag row, and highlight reminder/delete controls are aligned inline. | Draft |
| 1.3.0 | 2026-07-06 | Adds optional GitHub repository sync for MarkBuddy JSON data, including manual upload/restore, quick sync, token guidance, fixed sync path, no-change commit skipping, top-level sync notices, and conflict detection. | Draft |
| 1.2.0 | 2026-07-02 | Aligns the product around find-back reading workflows, adds Markdown export, JSON backup/restore, opt-in rediscovery reminders, due-count badges, light highlight recovery, and keyboard shortcuts. | Draft |
| 1.1.0 | 2026-06-29 | Adds SM-2 review mode, SPA highlight restoration, sorting, slide-over settings, and custom confirmation dialogs. | Draft |
| 1.0.0 | 2026-06-28 | Initial Release of MarkBuddy. | Superseded draft |

## Review Notes

### Known Issues / Limitations
- GitHub Sync requires users to create a GitHub repository manually before syncing. MarkBuddy does not create repositories automatically because that would require broader token permissions.
