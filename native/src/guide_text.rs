// A study guide's prose as the reader marks it: each section's Markdown as blocks of styled runs (so it keeps its
// bold, italics and links), the text of each guide part (the website's "introduction" and "reader"), and spans
// of that text anchored the way the website anchors them (src/features/comeFollowMe/guideAnchors.ts): the block a
// point is measured from, offsets in UTF-16 units as JavaScript counts them, the quote, and 32 units of context on
// each side. A span is found again at its recorded place, else by its quote in context, else not at all, so a mark
// is never drawn on the wrong prose.
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};

pub const CONTEXT: usize = 32;
pub const QUOTE_MAX: usize = 4000;

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Run {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
    pub code: bool,
    pub link: Option<String>,
}
#[derive(Debug, Clone, PartialEq)]
pub enum Kind {
    Heading(u8),
    Paragraph,
    Quote,
    /// A list item, with its marker ("•" or "3.").
    Item(String),
}
#[derive(Debug, Clone, PartialEq)]
pub struct Block {
    pub kind: Kind,
    pub runs: Vec<Run>,
    /// The heading's anchor id, as the website's guide renderer gives headings.
    pub id: Option<String>,
}
impl Block {
    pub fn text(&self) -> String {
        self.runs.iter().map(|r| r.text.as_str()).collect()
    }
}
/// The website's heading ids: lowercase words joined by hyphens.
pub fn heading_id(title: &str) -> String {
    let mut out = String::new();
    let mut dash = false;
    for c in title.chars().flat_map(char::to_lowercase) {
        if c.is_alphanumeric() {
            out.push(c);
            dash = false;
        } else if !dash && !out.is_empty() {
            out.push('-');
            dash = true;
        }
    }
    let id = out.trim_end_matches('-').to_string();
    id.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(120)
        .collect()
}

/// A section's Markdown as blocks.
pub fn blocks(markdown: &str) -> Vec<Block> {
    let mut out: Vec<Block> = Vec::new();
    let mut current: Option<Block> = None;
    let (mut bold, mut italic) = (0, 0);
    let mut link: Option<String> = None;
    let mut quote = 0;
    let mut lists: Vec<Option<u64>> = Vec::new();
    let mut item: Option<String> = None;
    let push = |current: &mut Option<Block>, out: &mut Vec<Block>| {
        if let Some(b) = current.take()
            && !b.text().trim().is_empty()
        {
            out.push(b);
        }
    };
    for event in Parser::new_ext(markdown, Options::ENABLE_STRIKETHROUGH) {
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                push(&mut current, &mut out);
                let level = match level {
                    HeadingLevel::H1 => 1,
                    HeadingLevel::H2 => 2,
                    HeadingLevel::H3 => 3,
                    HeadingLevel::H4 => 4,
                    _ => 5,
                };
                current = Some(Block {
                    kind: Kind::Heading(level),
                    runs: vec![],
                    id: None,
                });
            }
            Event::End(TagEnd::Heading(_)) => {
                if let Some(b) = &mut current {
                    b.id = Some(heading_id(&b.text()));
                }
                push(&mut current, &mut out);
            }
            Event::Start(Tag::Paragraph) => {
                push(&mut current, &mut out);
                let kind = if let Some(marker) = item.take() {
                    Kind::Item(marker)
                } else if quote > 0 {
                    Kind::Quote
                } else {
                    Kind::Paragraph
                };
                current = Some(Block {
                    kind,
                    runs: vec![],
                    id: None,
                });
            }
            Event::End(TagEnd::Paragraph) => push(&mut current, &mut out),
            Event::Start(Tag::BlockQuote(_)) => quote += 1,
            Event::End(TagEnd::BlockQuote(_)) => quote -= 1,
            Event::Start(Tag::List(start)) => lists.push(start),
            Event::End(TagEnd::List(_)) => {
                lists.pop();
            }
            Event::Start(Tag::Item) => {
                push(&mut current, &mut out);
                let marker = match lists.last_mut() {
                    Some(Some(n)) => {
                        let m = format!("{n}.");
                        *n += 1;
                        m
                    }
                    _ => "•".to_string(),
                };
                // A tight list item has no paragraph: its text starts the item block directly.
                item = Some(marker.clone());
                current = Some(Block {
                    kind: Kind::Item(marker),
                    runs: vec![],
                    id: None,
                });
            }
            Event::End(TagEnd::Item) => {
                item = None;
                push(&mut current, &mut out);
            }
            Event::Start(Tag::Strong) => bold += 1,
            Event::End(TagEnd::Strong) => bold -= 1,
            Event::Start(Tag::Emphasis) => italic += 1,
            Event::End(TagEnd::Emphasis) => italic -= 1,
            Event::Start(Tag::Link { dest_url, .. }) => link = Some(dest_url.to_string()),
            Event::End(TagEnd::Link) => link = None,
            Event::Text(t) | Event::Code(t) => {
                let code = false;
                let b = current.get_or_insert_with(|| Block {
                    kind: Kind::Paragraph,
                    runs: vec![],
                    id: None,
                });
                let text = t.replace('\n', " ");
                match b.runs.last_mut() {
                    Some(r)
                        if r.bold == (bold > 0)
                            && r.italic == (italic > 0)
                            && r.link == link
                            && r.code == code =>
                    {
                        r.text.push_str(&text)
                    }
                    _ => b.runs.push(Run {
                        text,
                        bold: bold > 0,
                        italic: italic > 0,
                        code,
                        link: link.clone(),
                    }),
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if let Some(b) = &mut current
                    && let Some(r) = b.runs.last_mut()
                {
                    r.text.push(' ');
                }
            }
            _ => {}
        }
    }
    push(&mut current, &mut out);
    out
}
/// One guide part's text: its blocks' text in order, one line each, with where each block starts (UTF-16).
#[derive(Debug, Clone, Default)]
pub struct PartText {
    pub units: Vec<u16>,
    /// (section index, block index, start in `units`).
    pub blocks: Vec<(usize, usize, usize)>,
    /// Heading anchors: (id, start).
    pub anchors: Vec<(String, usize)>,
}
impl PartText {
    pub fn build(sections: &[(usize, &[Block])]) -> Self {
        let mut part = PartText::default();
        for (section, blocks) in sections {
            for (i, block) in blocks.iter().enumerate() {
                if !part.units.is_empty() {
                    part.units.push(u16::from(b'\n'));
                }
                let start = part.units.len();
                if let Some(id) = &block.id
                    && !id.is_empty()
                {
                    part.anchors.push((id.clone(), start));
                }
                part.blocks.push((*section, i, start));
                part.units.extend(block.text().encode_utf16());
            }
        }
        part
    }
    pub fn block_start(&self, section: usize, block: usize) -> Option<usize> {
        self.blocks
            .iter()
            .find(|(s, b, _)| *s == section && *b == block)
            .map(|(_, _, start)| *start)
    }
    fn slice(&self, from: usize, to: usize) -> String {
        String::from_utf16_lossy(&self.units[from.min(self.units.len())..to.min(self.units.len())])
    }
    fn block_for(&self, position: usize, end: bool) -> (String, usize) {
        let mut found: Option<&(String, usize)> = None;
        for anchor in &self.anchors {
            if if end {
                anchor.1 >= position
            } else {
                anchor.1 > position
            } {
                break;
            }
            found = Some(anchor);
        }
        match found {
            Some((id, start)) => (id.clone(), position - start),
            None => (String::new(), position),
        }
    }
    fn anchor_start(&self, block: &str) -> Option<usize> {
        if block.is_empty() {
            return Some(0);
        }
        self.anchors.iter().find(|(id, _)| id == block).map(|a| a.1)
    }
    /// `describeSpan`: the anchor for the text between two positions, trimmed of surrounding whitespace.
    pub fn describe(&self, from: usize, to: usize) -> Option<(Anchor, usize, usize)> {
        let white = |u: u16| char::from_u32(u as u32).is_some_and(char::is_whitespace);
        let mut start = from.min(to);
        let mut end = to.max(from).min(self.units.len());
        while start < end && white(self.units[start]) {
            start += 1;
        }
        while end > start && white(self.units[end - 1]) {
            end -= 1;
        }
        if start >= end || end - start > QUOTE_MAX {
            return None;
        }
        let (start_block, start_offset) = self.block_for(start, false);
        let (end_block, end_offset) = self.block_for(end, true);
        Some((
            Anchor {
                start_block,
                start_offset,
                end_block,
                end_offset,
                exact: self.slice(start, end),
                prefix: self.slice(start.saturating_sub(CONTEXT), start),
                suffix: self.slice(end, end + CONTEXT),
            },
            start,
            end,
        ))
    }
    /// `resolveAnchor`: where a span is now, or `None` when it can't be placed with confidence.
    pub fn resolve(&self, a: &Anchor) -> Option<(usize, usize)> {
        let exact: Vec<u16> = a.exact.encode_utf16().collect();
        let prefix: Vec<u16> = a.prefix.encode_utf16().collect();
        let suffix: Vec<u16> = a.suffix.encode_utf16().collect();
        if exact.is_empty() {
            return None;
        }
        let text = &self.units;
        let prefix_ok = |at: usize| {
            at >= prefix.len()
                && text[at - prefix.len()..at] == prefix[..]
                && (prefix.len() >= CONTEXT || at == prefix.len())
        };
        let suffix_ok = |at: usize| {
            let end = at + exact.len();
            end + suffix.len() <= text.len()
                && text[end..end + suffix.len()] == suffix[..]
                && (suffix.len() >= CONTEXT || end + suffix.len() == text.len())
        };
        if let (Some(sb), Some(eb)) = (
            self.anchor_start(&a.start_block),
            self.anchor_start(&a.end_block),
        ) {
            let (start, end) = (sb + a.start_offset, eb + a.end_offset);
            if end >= start
                && end - start == exact.len()
                && end <= text.len()
                && text[start..end] == exact[..]
                && (prefix_ok(start) || suffix_ok(start))
            {
                return Some((start, end));
            }
        }
        let hits: Vec<usize> = (0..=text.len().saturating_sub(exact.len()))
            .filter(|&at| text[at..at + exact.len()] == exact[..])
            .collect();
        let in_context: Vec<usize> = hits
            .iter()
            .copied()
            .filter(|&at| prefix_ok(at) && suffix_ok(at))
            .collect();
        match (in_context.len(), hits.len()) {
            (1, _) => Some((in_context[0], in_context[0] + exact.len())),
            (0, 1) if prefix_ok(hits[0]) || suffix_ok(hits[0]) => {
                Some((hits[0], hits[0] + exact.len()))
            }
            _ => None,
        }
    }
}
/// A guide span's anchor (`GuideAnchorFields` without its part).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Anchor {
    pub start_block: String,
    pub start_offset: usize,
    pub end_block: String,
    pub end_offset: usize,
    pub exact: String,
    pub prefix: String,
    pub suffix: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn guide_markdown_keeps_its_formatting_in_runs() {
        let b = blocks(
            "## Jeremiah 31:1–3 — Everlasting Love\n\n\"At the same time\" points to [Jeremiah 30:24](https://www.churchofjesuschrist.org/study/scriptures/ot/jer/30?id=p24), *ḥesed*, **love**.\n\n- One\n- Two\n\n> Quoted\n",
        );
        assert_eq!(b[0].kind, Kind::Heading(2));
        assert_eq!(b[0].id.as_deref(), Some("jeremiah-31-1-3-everlasting-love"));
        assert_eq!(
            b[1].text(),
            "\"At the same time\" points to Jeremiah 30:24, ḥesed, love."
        );
        assert!(
            b[1].runs
                .iter()
                .any(|r| r.link.is_some() && r.text == "Jeremiah 30:24")
        );
        assert!(b[1].runs.iter().any(|r| r.italic && r.text == "ḥesed"));
        assert!(b[1].runs.iter().any(|r| r.bold && r.text == "love"));
        assert_eq!(b[2].kind, Kind::Item("•".into()));
        assert_eq!(b[3].text(), "Two");
        assert_eq!(b[4].kind, Kind::Quote);
    }
    #[test]
    fn spans_are_anchored_and_found_again_like_the_website() {
        let a = blocks(
            "## First Heading\n\nAlpha beta gamma delta, with ḥesed — and more words follow here for context.\n",
        );
        let b = blocks("## Second\n\nAlpha beta gamma delta again.\n");
        let part = PartText::build(&[(0, &a), (1, &b)]);
        let start = part.block_start(0, 1).unwrap();
        // "ḥesed" is one UTF-16 unit per letter here; offsets count as JavaScript does.
        let text: String = String::from_utf16_lossy(&part.units);
        let at = text.encode_utf16().count()
            - text[text.find("ḥesed").unwrap()..].encode_utf16().count();
        let (anchor, s, e) = part.describe(at, at + 5).unwrap();
        assert_eq!(anchor.exact, "ḥesed");
        assert_eq!(anchor.start_block, "first-heading");
        assert_eq!(anchor.start_offset, at - part.anchors[0].1);
        assert_eq!(part.resolve(&anchor), Some((s, e)));
        assert!(s > start);
        // Whitespace around a selection is trimmed.
        let (trimmed, ..) = part.describe(start, start + 6).unwrap();
        assert_eq!(trimmed.exact, "Alpha");
        // The same words elsewhere don't steal the mark: recorded place first, then context.
        assert_eq!(part.resolve(&trimmed).unwrap().0, start);
        // Text added before it moves it; context still finds it.
        let edited = blocks(
            "## First Heading\n\nNew opening sentence. Alpha beta gamma delta, with ḥesed — and more words follow here for context.\n",
        );
        let moved = PartText::build(&[(0, &edited), (1, &b)]);
        let found = moved.resolve(&anchor).unwrap();
        assert_eq!(
            String::from_utf16_lossy(&moved.units[found.0..found.1]),
            "ḥesed"
        );
        // A quote that's gone, or ambiguous without context, stays unplaced.
        let gone = Anchor {
            exact: "missing".into(),
            ..anchor.clone()
        };
        assert_eq!(part.resolve(&gone), None);
    }
}
