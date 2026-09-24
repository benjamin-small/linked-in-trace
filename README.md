# linked-in-trace

linked-in-trace is a Chrome extension that automatically saves a copy of every
LinkedIn profile you look at onto your own computer. Its purpose is to build a
private, dated history without uploading the captured profiles to another
service.

## What it does

- Every time you open someone's LinkedIn profile, it saves a complete copy of
  that page — text and photos — to your computer. You don't have to do
  anything; it happens on its own.
- Copies go into your **Downloads** folder, inside a folder called
  **linkedin-profiles**. Each file is named after the person and the date,
  for example: `jane-doe-123abc_2026-08-28.mhtml`.
- It saves **one copy per person per day**. Looking at the same profile twice
  in one day does not create a duplicate. Looking again next week saves a
  fresh copy — so over time you build a dated history.
- To read a saved copy later, double-click the file. It opens in Chrome and
  looks just like the real page. You can search the text with Ctrl+F
  (Cmd+F on Mac).
- Everything stays on your computer. Nothing is uploaded or shared with
  anyone.

## How to install it

You need Google Chrome 116 or newer.

1. Download the newest version from
   <https://github.com/benjamin-small/linked-in-trace/releases/latest> —
   under **Assets**, click the file ending in `.zip`.
2. Unzip it (usually just double-click the downloaded file). You get a
   folder called **linked-in-trace**. Move that folder somewhere permanent,
   like your Documents folder. **Important: don't move or delete this folder
   afterwards** — Chrome runs the add-on straight from it.
3. Open Chrome. Click in the address bar, type `chrome://extensions` and
   press Enter.
4. In the top-right corner, turn ON the switch called **Developer mode**.
5. Three new buttons appear top-left. Click **Load unpacked**.
6. In the window that opens, select the **linked-in-trace** folder and click
   **Select** (or **Open**).
7. That's it. The add-on now appears in the list. To see its icon all the
   time: click the puzzle-piece icon to the right of the address bar, then
   click the pin next to "linked-in-trace".

To check it works: log in to LinkedIn and open anyone's profile. The page
will briefly scroll down and back by itself — that's normal, it's making
sure everything has loaded. A small **✓** flashes on the icon, and the file
appears in Downloads → linkedin-profiles.

## Usage

You don't need to do anything. The little marks on the icon mean:

- **✓** — profile saved.
- **✗** — saving failed this time. It will try again the next time you open
  that profile.
- **OFF** — saving is paused.

**To pause or resume saving:** click the icon once. (OFF appears when
paused.)

**To remove it completely:** go to `chrome://extensions`, find
linked-in-trace, click **Remove**.

Good to know: if you've told Chrome to put downloads somewhere other than
the Downloads folder, the linkedin-profiles folder will be there instead.

## For developers

Development requires Node.js 22 or newer. Run `npm ci`, then `npm test`; the
readiness tests run under jsdom. There is no build step—edit files and select
**Reload** on `chrome://extensions`.

Use `npm run coverage` for the measured report. See
[`docs/testing.md`](docs/testing.md) for current coverage and test scope,
[`docs/configuration.md`](docs/configuration.md) for stored settings and
permissions, and [`docs/licensing.md`](docs/licensing.md) for the current
licensing status. The design is documented in
`docs/superpowers/specs/2026-08-27-linkedin-capture-extension-design.md`.
