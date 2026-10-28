# Scripture text source

`sqlite/lds-scriptures-sqlite.db` is the only source of the scripture text Verse Together bundles. It is the
input to `npm run generate:scriptures`, which writes `public/scripture-data/*.json` and
`src/lib/generated/scriptureCatalog.json`.

## Upstream

- **Project:** LDS Documentation Project – The Scriptures ("LDS Scriptures – Database and Text Exports"), maintained
  by Steve Dibb ("beandog"). Project page: <https://scriptures.nephi.org/>. Repository:
  <https://github.com/beandog/lds-scriptures>.
- **Version:** release [`2020.12.08`](https://github.com/beandog/lds-scriptures/releases/tag/2020.12.08)
  (tag commit `5c2aab473422ca6e3a59f1dba4599be0db5a75e8`, published 2020-12-09). The release notes say it
  "Contains 2013 version of LDS scriptures", meaning the Church's 2013 edition.
- **File:** the upstream file is
  [`sqlite/lds-scriptures-sqlite.db`](https://github.com/beandog/lds-scriptures/blob/2020.12.08/sqlite/lds-scriptures-sqlite.db).
  The copy here is byte-identical: git blob `1b9e84b1329535f8acc5824742393eafc088614b` matches upstream at the
  tag. SHA-256 `6d183d25a64177ff79a91d43d1739d80f635e7c409aea3b65e6e035ceb84e854`, 7,820,288 bytes. It was
  added unmodified in 724ac25 (2026-03-21). Only the SQLite export was kept; upstream's other formats and its
  README weren't copied.
- **Contents:** the King James Version Old Testament (23,145 verses) and New Testament (7,957), the Book of
  Mormon (6,604), the Doctrine and Covenants sections 1–138 (3,654) and the Pearl of Great Price (635), plus
  book and volume titles and subtitles. That is 41,995 verses, matching `public/scripture-data/manifest.json`.

## License and terms

Upstream states the data is in the public domain. It publishes no LICENSE file, and GitHub detects no license.

- The repository's [`README.txt`](https://github.com/beandog/lds-scriptures/blob/2020.12.08/README.txt): "This
  project's goal is to provide open database and text export formats of scriptures in the public domain for use
  by developers." It ends: "Copyright: public domain".
- The project page FAQ: "The scriptures, original works and documentation of this project are all part of the
  public domain in the USA. Simply speaking, this means you can do whatever you'd like with everything here
  without having to ask for permission." The site footer adds: "Except where otherwise noted, content on this
  wiki is licensed under the following license: Public Domain".
- On the text itself, the FAQ says the exports leave out study aids: "The chapter headers and the Bible
  Dictionary would be considered original works, and thus subject to U.S. copyright." The project's
  [Omitted Texts](https://scriptures.nephi.org/omitted_texts) page explains: "Since they are copyrighted, they
  are not included." It lists book and chapter headers, footnotes, the Topical Guide, Bible Dictionary, Joseph
  Smith Translation, Gazetteer, maps, pronunciation guide and Book of Mormon index. It also excludes texts
  without verse numbering: the KJV Epistle Dedicatory, the Book of Mormon title page, introduction, witness
  testimonies, Testimony of the Prophet Joseph Smith and Brief Explanation, Official Declarations 1 and 2, and the
  Pearl of Great Price introductory note and Oliver Cowdery's account.
- **Attribution:** upstream doesn't ask for any. Verse Together credits it voluntarily: "Scripture text: LDS
  Scriptures database and text exports by Steve Dibb (scriptures.nephi.org), release 2020.12.08, public domain."

## Beyond upstream's statement

Upstream's public-domain statement covers the USA only. The points below were checked on 2026-10-27. They are a
record, not legal advice.

### Where the text came from

The [Import Process](https://scriptures.nephi.org/import_process) page says the text was extracted from HTML
scripture pages, with verse numbers, paragraph marks and study-note markers stripped out. It doesn't name the
site, though the markup it targets (`p.verse`, `sup.studyNoteMarker`) suggests the Church's online scriptures.

### The Church's 2013 edition

The Church publishes the edition. Its copyright notice wasn't verifiable from a primary source on 2026-10-27,
because the Church's pages render it with script. The Church's own
[summary of the 2013 adjustments](https://www.churchofjesuschrist.org/study/manual/about-the-scriptures/adjustments?lang=eng)
says: "More than 99 percent of the 2013 adjustments were made in the study helps." In the scripture text itself,
"adjustments were made to resolve minor typographical errors in spelling, wording, and punctuation," and some
spellings were updated to match recent KJV editions. The study helps are excluded from this dataset.

The underlying texts were first published between 1611 (KJV) and 1918 (D&C 138), and Official Declaration 2
(1978) isn't included. Whether the 2013 edition's small text corrections attract a separate copyright hasn't been
settled by any source found. The Church's
[terms of use](https://www.churchofjesuschrist.org/legal/terms-of-use?lang=eng) limit reposting materials "from
this site" without permission. Permission requests go to <https://permissions.churchofjesuschrist.org/>.

### King James Version in the United Kingdom

The KJV is in the public domain in most of the world. In the UK, the right to print, publish and import it is a
Crown prerogative, licensed under letters patent ([Wikipedia](https://en.wikipedia.org/wiki/King_James_Version#Copyright_status)). Cambridge University Press administers it in England, Wales
and Northern Ireland, and the Scottish Bible Board in Scotland. Cambridge's KJV copyright pages (for example
[ISBN 978-0-521-22862-6](https://assets.cambridge.org/97805212/28626/copyright/9780521228626_copyright_info.pdf))
state:

> Rights in the Authorized (King James) Version of the Bible are administered in the United Kingdom by the Crown's patentee, Cambridge University Press. Applications for permission for liturgical or non-commercial educational use up to a maximum of 500 verses (or less than a full book) not required. Other uses subject to written permission being obtained from the Permissions Department, Cambridge University Press, Cambridge CB2 8RU (www.cambridge.org).

Verse Together bundles the whole KJV, which is far beyond that allowance. No source found says whether the
letters patent reach an app downloaded in the UK; Cambridge's copyright pages don't mention apps. According to
[Wikipedia](https://en.wikipedia.org/wiki/King_James_Version#Copyright_status), Cambridge considers
requests case by case and said in 2011 that it generally charges no fee. [Bible.com](https://www.bible.com/versions/1)'s
KJV, for example, carries "Rights in the Authorized (King James) Version of the Bible are vested in the Crown"
and "Published by permission of the Crown's patentee, Cambridge University Press."

**Decision (2026-10-27):** the Google Play release leaves out the United Kingdom. Asking Cambridge University
Press for permission is in the Housekeeping list in `FEATURE_IDEAS.md`.

Translations other than the KJV, which the reader fetches at runtime from bible-api.com, aren't bundled. This
record doesn't cover them.

The provenance above was checked against the upstream repository and project page on 2026-10-27.
