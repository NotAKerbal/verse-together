import json
import sqlite3
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SQLITE_PATH = ROOT / "public" / "lds-scriptures-2020.12.08" / "sqlite" / "lds-scriptures-sqlite.db"
OUTPUT_DIR = ROOT / "public" / "scripture-data"
DATASET_VERSION = "lds-scriptures-2020.12.08"

VOLUME_SLUGS = {
    "ot": "oldtestament",
    "nt": "newtestament",
    "bofm": "bookofmormon",
    "dc-testament": "doctrineandcovenants",
    "pgp": "pearl",
}


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    volume_rows = cur.execute(
        """
        select id, volume_title, volume_long_title, volume_subtitle, volume_short_title, volume_lds_url
        from volumes
        order by id
        """
    ).fetchall()

    book_rows = cur.execute(
        """
        select id, volume_id, book_title, book_long_title, book_subtitle, book_short_title, book_lds_url
        from books
        order by volume_id, id
        """
    ).fetchall()

    chapter_rows = cur.execute(
        """
        select id, book_id, chapter_number
        from chapters
        order by book_id, chapter_number
        """
    ).fetchall()

    verse_rows = cur.execute(
        """
        select chapter_id, verse_number, scripture_text
        from verses
        order by chapter_id, verse_number
        """
    ).fetchall()

    verses_by_chapter: dict[int, list[dict[str, object]]] = defaultdict(list)
    for row in verse_rows:
        verses_by_chapter[row["chapter_id"]].append(
            {
                "verse": int(row["verse_number"]),
                "text": row["scripture_text"],
            }
        )

    chapters_by_book: dict[int, list[dict[str, object]]] = defaultdict(list)
    for row in chapter_rows:
        chapters_by_book[row["book_id"]].append(
            {
                "chapter": int(row["chapter_number"]),
                "verses": verses_by_chapter[row["id"]],
            }
        )

    books_by_volume: dict[int, list[dict[str, object]]] = defaultdict(list)
    for row in book_rows:
        chapters = chapters_by_book[row["id"]]
        books_by_volume[row["volume_id"]].append(
            {
                "book": row["book_lds_url"],
                "title": row["book_title"],
                "longTitle": row["book_long_title"] or None,
                "subtitle": row["book_subtitle"] or None,
                "shortTitle": row["book_short_title"] or None,
                "chapterCount": len(chapters),
                "chapters": chapters,
            }
        )

    manifest_volumes: list[dict[str, object]] = []
    total_books = 0
    total_chapters = 0
    total_verses = 0

    for row in volume_rows:
        volume_slug = VOLUME_SLUGS[row["volume_lds_url"]]
        books = books_by_volume[row["id"]]
        chapter_count = sum(book["chapterCount"] for book in books)
        verse_count = sum(len(chapter["verses"]) for book in books for chapter in book["chapters"])
        total_books += len(books)
        total_chapters += chapter_count
        total_verses += verse_count

        bundle = {
            "version": DATASET_VERSION,
            "volume": {
                "volume": volume_slug,
                "title": row["volume_title"],
                "longTitle": row["volume_long_title"] or None,
                "subtitle": row["volume_subtitle"] or None,
                "shortTitle": row["volume_short_title"] or None,
                "bundlePath": f"/scripture-data/{volume_slug}.json",
                "bookCount": len(books),
                "chapterCount": chapter_count,
                "verseCount": verse_count,
            },
            "books": books,
        }

        bundle_path = OUTPUT_DIR / f"{volume_slug}.json"
        bundle_path.write_text(json.dumps(bundle, separators=(",", ":"), ensure_ascii=True), encoding="utf-8")

        manifest_volumes.append(bundle["volume"])

    manifest = {
        "version": DATASET_VERSION,
        "generatedFrom": str(SQLITE_PATH.relative_to(ROOT)).replace("\\", "/"),
        "volumes": manifest_volumes,
        "bookCount": total_books,
        "chapterCount": total_chapters,
        "verseCount": total_verses,
    }
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, separators=(",", ":"), ensure_ascii=True),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
