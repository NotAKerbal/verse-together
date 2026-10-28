// Two-way sync between this computer's copy of an account's study and the account (the website's Convex
// functions, called with the account's own authorization). Runs off the UI thread with its own connection to the
// study database, holding the account lock so signing out can't purge the cache while a sync still writes to it.
//
// Local changes are sent first, each as one transactional call that names only the fields changed here
// (convex/nativeSync.ts), and acknowledged by the local revision they were read at, so an edit made while a send is
// in flight is never marked as sent. Creates carry idempotency keys, so a lost reply is retried without duplicates.
// The account's copies then replace only fields with no unsent changes. Bookmarks are this app's own feature and
// stay local.
use crate::cloud::{self, Backend, CallError, Convex, Endpoints, Session};
use crate::marks::{MarkColor, TextMark, VerseMarks};
use crate::store::{
    self, Annotation, DirtyAnnotation, DirtyNote, DirtyReading, JournalGoals, Location, Note,
    NoteSource, RemoteNote, RemoteReading, SourceKind, Store, volume_url_slug,
};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// How many changes of each kind one sync sends; a longer backlog is drained by the next sync, at once.
pub const BATCH: usize = 200;

#[derive(Debug, Clone, Default)]
pub struct SyncReport {
    pub goals: Option<JournalGoals>,
    pub sent: usize,
    pub received: usize,
    /// Items the server refused this time (kept here, retried by later syncs).
    pub problems: Vec<String>,
    /// Notes changed both here and on the account: both versions were kept.
    pub kept_both: usize,
    /// More unsent changes are waiting than one sync sends.
    pub more: bool,
}

/// One sync for the signed-in account.
pub struct Job {
    pub directory: PathBuf,
    pub endpoints: Endpoints,
    pub session: Session,
    /// Chapters whose marks are refreshed (those on screen).
    pub chapters: Vec<Location>,
    /// Books whose read chapters are refreshed: (volume, book).
    pub books: Vec<(String, String)>,
    /// Study guides (week keys) whose prose marks are refreshed.
    pub guides: Vec<String>,
    /// Set when the account is signed out or switched; the sync stops before its next write.
    pub cancel: Arc<AtomicBool>,
    /// Held for the whole sync. Signing out takes it before removing the account's cached study.
    pub lock: Arc<Mutex<()>>,
}

pub fn run(job: &Job) -> Result<SyncReport, CallError> {
    let _held = job.lock.lock().unwrap_or_else(|e| e.into_inner());
    if job.cancel.load(Ordering::SeqCst) {
        return Err(CallError::Cancelled);
    }
    let jwt = cloud::convex_token(&job.endpoints, &job.session)?;
    let convex = Convex::new(&job.endpoints, jwt);
    let mut store = Store::open(&job.directory).map_err(CallError::refused)?;
    store.set_owner(&job.session.user.id);
    Sync {
        backend: &convex,
        store: &mut store,
        cancel: &job.cancel,
        report: SyncReport::default(),
    }
    .run(&job.chapters, &job.books, &job.guides)
}

fn chapter_args(l: &Location) -> Value {
    json!({ "volume": volume_url_slug(&l.volume), "book": l.book, "chapter": l.chapter })
}
/// Reading progress keys chapters by the canonical volume (`normalizeScriptureVolume`), unlike annotations, which
/// use its URL slug (`annotationChapter`): "doctrineandcovenants" there, "dnc" here.
fn progress_args(l: &Location) -> Value {
    json!({ "volume": store::volume_from_url_slug(&l.volume), "book": l.book, "chapter": l.chapter })
}
fn with(mut base: Value, extra: Value) -> Value {
    if let (Some(a), Some(b)) = (base.as_object_mut(), extra.as_object()) {
        for (k, v) in b {
            a.insert(k.clone(), v.clone());
        }
    }
    base
}

/// `nativeSync:applyVerse`'s arguments for a verse: only the fields changed here.
pub fn verse_args(d: &DirtyAnnotation, text: &str) -> Value {
    let mut args = with(
        chapter_args(&d.location),
        json!({ "verse": d.annotation.verse }),
    );
    if d.marks {
        let marks = &d.annotation.marks;
        let text_marks: Vec<&TextMark> = crate::marks::matching_text_marks(&marks.text_marks, text);
        args["marks"] = json!({
            "highlightColor": marks.highlight.as_ref().map(|c| c.as_str()),
            "underlineColor": marks.underline.as_ref().map(|c| c.as_str()),
            "textMarks": text_marks,
        });
    }
    if d.note {
        args["note"] = json!(d.annotation.note);
    }
    args
}

/// The account's annotations on a chapter, from `annotations:getChapterAnnotations`.
pub fn remote_annotations(value: &Value) -> Vec<Annotation> {
    let mut out = Vec::new();
    let Some(by_verse) = value["by_verse"].as_object() else {
        return out;
    };
    for rows in by_verse.values() {
        let Some(row) = rows
            .as_array()
            .and_then(|r| r.iter().find(|row| row["is_mine"] == true))
        else {
            continue;
        };
        let Some(verse) = row["verse"].as_u64() else {
            continue;
        };
        let color = |key: &str| row[key].as_str().and_then(MarkColor::parse);
        out.push(Annotation {
            verse: verse as u32,
            marks: VerseMarks {
                highlight: color("highlight_color"),
                underline: if row["underline"] == true {
                    color("underline_color").or(Some(MarkColor::Named("red")))
                } else {
                    None
                },
                text_marks: serde_json::from_value::<Vec<TextMark>>(row["text_marks"].clone())
                    .unwrap_or_default(),
            },
            bookmarked: false,
            note: row["body"].as_str().unwrap_or("").to_string(),
        });
    }
    out
}

/// A note as the website stores it: one Markdown body whose first line is its title.
pub fn note_markdown(note: &Note) -> String {
    let title = note.title.trim();
    if title.is_empty() {
        note.body.clone()
    } else {
        format!("# {title}\n\n{}", note.body.trim_start_matches('\n'))
    }
}
/// The reverse: a leading `# ` heading becomes the title.
pub fn split_markdown(markdown: &str) -> (String, String) {
    let trimmed = markdown.trim_start_matches(['\n', '\r']);
    if let Some(rest) = trimmed.strip_prefix("# ") {
        let (title, body) = rest.split_once('\n').unwrap_or((rest, ""));
        (
            title.trim().to_string(),
            body.trim_start_matches(['\n', '\r']).to_string(),
        )
    } else {
        (String::new(), markdown.to_string())
    }
}
fn iso_secs(value: &Value) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(value.as_str()?)
        .ok()
        .map(|t| t.timestamp())
}
fn has_content(note: &Note) -> bool {
    !note_markdown(note).trim().is_empty() || note.reading_at.is_some()
}
/// `insights:createJournalEntry`'s arguments: atomic, and idempotent by its request id.
pub fn create_args(note: &Note, request_id: &str) -> Value {
    let mut args = json!({
        "journalDate": note.journal_date,
        "markdownBody": note_markdown(note),
        "logReading": note.reading_at.is_some() && note.source.is_some(),
        "requestId": request_id,
    });
    if let Some(source) = &note.source {
        args["source"] = serde_json::to_value(source).unwrap_or(Value::Null);
    }
    args
}
/// `nativeSync:saveJournalNote`'s arguments for the fields changed here.
pub fn save_args(d: &DirtyNote, remote_id: &str) -> Value {
    let mut args = json!({ "draftId": remote_id });
    if d.body {
        args["markdownBody"] = json!(note_markdown(&d.note));
        args["expectedRevision"] = json!(d.remote_revision.unwrap_or(0));
    }
    if d.meta {
        args["journalDate"] = json!(d.note.journal_date);
        args["source"] = serde_json::to_value(&d.note.source).unwrap_or(Value::Null);
        args["logged"] = json!(d.note.reading_at.is_some() && d.note.source.is_some());
    }
    args
}
fn anchor_args(m: &store::GuideMark) -> Value {
    let a = &m.anchor;
    json!({
        "guide": m.guide, "part": m.part,
        "startBlock": a.start_block, "startOffset": a.start_offset,
        "endBlock": a.end_block, "endOffset": a.end_offset,
        "exact": a.exact, "prefix": a.prefix, "suffix": a.suffix,
    })
}
/// `annotations:setGuideAnnotation` with the span's whole state: the server finds the span by its anchor, and a span
/// left with nothing is removed there, so sending it again is harmless.
pub fn guide_args(m: &store::GuideMark) -> Value {
    with(
        anchor_args(m),
        json!({
            "body": m.body,
            "highlightColor": m.highlight.as_ref().map(|c| c.as_str()),
            "underlineColor": m.underline.as_ref().map(|c| c.as_str()),
        }),
    )
}
/// The account's spans in a guide (`annotations:getGuideHighlights`).
pub fn remote_guide_marks(guide: &str, value: &Value) -> Vec<store::GuideMark> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|r| {
            let text = |k: &str| r[k].as_str().map(str::to_string);
            Some(store::GuideMark {
                guide: guide.to_string(),
                part: text("part")?,
                anchor: crate::guide_text::Anchor {
                    start_block: text("startBlock")?,
                    start_offset: r["startOffset"].as_u64()? as usize,
                    end_block: text("endBlock")?,
                    end_offset: r["endOffset"].as_u64()? as usize,
                    exact: text("exact")?,
                    prefix: text("prefix").unwrap_or_default(),
                    suffix: text("suffix").unwrap_or_default(),
                },
                highlight: r["highlightColor"].as_str().and_then(MarkColor::parse),
                underline: r["underlineColor"].as_str().and_then(MarkColor::parse),
                body: text("body").unwrap_or_default(),
            })
        })
        .filter(|m| !m.is_empty())
        .collect()
}
fn reading_args(r: &store::Reading) -> (&'static str, Value) {
    match (r.origin.as_str(), r.source.location()) {
        ("chapter_mark", Some((l, _))) if r.source.kind == SourceKind::Scripture => (
            "readingProgress:markChapterRead",
            with(
                progress_args(&l),
                json!({ "journalDate": r.journal_date, "requestId": r.id }),
            ),
        ),
        _ => (
            "readingProgress:logReading",
            json!({ "source": r.source, "journalDate": r.journal_date, "requestId": r.id }),
        ),
    }
}

struct Sync<'a> {
    backend: &'a dyn Backend,
    store: &'a mut Store,
    cancel: &'a AtomicBool,
    report: SyncReport,
}
/// What to do with one item's error: stop the whole sync (signed out, offline, cancelled) or note it and go on.
fn fatal(e: &CallError) -> bool {
    !matches!(e, CallError::Refused { .. })
}
impl Sync<'_> {
    fn check(&self) -> Result<(), CallError> {
        if self.cancel.load(Ordering::SeqCst) {
            Err(CallError::Cancelled)
        } else {
            Ok(())
        }
    }
    fn write<T>(&mut self, f: impl FnOnce(&mut Store) -> store::Result<T>) -> Result<T, CallError> {
        self.check()?;
        f(self.store).map_err(CallError::refused)
    }
    fn mutation(&self, path: &str, args: Value) -> Result<Value, CallError> {
        self.check()?;
        self.backend.mutation(path, args)
    }
    fn query(&self, path: &str, args: Value) -> Result<Value, CallError> {
        self.check()?;
        self.backend.query(path, args)
    }
    /// An item's failure: fatal ones end the sync; a refusal is kept for the report and the item stays queued.
    fn failed(&mut self, e: CallError) -> Result<(), CallError> {
        if fatal(&e) {
            return Err(e);
        }
        self.report.problems.push(e.to_string());
        Ok(())
    }

    fn run(
        mut self,
        chapters: &[Location],
        books: &[(String, String)],
        guides: &[String],
    ) -> Result<SyncReport, CallError> {
        self.mutation("users:ensureCurrentUser", json!({}))?;
        self.push_annotations()?;
        for l in chapters {
            let value = self.query("annotations:getChapterAnnotations", chapter_args(l))?;
            let remote = remote_annotations(&value);
            self.report.received += remote.len();
            self.write(|s| s.apply_remote_chapter(l, &remote))?;
        }
        self.push_notes()?;
        self.pull_notes()?;
        self.push_readings()?;
        self.push_chapters()?;
        self.pull_readings()?;
        for (volume, book) in books {
            let progress = self.query(
                "readingProgress:getMyProgressForBook",
                json!({ "volume": store::volume_from_url_slug(volume), "book": book }),
            )?;
            let read: Vec<u32> = progress["readChapters"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|c| c.as_u64().map(|c| c as u32))
                .collect();
            self.write(|s| s.apply_remote_book(volume, book, &read))?;
        }
        self.push_guides()?;
        for guide in guides {
            let rows = self.query("annotations:getGuideHighlights", json!({ "guide": guide }))?;
            let remote = remote_guide_marks(guide, &rows);
            self.report.received += remote.len();
            self.write(|s| s.apply_remote_guide(guide, &remote))?;
        }
        let goals = self.query("users:getJournalGoals", json!({}))?;
        self.report.goals = serde_json::from_value(goals).ok();
        Ok(self.report)
    }

    fn push_annotations(&mut self) -> Result<(), CallError> {
        let dirty = self.write(|s| s.dirty_annotations(BATCH))?;
        self.report.more |= dirty.len() == BATCH;
        for d in dirty {
            let text = self
                .store
                .chapter(&d.location)
                .map_err(CallError::refused)?
                .into_iter()
                .find(|v| v.number == d.annotation.verse)
                .map(|v| v.text)
                .unwrap_or_default();
            match self.mutation("nativeSync:applyVerse", verse_args(&d, &text)) {
                Ok(_) => {
                    self.write(|s| s.annotation_synced(&d.location, d.annotation.verse, d.rev))?;
                    self.report.sent += 1;
                }
                Err(e) => self.failed(e)?,
            }
        }
        Ok(())
    }

    fn push_notes(&mut self) -> Result<(), CallError> {
        let dirty = self.write(|s| s.dirty_notes(BATCH))?;
        self.report.more |= dirty.len() == BATCH;
        for d in dirty {
            let id = d.note.id.clone();
            let rev = d.note.rev;
            let result = match (d.deleted, d.remote_id.as_deref()) {
                (true, Some(remote)) => self.delete_remote_note(&id, rev, remote),
                (true, None) if !d.attempted || !has_content(&d.note) => {
                    self.write(|s| s.note_gone(&id, rev))
                }
                // Deleted here, but its create may have reached the server with the reply lost: find it by the
                // same request id and delete it too, unless it was edited on the website meanwhile.
                (true, None) => match self.create(&d) {
                    Ok(Some((remote, _))) => self.delete_remote_note(&id, rev, &remote),
                    Ok(None) => self.write(|s| s.note_gone(&id, rev)),
                    Err(e) if e.code() == Some("ENTRY_CONFLICT") => {
                        self.write(|s| s.note_gone(&id, rev))
                    }
                    Err(e) => Err(e),
                },
                (false, None) if !has_content(&d.note) => Ok(()),
                (false, None) => {
                    self.write(|s| s.note_attempted(&id))?;
                    match self.create(&d) {
                        Ok(Some((remote, revision))) => {
                            self.write(|s| s.note_synced(&id, rev, &remote, revision, None))
                        }
                        // Deleted on the account after it was first sent, or edited there since: keep this copy
                        // as its own new entry (the account's version, if any, arrives with the pull).
                        Ok(None) => self.kept_both(&id),
                        Err(e) if e.code() == Some("ENTRY_CONFLICT") => self.kept_both(&id),
                        Err(e) => Err(e),
                    }
                }
                (false, Some(remote)) => {
                    match self.mutation("nativeSync:saveJournalNote", save_args(&d, remote)) {
                        Ok(v) => {
                            let revision = v["markdownRevision"]
                                .as_i64()
                                .unwrap_or(d.remote_revision.unwrap_or(0));
                            let updated = v["updatedAt"].as_str().map(str::to_string);
                            self.write(|s| {
                                s.note_synced(&id, rev, remote, revision, updated.as_deref())
                            })
                        }
                        Err(e) if matches!(e.code(), Some("REVISION_CONFLICT" | "NOT_FOUND")) => {
                            self.kept_both(&id)
                        }
                        Err(e) => Err(e),
                    }
                }
            };
            match result {
                Ok(()) => self.report.sent += 1,
                Err(e) => self.failed(e)?,
            }
        }
        Ok(())
    }
    /// Creates (or finds, by request id) the account's entry: its id and Markdown revision, or `None` if the
    /// account deleted that entry.
    fn create(&self, d: &DirtyNote) -> Result<Option<(String, i64)>, CallError> {
        let v = self.mutation(
            "insights:createJournalEntry",
            create_args(&d.note, &d.request_id),
        )?;
        if v["deleted"] == true {
            return Ok(None);
        }
        let id = v["id"]
            .as_str()
            .ok_or_else(|| CallError::refused("The server's reply had no note id"))?;
        Ok(Some((
            id.to_string(),
            v["markdownRevision"].as_i64().unwrap_or(0),
        )))
    }
    fn delete_remote_note(&mut self, id: &str, rev: i64, remote: &str) -> Result<(), CallError> {
        self.mutation("nativeSync:deleteJournalNote", json!({ "draftId": remote }))?;
        self.write(|s| s.note_gone(id, rev))
    }
    fn kept_both(&mut self, id: &str) -> Result<(), CallError> {
        self.write(|s| s.note_conflict(id))?;
        self.report.kept_both += 1;
        Ok(())
    }

    fn pull_notes(&mut self) -> Result<(), CallError> {
        let journal = self.query("insights:listMyJournal", json!({}))?;
        let known = self.write(|s| s.remote_notes())?;
        // Each note's status as listed (the reader's note links show Draft or Published and skip archived notes).
        let statuses: Vec<(String, String)> = journal
            .as_array()
            .into_iter()
            .flatten()
            .filter(|e| e["kind"] == "note")
            .filter_map(|e| {
                Some((
                    e["id"].as_str()?.to_string(),
                    e["status"].as_str()?.to_string(),
                ))
            })
            .collect();
        self.write(|s| s.set_note_statuses(&statuses))?;
        let mut listed = Vec::new();
        for entry in journal.as_array().into_iter().flatten() {
            if entry["kind"] != "note" {
                continue;
            }
            let Some(id) = entry["id"].as_str() else {
                continue;
            };
            listed.push(id.to_string());
            let revision = entry["markdown_revision"].as_i64().unwrap_or(0);
            let updated_at = entry["updated_at"].as_str().unwrap_or("").to_string();
            let here = known.iter().find(|(_, r, ..)| r == id);
            if here.is_some_and(|(_, _, rev, at, _)| {
                *rev == revision && at.as_deref() == Some(updated_at.as_str())
            }) {
                continue;
            }
            // The text is fetched only when its revision changed; metadata comes with the list.
            let text = if here.is_some_and(|(_, _, rev, ..)| *rev == revision) {
                None
            } else {
                let draft = self.query("insights:getDraft", json!({ "draftId": id }))?;
                Some(split_markdown(
                    draft["markdown_body"].as_str().unwrap_or(""),
                ))
            };
            let created = iso_secs(&entry["created_at"]).unwrap_or_else(store::now);
            let remote = RemoteNote {
                remote_id: id.to_string(),
                revision,
                journal_date: entry["journal_date"]
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| store::local_date(created)),
                source: serde_json::from_value::<NoteSource>(entry["source"].clone()).ok(),
                reading_at: iso_secs(&entry["reading_at"]),
                created,
                updated: iso_secs(&entry["updated_at"]).unwrap_or(created),
                updated_at,
                text,
            };
            self.write(|s| s.apply_remote_note(&remote))?;
            self.report.received += 1;
        }
        self.write(|s| s.retain_remote_notes(&listed))
    }

    fn push_readings(&mut self) -> Result<(), CallError> {
        let dirty = self.write(|s| s.dirty_readings(BATCH))?;
        self.report.more |= dirty.len() == BATCH;
        for d in dirty {
            let result = self.push_reading(&d);
            match result {
                Ok(()) => self.report.sent += 1,
                Err(e) => self.failed(e)?,
            }
        }
        Ok(())
    }
    fn push_reading(&mut self, d: &DirtyReading) -> Result<(), CallError> {
        let id = d.reading.id.clone();
        if !d.deleted {
            self.write(|s| s.reading_attempted(&id))?;
            let (path, args) = reading_args(&d.reading);
            let v = self.mutation(path, args)?;
            let remote = v["logId"].as_str().or(v["id"].as_str()).map(str::to_string);
            return self.write(|s| s.reading_synced(&id, d.rev, remote.as_deref()));
        }
        let remote = match (&d.remote_id, d.attempted) {
            (Some(remote), _) => Some(remote.clone()),
            (None, false) => None,
            // Its log may have reached the server with the reply lost: the same request id finds it.
            (None, true) => {
                let (path, args) = reading_args(&d.reading);
                let v = self.mutation(path, args)?;
                v["logId"].as_str().or(v["id"].as_str()).map(str::to_string)
            }
        };
        if let Some(remote) = remote {
            self.mutation("nativeSync:removeReading", json!({ "readingId": remote }))?;
        }
        self.write(|s| s.reading_synced(&id, d.rev, None))
    }
    fn push_chapters(&mut self) -> Result<(), CallError> {
        let dirty = self.write(|s| s.dirty_chapters(BATCH))?;
        self.report.more |= dirty.len() == BATCH;
        for d in dirty {
            let path = if d.read {
                "readingProgress:markChapterRead"
            } else {
                "readingProgress:unmarkChapterRead"
            };
            match self.mutation(path, progress_args(&d.location)) {
                Ok(_) => {
                    self.write(|s| s.chapter_synced(&d.location, d.rev))?;
                    self.report.sent += 1;
                }
                Err(e) => self.failed(e)?,
            }
        }
        Ok(())
    }
    fn push_guides(&mut self) -> Result<(), CallError> {
        let dirty = self.write(|s| s.dirty_guide_marks(BATCH))?;
        self.report.more |= dirty.len() == BATCH;
        for (m, rev) in dirty {
            match self.mutation("annotations:setGuideAnnotation", guide_args(&m)) {
                Ok(_) => {
                    self.write(|s| s.guide_mark_synced(&m, rev))?;
                    self.report.sent += 1;
                }
                Err(e) => self.failed(e)?,
            }
        }
        Ok(())
    }
    fn pull_readings(&mut self) -> Result<(), CallError> {
        let log = self.query("readingProgress:listMyReadingLog", json!({}))?;
        let mut remote = Vec::new();
        for row in log.as_array().into_iter().flatten() {
            // Readings logged by a journal entry are that entry's (shown with the note).
            if row.get("note_id").is_some_and(|n| !n.is_null()) {
                continue;
            }
            let (Some(id), Ok(source)) = (
                row["id"].as_str(),
                serde_json::from_value::<NoteSource>(row["source"].clone()),
            ) else {
                continue;
            };
            let read_at = iso_secs(&row["read_at"]).unwrap_or_else(store::now);
            remote.push(RemoteReading {
                remote_id: id.to_string(),
                request_id: row["request_id"].as_str().map(str::to_string),
                journal_date: row["journal_date"]
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| store::local_date(read_at)),
                source,
                read_at,
                origin: row["origin"].as_str().unwrap_or("manual").to_string(),
            });
        }
        self.report.received += remote.len();
        self.write(|s| s.apply_remote_readings(&remote))
    }
}

pub fn save_goals(
    endpoints: &Endpoints,
    session: &Session,
    goals: JournalGoals,
) -> Result<JournalGoals, CallError> {
    let jwt = cloud::convex_token(endpoints, session)?;
    let c = Convex::new(endpoints, jwt);
    let saved = c.mutation(
        "users:saveJournalGoals",
        json!({ "studyDays": goals.study_days, "reflections": goals.reflections }),
    )?;
    serde_json::from_value(saved).map_err(|e| CallError::refused(e.to_string()))
}

/// What copying this computer's own study into the account did.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Imported {
    pub notes: usize,
    pub verses: usize,
    pub guide_marks: usize,
}
/// This computer's own (signed-out) study, as the account's import calls: each journal note with
/// `insights:importDeviceNote` and each marked or annotated verse with `annotations:upsertVerseAnnotation`'s device
/// import, both keyed by a stable id with a receipt on the server, so copying again never duplicates anything and an
/// import never replaces a note or mark the account already has (the website's `DeviceSyncProvider` contracts).
pub fn device_imports(store: &Store, owner_key: &str) -> store::Result<Vec<(&'static str, Value)>> {
    let mut calls = Vec::new();
    for note in store.all_notes()? {
        if !has_content(&note) {
            continue;
        }
        let mut args = json!({
            "deviceId": format!("native-note:{}", note.id),
            "expectedOwner": owner_key,
            "markdownBody": note_markdown(&note),
            "journalDate": note.journal_date,
            "createdAt": note.created * 1000,
            "updatedAt": note.updated.max(note.created) * 1000,
        });
        if let Some(source) = &note.source {
            args["source"] = serde_json::to_value(source).unwrap_or(Value::Null);
            if let Some(at) = note.reading_at {
                args["readingAt"] = json!(at * 1000);
            }
        }
        calls.push(("insights:importDeviceNote", args));
    }
    for (l, a) in store.all_verse_annotations()? {
        let note = store::normalize_verse_note(&a.note);
        let text = store
            .chapter(&l)?
            .into_iter()
            .find(|v| v.number == a.verse)
            .map(|v| v.text)
            .unwrap_or_default();
        let marks: Vec<&TextMark> = crate::marks::matching_text_marks(&a.marks.text_marks, &text);
        if note.is_empty()
            && !a.marks.highlight.is_some()
            && a.marks.underline.is_none()
            && marks.is_empty()
        {
            continue;
        }
        let mut args = with(
            chapter_args(&l),
            json!({
                "verse": a.verse,
                "body": note,
                "deviceImportId": format!("native-verse:{}:{}:{}:{}", l.volume, l.book, l.chapter, a.verse),
                "deviceImportOwner": owner_key,
            }),
        );
        if let Some(h) = &a.marks.highlight {
            args["highlightColor"] = json!(h.as_str());
        }
        if let Some(u) = &a.marks.underline {
            args["underlineColor"] = json!(u.as_str());
        }
        if !marks.is_empty() {
            args["textMarks"] = json!(marks);
        }
        calls.push(("annotations:upsertVerseAnnotation", args));
    }
    for m in store.all_guide_marks()? {
        let a = &m.anchor;
        let id = format!(
            "native-guide:{}",
            &crate::cloud::challenge_for(&format!(
                "{}|{}|{}|{}|{}|{}|{}",
                m.guide, m.part, a.start_block, a.start_offset, a.end_block, a.end_offset, a.exact
            ))[..32]
        );
        let mut args = with(
            anchor_args(&m),
            json!({ "deviceImportId": id, "deviceImportOwner": owner_key, "body": m.body }),
        );
        if let Some(h) = &m.highlight {
            args["highlightColor"] = json!(h.as_str());
        }
        if let Some(u) = &m.underline {
            args["underlineColor"] = json!(u.as_str());
        }
        calls.push(("annotations:saveGuideHighlight", args));
    }
    Ok(calls)
}
pub fn import_device(job: &Job) -> Result<Imported, CallError> {
    let _held = job.lock.lock().unwrap_or_else(|e| e.into_inner());
    let jwt = cloud::convex_token(&job.endpoints, &job.session)?;
    let convex = Convex::new(&job.endpoints, jwt);
    import_with(&convex, &job.directory, &job.cancel)
}
pub(crate) fn import_with(
    backend: &dyn Backend,
    directory: &Path,
    cancel: &AtomicBool,
) -> Result<Imported, CallError> {
    let viewer = backend.mutation("users:ensureCurrentUser", json!({}))?;
    let owner_key = viewer["appUserId"]
        .as_str()
        .ok_or_else(|| CallError::refused("The account isn't ready yet. Try again shortly."))?
        .to_string();
    // This computer's own study: owner "".
    let store = Store::open(directory).map_err(CallError::refused)?;
    let mut done = Imported::default();
    for (path, args) in device_imports(&store, &owner_key).map_err(CallError::refused)? {
        if cancel.load(Ordering::SeqCst) {
            return Err(CallError::Cancelled);
        }
        backend.mutation(path, args)?;
        match path {
            "insights:importDeviceNote" => done.notes += 1,
            "annotations:saveGuideHighlight" => done.guide_marks += 1,
            _ => done.verses += 1,
        }
    }
    Ok(done)
}

/// Removes an account's cached study from this computer, after any sync still writing it has finished.
pub fn purge(directory: &Path, owner: &str, lock: &Mutex<()>) -> Result<(), String> {
    let _held = lock.lock().unwrap_or_else(|e| e.into_inner());
    Store::open(directory)?.forget_owner(owner)
}

#[cfg(test)]
pub(crate) mod tests;
