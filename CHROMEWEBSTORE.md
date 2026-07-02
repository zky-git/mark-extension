# Chrome Web Store Listing — MarkBuddy

> Last Updated: 2026-07-02

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
• Side Panel Organizer — View saved pages, highlights, tags, notes, and reminder status in a side panel.
• Auto-Restore — Highlights are automatically re-applied when you visit the webpage again.
• Light Recovery — If page text shifts slightly, MarkBuddy can recover highlights from the saved text snapshot.
• Optional Rediscovery Reminders — Add only important highlights to a lightweight SM-2 reminder queue.
• Due Count Badges — See how many highlights are ready to revisit on the extension icon and floating page trigger.
• Markdown Export — Export all, filtered, or single-page highlights to Markdown for note apps.
• JSON Backup — Back up and restore local MarkBuddy data.
• Keyboard Shortcuts — Open the side panel or save the current selection quickly.
• Domain Grouping — Group saved highlights and bookmarks by website domains for easier navigation.

HOW TO USE
1. Click the extension icon or press Alt+Shift+M to open the MarkBuddy side panel.
2. Select text on a webpage, then use the floating toolbar, right-click menu, or Alt+Shift+H to save a highlight.
3. Use the side panel to search, filter, add notes, jump back to the source, revisit selected highlights, or export your data.

PRIVACY
All your data (bookmarks, highlights, notes, colors, reminder state, and settings) is stored locally on your device using Chrome's extension storage API. We do not collect, transmit, or share your personal data or browsing history with third parties or external servers.

PERMISSIONS
• "sidePanel" — Needed to display the side panel where you organize highlights.
• "storage" — Needed to save your highlights and bookmarks locally.
• "tabs" — Needed to get the current tab's URL and title to save/restore highlights.
• "contextMenus" — Needed to add the "Highlight" option to your right-click context menu.
• "scripting" — Needed to apply highlights to the text on webpages.
• "activeTab" — Needed to temporarily access the current tab when you perform a highlight action.
• "webNavigation" — Needed to detect single-page app route changes and restore highlights after navigation.
• "alarms" — Needed to refresh due-highlight reminder badges periodically.
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
- **Screenshot 1**: Side panel open on a highlighted article, demonstrating search, tags, notes, and source jump.
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
| `<all_urls>` | content_scripts.matches | Runs the content script on webpages so saved highlights can be restored when the user returns. |
| `commands` | manifest key | Defines keyboard shortcuts. This is not a permissions entry. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

*(MarkBuddy stores all bookmarks and highlights locally. No data is sent to external servers.)*

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
| 1.2.0 | 2026-07-02 | Aligns the product around find-back reading workflows, adds Markdown export, JSON backup/restore, opt-in rediscovery reminders, due-count badges, light highlight recovery, and keyboard shortcuts. | Draft |
| 1.1.0 | 2026-06-29 | Adds SM-2 review mode, SPA highlight restoration, sorting, slide-over settings, and custom confirmation dialogs. | Draft |
| 1.0.0 | 2026-06-28 | Initial Release of MarkBuddy. | Superseded draft |

## Review Notes

### Known Issues / Limitations
- None.
