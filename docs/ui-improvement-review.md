# UI improvement review ledger

## Baseline

| Item | Value |
| --- | --- |
| Revision | `635aa60d` |
| Scope | Library → Old Testament books → Genesis chapters → reader |
| Viewports | Desktop 1280×800 and mobile 390×844, light appearance |
| Council | gpt-6.1-sol (UX), gpt-6-astra (visual), gpt-6.1-terra (accessibility) |
| Target score | 9 |
| Gate | Not met |
| Confirmed blockers | None |
| Peer sources accessed | 2026-11-05 UTC |

### Lowest category scores

Scores follow rubric order and record the lowest score any reviewer gave in that category.

| Rubric position | Lowest score |
| --- | --- |
| 1 | 7 |
| 2 | 7 |
| 3 | 7 |
| 4 | 7 |
| 5 | 7 |
| 6 | 7 (low confidence) |
| 7 | 7 |
| 8 | Unknown |
| 9 | Unknown |
| 10 | Unknown |
| 11 | 7 |
| 12 | Unknown |

### Evidence

Every reviewer opened all of these screenshots. Files are in `/home/jeffrey-home/.t3/userdata/browser-artifacts/`.

| Label | View | File |
| --- | --- | --- |
| E1 | Mobile library | `browser-screenshot-localhost-mw35py4z-1a233eae.png` |
| Not labeled | Mobile Old Testament | `browser-screenshot-localhost-mw35qcb7-6d7a109c.png` |
| Not labeled | Desktop Old Testament | `browser-screenshot-localhost-mw35qpja-8c38eff4.png` |
| Not labeled | Desktop Genesis chapters | `browser-screenshot-localhost-mw35rtpu-32165670.png` |
| Not labeled | Desktop reader | `browser-screenshot-localhost-mw35sils-2b48f83c.png` |
| P1 | [Bible.com Genesis 1](https://www.bible.com/bible/1/GEN.1.KJV) | `browser-screenshot-www-bible-com-mw35r3jp-54dd9bdc.png` |
| P2 | [Church of Jesus Christ Old Testament](https://www.churchofjesuschrist.org/study/scriptures/ot?lang=eng) | `browser-screenshot-www-churchofjesuschrist-org-mw35rjvd-eea1eeb4.png` |

### Findings

All three reviewers independently identified:

- The desktop Genesis picker and reader have no prominent in-content heading, only a small title at the top right.
- The reader's default line length is excessively long.
- Inactive primary navigation destinations show only icons.

Peer techniques observed are a prominent chapter heading, a bounded reading measure, and persistent context. They
inform the approach only; peer identities are not to be copied.

### Gaps not reviewed

- Dark appearance
- Keyboard use
- Zoom
- Mobile chapters and mobile reader
- Runtime states
- Timing
- Authenticated data

## Round 1 proposed fixes

These fixes do not establish a score. Scores come only from fresh review of captures taken after the change.

1. Show clear in-content book and chapter titles in the book chapter picker and reader, with one exposed `h1`.
2. Constrain the comfortable reader width while keeping explicit wide and full preferences and comparison layouts.
3. Show persistent labels in the mobile primary navigation and expanded desktop navigation.

## Fresh scores

Pending capture.
