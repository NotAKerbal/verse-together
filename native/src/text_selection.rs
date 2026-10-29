// Text selections that run across paragraphs, as a browser's selection runs across a page: in the reader's verses
// (plain, or read against other Bibles), in a lesson's chapters, and in a study guide's prose. A drag is kept as two
// spots (a paragraph in reading order and a byte offset of what that paragraph displays); each area turns the
// spots back into what it marks: verses' own words as UTF-16 ranges of their KJV text (the website's
// `selectedVerseRanges`, which never takes a verse number or another Bible's words), or a span of a guide part's
// text (`describeSpan`).
use crate::marks::{self, TextRange};
use crate::select_text::{DisplayMap, Phase, word_at};
use crate::{App, Message};
use iced::Task;
use std::ops::Range;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Area {
    Reader,
    Lesson,
    Guide,
}
/// A place in an area: a paragraph (its order in the area) and a byte offset of its displayed text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Spot {
    pub block: usize,
    pub at: usize,
}
#[derive(Debug, Clone, PartialEq)]
pub struct Drag {
    pub area: Area,
    pub anchor: Spot,
    pub focus: Spot,
    /// The word or paragraph a double or triple click took, kept whole while the drag extends from it.
    pub unit: Option<(Spot, Spot)>,
    pub dragging: bool,
}
impl Drag {
    pub fn ordered(&self) -> (Spot, Spot) {
        let (mut a, mut b) = (self.anchor.min(self.focus), self.anchor.max(self.focus));
        if let Some((s, e)) = self.unit {
            a = a.min(s);
            b = b.max(e);
        }
        (a, b)
    }
    pub fn is_empty(&self) -> bool {
        let (a, b) = self.ordered();
        a == b
    }
    /// The displayed range selected in one paragraph of `len` bytes.
    pub fn in_block(&self, area: Area, block: usize, len: usize) -> Option<Range<usize>> {
        if self.area != area {
            return None;
        }
        let (a, b) = self.ordered();
        if block < a.block || block > b.block {
            return None;
        }
        let start = if block == a.block { a.at.min(len) } else { 0 };
        let end = if block == b.block { b.at.min(len) } else { len };
        (start < end).then_some(start..end)
    }
    /// The paragraphs it covers, in order.
    pub fn blocks(&self) -> Range<usize> {
        let (a, b) = self.ordered();
        a.block..b.block + 1
    }
}
/// The source range a displayed selection takes, trimmed of whitespace as the website trims it, in UTF-16 units.
pub fn source_selection(
    map: &DisplayMap,
    text: &str,
    displayed: Range<usize>,
) -> Option<TextRange> {
    let source = map.source_range(displayed)?;
    let (mut a, mut b) = (source.start.min(text.len()), source.end.min(text.len()));
    while a < b && !text.is_char_boundary(a) {
        a += 1;
    }
    while b > a && !text.is_char_boundary(b) {
        b -= 1;
    }
    let piece = &text[a..b];
    let lead = piece.len() - piece.trim_start().len();
    let trail = piece.len() - piece.trim_end().len();
    let (a, b) = (a + lead, b - trail);
    (a < b).then(|| TextRange {
        start: marks::byte_to_utf16(text, a),
        end: marks::byte_to_utf16(text, b),
    })
}
/// Lesson paragraphs are ordered by chapter, then verse.
pub fn lesson_block(chapter: usize, verse_index: usize) -> usize {
    (chapter << 16) | verse_index
}
pub fn lesson_block_parts(block: usize) -> (usize, usize) {
    (block >> 16, block & 0xffff)
}
/// Guide paragraphs are ordered by part, then by their place in the part's text.
pub fn guide_block(part: usize, index: usize) -> usize {
    (part << 20) | index
}
pub fn guide_block_parts(block: usize) -> (usize, usize) {
    (block >> 20, block & 0xfffff)
}

impl App {
    /// The displayed text of a paragraph of an area, and how it maps to its source (for word and paragraph clicks).
    fn block_text(&self, area: Area, block: usize) -> Option<String> {
        match area {
            Area::Reader => Some(self.verse_shown(block)?.text()),
            Area::Lesson => {
                let (c, v) = lesson_block_parts(block);
                let open = self.lessons.open.as_ref()?;
                let verse = open.scripture.get(c)?.verses.get(v)?;
                Some(format!(
                    "{}{}",
                    self.lesson_indent(verse.number),
                    verse.text
                ))
            }
            Area::Guide => {
                let (part, i) = guide_block_parts(block);
                let open = self.lessons.open.as_ref()?;
                let (section, index, _) = *open.prose.parts.get(part)?.blocks.get(i)?;
                Some(open.prose.blocks.get(section)?.get(index)?.text())
            }
        }
    }
    pub(crate) fn pick(
        &mut self,
        area: Area,
        block: usize,
        at: usize,
        phase: Phase,
    ) -> Task<Message> {
        let spot = Spot { block, at };
        match phase {
            Phase::Press { clicks } => {
                if area == Area::Reader && !self.modifiers.shift() {
                    self.press_point = self.pointer.get();
                }
                let extend =
                    self.modifiers.shift() && self.drag.as_ref().is_some_and(|d| d.area == area);
                if extend {
                    let d = self.drag.as_mut().expect("drag");
                    d.focus = spot;
                    d.dragging = true;
                } else {
                    let unit = match clicks {
                        1 => None,
                        n => self.block_text(area, block).map(|text| {
                            let r = if n == 2 {
                                word_at(&text, at)
                            } else {
                                0..text.len()
                            };
                            (Spot { block, at: r.start }, Spot { block, at: r.end })
                        }),
                    };
                    self.drag = Some(Drag {
                        area,
                        anchor: unit.map(|u| u.0).unwrap_or(spot),
                        focus: unit.map(|u| u.1).unwrap_or(spot),
                        unit,
                        dragging: true,
                    });
                }
            }
            Phase::Drag => match &mut self.drag {
                Some(d) if d.area == area && d.dragging => {
                    // A guide selection stays in the part it started in, as the website's guide parts are separate.
                    if area == Area::Guide
                        && guide_block_parts(block).0 != guide_block_parts(d.anchor.block).0
                    {
                        return Task::none();
                    }
                    d.focus = spot;
                }
                _ => return Task::none(),
            },
            Phase::Release => return self.end_drag(),
        }
        self.selection_changed(area, false);
        Task::none()
    }
    /// The pointer came up (here or anywhere in the window): the selection is made.
    pub(crate) fn end_drag(&mut self) -> Task<Message> {
        let Some(d) = &mut self.drag else {
            return Task::none();
        };
        if !d.dragging {
            return Task::none();
        }
        d.dragging = false;
        let area = d.area;
        if d.is_empty() {
            self.drag = None;
        }
        self.selection_changed(area, true);
        if area == Area::Reader {
            // A new selection opens its menu on the actions, beside where it was made.
            self.annotating = false;
            self.annotate_style = None;
            self.annotate_custom = None;
            self.copied_words = false;
            let release = self.pointer.get();
            self.word_anchor = (!self.word_selection.is_empty())
                .then(|| release.map(|r| (self.press_point.unwrap_or(r), r, self.reader_scroll)))
                .flatten();
        }
        Task::none()
    }
    /// Recomputes what an area's selection takes from the drag.
    fn selection_changed(&mut self, area: Area, done: bool) {
        match area {
            Area::Reader => self.word_selection = self.reader_word_ranges(),
            Area::Lesson => self.lessons.words = self.lesson_word_ranges(),
            Area::Guide => self.guide_selection_from_drag(done),
        }
        // A selection in one area is the only one: starting one elsewhere lets go of the others.
        if self.drag.as_ref().is_some_and(|d| d.area == area) {
            if area != Area::Reader {
                self.word_selection.clear();
            }
            if area != Area::Lesson {
                self.lessons.words.clear();
            }
            if area != Area::Guide {
                self.lessons.guide.selection = None;
            }
        }
    }
    pub(crate) fn clear_text_selection(&mut self, area: Area) {
        if self.drag.as_ref().is_some_and(|d| d.area == area) {
            self.drag = None;
        }
        match area {
            Area::Reader => {
                self.word_selection.clear();
                self.word_anchor = None;
                self.annotating = false;
            }
            Area::Lesson => self.lessons.words.clear(),
            Area::Guide => {
                self.lessons.guide.selection = None;
                self.lessons.guide.note = None;
            }
        }
    }
    /// The reader's selected words: each verse's own words in the selection, in UTF-16 units of its text.
    fn reader_word_ranges(&self) -> Vec<(usize, TextRange)> {
        let Some(d) = self.drag.as_ref().filter(|d| d.area == Area::Reader) else {
            return vec![];
        };
        d.blocks()
            .filter_map(|index| {
                let verse = self.verses.get(index)?;
                let shown = self.verse_shown(index)?;
                let displayed = d.in_block(Area::Reader, index, shown.map.len())?;
                let range = source_selection(&shown.map, &verse.text, displayed)?;
                marks::range_problem(&verse.text, &range)
                    .is_none()
                    .then_some((index, range))
            })
            .collect()
    }
    fn lesson_word_ranges(&self) -> Vec<(usize, u32, TextRange)> {
        let (Some(d), Some(open)) = (
            self.drag.as_ref().filter(|d| d.area == Area::Lesson),
            self.lessons.open.as_ref(),
        ) else {
            return vec![];
        };
        let (a, b) = d.ordered();
        let mut out = vec![];
        for (c, chapter) in open.scripture.iter().enumerate() {
            for (v, verse) in chapter.verses.iter().enumerate() {
                let block = lesson_block(c, v);
                if block < a.block || block > b.block {
                    continue;
                }
                let indent = self.lesson_indent(verse.number);
                let mut map = DisplayMap::default();
                map.push(indent.len(), None);
                map.push(verse.text.len(), Some(0..verse.text.len()));
                if let Some(displayed) = d.in_block(Area::Lesson, block, map.len())
                    && let Some(range) = source_selection(&map, &verse.text, displayed)
                    && marks::range_problem(&verse.text, &range).is_none()
                {
                    out.push((c, verse.number, range));
                }
            }
        }
        out
    }
    fn guide_selection_from_drag(&mut self, done: bool) {
        let Some(open) = &self.lessons.open else {
            return;
        };
        let Some(d) = self.drag.as_ref().filter(|d| d.area == Area::Guide) else {
            self.lessons.guide.selection = None;
            return;
        };
        let (a, b) = d.ordered();
        let (part, first) = guide_block_parts(a.block);
        let (end_part, last) = guide_block_parts(b.block);
        let Some(text) = open.prose.parts.get(part) else {
            return;
        };
        let unit = |i: usize, at: usize| -> Option<usize> {
            let (section, index, start) = *text.blocks.get(i)?;
            let block = open.prose.blocks.get(section)?.get(index)?.text();
            let mut at = at.min(block.len());
            while !block.is_char_boundary(at) {
                at -= 1;
            }
            Some(start + block[..at].encode_utf16().count())
        };
        let start = unit(first, a.at);
        let end = if end_part == part {
            unit(last, b.at)
        } else {
            Some(text.units.len())
        };
        let (Some(start), Some(end)) = (start, end) else {
            return;
        };
        self.lessons.guide.note = None;
        let selection = crate::guide_marks::GuideSelection {
            part,
            start,
            end,
            done,
        };
        self.lessons.guide.selection =
            if done && text.describe(selection.start, selection.end).is_none() {
                None
            } else {
                Some(selection)
            };
    }
    /// The words selected in the reader, verse by verse, with each verse's number.
    pub(crate) fn reader_selected_pieces(&self) -> Vec<(u32, String)> {
        self.word_selection
            .iter()
            .filter_map(|(index, range)| {
                let verse = self.verses.get(*index)?;
                let a = marks::utf16_to_byte(&verse.text, range.start)?;
                let b = marks::utf16_to_byte(&verse.text, range.end)?;
                Some((verse.number, verse.text[a..b].to_string()))
            })
            .collect()
    }
    /// The words selected in the reader, verse by verse (joined with spaces, as the website's selected text is).
    pub(crate) fn reader_selected_text(&self) -> String {
        self.reader_selected_pieces()
            .into_iter()
            .map(|(_, text)| text)
            .collect::<Vec<_>>()
            .join(" ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_drag_covers_whole_paragraphs_between_its_ends() {
        let d = Drag {
            area: Area::Reader,
            anchor: Spot { block: 4, at: 10 },
            focus: Spot { block: 2, at: 3 },
            unit: None,
            dragging: false,
        };
        assert_eq!(d.blocks(), 2..5);
        assert_eq!(d.in_block(Area::Reader, 2, 20), Some(3..20));
        assert_eq!(d.in_block(Area::Reader, 3, 20), Some(0..20));
        assert_eq!(d.in_block(Area::Reader, 4, 20), Some(0..10));
        assert_eq!(d.in_block(Area::Reader, 5, 20), None);
        assert_eq!(d.in_block(Area::Lesson, 3, 20), None);
    }
    #[test]
    fn selections_take_only_the_verse_text_trimmed_in_utf16() {
        let text = "Ḥesed — covenant love, “for ever.”";
        let mut map = DisplayMap::default();
        map.push(6, None);
        map.push(text.len(), Some(0..text.len()));
        // From inside the indent to just after "love,": the indent is never taken.
        let end = 6 + text.find("love,").unwrap() + "love,".len();
        let r = source_selection(&map, text, 2..end + 1).unwrap();
        let units: Vec<u16> = text.encode_utf16().collect();
        assert_eq!(
            String::from_utf16(&units[r.start..r.end]).unwrap(),
            "Ḥesed — covenant love,"
        );
        assert_eq!(r.start, 0);
        // A selection of only whitespace takes nothing.
        let space = 6 + text.find(' ').unwrap();
        assert_eq!(source_selection(&map, text, space..space + 1), None);
    }
}
