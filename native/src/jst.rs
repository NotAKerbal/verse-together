// The Joseph Smith Translation read in place of the KJV verses it revises: a port of the website's
// `readJstChapter` (src/lib/jst.ts). Each passage's text is aligned word by word with the whole KJV passage it
// compares to, so every JST word appears once, in order, and JST verses beyond the KJV's are all kept. KJV verses
// outside a passage are untouched. Notes, passages the text can't place, and passages overlapping one already read
// in place are shown whole before the text instead. Pure, and checked against the website's own results.
use std::collections::{BTreeMap, HashMap, HashSet};

use crate::reader_tools::{JstExcerpt, JstVerse};

/// One run of a JST row, in reading order. Only `Same` and `Added` are the JST's text.
#[derive(Debug, Clone, PartialEq)]
pub enum Piece {
    /// Wording the JST shares with this KJV verse, written as the JST writes it.
    Same(String),
    /// Wording the JST adds here, or puts in place of the KJV's.
    Added(String),
    /// KJV wording the JST passage doesn't have; shown only when asked for.
    Omitted(String),
    /// Where a JST verse begins, by the JST's own number.
    Verse(String),
}

/// The JST reading that stands in for one KJV verse.
#[derive(Debug, Clone, PartialEq)]
pub struct Row {
    pub verse: u32,
    pub excerpt_id: String,
    pub label: String,
    pub compare_reference: String,
    /// The first row of a run of its passage, where the passage is labeled.
    pub first: bool,
    pub pieces: Vec<Piece>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Reading {
    /// KJV verse → its JST row. Verses not here read as the KJV.
    pub rows: BTreeMap<u32, Row>,
    /// Indices of the excerpts shown whole before the text.
    pub leading: Vec<usize>,
    /// Indices of the excerpts read in place.
    pub integrated: Vec<usize>,
}

impl Reading {
    pub fn omits_wording(&self) -> bool {
        self.rows
            .values()
            .any(|r| r.pieces.iter().any(|p| matches!(p, Piece::Omitted(_))))
    }
}

/// A KJV verse as the reader has it.
pub struct Kjv<'a> {
    pub verse: u32,
    pub text: &'a str,
}

/// Word cells an alignment may use; the largest appendix section needs about 540,000.
const MAX_ALIGNMENT_CELLS: usize = 2_000_000;
/// A coincidental match ("the", "unto him") between two changes is read as part of the change, up to this long.
const MAX_INCIDENTAL_MATCH: usize = 2;

fn word_key(word: &str) -> String {
    let key: String = word
        .to_lowercase()
        .chars()
        .map(|c| if c == '’' || c == '‘' { '\'' } else { c })
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        .collect();
    if key.is_empty() {
        word.to_string()
    } else {
        key
    }
}

struct KjvToken<'a> {
    word: &'a str,
    key: String,
    verse: u32,
}
struct JstToken<'a> {
    word: &'a str,
    key: String,
    verse_number: &'a str,
    starts_verse: bool,
}

enum Block {
    Same(Vec<(usize, usize)>),
    Change { kjv: Vec<usize>, jst: Vec<usize> },
}

fn push_same(blocks: &mut Vec<Block>, pair: (usize, usize)) {
    if let Some(Block::Same(pairs)) = blocks.last_mut() {
        pairs.push(pair);
    } else {
        blocks.push(Block::Same(vec![pair]));
    }
}

/// Longest-common-subsequence alignment of the two word lists, as alternating same / change blocks.
fn align_words(kjv: &[KjvToken], jst: &[JstToken]) -> Vec<Block> {
    let (n, m) = (kjv.len(), jst.len());
    let width = m + 1;
    let mut table = vec![0u32; (n + 1) * width];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            table[i * width + j] = if kjv[i].key == jst[j].key {
                table[(i + 1) * width + j + 1] + 1
            } else {
                table[(i + 1) * width + j].max(table[i * width + j + 1])
            };
        }
    }
    let mut blocks: Vec<Block> = Vec::new();
    fn change(blocks: &mut Vec<Block>) -> (&mut Vec<usize>, &mut Vec<usize>) {
        if !matches!(blocks.last(), Some(Block::Change { .. })) {
            blocks.push(Block::Change {
                kjv: vec![],
                jst: vec![],
            });
        }
        match blocks.last_mut() {
            Some(Block::Change { kjv, jst }) => (kjv, jst),
            _ => unreachable!(),
        }
    }
    let (mut i, mut j) = (0, 0);
    while i < n || j < m {
        if i < n && j < m && kjv[i].key == jst[j].key {
            push_same(&mut blocks, (i, j));
            i += 1;
            j += 1;
        } else if i < n && (j >= m || table[(i + 1) * width + j] >= table[i * width + j + 1]) {
            change(&mut blocks).0.push(i);
            i += 1;
        } else {
            change(&mut blocks).1.push(j);
            j += 1;
        }
    }
    share_change_edges(drop_incidental_matches(blocks), kjv, jst)
}

/// A change that starts or ends with the same word on both sides keeps that word as shared, so an addition reads
/// as an addition rather than as a replaced word.
fn share_change_edges(blocks: Vec<Block>, kjv: &[KjvToken], jst: &[JstToken]) -> Vec<Block> {
    let mut out = Vec::new();
    for block in blocks {
        match block {
            Block::Same(pairs) => pairs.into_iter().for_each(|p| push_same(&mut out, p)),
            Block::Change {
                kjv: mut k,
                jst: mut t,
            } => {
                let mut head = 0;
                while head < k.len() && head < t.len() && kjv[k[head]].key == jst[t[head]].key {
                    push_same(&mut out, (k[head], t[head]));
                    head += 1;
                }
                k.drain(..head);
                t.drain(..head);
                let mut tail = Vec::new();
                while let (Some(&a), Some(&b)) = (k.last(), t.last()) {
                    if kjv[a].key != jst[b].key {
                        break;
                    }
                    tail.insert(0, (a, b));
                    k.pop();
                    t.pop();
                }
                if !k.is_empty() || !t.is_empty() {
                    out.push(Block::Change { kjv: k, jst: t });
                }
                tail.into_iter().for_each(|p| push_same(&mut out, p));
            }
        }
    }
    out
}

/// Fold short matches sandwiched between larger changes into one change, so a rewrite reads as one.
fn drop_incidental_matches(mut blocks: Vec<Block>) -> Vec<Block> {
    let size = |b: &Block| match b {
        Block::Change { kjv, jst } => kjv.len().max(jst.len()),
        Block::Same(_) => 0,
    };
    'outer: loop {
        for index in 1..blocks.len().saturating_sub(1) {
            let (Block::Change { .. }, Block::Same(pairs), Block::Change { .. }) =
                (&blocks[index - 1], &blocks[index], &blocks[index + 1])
            else {
                continue;
            };
            let length = pairs.len();
            if length > MAX_INCIDENTAL_MATCH
                || length > size(&blocks[index - 1])
                || length > size(&blocks[index + 1])
            {
                continue;
            }
            let mut merged = blocks.drain(index - 1..index + 2);
            let (
                Some(Block::Change {
                    kjv: mut k,
                    jst: mut t,
                }),
                Some(Block::Same(pairs)),
                Some(Block::Change { kjv: k2, jst: t2 }),
            ) = (merged.next(), merged.next(), merged.next())
            else {
                unreachable!()
            };
            drop(merged);
            k.extend(pairs.iter().map(|p| p.0));
            k.extend(k2);
            t.extend(pairs.iter().map(|p| p.1));
            t.extend(t2);
            blocks.insert(index - 1, Block::Change { kjv: k, jst: t });
            continue 'outer;
        }
        return blocks;
    }
}

type Rows = HashMap<u32, Vec<Piece>>;

fn push(rows: &mut Rows, verse: u32, piece: Piece) {
    let pieces = rows.entry(verse).or_default();
    let merged = match (pieces.last_mut(), &piece) {
        (Some(Piece::Same(a)), Piece::Same(b))
        | (Some(Piece::Added(a)), Piece::Added(b))
        | (Some(Piece::Omitted(a)), Piece::Omitted(b)) => {
            a.push(' ');
            a.push_str(b);
            true
        }
        _ => false,
    };
    if !merged {
        pieces.push(piece);
    }
}

/// Each KJV verse's pieces of the JST reading, in order, for one aligned group of verses.
fn read_group(kjv_verses: &[&Kjv], jst_verses: &[JstVerse]) -> Option<Rows> {
    let kjv: Vec<KjvToken> = kjv_verses
        .iter()
        .flat_map(|v| {
            v.text.split_whitespace().map(|word| KjvToken {
                word,
                key: word_key(word),
                verse: v.verse,
            })
        })
        .collect();
    let jst: Vec<JstToken> = jst_verses
        .iter()
        .flat_map(|v| {
            v.text
                .split_whitespace()
                .enumerate()
                .map(|(index, word)| JstToken {
                    word,
                    key: word_key(word),
                    verse_number: &v.number,
                    starts_verse: index == 0,
                })
        })
        .collect();
    if (kjv.len() + 1) * (jst.len() + 1) > MAX_ALIGNMENT_CELLS {
        return None;
    }
    let blocks = align_words(&kjv, &jst);
    let mut rows: Rows = kjv_verses.iter().map(|v| (v.verse, Vec::new())).collect();
    let push_jst = |rows: &mut Rows, verse: u32, index: usize, added: bool| {
        let token = &jst[index];
        if token.starts_verse {
            push(rows, verse, Piece::Verse(token.verse_number.to_string()));
        }
        let word = token.word.to_string();
        push(
            rows,
            verse,
            if added {
                Piece::Added(word)
            } else {
                Piece::Same(word)
            },
        );
    };

    let mut previous: Option<u32> = None;
    for (index, block) in blocks.iter().enumerate() {
        let (block_kjv, block_jst) = match block {
            Block::Same(pairs) => {
                for &(k, t) in pairs {
                    push_jst(&mut rows, kjv[k].verse, t, false);
                }
                previous = pairs.last().map(|p| kjv[p.0].verse);
                continue;
            }
            Block::Change { kjv, jst } => (kjv, jst),
        };
        let next_pair = match blocks.get(index + 1) {
            Some(Block::Same(pairs)) => pairs.first().copied(),
            _ => None,
        };
        let next_verse = next_pair.map(|p| kjv[p.0].verse);
        // The verses whose wording this change replaces, each with the KJV words the JST leaves out.
        let mut replaced: Vec<u32> = Vec::new();
        let mut omitted: HashMap<u32, Vec<&str>> = HashMap::new();
        for &k in block_kjv {
            let verse = kjv[k].verse;
            omitted
                .entry(verse)
                .or_insert_with(|| {
                    replaced.push(verse);
                    Vec::new()
                })
                .push(kjv[k].word);
        }
        // Where each added word goes: a replacement is spread over the verses it replaces, a JST verse at a time,
        // and the end of a JST verse begun earlier stays with it; an addition stays with the verse it follows,
        // except a JST verse that runs on into the next KJV verse.
        let mut targets: Vec<u32> = Vec::new();
        if !replaced.is_empty() {
            let finishes_previous = previous.is_some_and(|p| p != replaced[0])
                && !block_jst.is_empty()
                && !jst[block_jst[0]].starts_verse
                && block_jst.iter().any(|&t| jst[t].starts_verse);
            let mut chunk: i64 = if finishes_previous { -1 } else { 0 };
            for (position, &t) in block_jst.iter().enumerate() {
                if position > 0 && jst[t].starts_verse {
                    chunk += 1;
                }
                targets.push(if chunk < 0 {
                    previous.unwrap_or(replaced[0])
                } else {
                    replaced[(chunk as usize).min(replaced.len() - 1)]
                });
            }
        } else {
            let fallback = previous.or(next_verse).unwrap_or(kjv_verses[0].verse);
            let mut split = block_jst.len();
            if let (Some(p), Some(n), Some(pair)) = (previous, next_verse, next_pair)
                && n != p
                && !jst[pair.1].starts_verse
                && let Some(position) = (0..block_jst.len())
                    .rev()
                    .find(|&position| jst[block_jst[position]].starts_verse)
            {
                split = position;
            }
            for position in 0..block_jst.len() {
                targets.push(if position >= split {
                    next_verse.unwrap_or(fallback)
                } else {
                    fallback
                });
            }
        }
        for &verse in &replaced {
            push(&mut rows, verse, Piece::Omitted(omitted[&verse].join(" ")));
            for (position, &t) in block_jst.iter().enumerate() {
                if targets[position] == verse {
                    push_jst(&mut rows, verse, t, true);
                }
            }
        }
        for (position, &t) in block_jst.iter().enumerate() {
            if !omitted.contains_key(&targets[position]) {
                push_jst(&mut rows, targets[position], t, true);
            }
        }
        if let Some(&k) = block_kjv.last() {
            previous = Some(kjv[k].verse);
        }
    }
    Some(rows)
}

fn shares_wording(pieces: Option<&Vec<Piece>>) -> bool {
    pieces.is_some_and(|p| p.iter().any(|piece| matches!(piece, Piece::Same(_))))
}

/// One group read in place. KJV verses at either end that share no wording with the JST text are only named by
/// the compare reference, so they stay KJV rather than reading as if the JST removed them.
fn read_group_trimmed(kjv_verses: &[&Kjv], jst_verses: &[JstVerse]) -> Option<Rows> {
    let mut verses = kjv_verses;
    loop {
        let rows = read_group(verses, jst_verses)?;
        let (mut from, mut to) = (0, verses.len());
        while from < to && !shares_wording(rows.get(&verses[from].verse)) {
            from += 1;
        }
        while to > from && !shares_wording(rows.get(&verses[to - 1].verse)) {
            to -= 1;
        }
        if from == to || (from == 0 && to == verses.len()) {
            return Some(rows);
        }
        verses = &verses[from..to];
    }
}

/// How a section's text lines up with the KJV verses it compares to: usually one group, but when the JST verses
/// are numbered like the KJV's and skip some, each numbered run is its own group and the KJV verses between runs
/// stay KJV.
fn alignment_groups<'a, 'b>(
    kjv_verses: &[&'a Kjv<'b>],
    jst_verses: &'a [JstVerse],
) -> Vec<(Vec<&'a Kjv<'b>>, &'a [JstVerse])> {
    let whole = vec![(kjv_verses.to_vec(), jst_verses)];
    let numbers: Vec<Option<u32>> = jst_verses
        .iter()
        .map(|v| {
            (!v.number.is_empty() && v.number.bytes().all(|b| b.is_ascii_digit()))
                .then(|| v.number.parse().ok())
                .flatten()
        })
        .collect();
    let kjv_numbers: HashSet<u32> = kjv_verses.iter().map(|v| v.verse).collect();
    for (index, number) in numbers.iter().enumerate() {
        match number {
            Some(n) if kjv_numbers.contains(n) => {
                if index > 0 && numbers[index - 1].is_some_and(|prev| *n <= prev) {
                    return whole;
                }
            }
            _ => return whole,
        }
    }
    // (start, end, first jst index, jst count)
    let mut runs: Vec<(u32, u32, usize, usize)> = Vec::new();
    for (index, number) in numbers.iter().enumerate() {
        let n = number.unwrap_or_default();
        match runs.last_mut() {
            Some(last) if n == last.1 + 1 => {
                last.1 = n;
                last.3 += 1;
            }
            _ => runs.push((n, n, index, 1)),
        }
    }
    if runs.len() < 2 {
        return whole;
    }
    let count = runs.len();
    runs.iter()
        .enumerate()
        .map(|(index, &(start, end, at, len))| {
            (
                kjv_verses
                    .iter()
                    .copied()
                    .filter(|v| {
                        (index == 0 || v.verse >= start) && (index == count - 1 || v.verse <= end)
                    })
                    .collect(),
                &jst_verses[at..at + len],
            )
        })
        .collect()
}

/// The chapter as read with the JST (`readJstChapter`).
pub fn read_chapter(excerpts: &[JstExcerpt], verses: &[Kjv]) -> Reading {
    let mut reading = Reading::default();
    for (excerpt_index, excerpt) in excerpts.iter().enumerate() {
        let covered: Vec<&Kjv> = verses
            .iter()
            .filter(|v| {
                excerpt
                    .compared_spans
                    .iter()
                    .any(|s| v.verse >= s.start && s.end.is_none_or(|end| v.verse <= end))
            })
            .collect();
        if excerpt.verses.is_empty()
            || covered.is_empty()
            || covered.iter().any(|v| reading.rows.contains_key(&v.verse))
        {
            reading.leading.push(excerpt_index);
            continue;
        }
        let mut read: HashMap<u32, Vec<Piece>> = HashMap::new();
        let mut readable = true;
        for (kjv, jst) in alignment_groups(&covered, &excerpt.verses) {
            match read_group_trimmed(&kjv, jst) {
                Some(rows) => read.extend(rows),
                None => {
                    readable = false;
                    break;
                }
            }
        }
        if !readable {
            reading.leading.push(excerpt_index);
            continue;
        }
        reading.integrated.push(excerpt_index);
        let mut previous: Option<u32> = None;
        for verse in &covered {
            let Some(pieces) = read.remove(&verse.verse) else {
                continue;
            };
            let index = verses
                .iter()
                .position(|v| v.verse == verse.verse)
                .unwrap_or(0);
            let first =
                previous.is_none() || index == 0 || previous != Some(verses[index - 1].verse);
            reading.rows.insert(
                verse.verse,
                Row {
                    verse: verse.verse,
                    excerpt_id: excerpt.id.clone(),
                    label: excerpt.label.clone(),
                    compare_reference: excerpt.compare_reference.clone(),
                    first,
                    pieces,
                },
            );
            previous = Some(verse.verse);
        }
    }
    reading
}

/// "JST, Mark 9:40–48" → "JST 9:40–48", as the website's passage label shows it.
pub fn passage_label(label: &str) -> String {
    let short = label
        .strip_prefix("JST,")
        .map(str::trim_start)
        .unwrap_or(label);
    let re = regex::Regex::new(r"^.*?(\d+:[\d–,\s]+)$").expect("valid");
    format!("JST {}", re.replace(short, "$1"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct GoldenRow {
        verse: u32,
        #[serde(rename = "excerptId")]
        excerpt_id: String,
        label: String,
        first: bool,
        pieces: Vec<serde_json::Value>,
    }
    #[derive(Deserialize)]
    struct GoldenVerse {
        verse: u32,
        text: String,
    }
    #[derive(Deserialize)]
    struct Golden {
        book: String,
        chapter: u32,
        excerpts: Vec<JstExcerpt>,
        verses: Vec<GoldenVerse>,
        rows: Vec<GoldenRow>,
        leading: Vec<String>,
        integrated: Vec<String>,
    }

    fn piece(value: &serde_json::Value) -> Piece {
        let text = || value["text"].as_str().unwrap().to_string();
        match value["kind"].as_str().unwrap() {
            "same" => Piece::Same(text()),
            "added" => Piece::Added(text()),
            "omitted" => Piece::Omitted(text()),
            _ => Piece::Verse(value["number"].as_str().unwrap().to_string()),
        }
    }

    /// The website's own readings of its JST fixtures (`native/scripts/generate-jst-golden.mjs`), word for word.
    #[test]
    fn chapters_read_with_the_jst_exactly_as_on_the_website() {
        let cases: Vec<Golden> =
            serde_json::from_str(include_str!("../testdata/jst-golden.json")).unwrap();
        assert!(cases.len() >= 8);
        for case in &cases {
            let verses: Vec<Kjv> = case
                .verses
                .iter()
                .map(|v| Kjv {
                    verse: v.verse,
                    text: &v.text,
                })
                .collect();
            let reading = read_chapter(&case.excerpts, &verses);
            let where_ = format!("{} {}", case.book, case.chapter);
            let ids = |indices: &[usize]| -> Vec<String> {
                indices
                    .iter()
                    .map(|&i| case.excerpts[i].id.clone())
                    .collect()
            };
            assert_eq!(ids(&reading.leading), case.leading, "{where_} leading");
            assert_eq!(
                ids(&reading.integrated),
                case.integrated,
                "{where_} integrated"
            );
            assert_eq!(reading.rows.len(), case.rows.len(), "{where_} rows");
            for expected in &case.rows {
                let row = &reading.rows[&expected.verse];
                assert_eq!(
                    row.excerpt_id, expected.excerpt_id,
                    "{where_}:{}",
                    expected.verse
                );
                assert_eq!(row.label, expected.label);
                assert_eq!(
                    row.first, expected.first,
                    "{where_}:{} first",
                    expected.verse
                );
                let pieces: Vec<Piece> = expected.pieces.iter().map(piece).collect();
                assert_eq!(row.pieces, pieces, "{where_}:{} pieces", expected.verse);
            }
        }
        // Mark 9:4 reads JST 9:3 with its addition marked (the website's own test).
        let mark = &cases[0];
        assert_eq!((mark.book.as_str(), mark.chapter), ("mark", 9));
        let verses: Vec<Kjv> = mark
            .verses
            .iter()
            .map(|v| Kjv {
                verse: v.verse,
                text: &v.text,
            })
            .collect();
        let reading = read_chapter(&mark.excerpts, &verses);
        assert_eq!(
            reading.rows.keys().copied().collect::<Vec<_>>(),
            [4, 43, 44, 45, 46, 47, 48]
        );
        assert!(reading.rows[&4].pieces.contains(&Piece::Added(
            "or in other words, John the Baptist and Moses;".into()
        )));
        assert!(reading.omits_wording());
        assert_eq!(passage_label("JST, Mark 9:40–48"), "JST 9:40–48");
        // No excerpts: every verse reads as the KJV.
        assert_eq!(read_chapter(&[], &verses), Reading::default());
    }
}
