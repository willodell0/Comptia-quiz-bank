# Quiz Bank

An installable quiz app that works offline. It holds as many quiz banks as you like, and each one gets quizzes, timed mock exams, missed-question retries, flashcards and a pronunciation guide. Scores are saved on the device.

## What's in this folder

| File | What it does |
|---|---|
| `index.html` | The app page |
| `app.js` | The app itself |
| `sw.js` | Makes it work offline and handles updates |
| `manifest.webmanifest` | Tells your phone it's an installable app (name, icon, colours) |
| `icons/` | App icons |
| `banks/` | Built-in quiz banks, plus `index.json` listing them |
| `docs/example-bank.json` | A small sample bank to copy from |
| `BANK-FORMAT.md` | How to write a bank |

## Put it online with GitHub Pages (free)

1. Click **+** (top right) > **New repository**. Name it `quiz-bank`, set it to **Public**, and click **Create repository**.
2. On the new repository page, click **uploading an existing file**. Drag in **everything inside this folder** (the files and the `icons`, `banks` and `docs` folders), then click **Commit changes**. Use Chrome or Edge on a computer, as they can upload folders.
3. Go to **Settings > Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose **main** and **/ (root)**, then **Save**.
4. After a minute or two the page shows your address: `https://YOUR-USERNAME.github.io/quiz-bank/`.
5. Open that address in Chrome on your phone. Tap the menu (three dots) > **Install app** (or **Add to Home screen**).


## Adding banks

There are two ways:

- **Just on your phone:** save the `.json` file to your phone, open the app, tap **All banks > Import bank file**.
- **Built in for every device:** upload the file to the `banks` folder on GitHub and add its name to `banks/index.json`, e.g. `{"banks":["comptia-aplus-1200.json","network-plus.json"]}`.

## Updating the app

If you change `index.html`, `app.js` or the icons, change the `VERSION` line at the top of `sw.js` (any new text will do) and upload it with the other changes. Installed copies will then show **An update is ready. Reload**. Bank files in `banks/` update by themselves when the phone is online.

## Moving to a new phone

In **All banks**, tap **Save progress backup**. On the new phone, install the app and tap **Restore from backup**.
