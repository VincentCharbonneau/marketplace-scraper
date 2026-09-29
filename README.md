# Marketplace Exact Match

Browser extension that filters Facebook Marketplace search results down to listings whose
title **exactly** matches the names you care about. Marketplace's own search returns
loosely related results; this dims (or hides) everything else and keeps a list of matches.

It runs in your normal browser session, so there's no separate login or bot account.

## Install (Chrome / Edge / Brave / Arc)

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick the `extension/` folder
4. Pin the extension to your toolbar

After editing the code, click the ↻ reload button on the extension card and refresh Facebook.

## Use

1. Click the extension icon → **Settings** and enter the names to match (one per line).
2. Search Marketplace as usual. Set your location, radius and price filters in Facebook's own sidebar.
3. Matching listings get a green outline; everything else is dimmed.
4. Click **Scan all** in the panel at the bottom right. It scrolls through the results until
   they run out, or until Facebook's "results from outside your search" section.
5. Click the extension icon → **Matches** to see every match with its link. New ones are
   tagged, and the toolbar badge counts new matches. **Export CSV** saves the list.

Matches are kept across searches until you click **Clear list**.

Click **–** on the panel to minimize it to a small **✓ N** pill. This pauses the dimming and
outlines so the page looks normal. Click the pill to bring the panel and filtering back.

## Matching rules

- **Must match**: case, spaces, dashes and punctuation are ignored, so `5800x3d` matches
  `Ryzen 7 5800 X3D` and `5800-x3d`, but not `5800X` or `5700X3D`.
- **Exclude**: whole words/phrases (`iso` won't exclude "comparison").
- Prefix either with `re:` to use a regex, e.g. `re:5800\s*x3d`.
- Only listing titles are checked, not descriptions.

## Files

| file | purpose |
|---|---|
| `extension/manifest.json` | extension manifest (MV3) |
| `extension/match.js` | matching + card parsing, shared by page and popup |
| `extension/content.js` | runs on facebook.com: filters cards, on-page panel, auto-scroll scan |
| `extension/popup.html/.js` | match list, CSV export, settings |
| `extension/background.js` | toolbar badge with new-match count |
