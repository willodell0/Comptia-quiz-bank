# Quiz bank format

A quiz bank is one `.json` file. You can import it on your phone with **All banks > Import bank file**, or build it into the app by putting it in the `banks` folder (see README.md).

## The smallest bank that works

```json
{
  "title": "My first bank",
  "questions": [
    {
      "q": "Which port does HTTPS use?",
      "o": ["443", "80", "22", "25"],
      "e": "HTTPS uses TCP 443."
    }
  ]
}
```

**The first option in `o` is always the correct answer.** The app shuffles the options each time, so they never appear in the same order.

## Question fields

| Field | Needed? | What it is |
|---|---|---|
| `q` | Yes | The question text. |
| `o` | Yes | 2 to 6 answer options. The first is correct, unless you set `a`. |
| `a` | No | Position of the correct answer (counting from 0) if you'd rather not put it first. |
| `e` | No | The explanation shown after answering. |
| `ob` | No | The objective it belongs to, e.g. `"N10 1.4"`. Questions are grouped and scored by this. |
| `m` | No | Course module number, e.g. `3`. Needs `modules` (below). |
| `l` | No | Lesson or topic name, shown as a tag. |
| `s` | No | `1` marks a scenario question. |
| `g` | No | `1` marks a question as extra or not in your notes (uses the `gap` label). |
| `id` | No | A fixed ID. Leave it out and the app makes one from the question text. |

## Bank fields (all optional except `title` and `questions`)

| Field | What it is |
|---|---|
| `id` | Short name with no spaces, e.g. `"comptia-network-plus"`. Importing a file with the same `id` replaces the old version and keeps your progress. |
| `title`, `subtitle`, `description` | Shown in the library and at the top of the bank. |
| `version` | Any text, e.g. a date. Shown in the library so you can tell versions apart. |
| `footer` | A line of small print at the bottom of the bank. |
| `codePrefix` | Added in front of objective codes on tags, e.g. `"220-"`. |
| `objectives` | Maps each `ob` code to a title: `{"N10 1.4": {"title": "Ports and protocols", "domain": "N10-1", "code": "1.4"}}`. A plain string title also works. |
| `domains` | Exam domains: `{"N10-1": {"exam": "N10-009", "code": "1.0", "name": "Networking Concepts", "weight": 23}}`. Adds the **Exam domains** tab. `weight` is the % of the exam. |
| `exams` | Mock exams: `[{"id": "N10-009", "name": "N10-009 Network+", "questions": 90, "minutes": 90, "note": "Pass mark 720 on a 100 to 900 scale."}]`. Domains with a matching `exam` are used, picked in proportion to their `weight`. `exclude` lists objectives to leave out of the mock. |
| `modules` | Course modules: `{"1": "Networking basics", "2": "Cabling"}`. Adds the **Course modules** tab. |
| `glossary` | Key terms for **Flashcards** and **Pronunciation**: `[{"term": "OSPF", "stands": "Open Shortest Path First", "sayAs": "", "speak": "", "meaning": "...", "module": 2, "objective": "N10 2.1"}]`. `sayAs` is how to say it if it's said as a word (e.g. `"PIX-ee"`); leave it empty if it's spelled out letter by letter. `speak` is optional text for the voice to read. |
| `labels` | Wording for tags: `{"gap": "Not in notes", "noModule": "Not in your notes", "module": "Module"}`. |
| `coverage` | Adds a **Coverage check** tab. See the A+ bank for an example. |

A full working example is in `docs/example-bank.json`.

## Getting Claude to write a bank

Paste something like this into a chat, with your notes attached:

> Make a quiz bank file for my Quiz Bank app from the attached notes. Use the format in BANK-FORMAT.md (attached). Use the official exam objectives as `ob` codes, add `domains` with exam weightings and an `exams` entry for a mock exam, and include a glossary of key acronyms with pronunciations. Write about 15 questions per objective, put the correct answer first in `o`, give every question an explanation, and use British English.

Attach this file too, so the format is followed exactly.
