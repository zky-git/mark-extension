# Chrome Web Store Listing — MarkBuddy

> Last Updated: 2026-06-28

## Store Listing

**Extension Name** [REQUIRED]
MarkBuddy

**Short Description** [REQUIRED]
Save bookmarks and highlight text on any webpage. Highlights are automatically restored on every visit.

**Detailed Description** [REQUIRED]
MarkBuddy is a personal reading assistant that helps you save bookmarks and highlight text on any webpage. Highlights are automatically restored on every visit.

FEATURES
• Text Highlighting — Highlight text on any page using the context menu (right-click) or keyboard shortcut.
• Highlight Color Customization — Choose from a palette of highlighting colors.
• Side Panel Organizer — View all your saved bookmarks and highlights in a neat side panel.
• Auto-Restore — Highlights are automatically re-applied to the webpage when you visit it again.
• Domain Grouping — Group saved highlights and bookmarks by website domains for easier navigation.

HOW TO USE
1. Click the extension icon to open the MarkBuddy side panel.
2. Select any text on a webpage, right-click, and choose "Highlight" to highlight it.
3. Use the side panel to see, filter, and jump back to your saved bookmarks and highlights.

PRIVACY
All your data (bookmarks, highlights, colors, settings) is stored locally on your device using Chrome's extension storage API. We do not collect, transmit, or share any of your personal data or browsing history with third parties or external servers.

PERMISSIONS
• "sidePanel" — Needed to display the side panel where you organize highlights.
• "storage" — Needed to save your highlights and bookmarks locally.
• "tabs" — Needed to get the current tab's URL and title to save/restore highlights.
• "contextMenus" — Needed to add the "Highlight" option to your right-click context menu.
• "scripting" — Needed to apply highlights to the text on webpages.
• "activeTab" — Needed to temporarily access the current tab when you perform a highlight action.
• "<all_urls>" — Needed to restore your saved highlights on any website you visit.

SUPPORT
If you have any questions or feedback, please contact us at support@example.com or open an issue on our project repository.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Saves bookmarks and highlights text on web pages, automatically restoring highlights on future visits.

**Primary Language** [REQUIRED]
Chinese (Simplified) / English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | icons/icon-128.png |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |

### Screenshot Notes
- **Screenshot 1**: Side panel open on a highlighted news article, demonstrating the highlight list and categories.
- **Screenshot 2**: Right-click context menu showing the highlight options and color settings panel.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `sidePanel` | permissions | Displays the extension UI in Chrome's side panel for side-by-side reading and annotation list management. |
| `storage` | permissions | Saves page highlights, settings, and bookmarks locally on the user's browser. |
| `tabs` | permissions | Retrieves tab URLs and titles to associate highlights with the correct page when loading. |
| `contextMenus` | permissions | Adds right-click options to highlight the currently selected text. |
| `scripting` | permissions | Injects styles and highlighting scripts into pages dynamically. |
| `activeTab` | permissions | Obtains temporary host access on user action to perform page manipulations. |
| `<all_urls>` | host_permissions | Restores highlights automatically on any webpage when the user returns. |

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
| 1.0.0 | 2026-06-28 | Initial Release of MarkBuddy. | Draft |

## Review Notes

### Known Issues / Limitations
- None.
