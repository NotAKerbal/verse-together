// The sync against a stand-in account that follows the server's contracts (convex/nativeSync.ts,
// insights:createJournalEntry, readingProgress:*): idempotent creates by request id, revision-checked note text,
// field-level verse changes. Faults are injected where real networks fail: a reply lost after the server applied
// the call, or a call that never arrived. (The functions themselves are tested against Convex in
// tests/convex/nativeSync.test.ts.)
use super::*;
use crate::marks::MarkColor;
use crate::store::{DirtyAnnotation, Note, NoteSource};
use std::cell::RefCell;
use std::collections::BTreeMap;

#[derive(Default, Clone)]
struct Verse {
    body: String,
    highlight: Option<String>,
    underline: Option<String>,
    text_marks: Value,
}
#[derive(Clone)]
struct Draft {
    markdown: String,
    revision: i64,
    journal_date: String,
    source: Value,
    reading_at: Option<i64>,
    request_id: Option<String>,
    created: i64,
    updated: i64,
    /// What the create that made it carried, to tell a retry from an edit (`entryRequestFingerprint`).
    request_content: Option<String>,
    /// "draft", "published" or "archived".
    status: String,
}
#[derive(Clone)]
struct Log {
    request_id: String,
    source: Value,
    journal_date: String,
    origin: String,
    read_at: i64,
}
#[derive(Default)]
struct Account {
    verses: BTreeMap<(String, String, u32, u32), Verse>,
    drafts: BTreeMap<String, Draft>,
    deleted_requests: Vec<String>,
    logs: BTreeMap<String, Log>,
    hidden: Vec<String>,
    read: BTreeMap<(String, String, u32), bool>,
    next: i64,
    calls: Vec<String>,
}
/// What goes wrong with the next call to `path`.
#[derive(Clone, Copy, PartialEq)]
enum Fault {
    /// The server applies it, but the reply never arrives.
    LoseReply,
    /// It never reaches the server.
    Offline,
}
/// A call's path and what happens while it is in flight.
type Hook = (String, Box<dyn FnOnce()>);
#[derive(Default)]
struct Fake {
    account: RefCell<Account>,
    faults: RefCell<Vec<(String, Fault)>>,
    /// Runs while a call is in flight (as if the reader edited something meanwhile).
    during: RefCell<Option<Hook>>,
}
fn stamp(n: i64) -> String {
    chrono::DateTime::from_timestamp(1_790_000_000 + n, 0)
        .unwrap()
        .to_rfc3339()
}
fn conflict(code: &str) -> CallError {
    CallError::Refused {
        message: code.into(),
        code: Some(code.into()),
        data: json!({ "code": code }),
    }
}
impl Fake {
    fn fault(&self, path: &str, fault: Fault) {
        self.faults.borrow_mut().push((path.into(), fault));
    }
    fn during(&self, path: &str, f: impl FnOnce() + 'static) {
        *self.during.borrow_mut() = Some((path.into(), Box::new(f)));
    }
    fn tick(a: &mut Account) -> i64 {
        a.next += 1;
        a.next
    }
    fn call(&self, path: &str, args: Value) -> Result<Value, CallError> {
        let fault = {
            let mut faults = self.faults.borrow_mut();
            faults
                .iter()
                .position(|(p, _)| p == path)
                .map(|i| faults.remove(i).1)
        };
        if fault == Some(Fault::Offline) {
            return Err(CallError::Unavailable("offline".into()));
        }
        let hook = {
            let mut during = self.during.borrow_mut();
            if during.as_ref().is_some_and(|(p, _)| p == path) {
                during.take().map(|(_, f)| f)
            } else {
                None
            }
        };
        if let Some(hook) = hook {
            hook();
        }
        self.account.borrow_mut().calls.push(path.into());
        let result = self.apply(path, &args);
        if fault == Some(Fault::LoseReply) {
            return Err(CallError::Unavailable("connection reset".into()));
        }
        result
    }
    fn apply(&self, path: &str, args: &Value) -> Result<Value, CallError> {
        let mut a = self.account.borrow_mut();
        let key = |args: &Value| {
            (
                args["volume"].as_str().unwrap().to_string(),
                args["book"].as_str().unwrap().to_string(),
                args["chapter"].as_u64().unwrap() as u32,
            )
        };
        Ok(match path {
            "users:ensureCurrentUser" => json!({}),
            "users:getJournalGoals" => json!({ "studyDays": 4, "reflections": 2 }),
            "nativeSync:applyVerse" => {
                let (v, b, c) = key(args);
                let id = (v, b, c, args["verse"].as_u64().unwrap() as u32);
                let mut verse = a.verses.get(&id).cloned().unwrap_or_default();
                if let Some(marks) = args.get("marks") {
                    verse.highlight = marks["highlightColor"].as_str().map(str::to_string);
                    verse.underline = marks["underlineColor"].as_str().map(str::to_string);
                    verse.text_marks = marks["textMarks"].clone();
                }
                if let Some(note) = args.get("note") {
                    verse.body = crate::store::normalize_verse_note(note.as_str().unwrap());
                }
                let empty = verse.body.is_empty()
                    && verse.highlight.is_none()
                    && verse.underline.is_none()
                    && verse.text_marks.as_array().is_none_or(|m| m.is_empty());
                if empty {
                    a.verses.remove(&id);
                } else {
                    a.verses.insert(id, verse);
                }
                json!({ "removed": empty })
            }
            "annotations:getChapterAnnotations" => {
                let (v, b, c) = key(args);
                let mut by_verse = serde_json::Map::new();
                for ((vv, bb, cc, verse), row) in &a.verses {
                    if (vv, bb, *cc) == (&v, &b, c) {
                        by_verse.insert(verse.to_string(), json!([{
                            "verse": verse, "body": row.body, "is_mine": true,
                            "highlight_color": row.highlight, "underline": row.underline.is_some(),
                            "underline_color": row.underline, "text_marks": row.text_marks,
                        }]));
                    }
                }
                json!({ "by_verse": by_verse })
            }
            "insights:createJournalEntry" => {
                let request = args["requestId"].as_str().unwrap().to_string();
                if a.deleted_requests.contains(&request) {
                    return Ok(json!({ "id": null, "duplicate": true, "deleted": true, "markdownRevision": null }));
                }
                let content = format!(
                    "{}|{}|{}|{}",
                    args["markdownBody"], args["journalDate"], args["source"], args["logReading"]
                );
                if let Some((id, draft)) = a
                    .drafts
                    .iter_mut()
                    .find(|(_, d)| d.request_id.as_deref() == Some(request.as_str()))
                {
                    let untouched = draft.created == draft.updated && draft.revision == 0;
                    if untouched {
                        draft.markdown = args["markdownBody"].as_str().unwrap().into();
                        draft.request_content = Some(content);
                        return Ok(json!({ "id": id, "duplicate": true, "deleted": false, "markdownRevision": 0 }));
                    }
                    if draft.request_content.as_deref() == Some(content.as_str()) {
                        return Ok(json!({ "id": id, "duplicate": true, "deleted": false, "markdownRevision": draft.revision }));
                    }
                    return Err(conflict("ENTRY_CONFLICT"));
                }
                let now = Self::tick(&mut a);
                let id = format!("draft{now}");
                a.drafts.insert(
                    id.clone(),
                    Draft {
                        markdown: args["markdownBody"].as_str().unwrap().into(),
                        revision: 0,
                        journal_date: args["journalDate"].as_str().unwrap().into(),
                        source: args["source"].clone(),
                        reading_at: (args["logReading"] == true).then_some(now),
                        request_id: Some(request),
                        created: now,
                        updated: now,
                        request_content: Some(content),
                        status: "draft".into(),
                    },
                );
                json!({ "id": id, "duplicate": false, "deleted": false, "markdownRevision": 0 })
            }
            "nativeSync:saveJournalNote" => {
                let now = Self::tick(&mut a);
                let id = args["draftId"].as_str().unwrap();
                let Some(draft) = a.drafts.get_mut(id) else {
                    return Err(conflict("NOT_FOUND"));
                };
                if draft.status != "draft" {
                    return Err(conflict("READ_ONLY"));
                }
                if let Some(markdown) = args.get("markdownBody") {
                    if args["expectedRevision"].as_i64() != Some(draft.revision) {
                        return Err(conflict("REVISION_CONFLICT"));
                    }
                    draft.markdown = markdown.as_str().unwrap().into();
                    draft.revision += 1;
                }
                if let Some(day) = args.get("journalDate") {
                    draft.journal_date = day.as_str().unwrap().into();
                    draft.source = args["source"].clone();
                    draft.reading_at = (args["logged"] == true).then_some(now);
                }
                draft.updated = now;
                json!({ "markdownRevision": draft.revision, "updatedAt": stamp(now) })
            }
            "nativeSync:deleteJournalNote" => {
                let id = args["draftId"].as_str().unwrap();
                if a.drafts.get(id).is_some_and(|d| d.status == "published") {
                    return Err(conflict("READ_ONLY"));
                }
                let removed = a.drafts.remove(id);
                if let Some(request) = removed.as_ref().and_then(|d| d.request_id.clone()) {
                    a.deleted_requests.push(request);
                }
                json!({ "deleted": removed.is_some() })
            }
            "insights:listMyJournal" => Value::Array(
                a.drafts
                    .iter()
                    .map(|(id, d)| {
                        json!({
                            "kind": "note", "id": id, "status": d.status, "journal_date": d.journal_date, "source": d.source,
                            "reading_at": d.reading_at.map(stamp), "markdown_revision": d.revision,
                            "created_at": stamp(d.created), "updated_at": stamp(d.updated),
                        })
                    })
                    .collect(),
            ),
            "insights:getDraft" => {
                let d = &a.drafts[args["draftId"].as_str().unwrap()];
                json!({ "markdown_body": d.markdown })
            }
            "readingProgress:markChapterRead" | "readingProgress:logReading" => {
                let mut log_id = Value::Null;
                if let Some(request) = args["requestId"].as_str() {
                    if let Some((id, _)) = a.logs.iter().find(|(_, l)| l.request_id == request) {
                        let id = id.clone();
                        return Ok(json!({ "id": id, "logId": id, "duplicate": true }));
                    }
                    let now = Self::tick(&mut a);
                    let id = format!("log{now}");
                    let chapter = path.ends_with("markChapterRead");
                    a.logs.insert(
                        id.clone(),
                        Log {
                            request_id: request.into(),
                            source: if chapter {
                                json!({ "kind": "scripture", "label": "chapter", "href": format!("/browse/{}/{}/{}", args["volume"].as_str().unwrap(), args["book"].as_str().unwrap(), args["chapter"]), "volume": args["volume"], "book": args["book"], "chapter": args["chapter"] })
                            } else {
                                args["source"].clone()
                            },
                            journal_date: args["journalDate"].as_str().unwrap().into(),
                            origin: if chapter { "chapter_mark" } else { "manual" }.into(),
                            read_at: now,
                        },
                    );
                    log_id = json!(id);
                }
                if path.ends_with("markChapterRead") {
                    a.read.insert(key(args), true);
                }
                json!({ "id": log_id, "logId": log_id })
            }
            "readingProgress:unmarkChapterRead" => {
                a.read.remove(&key(args));
                json!({ "ok": true })
            }
            "nativeSync:removeReading" => {
                let id = args["readingId"].as_str().unwrap().to_string();
                let removed = a.logs.contains_key(&id) && !a.hidden.contains(&id);
                a.hidden.push(id);
                json!({ "removed": removed })
            }
            "readingProgress:listMyReadingLog" => Value::Array(
                a.logs
                    .iter()
                    .filter(|(id, _)| !a.hidden.contains(id))
                    .map(|(id, l)| {
                        json!({ "id": id, "kind": "log", "origin": l.origin, "source": l.source,
                            "journal_date": l.journal_date, "read_at": stamp(l.read_at), "request_id": l.request_id })
                    })
                    .collect(),
            ),
            "readingProgress:getMyProgressForBook" => {
                let (v, b) = (args["volume"].as_str().unwrap(), args["book"].as_str().unwrap());
                let chapters: Vec<u32> = a
                    .read
                    .keys()
                    .filter(|(vv, bb, _)| vv == v && bb == b)
                    .map(|(_, _, c)| *c)
                    .collect();
                json!({ "readChapters": chapters })
            }
            other => panic!("unexpected call {other}"),
        })
    }
    /// A web edit of a note's text, as the website's editor saves it.
    fn web_edit(&self, id: &str, markdown: &str) {
        let mut a = self.account.borrow_mut();
        let now = Self::tick(&mut a);
        let d = a.drafts.get_mut(id).unwrap();
        d.markdown = markdown.into();
        d.revision += 1;
        d.updated = now;
    }
    /// Publishing (or archiving) a note on the website.
    fn web_status(&self, id: &str, status: &str) {
        let mut a = self.account.borrow_mut();
        let now = Self::tick(&mut a);
        let d = a.drafts.get_mut(id).unwrap();
        d.status = status.into();
        d.updated = now;
    }
    fn only_draft(&self) -> (String, Draft) {
        let a = self.account.borrow();
        assert_eq!(a.drafts.len(), 1, "exactly one note on the account");
        let (id, d) = a.drafts.iter().next().unwrap();
        (id.clone(), d.clone())
    }
}
impl Backend for Fake {
    fn query(&self, path: &str, args: Value) -> Result<Value, CallError> {
        self.call(path, args)
    }
    fn mutation(&self, path: &str, args: Value) -> Result<Value, CallError> {
        self.call(path, args)
    }
}

const OWNER: &str = "account-1";
fn directory() -> PathBuf {
    std::env::temp_dir().join(format!(
        "verse-sync-test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ))
}
fn open(dir: &Path) -> Store {
    let mut s = Store::open(dir).unwrap();
    s.set_owner(OWNER);
    s
}
fn sync(fake: &Fake, dir: &Path, chapters: &[Location]) -> Result<SyncReport, CallError> {
    let mut store = open(dir);
    let cancel = AtomicBool::new(false);
    Sync {
        backend: fake,
        store: &mut store,
        cancel: &cancel,
        report: SyncReport::default(),
    }
    .run(
        chapters,
        &[("bookofmormon".to_string(), "alma".to_string())],
        &[],
    )
}
fn alma() -> Location {
    Location {
        volume: "bookofmormon".into(),
        book: "alma".into(),
        chapter: 32,
    }
}
fn note_on(store: &Store, verse: u32) -> String {
    store
        .annotations(&alma())
        .unwrap()
        .into_iter()
        .find(|a| a.verse == verse)
        .map(|a| a.note)
        .unwrap_or_default()
}

#[test]
fn an_edit_made_while_its_first_version_is_sent_is_sent_too() {
    let dir = directory();
    let fake = Fake::default();
    let mut store = open(&dir);
    let mut a = Annotation {
        verse: 21,
        note: "First thought".into(),
        ..Default::default()
    };
    store.save_annotation(&alma(), &a).unwrap();
    let ui_dir = dir.clone();
    fake.during("nativeSync:applyVerse", move || {
        let mut ui = open(&ui_dir);
        let a = Annotation {
            verse: 21,
            note: "Second thought, typed during the send".into(),
            ..Default::default()
        };
        ui.save_annotation(&alma(), &a).unwrap();
    });
    sync(&fake, &dir, &[alma()]).unwrap();
    assert_eq!(note_on(&store, 21), "Second thought, typed during the send");
    assert_eq!(
        store.unsynced(OWNER).unwrap(),
        1,
        "the second edit is still queued"
    );
    sync(&fake, &dir, &[alma()]).unwrap();
    let account = fake.account.borrow();
    let key = ("bookofmormon".into(), "alma".into(), 32, 21);
    assert_eq!(
        account.verses[&key].body,
        "Second thought, typed during the send"
    );
    drop(account);
    assert_eq!(store.unsynced(OWNER).unwrap(), 0);
    a.note.clear();
    store.save_annotation(&alma(), &a).unwrap();
    sync(&fake, &dir, &[alma()]).unwrap();
    assert!(
        fake.account.borrow().verses.is_empty(),
        "clearing the note removed it on the account"
    );
    assert_eq!(note_on(&store, 21), "");
    drop(store);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_highlight_made_here_never_overwrites_a_note_written_on_the_website() {
    let dir = directory();
    let fake = Fake::default();
    let mut store = open(&dir);
    store
        .save_annotation(
            &alma(),
            &Annotation {
                verse: 21,
                note: "Old note".into(),
                ..Default::default()
            },
        )
        .unwrap();
    sync(&fake, &dir, &[alma()]).unwrap();
    // The website changes the note; this computer, not yet refreshed, adds a highlight.
    fake.account
        .borrow_mut()
        .verses
        .get_mut(&("bookofmormon".into(), "alma".into(), 32, 21))
        .unwrap()
        .body = "Newer note from the website".into();
    let mut a = store.annotations(&alma()).unwrap().remove(0);
    a.marks.highlight = Some(MarkColor::Named("green"));
    store.save_annotation(&alma(), &a).unwrap();
    let DirtyAnnotation { marks, note, .. } = store.dirty_annotations(10).unwrap().remove(0);
    assert!(marks && !note, "only the marks are queued");
    sync(&fake, &dir, &[alma()]).unwrap();
    let account = fake.account.borrow();
    let row = &account.verses[&("bookofmormon".into(), "alma".into(), 32, 21)];
    assert_eq!(row.body, "Newer note from the website");
    assert_eq!(row.highlight.as_deref(), Some("green"));
    drop(account);
    let here = store.annotations(&alma()).unwrap().remove(0);
    assert_eq!(here.note, "Newer note from the website");
    assert_eq!(here.marks.highlight, Some(MarkColor::Named("green")));
    drop(store);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_lost_reply_never_duplicates_a_new_note() {
    let dir = directory();
    let fake = Fake::default();
    let mut store = open(&dir);
    let mut note = Note::new("2026-10-27", None);
    note.title = "Seeds".into();
    note.body = "A particle of faith — ✓".into();
    let saved = store.save_note(&note).unwrap();
    fake.fault("insights:createJournalEntry", Fault::LoseReply);
    assert!(matches!(
        sync(&fake, &dir, &[]),
        Err(CallError::Unavailable(_))
    ));
    // Edited again before the retry: the retry carries the new text to the same entry.
    note.rev = saved.rev;
    note.body.push_str("\n\nMore.");
    store.save_note(&note).unwrap();
    sync(&fake, &dir, &[]).unwrap();
    sync(&fake, &dir, &[]).unwrap();
    let (_, draft) = fake.only_draft();
    assert_eq!(
        draft.markdown,
        "# Seeds\n\nA particle of faith — ✓\n\nMore."
    );
    assert_eq!(store.all_notes().unwrap().len(), 1);
    assert_eq!(store.unsynced(OWNER).unwrap(), 0);
    // A lost reply on an update is also safe to repeat.
    let mut note = store.all_notes().unwrap().remove(0);
    note.body = "Rewritten.".into();
    store.save_note(&note).unwrap();
    fake.fault("nativeSync:saveJournalNote", Fault::Offline);
    assert!(sync(&fake, &dir, &[]).is_err());
    sync(&fake, &dir, &[]).unwrap();
    assert_eq!(fake.only_draft().1.markdown, "# Seeds\n\nRewritten.");
    drop(store);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn edits_on_both_sides_keep_both_versions_once() {
    let dir = directory();
    let fake = Fake::default();
    let mut store = open(&dir);
    let mut note = Note::new("2026-10-27", None);
    note.body = "Shared start".into();
    store.save_note(&note).unwrap();
    sync(&fake, &dir, &[]).unwrap();
    let (id, _) = fake.only_draft();
    fake.web_edit(&id, "Edited on the website");
    let mut here = store.all_notes().unwrap().remove(0);
    here.body = "Edited on this computer".into();
    store.save_note(&here).unwrap();
    let report = sync(&fake, &dir, &[]).unwrap();
    assert_eq!(report.kept_both, 1);
    sync(&fake, &dir, &[]).unwrap();
    sync(&fake, &dir, &[]).unwrap();
    let account = fake.account.borrow();
    let mut bodies: Vec<&str> = account
        .drafts
        .values()
        .map(|d| d.markdown.as_str())
        .collect();
    bodies.sort();
    assert_eq!(bodies, ["Edited on the website", "Edited on this computer"]);
    drop(account);
    let mut local: Vec<String> = store
        .all_notes()
        .unwrap()
        .into_iter()
        .map(|n| n.body)
        .collect();
    local.sort();
    assert_eq!(local, ["Edited on the website", "Edited on this computer"]);
    assert_eq!(store.unsynced(OWNER).unwrap(), 0);
    drop(store);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn an_open_editor_never_saves_over_an_edit_that_arrived_meanwhile() {
    let dir = directory();
    let fake = Fake::default();
    let mut store = open(&dir);
    let mut note = Note::new("2026-10-27", None);
    note.body = "Start".into();
    store.save_note(&note).unwrap();
    sync(&fake, &dir, &[]).unwrap();
    // The editor opens the note, then a sync brings the website's edit while the reader types.
    let mut editor = store.all_notes().unwrap().remove(0);
    let (id, _) = fake.only_draft();
    fake.web_edit(&id, "From the website");
    sync(&fake, &dir, &[]).unwrap();
    assert_eq!(store.all_notes().unwrap()[0].body, "From the website");
    editor.body = "Typed here meanwhile".into();
    let saved = store.save_note(&editor).unwrap();
    assert!(saved.forked, "kept as a separate note");
    sync(&fake, &dir, &[]).unwrap();
    let mut bodies: Vec<String> = fake
        .account
        .borrow()
        .drafts
        .values()
        .map(|d| d.markdown.clone())
        .collect();
    bodies.sort();
    assert_eq!(bodies, ["From the website", "Typed here meanwhile"]);
    drop(store);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn metadata_changed_on_the_website_arrives_without_a_text_change() {
    let dir = directory();
    let fake = Fake::default();
    let mut store = open(&dir);
    let mut note = Note::new("2026-10-27", None);
    note.body = "Reflection".into();
    store.save_note(&note).unwrap();
    sync(&fake, &dir, &[]).unwrap();
    {
        let mut a = fake.account.borrow_mut();
        let now = Fake::tick(&mut a);
        let d = a.drafts.values_mut().next().unwrap();
        d.journal_date = "2026-10-25".into();
        d.source = json!({ "kind": "guide", "label": "Jeremiah 31–33", "href": "/come-follow-me/2026-10-26" });
        d.reading_at = Some(now);
        d.updated = now;
    }
    sync(&fake, &dir, &[]).unwrap();
    let here = store.all_notes().unwrap().remove(0);
    assert_eq!(here.journal_date, "2026-10-25");
    assert_eq!(
        here.source,
        Some(NoteSource::lesson("2026-10-26", "Jeremiah 31–33"))
    );
    assert!(here.reading_at.is_some());
    assert_eq!(here.body, "Reflection");
    drop(store);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn deletions_reach_the_account_even_after_a_lost_create_reply() {
    let dir = directory();
    let fake = Fake::default();
    let mut store = open(&dir);
    let mut note = Note::new("2026-10-27", None);
    note.body = "Short-lived".into();
    let saved = store.save_note(&note).unwrap();
    fake.fault("insights:createJournalEntry", Fault::LoseReply);
    assert!(sync(&fake, &dir, &[]).is_err());
    assert_eq!(
        fake.account.borrow().drafts.len(),
        1,
        "it did reach the server"
    );
    store.delete_note(&saved.id).unwrap();
    sync(&fake, &dir, &[]).unwrap();
    assert!(fake.account.borrow().drafts.is_empty());
    assert!(store.all_notes().unwrap().is_empty());
    assert_eq!(store.unsynced(OWNER).unwrap(), 0);
    // A note deleted before it was ever sent is just forgotten.
    let mut never = Note::new("2026-10-27", None);
    never.body = "never sent".into();
    let saved = store.save_note(&never).unwrap();
    store.delete_note(&saved.id).unwrap();
    let calls = fake.account.borrow().calls.len();
    sync(&fake, &dir, &[]).unwrap();
    assert!(
        !fake.account.borrow().calls[calls..]
            .iter()
            .any(|c| c == "insights:createJournalEntry")
    );
    assert_eq!(store.unsynced(OWNER).unwrap(), 0);
    drop(store);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn readings_and_read_chapters_travel_both_ways() {
    let dir = directory();
    let fake = Fake::default();
    let mut store = open(&dir);
    let source = NoteSource::scripture("Alma", &alma(), None);
    store.set_read(&alma(), &source, true).unwrap();
    let lesson = NoteSource::lesson("2026-10-26", "Jeremiah 31–33");
    store.log_reading("2026-10-26", &lesson).unwrap();
    sync(&fake, &dir, &[]).unwrap();
    assert_eq!(fake.account.borrow().logs.len(), 2);
    assert!(
        fake.account
            .borrow()
            .read
            .contains_key(&("bookofmormon".into(), "alma".into(), 32))
    );
    assert_eq!(store.unsynced(OWNER).unwrap(), 0);
    // A retry after a lost reply logs nothing twice.
    store.log_reading("2026-10-27", &lesson).unwrap();
    fake.fault("readingProgress:logReading", Fault::LoseReply);
    assert!(sync(&fake, &dir, &[]).is_err());
    sync(&fake, &dir, &[]).unwrap();
    assert_eq!(fake.account.borrow().logs.len(), 3);
    assert_eq!(
        store
            .readings_between("2026-10-26", "2026-10-27")
            .unwrap()
            .iter()
            .filter(|r| r.origin == "manual")
            .count(),
        2
    );
    // Read on the website: another chapter of the book, and a reading logged there.
    {
        let mut a = fake.account.borrow_mut();
        a.read
            .insert(("bookofmormon".into(), "alma".into(), 33), true);
        a.logs.insert(
            "web-log".into(),
            Log {
                request_id: "web-request".into(),
                source: serde_json::to_value(NoteSource::lesson("2026-10-19", "Jeremiah 1–10"))
                    .unwrap(),
                journal_date: "2026-10-20".into(),
                origin: "manual".into(),
                read_at: 50,
            },
        );
    }
    sync(&fake, &dir, &[]).unwrap();
    assert_eq!(
        store.read_chapters("bookofmormon", "alma").unwrap(),
        [32, 33]
    );
    let web = store.readings_between("2026-10-20", "2026-10-20").unwrap();
    assert_eq!(web.len(), 1);
    // Removing it here removes it from the account's history; unmarking a chapter unmarks it there.
    store.delete_reading(&web[0].id).unwrap();
    store.set_read(&alma(), &source, false).unwrap();
    sync(&fake, &dir, &[]).unwrap();
    assert!(
        fake.account
            .borrow()
            .hidden
            .contains(&"web-log".to_string())
    );
    assert!(
        !fake
            .account
            .borrow()
            .read
            .contains_key(&("bookofmormon".into(), "alma".into(), 32))
    );
    assert!(
        store
            .readings_between("2026-10-20", "2026-10-20")
            .unwrap()
            .is_empty()
    );
    assert_eq!(store.read_chapters("bookofmormon", "alma").unwrap(), [33]);
    assert_eq!(store.unsynced(OWNER).unwrap(), 0);
    drop(store);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_cancelled_sync_writes_nothing_more() {
    let dir = directory();
    let fake = Fake::default();
    let mut store = open(&dir);
    store
        .save_annotation(
            &alma(),
            &Annotation {
                verse: 1,
                note: "queued".into(),
                ..Default::default()
            },
        )
        .unwrap();
    let cancel = AtomicBool::new(true);
    let mut sync_store = open(&dir);
    let result = Sync {
        backend: &fake,
        store: &mut sync_store,
        cancel: &cancel,
        report: SyncReport::default(),
    }
    .run(&[alma()], &[], &[]);
    assert_eq!(result.unwrap_err(), CallError::Cancelled);
    assert!(fake.account.borrow().calls.is_empty());
    assert_eq!(store.unsynced(OWNER).unwrap(), 1);
    store.set_owner("");
    drop(store);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_long_backlog_is_reported_so_it_drains_at_once() {
    let dir = directory();
    let fake = Fake::default();
    let mut store = open(&dir);
    let all: Vec<Annotation> = (1..=(BATCH as u32 + 5))
        .map(|verse| Annotation {
            verse,
            marks: VerseMarks {
                highlight: Some(MarkColor::Named("yellow")),
                ..Default::default()
            },
            ..Default::default()
        })
        .collect();
    let psalm = Location {
        volume: "oldtestament".into(),
        book: "psalms".into(),
        chapter: 119,
    };
    store.save_annotations(&psalm, &all).unwrap();
    let first = sync(&fake, &dir, &[]).unwrap();
    assert!(first.more);
    let second = sync(&fake, &dir, &[]).unwrap();
    assert!(!second.more);
    assert_eq!(fake.account.borrow().verses.len(), BATCH + 5);
    assert_eq!(store.unsynced(OWNER).unwrap(), 0);
    drop(store);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn only_changed_fields_are_sent() {
    let d = DirtyAnnotation {
        location: alma(),
        annotation: Annotation {
            verse: 21,
            note: "kept".into(),
            marks: VerseMarks {
                underline: Some(MarkColor::Custom("#123abc".into())),
                ..Default::default()
            },
            bookmarked: true,
        },
        rev: 9,
        marks: true,
        note: false,
    };
    let args = verse_args(&d, "And now as I said");
    assert_eq!(args["volume"], "bookofmormon");
    assert_eq!(args["marks"]["underlineColor"], "#123abc");
    assert!(args["marks"]["highlightColor"].is_null());
    assert!(args.get("note").is_none());
    assert!(args.get("bookmarked").is_none());
}

#[test]
fn server_rows_become_local_annotations() {
    let value = json!({ "by_verse": {
        "21": [{ "id": "a", "verse": 21, "body": "Faith", "is_mine": true, "highlight_color": "blue",
                 "underline": true, "underline_color": null,
                 "text_marks": [{ "start": 0, "end": 3, "text": "And", "kind": "underline", "color": "#a1b2c3" }] }],
        "22": [{ "id": "b", "verse": 22, "body": "", "is_mine": false, "highlight_color": "red" }]
    }});
    let rows = remote_annotations(&value);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].marks.highlight, Some(MarkColor::Named("blue")));
    assert_eq!(
        rows[0].marks.underline,
        Some(MarkColor::Named("red")),
        "an uncolored underline is red"
    );
    assert_eq!(
        rows[0].marks.text_marks[0].color,
        MarkColor::Custom("#a1b2c3".into())
    );
    assert_eq!(rows[0].note, "Faith");
}
#[test]
fn titles_travel_as_the_markdown_heading() {
    let mut note = Note::new("2026-10-27", None);
    note.title = "Seeds".into();
    note.body = "A particle of faith.\n".into();
    let markdown = note_markdown(&note);
    assert_eq!(markdown, "# Seeds\n\nA particle of faith.\n");
    assert_eq!(
        split_markdown(&markdown),
        ("Seeds".into(), "A particle of faith.\n".into())
    );
    assert_eq!(
        split_markdown("No heading"),
        (String::new(), "No heading".into())
    );
    note.title.clear();
    assert_eq!(note_markdown(&note), note.body);
}
#[test]
fn sources_serialize_like_the_websites_validator() {
    let source = NoteSource::scripture(
        "Doctrine and Covenants",
        &Location {
            volume: "doctrineandcovenants".into(),
            book: "dc".into(),
            chapter: 4,
        },
        Some((2, 2)),
    );
    let v = serde_json::to_value(&source).unwrap();
    assert_eq!(v["kind"], "scripture");
    assert_eq!(v["href"], "/browse/dnc/dc/4#v-2");
    assert_eq!(v["verseStart"], 2);
    assert!(v.get("verse_start").is_none());
    assert_eq!(chapter_args(&source.location().unwrap().0)["volume"], "dnc");
}

#[test]
fn copying_this_computers_study_uses_the_accounts_idempotent_imports() {
    let dir = directory();
    let mut device = Store::open(&dir).unwrap();
    let mut note = Note::new(
        "2026-10-20",
        Some(NoteSource::lesson("2026-10-19", "Jeremiah 1–10")),
    );
    note.title = "Before signing in".into();
    note.body = "Written on this computer — ✓".into();
    device.save_note(&note).unwrap();
    device
        .save_annotation(
            &alma(),
            &Annotation {
                verse: 21,
                note: "  faith   is  ".into(),
                marks: VerseMarks {
                    highlight: Some(MarkColor::Named("yellow")),
                    ..Default::default()
                },
                ..Default::default()
            },
        )
        .unwrap();
    // A bookmark alone is this app's own and isn't copied.
    device
        .save_annotation(
            &alma(),
            &Annotation {
                verse: 22,
                bookmarked: true,
                ..Default::default()
            },
        )
        .unwrap();
    let calls = device_imports(&device, "owner-key").unwrap();
    assert_eq!(calls.len(), 2);
    let (path, args) = &calls[0];
    assert_eq!(*path, "insights:importDeviceNote");
    assert_eq!(args["deviceId"], format!("native-note:{}", note.id));
    assert_eq!(args["expectedOwner"], "owner-key");
    assert_eq!(
        args["markdownBody"],
        "# Before signing in\n\nWritten on this computer — ✓"
    );
    assert_eq!(args["source"]["href"], "/come-follow-me/2026-10-19");
    let (path, args) = &calls[1];
    assert_eq!(*path, "annotations:upsertVerseAnnotation");
    assert_eq!(
        args["deviceImportId"],
        "native-verse:bookofmormon:alma:32:21"
    );
    assert_eq!(args["body"], "faith is");
    assert_eq!(args["highlightColor"], "yellow");
    // The device's own study is left exactly as it was.
    assert_eq!(device.all_notes().unwrap().len(), 1);
    assert_eq!(device.unsynced("").unwrap(), 0);
    drop(device);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn reading_progress_uses_the_canonical_volume_and_marks_use_the_slug() {
    let dc = Location {
        volume: "doctrineandcovenants".into(),
        book: "dc".into(),
        chapter: 4,
    };
    assert_eq!(progress_args(&dc)["volume"], "doctrineandcovenants");
    assert_eq!(chapter_args(&dc)["volume"], "dnc");
}

#[test]
fn text_written_here_in_a_note_published_elsewhere_is_kept_as_a_separate_draft() {
    let dir = directory();
    let fake = Fake::default();
    let mut store = open(&dir);
    let mut note = Note::new(
        "2026-10-27",
        Some(NoteSource::scripture("Alma", &alma(), Some((21, 21)))),
    );
    note.body = "Faith grows".into();
    note.reading_at = Some(1_790_000_000);
    store.save_note(&note).unwrap();
    sync(&fake, &dir, &[]).unwrap();
    let (remote, _) = fake.only_draft();
    // Written here (the status isn't known here yet) while the website publishes it.
    let mut editor = store.note(&note.id).unwrap().unwrap();
    editor.body = "Faith grows, like a seed".into();
    store.save_note(&editor).unwrap();
    fake.web_status(&remote, "published");
    let report = sync(&fake, &dir, &[]).unwrap();
    assert!(report.problems.is_empty(), "{:?}", report.problems);
    assert_eq!(report.read_only_copies.len(), 1);
    let (original, copy, _) = &report.read_only_copies[0];
    assert_eq!(original, &note.id);
    // The published note is the account's again, read-only, and its reading is its own.
    let published = store.note(&note.id).unwrap().unwrap();
    assert_eq!(published.body, "Faith grows");
    assert!(published.reading_at.is_some());
    assert_eq!(store.note_status(&note.id).unwrap(), "published");
    // The text written here is a draft of the same account, without logging the reading again.
    let kept = store.note(copy).unwrap().unwrap();
    assert_eq!(kept.body, "Faith grows, like a seed");
    assert_eq!(kept.reading_at, None);
    assert_eq!(kept.source, published.source);
    assert_eq!(store.note_status(copy).unwrap(), "draft");
    // The next sync sends the copy as its own entry and leaves the published one alone.
    sync(&fake, &dir, &[]).unwrap();
    let a = fake.account.borrow();
    assert_eq!(a.drafts[&remote].markdown, "Faith grows");
    assert_eq!(a.drafts[&remote].status, "published");
    let mut others: Vec<(&str, bool)> = a
        .drafts
        .iter()
        .filter(|(id, _)| **id != remote)
        .map(|(_, d)| (d.markdown.as_str(), d.reading_at.is_some()))
        .collect();
    others.sort();
    assert_eq!(others, [("Faith grows, like a seed", false)]);
    drop(a);
    assert_eq!(store.unsynced(OWNER).unwrap(), 0);
    // Nothing of this belongs to this computer's own study.
    store.set_owner("");
    assert!(store.all_notes().unwrap().is_empty());
    drop(store);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_published_note_refuses_every_change_here_and_comes_back_if_deleted() {
    let dir = directory();
    let fake = Fake::default();
    let mut store = open(&dir);
    let mut note = Note::new("2026-10-27", None);
    note.title = "Shared".into();
    note.body = "Published words".into();
    store.save_note(&note).unwrap();
    sync(&fake, &dir, &[]).unwrap();
    let (remote, _) = fake.only_draft();
    // Deleted here before the publish was known: the account refuses, so it comes back.
    store.delete_note(&note.id).unwrap();
    fake.web_status(&remote, "published");
    let report = sync(&fake, &dir, &[]).unwrap();
    assert!(report.problems.is_empty(), "{:?}", report.problems);
    assert!(report.read_only_copies.is_empty());
    let back = store
        .note(&note.id)
        .unwrap()
        .expect("the published note is back");
    assert_eq!(
        (back.title.as_str(), back.body.as_str()),
        ("Shared", "Published words")
    );
    assert_eq!(fake.account.borrow().drafts.len(), 1);
    // Known as published now: every change is refused or kept apart.
    assert!(store.delete_note(&note.id).is_err());
    let mut moved = back.clone();
    moved.journal_date = "2026-10-20".into();
    assert!(store.save_note(&moved).is_err(), "its day can't change");
    let mut logged = back.clone();
    logged.reading_at = Some(1);
    assert!(store.save_note(&logged).is_err(), "nor its reading");
    let unchanged = store.save_note(&back).unwrap();
    assert!(!unchanged.forked && unchanged.id == note.id);
    let mut typed = back.clone();
    typed.body = "Published words, and more".into();
    let saved = store.save_note(&typed).unwrap();
    assert!(saved.forked && saved.read_only && saved.id != note.id);
    assert_eq!(
        store.note(&note.id).unwrap().unwrap().body,
        "Published words"
    );
    assert_eq!(
        store.note(&saved.id).unwrap().unwrap().body,
        "Published words, and more"
    );
    sync(&fake, &dir, &[]).unwrap();
    assert_eq!(
        fake.account.borrow().drafts[&remote].markdown,
        "# Shared\n\nPublished words"
    );
    assert_eq!(fake.account.borrow().drafts.len(), 2);
    // An archived note is read-only too, but can be deleted, as on the website.
    fake.web_status(&remote, "archived");
    sync(&fake, &dir, &[]).unwrap();
    assert_eq!(store.note_status(&note.id).unwrap(), "archived");
    let again = store.note(&note.id).unwrap().unwrap();
    let mut typed = again.clone();
    typed.body = "Archived words?".into();
    assert!(store.save_note(&typed).unwrap().read_only);
    store.delete_note(&note.id).unwrap();
    sync(&fake, &dir, &[]).unwrap();
    assert!(!fake.account.borrow().drafts.contains_key(&remote));
    drop(store);
    let _ = std::fs::remove_dir_all(dir);
}
