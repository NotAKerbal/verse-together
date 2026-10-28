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

Upstream's public-domain statement is about the USA. The text comes from the Church's 2013 edition. Verse
Together hasn't independently reviewed that edition's editorial changes, or how the KJV is treated outside the
US. In the United Kingdom, the KJV is covered by Crown letters patent.

Translations other than the KJV, which the reader fetches at runtime from bible-api.com, aren't bundled. This
record doesn't cover them.

The provenance above was checked against the upstream repository and project page on 2026-10-27.
