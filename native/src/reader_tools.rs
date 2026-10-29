// The reader's study tools, after the website's ChapterReader: study paths beside verses (`/api/insights/chapter`),
// Explore a word (`WordStudyPanel`: the scripture study helps, Strong's Hebrew and Greek, English dictionaries),
// lesson Resources for the selected verses (`/api/resources`), and for the Bible the reader's other Bibles shown
// verse by verse beside the KJV (`BibleTranslationToolbar`, HelloAO) and Joseph Smith Translation passages. The
// scripture text itself stays embedded; these are the website's own public endpoints, called off the UI thread.
// Every result is for the chapter or word it was asked for; a late one for anything else is dropped.
use crate::account::background;
use crate::store::{Location, Verse};
use crate::{App, Message};
use iced::Task;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use unicode_normalization::UnicodeNormalization;

// ---------- The website's payloads ----------

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct StudyPath {
    pub kind: String,
    #[serde(default)]
    pub verse_numbers: Vec<u32>,
    pub title: String,
    #[serde(default)]
    pub direction: String,
    #[serde(default)]
    pub why: String,
    #[serde(default)]
    pub look_for: Vec<String>,
    #[serde(default)]
    pub sources: Vec<PathSource>,
    #[serde(default)]
    pub scripture_links: Vec<ScriptureLink>,
}
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct PathSource {
    pub title: String,
    pub url: String,
    #[serde(default)]
    pub format: String,
}
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct ScriptureLink {
    pub reference: String,
    pub volume: String,
    pub book: String,
    pub chapter: u32,
    pub verse_start: u32,
    #[serde(default)]
    pub verse_end: u32,
}
/// `KIND_LABELS` in VerseStudyPaths.
pub fn kind_label(kind: &str) -> &'static str {
    match kind {
        "cross_reference" => "Cross-reference",
        "doctrinal_context" => "Doctrinal context",
        "historical_context" => "Historical context",
        "word_or_phrase" => "Word or phrase",
        "textual_pattern" => "Textual pattern",
        "open_question" => "Open question",
        _ => "Study path",
    }
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Resource {
    pub id: String,
    pub title: String,
    pub reference: String,
    pub lesson_title: String,
    pub date_label: String,
    pub href: String,
    #[serde(default)]
    pub body_html: String,
    #[serde(default)]
    pub sources: Vec<ResourceSource>,
}
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct ResourceSource {
    pub title: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryEntry {
    pub id: String,
    pub word: String,
    #[serde(default)]
    pub heading: Option<String>,
    #[serde(default)]
    pub entry_text: String,
    #[serde(default)]
    pub pronounce: Option<String>,
}
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Etymology {
    pub id: String,
    pub source: String,
    pub word: String,
    pub text: String,
}
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Dictionary {
    /// Edition, source label, entries; only editions with entries.
    pub groups: Vec<(String, String, Vec<DictionaryEntry>)>,
    pub etymology: Vec<Etymology>,
}
pub fn parse_dictionary(v: &serde_json::Value) -> Result<Dictionary, String> {
    if v["ok"] != true || v["enabled"] != true {
        return Err("Lookup unavailable".into());
    }
    let mut groups = Vec::new();
    for edition in ["1828", "1844", "1913"] {
        let entries: Vec<DictionaryEntry> =
            serde_json::from_value(v["byEdition"][edition]["entries"].clone()).unwrap_or_default();
        if !entries.is_empty() {
            let source = v["providerLabels"][edition]
                .as_str()
                .filter(|s| !s.is_empty())
                .unwrap_or("Dictionary")
                .to_string();
            groups.push((edition.to_string(), source, entries));
        }
    }
    let etymology = serde_json::from_value(v["etymology"]["items"].clone()).unwrap_or_default();
    Ok(Dictionary { groups, etymology })
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrongsMatch {
    pub id: String,
    pub lemma: String,
    pub transliteration: String,
    #[serde(default)]
    pub pronunciation: Option<String>,
    pub definition: String,
    #[serde(default)]
    pub derivation: String,
    #[serde(default)]
    pub kjv: String,
}
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Lexicon {
    pub matches: Vec<StrongsMatch>,
    pub total: usize,
    pub title: String,
    pub source_url: String,
}
pub fn parse_lexicon(v: &serde_json::Value) -> Result<Lexicon, String> {
    if v["ok"] != true {
        return Err("The lexicon could not be read.".into());
    }
    let lookup = &v["lookup"];
    Ok(Lexicon {
        matches: serde_json::from_value(lookup["matches"].clone()).unwrap_or_default(),
        total: lookup["total"].as_u64().unwrap_or(0) as usize,
        title: lookup["attribution"]["title"]
            .as_str()
            .unwrap_or("Strong’s Dictionary")
            .into(),
        source_url: lookup["attribution"]["sourceUrl"]
            .as_str()
            .unwrap_or("")
            .into(),
    })
}

/// A study helps entry's text (`StudyHelpEntry`): headings, paragraphs and lists of marked-up runs.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct HelpEntry {
    pub guide: String,
    pub slug: String,
    pub title: String,
    pub url: String,
    pub blocks: Vec<HelpBlock>,
    #[serde(default)]
    pub truncated: bool,
}
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum HelpBlock {
    Heading {
        content: Vec<HelpInline>,
    },
    Paragraph {
        #[serde(default)]
        style: Option<String>,
        content: Vec<HelpInline>,
    },
    List {
        items: Vec<Vec<HelpInline>>,
    },
}
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum HelpInline {
    Text(String),
    Link {
        href: String,
        #[serde(default)]
        topic: Option<HelpTopic>,
        #[serde(default, rename = "appHref")]
        app_href: Option<String>,
        children: Vec<HelpInline>,
    },
    Mark {
        mark: String,
        children: Vec<HelpInline>,
    },
}
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct HelpTopic {
    pub guide: String,
    pub slug: String,
}
pub fn inline_text(content: &[HelpInline]) -> String {
    content
        .iter()
        .map(|n| match n {
            HelpInline::Text(t) => t.clone(),
            HelpInline::Link { children, .. } | HelpInline::Mark { children, .. } => {
                inline_text(children)
            }
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JstExcerpt {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub compare_reference: String,
    #[serde(default)]
    pub anchor_verse: Option<u32>,
    /// The KJV verses in this chapter the excerpt compares to.
    #[serde(default)]
    pub compared_spans: Vec<JstSpan>,
    #[serde(default)]
    pub verses: Vec<JstVerse>,
    #[serde(default)]
    pub note: Option<String>,
}
/// A KJV verse span inside the chapter; `end: None` runs to the end of the chapter.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct JstSpan {
    pub start: u32,
    #[serde(default)]
    pub end: Option<u32>,
}
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct JstVerse {
    pub number: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Translation {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub english_name: Option<String>,
    #[serde(default)]
    pub short_name: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub language_english_name: Option<String>,
    #[serde(default)]
    pub language_name: Option<String>,
}
impl Translation {
    /// `translationTitle`.
    pub fn title(&self) -> String {
        self.english_name
            .clone()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| self.name.clone())
    }
    pub fn language_label(&self) -> String {
        self.language_english_name
            .clone()
            .or_else(|| self.language_name.clone())
            .or_else(|| self.language.clone())
            .unwrap_or_else(|| "Unknown language".into())
    }
    pub fn favorite(&self) -> FavoriteBible {
        FavoriteBible {
            id: self.id.clone(),
            label: self.title(),
            language: Some(self.language_label()),
            abbreviation: self.short_name.clone().or_else(|| Some(self.id.clone())),
        }
    }
}
/// A Bible kept in "Your Bibles" (`FavoriteTranslation`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FavoriteBible {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub abbreviation: Option<String>,
}
/// `FEATURED_BIBLES`.
pub fn featured_bibles() -> Vec<FavoriteBible> {
    [
        ("BSB", "BSB", "Berean Standard Bible"),
        ("eng_net", "NET", "NET Bible"),
        ("eng_webu", "WEB", "World English Bible Updated"),
        ("eng_fbv", "FBV", "Free Bible Version"),
        ("eng_lsv", "LSV", "Literal Standard Version"),
    ]
    .into_iter()
    .map(|(id, short, label)| FavoriteBible {
        id: id.into(),
        label: label.into(),
        language: Some("English".into()),
        abbreviation: Some(short.into()),
    })
    .collect()
}
pub fn is_bible(volume: &str) -> bool {
    volume == "oldtestament" || volume == "newtestament"
}

// ---------- Scripture study helps, matched on this computer (src/lib/studyHelps.ts) ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Guide {
    Bd,
    Gs,
    Tg,
}
impl Guide {
    pub const ALL: [Guide; 3] = [Guide::Bd, Guide::Gs, Guide::Tg];
    pub fn id(self) -> &'static str {
        match self {
            Guide::Bd => "bd",
            Guide::Gs => "gs",
            Guide::Tg => "tg",
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Guide::Bd => "Bible Dictionary",
            Guide::Gs => "Guide to the Scriptures",
            Guide::Tg => "Topical Guide",
        }
    }
    pub fn description(self) -> &'static str {
        match self {
            Guide::Bd => "Bible people, places, and terms",
            Guide::Gs => "Topics across all the standard works",
            Guide::Tg => "Verses gathered by topic",
        }
    }
}
fn fold(value: &str) -> String {
    value
        .nfkd()
        .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
        .map(|c| match c {
            '‘' | '’' | 'ʼ' => '\'',
            c => c,
        })
        .flat_map(char::to_lowercase)
        .collect()
}
pub fn slugify(title: &str) -> String {
    let folded = fold(title).replace('\'', "");
    let mut out = String::new();
    let mut dash = false;
    for c in folded.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            dash = false;
        } else if !dash && !out.is_empty() {
            out.push('-');
            dash = true;
        }
    }
    out.trim_end_matches('-').to_string()
}
pub fn normalize_phrase(value: &str) -> String {
    let folded = fold(value);
    let folded = regex::Regex::new(r"'s\b").unwrap().replace_all(&folded, "");
    folded
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}
fn term_forms(term: &str) -> Vec<String> {
    let mut forms = vec![term.to_string()];
    if term.len() > 4 && term.ends_with("ies") {
        forms.push(format!("{}y", &term[..term.len() - 3]));
    }
    if term.len() > 3
        && ["ses", "xes", "zes", "ches", "shes"]
            .iter()
            .any(|e| term.ends_with(e))
    {
        forms.push(term[..term.len() - 2].to_string());
    }
    if term.len() > 3 && term.ends_with('s') && !term.ends_with("ss") {
        forms.push(term[..term.len() - 1].to_string());
    }
    forms.dedup();
    forms
}
const RELATED_STOPWORDS: &[&str] = &[
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "did", "do", "for", "from", "had",
    "has", "have", "he", "her", "him", "his", "i", "in", "is", "it", "me", "my", "not", "o", "of",
    "on", "or", "our", "shall", "she", "that", "the", "thee", "their", "them", "they", "thou",
    "thy", "to", "unto", "us", "was", "we", "were", "which", "who", "will", "with", "ye", "you",
    "your",
];
struct Prepared {
    title: String,
    slug: String,
    padded: String,
    full: String,
    headword: String,
    alternatives: Vec<String>,
}
fn prepare(title: &str, slug: Option<&str>) -> Prepared {
    let plain = regex::Regex::new(r"\[[^\]]*\]|\([^)]*\)")
        .unwrap()
        .replace_all(title, " ")
        .to_string();
    let or = regex::Regex::new(r"(?i)\s+or\s+").unwrap();
    let parts: Vec<String> = plain
        .split(',')
        .flat_map(|p| or.split(p).map(str::to_string).collect::<Vec<_>>())
        .map(|p| {
            let p = p.trim();
            p.strip_prefix("or ")
                .or_else(|| p.strip_prefix("Or "))
                .unwrap_or(p)
                .to_string()
        })
        .filter(|p| !p.is_empty())
        .collect();
    let normalized: Vec<String> = parts.iter().map(|p| normalize_phrase(p)).collect();
    let headword = normalized.first().cloned().unwrap_or_default();
    let lists_forms = normalized.len() > 1
        && parts[1..]
            .iter()
            .all(|p| !p.contains(char::is_whitespace) && !p.starts_with('-'));
    let full = normalize_phrase(&plain);
    Prepared {
        title: title.to_string(),
        slug: slug.map(str::to_string).unwrap_or_else(|| slugify(title)),
        padded: format!(" {full} "),
        full,
        headword,
        alternatives: if lists_forms {
            normalized[1..].to_vec()
        } else {
            vec![]
        },
    }
}
#[derive(Debug, Clone, PartialEq, Default)]
pub struct HelpMatches {
    /// Topics headed by the word: (title, slug).
    pub entries: Vec<(String, String)>,
    /// Other topics whose titles contain it.
    pub related: Vec<(String, String)>,
}
fn prepared_guides() -> &'static HashMap<Guide, Vec<Prepared>> {
    static GUIDES: std::sync::OnceLock<HashMap<Guide, Vec<Prepared>>> = std::sync::OnceLock::new();
    GUIDES.get_or_init(|| {
        let index: serde_json::Value =
            serde_json::from_str(include_str!("../../src/lib/generated/studyHelpsIndex.json"))
                .unwrap_or_default();
        Guide::ALL
            .iter()
            .map(|g| {
                let entries = index["guides"][g.id()]["entries"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|e| match e {
                        serde_json::Value::String(t) => Some(prepare(t, None)),
                        serde_json::Value::Array(pair) => Some(prepare(
                            pair.first()?.as_str()?,
                            pair.get(1).and_then(|s| s.as_str()),
                        )),
                        _ => None,
                    })
                    .collect();
                (*g, entries)
            })
            .collect()
    })
}
/// `findStudyHelpMatches`: up to three topics headed by the word, and four related ones.
pub fn study_help_matches(guide: Guide, word: &str) -> HelpMatches {
    let term = normalize_phrase(word);
    if term.is_empty() {
        return HelpMatches::default();
    }
    let forms = term_forms(&term);
    let search_related = term.len() > 2 && !RELATED_STOPWORDS.contains(&term.as_str());
    let mut exact: Vec<(usize, &Prepared)> = Vec::new();
    let mut related: Vec<(usize, &Prepared)> = Vec::new();
    for entry in &prepared_guides()[&guide] {
        let rank = forms
            .iter()
            .enumerate()
            .filter_map(|(i, form)| {
                let r = if entry.full == *form {
                    0
                } else if entry.headword == *form {
                    1
                } else if entry.alternatives.contains(form) {
                    2
                } else {
                    return None;
                };
                Some(i * 3 + r)
            })
            .min();
        if let Some(rank) = rank {
            exact.push((rank, entry));
            continue;
        }
        if !search_related {
            continue;
        }
        if let Some(position) = forms
            .iter()
            .filter_map(|form| entry.padded.find(&format!(" {form} ")))
            .min()
        {
            related.push((
                if position == 0 { 0 } else { 1000 } + entry.full.len(),
                entry,
            ));
        }
    }
    let order = |v: &mut Vec<(usize, &Prepared)>, n: usize| -> Vec<(String, String)> {
        v.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.title.cmp(&b.1.title)));
        v.iter()
            .take(n)
            .map(|(_, e)| (e.title.clone(), e.slug.clone()))
            .collect()
    };
    HelpMatches {
        entries: order(&mut exact, 3),
        related: order(&mut related, 4),
    }
}

/// The lessons' resource HTML (`<p>`, `<em>`, `<strong>`, `<a>`, lists) as Markdown, which the reader renders.
pub fn html_to_markdown(html: &str) -> String {
    let tag = regex::Regex::new(r"(?s)<(/?)([a-zA-Z0-9]+)([^>]*)>").unwrap();
    let href = regex::Regex::new(r#"href="([^"]*)""#).unwrap();
    let mut out = String::new();
    let mut last = 0;
    let mut links: Vec<String> = Vec::new();
    for c in tag.captures_iter(html) {
        let m = c.get(0).unwrap();
        out.push_str(&decode_entities(&html[last..m.start()]));
        last = m.end();
        let closing = &c[1] == "/";
        match (c[2].to_ascii_lowercase().as_str(), closing) {
            ("p", false) | ("div", false) => {}
            ("p", true) | ("div", true) => out.push_str("\n\n"),
            ("br", _) => out.push_str("  \n"),
            ("em" | "i", _) => out.push('*'),
            ("strong" | "b", _) => out.push_str("**"),
            ("li", false) => out.push_str("- "),
            ("li", true) => out.push('\n'),
            ("ul" | "ol", true) => out.push('\n'),
            ("blockquote", false) => out.push_str("> "),
            ("blockquote", true) => out.push_str("\n\n"),
            ("a", false) => {
                links.push(
                    href.captures(&c[3])
                        .map(|h| decode_entities(&h[1]))
                        .unwrap_or_default(),
                );
                out.push('[');
            }
            ("a", true) => {
                let target = links.pop().unwrap_or_default();
                out.push_str(&format!("]({})", target.replace(' ', "%20")));
            }
            _ => {}
        }
    }
    out.push_str(&decode_entities(&html[last..]));
    out.trim().to_string()
}
fn decode_entities(text: &str) -> String {
    text.replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
}

// ---------- Live calls ----------

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(30)))
        .http_status_as_error(false)
        .build()
        .into()
}
fn get_json(url: &str) -> Result<serde_json::Value, String> {
    let mut response = agent()
        .get(url)
        .call()
        .map_err(|e| format!("Couldn't reach Verse Together: {e}"))?;
    let status = response.status().as_u16();
    let value: serde_json::Value = response
        .body_mut()
        .read_json()
        .map_err(|_| format!("Verse Together answered HTTP {status}"))?;
    if !(200..300).contains(&status) {
        return Err(value["error"]
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| format!("Verse Together answered HTTP {status}")));
    }
    Ok(value)
}
fn encode(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}
pub fn fetch_study_paths(site: &str, l: &Location) -> Result<Vec<StudyPath>, String> {
    let mut response = agent()
        .post(&format!("{site}/api/insights/chapter"))
        .send_json(serde_json::json!({ "volume": l.volume, "book": l.book, "chapter": l.chapter }))
        .map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let value: serde_json::Value = response.body_mut().read_json().map_err(|e| e.to_string())?;
    if !(200..300).contains(&status) {
        return Err(value["error"].as_str().unwrap_or("unavailable").to_string());
    }
    Ok(serde_json::from_value(value["paths"].clone()).unwrap_or_default())
}
pub fn fetch_resources(site: &str, l: &Location, verses: &[u32]) -> Result<Vec<Resource>, String> {
    let spec = verses
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let v = get_json(&format!(
        "{site}/api/resources?volume={}&book={}&chapter={}&verses={}",
        encode(&l.volume),
        encode(&l.book),
        l.chapter,
        encode(&spec)
    ))?;
    serde_json::from_value(v["resources"].clone()).map_err(|_| "Invalid lesson resources".into())
}
pub fn fetch_dictionary(site: &str, word: &str) -> Result<Dictionary, String> {
    parse_dictionary(&get_json(&format!(
        "{site}/api/tools/dictionary?term={}",
        encode(word)
    ))?)
}
pub fn fetch_lexicon(site: &str, language: &str, term: &str) -> Result<Lexicon, String> {
    parse_lexicon(&get_json(&format!(
        "{site}/api/tools/lexicon?language={language}&term={}",
        encode(term)
    ))?)
}
pub fn fetch_help(site: &str, guide: &str, slug: &str) -> Result<HelpEntry, String> {
    let v = get_json(&format!(
        "{site}/api/tools/study-helps?guide={guide}&slug={}",
        encode(slug)
    ))?;
    serde_json::from_value(v["entry"].clone()).map_err(|_| "The entry could not be loaded.".into())
}
pub fn fetch_translations(site: &str) -> Result<Vec<Translation>, String> {
    let v = get_json(&format!("{site}/api/helloao/translations"))?;
    Ok(serde_json::from_value(v["translations"].clone()).unwrap_or_default())
}
pub fn fetch_chapter(site: &str, l: &Location, translation: &str) -> Result<Vec<Verse>, String> {
    let v = get_json(&format!(
        "{site}/api/scriptures/chapter?volume={}&book={}&chapter={}&translation={}",
        encode(&l.volume),
        encode(&l.book),
        l.chapter,
        encode(translation)
    ))?;
    // A translation the provider substituted (fell back) is reported as such, not shown as the one asked for.
    if v["translation"]
        .as_str()
        .is_some_and(|t| !t.eq_ignore_ascii_case(translation))
    {
        return Err(format!("{translation} isn't available for this chapter."));
    }
    Ok(v["verses"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|r| {
            Some(Verse {
                number: r["verse"].as_u64()? as u32,
                text: r["text"].as_str()?.to_string(),
            })
        })
        .collect())
}
/// The chapter in the reader's default Bible (`fetchChapterOnServer(…, { translation: defaultBible })`): its verses and
/// the translation that actually answered, which is the bundled LDS text ("lds") when the provider fell back to it.
pub fn fetch_primary(
    site: &str,
    l: &Location,
    translation: &str,
) -> Result<(String, Vec<Verse>), String> {
    let v = get_json(&format!(
        "{site}/api/scriptures/chapter?volume={}&book={}&chapter={}&translation={}",
        encode(&l.volume),
        encode(&l.book),
        l.chapter,
        encode(translation)
    ))?;
    let actual = v["translation"]
        .as_str()
        .map(crate::faith::normalize_default_bible)
        .unwrap_or_else(|| crate::faith::LDS_BIBLE_ID.into());
    let verses: Vec<Verse> = v["verses"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|r| {
            Some(Verse {
                number: r["verse"].as_u64()? as u32,
                text: r["text"].as_str()?.to_string(),
            })
        })
        .collect();
    if verses.is_empty() {
        return Err(format!("{translation} has no text for this chapter."));
    }
    Ok((actual, verses))
}
pub fn fetch_jst(site: &str, l: &Location) -> Result<Vec<JstExcerpt>, String> {
    let v = get_json(&format!(
        "{site}/api/scriptures/jst?volume={}&book={}&chapter={}",
        encode(&l.volume),
        encode(&l.book),
        l.chapter
    ))?;
    serde_json::from_value(v["excerpts"].clone()).map_err(|_| "Invalid JST excerpts".into())
}

// ---------- Word differences for comparisons (`computeInlineDiffSegments`) ----------

/// One piece of a verse read against another Bible (`computeInlineDiffSegments` + `renderInlineDiff`): a byte
/// range of the base text, exactly as written (its own spacing and punctuation), and for a change the other
/// Bible's differing words.
#[derive(Debug, Clone, PartialEq)]
pub enum Diff {
    Same(std::ops::Range<usize>),
    Changed(std::ops::Range<usize>, String),
}
/// `normalizeWord`: lowercase letters and digits only.
fn word_key(w: &str) -> String {
    w.to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        .collect()
}
/// The website's `normalizeCompareText`: a Bible's wording only counts as different past case and punctuation.
pub fn normalize_compare(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_lowercase() || c.is_ascii_digit() || c.is_whitespace() {
                c
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// The website's inline comparison of `primary` with `other`, word by word (longest common subsequence on
/// normalized words), with each piece's base text cut from `primary` as `renderInlineDiff` cuts it.
pub fn diff_words(primary: &str, other: &str) -> Vec<Diff> {
    let tokens: Vec<(usize, &str)> = primary
        .split_whitespace()
        .map(|w| (w.as_ptr() as usize - primary.as_ptr() as usize, w))
        .collect();
    let b: Vec<&str> = other.split_whitespace().collect();
    let (ka, kb): (Vec<String>, Vec<String>) = (
        tokens.iter().map(|(_, w)| word_key(w)).collect(),
        b.iter().map(|w| word_key(w)).collect(),
    );
    let (n, m) = (tokens.len(), b.len());
    let mut table = vec![vec![0u32; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            table[i][j] = if ka[i] == kb[j] {
                table[i + 1][j + 1] + 1
            } else {
                table[i + 1][j].max(table[i][j + 1])
            };
        }
    }
    // Segments as counts of base words, with the other Bible's changed words.
    let mut segments: Vec<(bool, usize, Vec<&str>)> = vec![];
    let (mut pending_a, mut pending_b): (usize, Vec<&str>) = (0, vec![]);
    let (mut i, mut j) = (0, 0);
    fn flush<'a>(
        segments: &mut Vec<(bool, usize, Vec<&'a str>)>,
        a: &mut usize,
        b: &mut Vec<&'a str>,
    ) {
        if *a > 0 || !b.is_empty() {
            segments.push((false, *a, std::mem::take(b)));
            *a = 0;
        }
    }
    while i < n || j < m {
        if i < n && j < m && ka[i] == kb[j] {
            flush(&mut segments, &mut pending_a, &mut pending_b);
            match segments.last_mut() {
                Some((true, count, _)) => *count += 1,
                _ => segments.push((true, 1, vec![])),
            }
            i += 1;
            j += 1;
        } else if i < n && (j >= m || table[i + 1][j] >= table[i][j + 1]) {
            pending_a += 1;
            i += 1;
        } else if j < m {
            pending_b.push(b[j]);
            j += 1;
        }
    }
    flush(&mut segments, &mut pending_a, &mut pending_b);
    let mut out = vec![];
    let (mut token_index, mut source_offset) = (0, 0);
    for (equal, count, changed) in segments {
        token_index += count;
        let end = if token_index == tokens.len() {
            primary.len()
        } else if count > 0 {
            let (at, word) = tokens[token_index - 1];
            at + word.len()
        } else {
            source_offset
        };
        let range = source_offset..end;
        source_offset = end;
        out.push(if equal {
            Diff::Same(range)
        } else {
            Diff::Changed(range, changed.join(" "))
        });
    }
    out
}

// ---------- State ----------

/// A lesson resource with its text parsed for display.
pub type ParsedResource = (Resource, Vec<iced::widget::markdown::Item>);
#[derive(Debug, Clone, PartialEq)]
pub enum Load<T> {
    Loading,
    Ready(T),
    Failed(String),
}
#[derive(Debug, Clone, PartialEq)]
pub enum Panel {
    /// Study paths for a verse.
    Paths(u32),
    /// Explore a word.
    Explore,
    /// Lesson resources for the verses selected when it opened.
    Resources(Vec<u32>),
}
#[derive(Debug, Clone, PartialEq)]
pub enum BiblesView {
    List,
    Add,
}
pub struct Explore {
    pub word: String,
    pub dictionary: Load<Dictionary>,
    pub hebrew: Load<Lexicon>,
    pub greek: Load<Lexicon>,
    pub helps: Vec<(Guide, HelpMatches)>,
    /// The open section: 0 helps, 1 languages, 2 English.
    pub open: Option<usize>,
    /// A study helps entry being read.
    pub entry: Option<(Guide, String, Load<HelpEntry>)>,
}
/// The reader's main text (`ChapterContent.translation`): the bundled LDS KJV, or the default Bible's chapter.
#[derive(Debug, Clone, PartialEq, Default)]
pub enum Primary {
    /// The bundled text, as asked for: not a Bible chapter, or the default Bible is the bundled one.
    #[default]
    Bundled,
    /// The default Bible's chapter is on its way; the text area stays empty meanwhile, as on the website.
    Loading { requested: String },
    /// The chapter as shown: the default Bible asked for and the translation that answered ("lds" is the bundled
    /// text, shown after a failure, with the website's notice).
    Shown { requested: String, actual: String },
}
/// A default Bible's chapter as it was last loaded: its text (`None`: the bundled text was shown instead).
#[derive(Debug, Clone)]
pub struct CachedPrimary {
    pub location: Location,
    pub requested: String,
    pub actual: String,
    pub verses: Option<Vec<Verse>>,
    pub at: std::time::Instant,
}
/// How many default-Bible chapters are kept in memory, and how long a failure is remembered before trying again.
pub const PRIMARY_CACHE: usize = 48;
pub const PRIMARY_RETRY: Duration = Duration::from_secs(120);
pub struct ToolsState {
    pub site: String,
    /// The chapter the extras below belong to.
    pub chapter: Option<Location>,
    pub paths: Load<Vec<StudyPath>>,
    pub panel: Option<Panel>,
    pub explore: Option<Explore>,
    /// Each resource with its lesson text parsed for display.
    pub resources: Option<Load<Vec<ParsedResource>>>,
    /// Translation id → its verses for this chapter.
    pub compare: Vec<(String, Load<Vec<Verse>>)>,
    pub jst: Option<Load<Vec<JstExcerpt>>>,
    /// The chapter as read with the JST (`readJstChapter`), from `jst` and the chapter's KJV text.
    pub jst_reading: crate::jst::Reading,
    /// "Show omitted KJV words".
    pub jst_omitted: bool,
    /// The Your Bibles "Joseph Smith Translation" disclosure is open.
    pub jst_details: bool,
    /// The full-screen Your Bibles dialog, when open: its list, or the catalog (with the language chooser).
    pub bibles_dialog: Option<BiblesView>,
    pub catalog: Option<Load<Vec<Translation>>>,
    pub catalog_query: String,
    /// The catalog's language ("eng", a language id, or all), whether all English Bibles are being browsed, and
    /// how many rows show; the language chooser (open, its search, how many rows show).
    pub catalog_language: String,
    pub catalog_browsing: bool,
    pub catalog_limit: usize,
    pub choosing_language: bool,
    pub language_query: String,
    pub language_limit: usize,
    /// The reader's main text, the default Bible's chapters already loaded, and those being fetched.
    pub primary: Primary,
    pub primary_cache: Vec<CachedPrimary>,
    pub primary_in_flight: Vec<(Location, String)>,
}
impl ToolsState {
    pub fn new() -> Self {
        Self {
            site: crate::cloud::Endpoints::from_env()
                .map(|e| e.site)
                .unwrap_or_else(|_| crate::cloud::DEFAULT_SITE.into()),
            chapter: None,
            paths: Load::Ready(vec![]),
            panel: None,
            explore: None,
            resources: None,
            compare: vec![],
            jst: None,
            jst_reading: Default::default(),
            jst_omitted: false,
            jst_details: false,
            bibles_dialog: None,
            catalog: None,
            catalog_query: String::new(),
            catalog_language: crate::bible_catalog::DEFAULT_LANGUAGE.into(),
            catalog_browsing: false,
            catalog_limit: crate::bible_catalog::PAGE_SIZE,
            choosing_language: false,
            language_query: String::new(),
            language_limit: crate::bible_catalog::PAGE_SIZE,
            primary: Primary::Bundled,
            primary_cache: vec![],
            primary_in_flight: vec![],
        }
    }
    /// The cached chapter for this default Bible, unless it is a failure old enough to try again.
    pub fn cached_primary(&self, l: &Location, requested: &str) -> Option<&CachedPrimary> {
        self.primary_cache.iter().find(|c| {
            &c.location == l
                && c.requested == requested
                && (c.verses.is_some() || c.at.elapsed() < PRIMARY_RETRY)
        })
    }
    /// Keeps a loaded chapter, newest first, within `PRIMARY_CACHE`.
    pub fn remember_primary(&mut self, entry: CachedPrimary) {
        self.primary_cache
            .retain(|c| !(c.location == entry.location && c.requested == entry.requested));
        self.primary_cache.insert(0, entry);
        self.primary_cache.truncate(PRIMARY_CACHE);
    }
    /// The study paths that tag a verse.
    pub fn paths_for(&self, verse: u32) -> Vec<&StudyPath> {
        match &self.paths {
            Load::Ready(paths) => paths
                .iter()
                .filter(|p| p.verse_numbers.contains(&verse))
                .collect(),
            _ => vec![],
        }
    }
}

#[derive(Debug, Clone)]
pub enum ToolsMsg {
    Paths(Location, Result<Vec<StudyPath>, String>),
    OpenPaths(u32),
    ClosePanel,
    /// Explore this word (the one selected when the action was shown).
    Explore(String),
    Dictionary(String, Result<Dictionary, String>),
    Lexicon(String, &'static str, Result<Lexicon, String>),
    RetryDictionary,
    RetryLexicon,
    ToggleSection(usize),
    OpenHelp(Guide, String),
    Help(Guide, String, Result<HelpEntry, String>),
    CloseHelp,
    Resources,
    ResourcesLoaded(Location, Vec<u32>, Result<Vec<Resource>, String>),
    RetryResources,
    Compare(Location, String, Result<Vec<Verse>, String>),
    /// The default Bible's chapter (`Primary`): asked for, then the translation that answered and its verses.
    Primary(Location, String, Result<(String, Vec<Verse>), String>),
    /// "Make default" (`useDefaultBible`): the Bible chapters open in.
    SetDefault(String),
    ShowBible(String, bool),
    SaveBible(FavoriteBible),
    RemoveBible(String),
    /// Opens the Your Bibles dialog on a view (or moves it there).
    BiblesView(BiblesView),
    /// Done, or Escape: the dialog closes.
    CloseBibles,
    Catalog(Result<Vec<Translation>, String>),
    CatalogQuery(String),
    /// Open or close the language chooser.
    ChooseLanguage(bool),
    CatalogLanguage(String),
    LanguageQuery(String),
    /// Enter in the language search: the first language.
    LanguageFirst,
    BrowseAllEnglish,
    CatalogMore,
    LanguagesMore,
    ToggleJst,
    /// "Show omitted KJV words" / "Hide omitted KJV words".
    ToggleJstOmitted,
    /// Open or close the "Joseph Smith Translation" disclosure under Your Bibles.
    JstDetails,
    RetryJst,
    Jst(Location, Result<Vec<JstExcerpt>, String>),
    /// A link in a tool: the reader's own scripture opens here, anything else in the browser.
    Link(String),
}
fn msg(m: ToolsMsg) -> Message {
    Message::Tools(m)
}

impl App {
    /// The default Bible this chapter is read in, when it isn't the bundled text (`ChapterPage`: Bible chapters only).
    pub(crate) fn primary_request(&self) -> Option<String> {
        let id = &self.preferences.default_bible;
        (is_bible(&self.preferences.last.volume) && id != crate::faith::LDS_BIBLE_ID)
            .then(|| id.clone())
    }
    /// The translation the reader's text is in (`primaryTranslation`): "lds" for the bundled text.
    pub(crate) fn primary_translation(&self) -> &str {
        match &self.tools.primary {
            Primary::Bundled => crate::faith::LDS_BIBLE_ID,
            Primary::Loading { requested } => requested,
            Primary::Shown { actual, .. } => actual,
        }
    }
    /// Whether the reader shows the bundled LDS KJV, which the JST appendix revises.
    pub(crate) fn primary_is_bundled(&self) -> bool {
        self.primary_translation() == crate::faith::LDS_BIBLE_ID
    }
    /// The website's notice when the default Bible couldn't load this chapter (`defaultBibleNotice`).
    pub(crate) fn primary_notice(&self) -> Option<String> {
        match &self.tools.primary {
            Primary::Shown { requested, actual } => {
                crate::faith::default_bible_notice(requested, Some(actual), self.show_lds())
            }
            _ => None,
        }
    }
    /// Puts the default Bible's text in place of the bundled verses just read, when this chapter has one: from memory,
    /// or (until it arrives) none, as the website streams the text in. Marks stay on their verses; word marks are
    /// only drawn where their words match (`matchingTextMarks`), so a translation never shows a mark on other words.
    pub(crate) fn apply_primary(&mut self) {
        let l = self.preferences.last.clone();
        let Some(requested) = self.primary_request() else {
            self.tools.primary = Primary::Bundled;
            return;
        };
        // A chapter read again in place (another owner's marks, a sync) keeps the text it shows; a failure is only
        // tried again on a new visit, when `load_chapter_tools` fetches.
        let fresh_visit = self.tools.chapter.as_ref() != Some(&l);
        let cached = if fresh_visit {
            self.tools.cached_primary(&l, &requested)
        } else {
            self.tools
                .primary_cache
                .iter()
                .find(|c| c.location == l && c.requested == requested)
        };
        match cached.cloned() {
            Some(cached) => {
                if let Some(verses) = cached.verses {
                    self.verses = verses;
                    self.build_verse_content();
                }
                self.tools.primary = Primary::Shown {
                    requested,
                    actual: cached.actual,
                };
            }
            None => {
                self.verses.clear();
                self.build_verse_content();
                self.tools.primary = Primary::Loading { requested };
            }
        }
    }
    /// Fetches the default Bible's chapter off the UI thread when the reader is waiting for it.
    fn load_primary(&mut self) -> Task<Message> {
        let Primary::Loading { requested } = &self.tools.primary else {
            return Task::none();
        };
        let key = (self.preferences.last.clone(), requested.clone());
        if self.tools.primary_in_flight.contains(&key) {
            return Task::none();
        }
        self.tools.primary_in_flight.push(key.clone());
        let site = self.tools.site.clone();
        let (l, id) = key;
        Task::perform(
            background(move || {
                let r = fetch_primary(&site, &l, &id);
                (l, id, r)
            }),
            |(l, id, r)| msg(ToolsMsg::Primary(l, id, r)),
        )
    }
    /// Whether JST passages are read with this chapter: chosen, shown to this tradition, on the bundled KJV.
    pub(crate) fn jst_enabled(&self) -> bool {
        self.preferences.jst
            && self.show_lds()
            && is_bible(&self.preferences.last.volume)
            && self.primary_is_bundled()
    }
    /// Starts the chapter's extras after its text is on screen: the default Bible's text, study paths, other Bibles,
    /// JST.
    pub(crate) fn load_chapter_tools(&mut self) -> Task<Message> {
        let primary = self.load_primary();
        let l = self.preferences.last.clone();
        if self.tools.chapter.as_ref() == Some(&l) {
            return primary;
        }
        self.tools.chapter = Some(l.clone());
        self.tools.panel = None;
        self.tools.explore = None;
        self.tools.resources = None;
        let site = self.tools.site.clone();
        let mut tasks = vec![primary];
        // Study paths are Latter-day Saint study content (`ChapterReader`: none for other denominations).
        if self.show_lds() {
            self.tools.paths = Load::Loading;
            let (site, l) = (site.clone(), l.clone());
            tasks.push(Task::perform(
                background(move || {
                    let r = fetch_study_paths(&site, &l);
                    (l, r)
                }),
                |(l, r)| msg(ToolsMsg::Paths(l, r)),
            ));
        } else {
            self.tools.paths = Load::Ready(vec![]);
        }
        self.tools.compare.clear();
        self.tools.jst = None;
        self.tools.jst_reading = Default::default();
        if is_bible(&l.volume) {
            // The default Bible is the text itself, so it is never also compared with (`overlayTranslations`).
            let default = self.primary_request();
            for id in self.preferences.compare_bibles.clone() {
                if default
                    .as_ref()
                    .is_some_and(|d| d.eq_ignore_ascii_case(&id))
                {
                    continue;
                }
                tasks.push(self.load_compare(&id));
            }
            if self.jst_enabled() {
                tasks.push(self.load_jst());
            }
        }
        Task::batch(tasks)
    }
    /// Reads the chapter again with every extra, after the default Bible or the faith tradition changed.
    pub(crate) fn reload_reader_text(&mut self) -> Task<Message> {
        self.tools.chapter = None;
        self.load_chapter();
        self.load_note();
        self.load_chapter_tools()
    }
    fn load_compare(&mut self, id: &str) -> Task<Message> {
        let l = self.preferences.last.clone();
        self.tools.compare.retain(|(t, _)| t != id);
        self.tools.compare.push((id.to_string(), Load::Loading));
        let (site, id) = (self.tools.site.clone(), id.to_string());
        Task::perform(
            background(move || {
                let r = fetch_chapter(&site, &l, &id);
                (l, id, r)
            }),
            |(l, id, r)| msg(ToolsMsg::Compare(l, id, r)),
        )
    }
    fn load_jst(&mut self) -> Task<Message> {
        let l = self.preferences.last.clone();
        self.tools.jst = Some(Load::Loading);
        let site = self.tools.site.clone();
        Task::perform(
            background(move || {
                let r = fetch_jst(&site, &l);
                (l, r)
            }),
            |(l, r)| msg(ToolsMsg::Jst(l, r)),
        )
    }
    /// The single word selected in a verse, as the website's Explore offers it (`extractSingleSelectedWord`).
    pub(crate) fn selected_single_word(&self) -> Option<String> {
        let words = self.reader_selected_text();
        let word: String = words
            .trim()
            .trim_matches(|c: char| !c.is_alphanumeric())
            .to_string();
        (!word.is_empty() && !word.contains(char::is_whitespace) && word.chars().count() <= 40)
            .then_some(word)
    }
    fn start_explore(&mut self, word: String) -> Task<Message> {
        let word = word.to_lowercase();
        // The study helps are Latter-day Saint guides (`useScriptureHelps`: none for other denominations).
        let helps = if self.show_lds() {
            Guide::ALL
                .iter()
                .map(|g| (*g, study_help_matches(*g, &word)))
                .collect()
        } else {
            vec![]
        };
        self.tools.explore = Some(Explore {
            word: word.clone(),
            dictionary: Load::Loading,
            hebrew: Load::Loading,
            greek: Load::Loading,
            helps,
            open: None,
            entry: None,
        });
        self.tools.panel = Some(Panel::Explore);
        Task::batch([self.lookup_dictionary(), self.lookup_lexicons()])
    }
    fn lookup_dictionary(&mut self) -> Task<Message> {
        let Some(e) = &mut self.tools.explore else {
            return Task::none();
        };
        e.dictionary = Load::Loading;
        let (site, word) = (self.tools.site.clone(), e.word.clone());
        Task::perform(
            background(move || {
                let r = fetch_dictionary(&site, &word);
                (word, r)
            }),
            |(w, r)| msg(ToolsMsg::Dictionary(w, r)),
        )
    }
    fn lookup_lexicons(&mut self) -> Task<Message> {
        let Some(e) = &mut self.tools.explore else {
            return Task::none();
        };
        e.hebrew = Load::Loading;
        e.greek = Load::Loading;
        let term = normalize_phrase(&e.word);
        let term = if term.is_empty() {
            e.word.clone()
        } else {
            term
        };
        let word = e.word.clone();
        let tasks = ["hebrew", "greek"].map(|language| {
            let (site, term, word) = (self.tools.site.clone(), term.clone(), word.clone());
            Task::perform(
                background(move || fetch_lexicon(&site, language, &term)),
                move |r| msg(ToolsMsg::Lexicon(word.clone(), language, r)),
            )
        });
        Task::batch(tasks)
    }
    fn load_resources(&mut self) -> Task<Message> {
        // The selected verses, or the verses of the selected words (the selection menu's Resources).
        let words = self.word_verses();
        let verses: Vec<u32> = if words.is_empty() {
            self.selected.iter().copied().collect()
        } else {
            words
        };
        if verses.is_empty() {
            return Task::none();
        }
        self.tools.panel = Some(Panel::Resources(verses.clone()));
        self.tools.resources = Some(Load::Loading);
        let (site, l) = (self.tools.site.clone(), self.preferences.last.clone());
        Task::perform(
            background(move || {
                let r = fetch_resources(&site, &l, &verses);
                (l, verses, r)
            }),
            |(l, v, r)| msg(ToolsMsg::ResourcesLoaded(l, v, r)),
        )
    }
    /// Keeps a just-made verse jump on its verse when extras above it change the layout.
    fn keep_jump(&self) -> Task<Message> {
        match self.jumped {
            Some((verse, at)) if at.elapsed() < Duration::from_secs(4) => {
                crate::presented(crate::jump::to_verse(verse))
            }
            _ => Task::none(),
        }
    }
    pub(crate) fn update_tools(&mut self, message: ToolsMsg) -> Task<Message> {
        let here = self.preferences.last.clone();
        match message {
            ToolsMsg::Paths(l, r) if l == here => {
                // As on the website, a chapter whose paths can't be loaded simply shows none.
                self.tools.paths = match r {
                    Ok(paths) => Load::Ready(paths),
                    Err(e) => Load::Failed(e),
                };
            }
            ToolsMsg::OpenPaths(verse) => {
                self.tools.panel = if self.tools.panel == Some(Panel::Paths(verse)) {
                    None
                } else {
                    Some(Panel::Paths(verse))
                };
            }
            ToolsMsg::ClosePanel => {
                self.tools.panel = None;
                self.tools.explore = None;
            }
            ToolsMsg::Explore(word) => return self.start_explore(word),
            ToolsMsg::Dictionary(word, r) => {
                if let Some(e) = &mut self.tools.explore
                    && e.word == word
                {
                    e.dictionary = match r {
                        Ok(d) => Load::Ready(d),
                        Err(e) => Load::Failed(e),
                    };
                }
            }
            ToolsMsg::Lexicon(word, language, r) => {
                if let Some(e) = &mut self.tools.explore
                    && e.word == word
                {
                    let state = match r {
                        Ok(l) => Load::Ready(l),
                        Err(e) => Load::Failed(e),
                    };
                    if language == "hebrew" {
                        e.hebrew = state;
                    } else {
                        e.greek = state;
                    }
                }
            }
            ToolsMsg::RetryDictionary => return self.lookup_dictionary(),
            ToolsMsg::RetryLexicon => return self.lookup_lexicons(),
            ToolsMsg::ToggleSection(i) => {
                if let Some(e) = &mut self.tools.explore {
                    e.open = if e.open == Some(i) { None } else { Some(i) };
                }
            }
            ToolsMsg::OpenHelp(guide, slug) => {
                if let Some(e) = &mut self.tools.explore {
                    e.entry = Some((guide, slug.clone(), Load::Loading));
                    let site = self.tools.site.clone();
                    return Task::perform(
                        background(move || {
                            let r = fetch_help(&site, guide.id(), &slug);
                            (guide, slug, r)
                        }),
                        |(g, s, r)| msg(ToolsMsg::Help(g, s, r)),
                    );
                }
            }
            ToolsMsg::Help(guide, slug, r) => {
                if let Some(e) = &mut self.tools.explore
                    && let Some((g, s, state)) = &mut e.entry
                    && *g == guide
                    && *s == slug
                {
                    *state = match r {
                        Ok(entry) => Load::Ready(entry),
                        Err(e) => Load::Failed(e),
                    };
                }
            }
            ToolsMsg::CloseHelp => {
                if let Some(e) = &mut self.tools.explore {
                    e.entry = None;
                }
            }
            ToolsMsg::Resources => return self.load_resources(),
            ToolsMsg::RetryResources => {
                if let Some(Panel::Resources(verses)) = self.tools.panel.clone() {
                    self.selected = verses.into_iter().collect();
                    return self.load_resources();
                }
            }
            ToolsMsg::ResourcesLoaded(l, verses, r) => {
                if l == here && self.tools.panel == Some(Panel::Resources(verses)) {
                    self.tools.resources = Some(match r {
                        Ok(list) => Load::Ready(
                            list.into_iter()
                                .map(|r| {
                                    let body = html_to_markdown(&r.body_html);
                                    let items = iced::widget::markdown::parse(&body).collect();
                                    (r, items)
                                })
                                .collect(),
                        ),
                        Err(_) => Load::Failed(
                            "We couldn’t load lesson resources. Try again or search the web below."
                                .into(),
                        ),
                    });
                }
            }
            ToolsMsg::Compare(l, id, r) => {
                if l == here
                    && let Some((_, state)) = self.tools.compare.iter_mut().find(|(t, _)| *t == id)
                {
                    *state = match r {
                        Ok(v) => Load::Ready(v),
                        Err(e) => Load::Failed(e),
                    };
                    return self.keep_jump();
                }
            }
            ToolsMsg::Primary(l, id, r) => {
                self.tools
                    .primary_in_flight
                    .retain(|(at, t)| !(*at == l && *t == id));
                // A failed chapter shows the bundled text (`fetchChapterUncached` falls back to it), with the notice.
                let (actual, verses) = match r {
                    Ok((actual, _)) if actual == crate::faith::LDS_BIBLE_ID => (actual, None),
                    Ok((actual, verses)) => (actual, Some(verses)),
                    Err(_) => (crate::faith::LDS_BIBLE_ID.to_string(), None),
                };
                self.tools.remember_primary(CachedPrimary {
                    location: l.clone(),
                    requested: id.clone(),
                    actual,
                    verses,
                    at: std::time::Instant::now(),
                });
                if l == here
                    && self.tools.primary
                        == (Primary::Loading {
                            requested: id.clone(),
                        })
                {
                    self.load_chapter();
                    let mut tasks = vec![self.keep_jump()];
                    if self.jst_enabled() && self.tools.jst.is_none() {
                        tasks.push(self.load_jst());
                    }
                    return Task::batch(tasks);
                }
            }
            ToolsMsg::SetDefault(id) => {
                let id = crate::faith::normalize_default_bible(&id);
                if self.preferences.default_bible == id {
                    return Task::none();
                }
                if !self.save_note() {
                    return Task::none();
                }
                self.preferences.default_bible = id;
                self.persist();
                return self.reload_reader_text();
            }
            ToolsMsg::ShowBible(id, show) => {
                let shown = &mut self.preferences.compare_bibles;
                shown.retain(|t| !t.eq_ignore_ascii_case(&id));
                if show {
                    shown.push(id.clone());
                }
                self.persist();
                let is_default = self
                    .primary_request()
                    .is_some_and(|d| d.eq_ignore_ascii_case(&id));
                if show && is_bible(&here.volume) && !is_default {
                    return self.load_compare(&id);
                }
                self.tools
                    .compare
                    .retain(|(t, _)| !t.eq_ignore_ascii_case(&id));
            }
            ToolsMsg::SaveBible(bible) => {
                let favorites = &mut self.preferences.bibles;
                if !favorites
                    .iter()
                    .any(|b| b.id.eq_ignore_ascii_case(&bible.id))
                {
                    favorites.push(bible.clone());
                }
                // Added from the catalog, the dialog returns to the list (`addBible` → `goTo("list")`).
                if self.tools.bibles_dialog.is_some() {
                    self.tools.bibles_dialog = Some(BiblesView::List);
                }
                self.persist();
                // Added in the reader it shows beside the text; in Settings it is only saved (`onShownChange`).
                if self.screen == crate::Screen::Settings {
                    return Task::none();
                }
                return self.update_tools(ToolsMsg::ShowBible(bible.id, true));
            }
            ToolsMsg::RemoveBible(id) => {
                // Removing the default Bible restores the bundled one first (`removeBible`).
                let reset = self.preferences.default_bible.eq_ignore_ascii_case(&id);
                if reset && !self.save_note() {
                    return Task::none();
                }
                self.preferences
                    .bibles
                    .retain(|b| !b.id.eq_ignore_ascii_case(&id));
                let hide = self.update_tools(ToolsMsg::ShowBible(id, false));
                if reset {
                    self.preferences.default_bible = crate::faith::LDS_BIBLE_ID.into();
                    self.persist();
                    return Task::batch([hide, self.reload_reader_text()]);
                }
                return hide;
            }
            ToolsMsg::CloseBibles => {
                self.tools.bibles_dialog = None;
                self.tools.choosing_language = false;
            }
            ToolsMsg::BiblesView(view) => {
                self.tools.bibles_dialog = Some(view.clone());
                self.tools.choosing_language = false;
                // Each view starts at its top; the catalog's search has the keyboard (`data-autofocus`).
                let top = crate::presented(iced::widget::operation::scroll_to(
                    "bibles-dialog",
                    iced::widget::scrollable::AbsoluteOffset { x: 0.0, y: 0.0 },
                ));
                if view != BiblesView::Add {
                    return top;
                }
                let focus = crate::presented(iced::widget::operation::focus("catalog-search"));
                if !matches!(
                    self.tools.catalog,
                    Some(Load::Ready(_)) | Some(Load::Loading)
                ) {
                    self.tools.catalog = Some(Load::Loading);
                    let site = self.tools.site.clone();
                    return Task::batch([
                        top,
                        focus,
                        Task::perform(background(move || fetch_translations(&site)), |r| {
                            msg(ToolsMsg::Catalog(r))
                        }),
                    ]);
                }
                return Task::batch([top, focus]);
            }
            ToolsMsg::Catalog(r) => {
                self.tools.catalog = Some(match r {
                    Ok(list) => Load::Ready(list),
                    Err(e) => Load::Failed(e),
                });
            }
            ToolsMsg::CatalogQuery(q) => {
                self.tools.catalog_query = q;
                self.tools.catalog_limit = crate::bible_catalog::PAGE_SIZE;
            }
            ToolsMsg::ChooseLanguage(open) => {
                self.tools.choosing_language = open;
                self.tools.language_query.clear();
                self.tools.language_limit = crate::bible_catalog::PAGE_SIZE;
                let top = crate::presented(iced::widget::operation::scroll_to(
                    "bibles-dialog",
                    iced::widget::scrollable::AbsoluteOffset { x: 0.0, y: 0.0 },
                ));
                return Task::batch([
                    top,
                    crate::presented(iced::widget::operation::focus(if open {
                        "language-search"
                    } else {
                        "catalog-search"
                    })),
                ]);
            }
            ToolsMsg::CatalogLanguage(id) => {
                self.tools.catalog_language = id;
                self.tools.catalog_limit = crate::bible_catalog::PAGE_SIZE;
                self.tools.choosing_language = false;
                return crate::presented(iced::widget::operation::scroll_to(
                    "bibles-dialog",
                    iced::widget::scrollable::AbsoluteOffset { x: 0.0, y: 0.0 },
                ));
            }
            ToolsMsg::LanguageQuery(q) => {
                self.tools.language_query = q;
                self.tools.language_limit = crate::bible_catalog::PAGE_SIZE;
            }
            ToolsMsg::LanguageFirst => {
                if let Some(first) = self.language_options().first() {
                    let id = first.id.clone();
                    return self.update_tools(ToolsMsg::CatalogLanguage(id));
                }
            }
            ToolsMsg::BrowseAllEnglish => self.tools.catalog_browsing = true,
            ToolsMsg::CatalogMore => self.tools.catalog_limit += crate::bible_catalog::PAGE_SIZE,
            ToolsMsg::LanguagesMore => self.tools.language_limit += crate::bible_catalog::PAGE_SIZE,
            ToolsMsg::ToggleJst => {
                self.preferences.jst = !self.preferences.jst;
                self.persist();
                self.tools.jst_reading = Default::default();
                if self.jst_enabled() {
                    return self.load_jst();
                }
                self.tools.jst = None;
            }
            ToolsMsg::Jst(l, r) => {
                if l == here && self.jst_enabled() {
                    self.tools.jst_reading = match &r {
                        Ok(excerpts) => {
                            let verses: Vec<crate::jst::Kjv> = self
                                .verses
                                .iter()
                                .map(|v| crate::jst::Kjv {
                                    verse: v.number,
                                    text: &v.text,
                                })
                                .collect();
                            crate::jst::read_chapter(excerpts, &verses)
                        }
                        Err(_) => Default::default(),
                    };
                    self.tools.jst = Some(match r {
                        Ok(x) => Load::Ready(x),
                        Err(e) => Load::Failed(e),
                    });
                    return self.keep_jump();
                }
            }
            ToolsMsg::ToggleJstOmitted => self.tools.jst_omitted = !self.tools.jst_omitted,
            ToolsMsg::JstDetails => self.tools.jst_details = !self.tools.jst_details,
            ToolsMsg::RetryJst => {
                if self.jst_enabled() {
                    return self.load_jst();
                }
            }
            ToolsMsg::Link(href) => {
                if let Some((l, v)) = app_scripture_href(&href) {
                    return self.navigate(l, v);
                }
                if href.starts_with('/') {
                    let url = format!("{}{href}", self.tools.site);
                    return self.update(Message::OpenLink(url));
                }
                return self.update(Message::OpenLink(href));
            }
            ToolsMsg::Paths(..) => {}
        }
        Task::none()
    }
}
/// `/browse/<volume>/<book>/<chapter>#v-N` in this app.
pub fn app_scripture_href(href: &str) -> Option<(Location, Option<u32>)> {
    let (path, fragment) = href.split_once('#').unwrap_or((href, ""));
    let mut parts = path.trim_start_matches('/').split('/');
    if parts.next()? != "browse" {
        return None;
    }
    let volume = crate::store::volume_from_url_slug(parts.next()?).to_string();
    let book = parts.next()?.to_string();
    let chapter = parts.next()?.split('?').next()?.parse().ok()?;
    let verse = fragment.strip_prefix("v-").and_then(|v| v.parse().ok());
    Some((
        Location {
            volume,
            book,
            chapter,
        },
        verse,
    ))
}

/// The path of a link to the website ("https://www.versetogether.org/share/…", or "/share/…" as written in a note).
pub fn site_path<'a>(href: &'a str, site: &str) -> Option<&'a str> {
    if href.starts_with('/') && !href.starts_with("//") {
        return Some(href);
    }
    let host = |url: &str| {
        url.split_once("://").map(|(_, rest)| {
            rest.split('/')
                .next()
                .unwrap_or("")
                .trim_start_matches("www.")
                .to_string()
        })
    };
    let (site_host, link_host) = (host(site)?, host(href)?);
    if site_host != link_host && link_host != "versetogether.org" {
        return None;
    }
    let rest = href.split_once("://")?.1;
    rest.find('/').map(|at| &rest[at..])
}
/// A passage share link (`buildShareUrl`: `/share/<volume>/<book>/<chapter>/<verses>`): the chapter and the
/// verses it shares (`parseVerseSpec`, verses past the chapter's end dropped later).
pub fn share_href(path: &str) -> Option<(Location, Vec<u32>)> {
    let path = path.split(['?', '#']).next()?;
    let mut parts = path.trim_start_matches('/').split('/');
    if parts.next()? != "share" {
        return None;
    }
    let volume = crate::store::volume_from_url_slug(parts.next()?).to_string();
    let book = parts.next()?.to_string();
    let chapter: u32 = parts.next()?.parse().ok()?;
    let spec = parts.next()?.replace("%2C", ",").replace("%E2%80%93", "–");
    let mut verses = std::collections::BTreeSet::new();
    for part in spec
        .split([',', ';'])
        .map(str::trim)
        .filter(|p| !p.is_empty())
    {
        let ends: Vec<&str> = part.split(['-', '–', '—']).map(str::trim).collect();
        if ends.len() > 2
            || !ends
                .iter()
                .all(|e| !e.is_empty() && e.bytes().all(|b| b.is_ascii_digit()))
        {
            return None;
        }
        let a: u32 = ends[0].parse().ok()?;
        let b: u32 = ends.last()?.parse().ok()?;
        verses.extend(a.min(b).max(1)..=a.max(b).min(a.min(b).max(1) + 500));
    }
    (!verses.is_empty()).then(|| {
        (
            Location {
                volume,
                book,
                chapter,
            },
            verses.into_iter().collect(),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn share_links_open_their_passage() {
        let site = "https://www.versetogether.org";
        let path = site_path(
            "https://versetogether.org/share/bookofmormon/alma/32/21-23,27",
            site,
        )
        .unwrap();
        assert_eq!(path, "/share/bookofmormon/alma/32/21-23,27");
        let (l, verses) = share_href(path).unwrap();
        assert_eq!(
            (l.volume.as_str(), l.book.as_str(), l.chapter),
            ("bookofmormon", "alma", 32)
        );
        assert_eq!(verses, [21, 22, 23, 27]);
        assert_eq!(share_href("/share/newtestament/john/3/16").unwrap().1, [16]);
        assert!(share_href("/share/newtestament/john/3/x").is_none());
        assert!(site_path("https://example.com/share/newtestament/john/3/16", site).is_none());
        assert_eq!(
            site_path("/browse/nt/john/3", site),
            Some("/browse/nt/john/3")
        );
    }
    #[test]
    fn study_helps_match_like_the_website() {
        let faith = study_help_matches(Guide::Bd, "Faith");
        assert_eq!(faith.entries[0], ("Faith".to_string(), "faith".to_string()));
        // Plurals and possessives find their topic; a stopword finds no related topics.
        let prophets = study_help_matches(Guide::Gs, "prophets");
        assert!(
            prophets
                .entries
                .iter()
                .any(|(t, _)| t.starts_with("Prophet")),
            "{prophets:?}"
        );
        assert!(study_help_matches(Guide::Tg, "the").related.is_empty());
        assert_eq!(
            slugify("Jesus Christ, Atonement through"),
            "jesus-christ-atonement-through"
        );
        assert_eq!(normalize_phrase("God’s Élite"), "god elite");
    }
    #[test]
    fn payloads_from_the_website_parse() {
        let dictionary = serde_json::json!({ "ok": true, "enabled": true, "byEdition": { "1828": { "entries": [{ "id": "a", "edition": "1828", "word": "FAITH", "heading": null, "entryText": "Belief.", "pronounce": null }] }, "1844": null, "1913": null }, "providerLabels": { "1828": "Webster’s 1828" }, "etymology": { "items": [] } });
        let d = parse_dictionary(&dictionary).unwrap();
        assert_eq!(d.groups[0].1, "Webster’s 1828");
        assert!(parse_dictionary(&serde_json::json!({ "ok": true, "enabled": false })).is_err());
        let lexicon = serde_json::json!({"ok":true,"lookup":{"language":"greek","term":"faith","matches":[{"id":"G4102","lemma":"πίστις","transliteration":"pístis","pronunciation":null,"definition":"persuasion","derivation":"from","kjv":"faith","matchedIn":"kjv"}],"total":3,"attribution":{"title":"Strong’s Greek Dictionary","sourceUrl":"https://example.org","license":"CC"}}});
        assert_eq!(parse_lexicon(&lexicon).unwrap().matches[0].lemma, "πίστις");
        let entry: HelpEntry = serde_json::from_value(serde_json::json!({"guide":"bd","slug":"faith","title":"Faith","url":"https://www.churchofjesuschrist.org/study/scriptures/bd/faith?lang=eng","blocks":[{"type":"paragraph","content":["Faith is to hope (",{"href":"https://x","children":["Heb. 11:1"],"appHref":"/browse/newtestament/hebrews/11#v-1"},")."]},{"type":"list","items":[[{"mark":"em","children":["See also"]}]]}],"truncated":false})).unwrap();
        assert_eq!(
            inline_text(match &entry.blocks[0] {
                HelpBlock::Paragraph { content, .. } => content,
                _ => unreachable!(),
            }),
            "Faith is to hope (Heb. 11:1)."
        );
        assert_eq!(
            app_scripture_href("/browse/newtestament/hebrews/11#v-1"),
            Some((
                Location {
                    volume: "newtestament".into(),
                    book: "hebrews".into(),
                    chapter: 11
                },
                Some(1)
            ))
        );
        let excerpt: JstExcerpt = serde_json::from_value(serde_json::json!({"id":"jst-mark-9#0","label":"JST, Mark 9:3","compareReference":"Mark 9:4","anchorVerse":4,"comparedSpans":[{"start":4,"end":4}],"verses":[{"number":"3","text":"And there appeared"}]})).unwrap();
        assert_eq!(excerpt.anchor_verse, Some(4));
        let paths: Vec<StudyPath> = serde_json::from_value(serde_json::json!([{"kind":"doctrinal_context","verse_numbers":[9,10],"title":"Worship","direction":"Explore","why":"Because","look_for":["x"],"sources":[{"format":"article","title":"t","url":"https://x"}],"scripture_links":[]}])).unwrap();
        assert_eq!(kind_label(&paths[0].kind), "Doctrinal context");
    }
    #[test]
    fn lesson_html_becomes_markdown() {
        assert_eq!(
            html_to_markdown(
                "<p>&quot;Behold&quot; <em>new</em> covenant, <a href=\"/browse/oldtestament/jeremiah/31#v-31\">Jeremiah 31:31</a>.</p><ul><li>One</li><li>Two &amp; three</li></ul>"
            ),
            "\"Behold\" *new* covenant, [Jeremiah 31:31](/browse/oldtestament/jeremiah/31#v-31).\n\n- One\n- Two & three"
        );
    }
    #[test]
    fn comparisons_mark_only_the_changed_words() {
        let kjv = "For God so loved the world, that he gave his only begotten Son";
        let d = diff_words(
            kjv,
            "For God so loved the world that He gave His one and only Son",
        );
        let show: Vec<String> = d
            .iter()
            .map(|piece| match piece {
                Diff::Same(r) => format!("={}", &kjv[r.clone()]),
                Diff::Changed(r, other) => format!("[{}/{}]", &kjv[r.clone()], other),
            })
            .collect();
        // Shared words (case and punctuation aside) keep the base text as written; changes pair each side.
        assert_eq!(
            show,
            [
                "=For God so loved the world, that he gave his",
                "[/one and]",
                "= only",
                "[ begotten/]",
                "= Son",
            ]
        );
        // The pieces cover the base text exactly, in order.
        let joined: String = d
            .iter()
            .map(|piece| match piece {
                Diff::Same(r) | Diff::Changed(r, _) => &kjv[r.clone()],
            })
            .collect();
        assert_eq!(joined, kjv);
    }
}
