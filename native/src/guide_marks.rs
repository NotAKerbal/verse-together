// Marks and notes on a study guide's prose, as the website's useGuideHighlights offers them: select words in the
// guide, then a quick mark, any mark, or a note for that exact span. Spans are stored per owner (this computer's
// study, or the signed-in account's, synced with `annotations:*Guide*`) and found again by their anchors.
use crate::design::{self, icon, sans};
use crate::guide_text::{self, Block, Kind, PartText};
use crate::icons;
use crate::marks::{MarkColor, MarkKind};
use crate::rich_select;
use crate::store::GuideMark;
use crate::{App, Message};
use iced::advanced::text::Span;
use iced::widget::{button, column, container, rich_text, row, span, text, text_editor};
use iced::{Alignment::Center, Border, Color, Element, Fill, Font, Padding, font};

pub const PARTS: [&str; 2] = ["introduction", "reader"];
/// A span drawn in a block: start, end (UTF-16 from the block's start), highlight, underline, and whether it has a note.
type Painted = (usize, usize, Option<Color>, Option<Color>, bool);

/// The guide's prose, ready to mark: each section's blocks and the text of each part.
#[derive(Default)]
pub struct GuideProse {
    pub blocks: Vec<Vec<Block>>,
    /// Which part (index into `PARTS`) each section belongs to.
    pub section_part: Vec<usize>,
    pub parts: [PartText; 2],
}
impl GuideProse {
    /// Sections before the first verse-by-verse one are the introduction; from it on, the reader part (the
    /// closing sections included), as the website's guide divides them.
    pub fn new(sections: &[crate::lessons::Section]) -> Self {
        let blocks: Vec<Vec<Block>> = sections
            .iter()
            .map(|s| guide_text::blocks(&s.body))
            .collect();
        let first_reader = sections
            .iter()
            .position(|s| s.passage.is_some())
            .unwrap_or(sections.len());
        let section_part: Vec<usize> = (0..sections.len())
            .map(|i| usize::from(i >= first_reader))
            .collect();
        let part = |n: usize| {
            let list: Vec<(usize, &[Block])> = blocks
                .iter()
                .enumerate()
                .filter(|(i, _)| section_part[*i] == n)
                .map(|(i, b)| (i, b.as_slice()))
                .collect();
            PartText::build(&list)
        };
        let parts = [part(0), part(1)];
        Self {
            blocks,
            section_part,
            parts,
        }
    }
}
/// A selection in the guide's prose: its part and span there, in UTF-16 units.
#[derive(Debug, Clone, PartialEq)]
pub struct GuideSelection {
    pub part: usize,
    pub start: usize,
    pub end: usize,
    pub done: bool,
}
#[derive(Default)]
pub struct GuideMarksState {
    pub marks: Vec<GuideMark>,
    /// Where each mark is now: (index into `marks`, part, start, end). Marks that can't be placed aren't drawn.
    pub placed: Vec<(usize, usize, usize, usize)>,
    pub selection: Option<GuideSelection>,
    pub note: Option<text_editor::Content>,
}

#[derive(Debug, Clone)]
pub enum GuideMsg {
    Select(usize, usize, usize, usize, bool),
    QuickMark(usize),
    Mark(MarkKind, Option<MarkColor>),
    ClearMarks,
    OpenNote,
    EditNote(text_editor::Action),
    SaveNote,
    Dismiss,
}
fn msg(m: GuideMsg) -> Message {
    Message::Guide(m)
}

impl App {
    pub(crate) fn load_guide_marks(&mut self) {
        let Some(open) = &self.lessons.open else {
            return;
        };
        let guide = open.lesson.start.clone();
        let marks = match &self.store {
            Some(s) => s.guide_marks(&guide),
            None => return,
        };
        let Some(marks) = self.report(marks) else {
            return;
        };
        let prose = &self.lessons.open.as_ref().expect("open guide").prose;
        let placed = marks
            .iter()
            .enumerate()
            .filter_map(|(i, m)| {
                let part = PARTS.iter().position(|p| *p == m.part)?;
                let (s, e) = prose.parts[part].resolve(&m.anchor)?;
                Some((i, part, s, e))
            })
            .collect();
        self.lessons.guide.marks = marks;
        self.lessons.guide.placed = placed;
    }
    /// The selection's anchor, and the saved span with exactly that anchor, if any.
    fn selected_span(&self) -> Option<(GuideMark, Option<usize>)> {
        let open = self.lessons.open.as_ref()?;
        let sel = self.lessons.guide.selection.as_ref()?;
        let (anchor, ..) = open.prose.parts[sel.part].describe(sel.start, sel.end)?;
        let (s, e) = trimmed(&open.prose.parts[sel.part], sel.start, sel.end);
        let existing = self
            .lessons
            .guide
            .placed
            .iter()
            .find(|(_, part, ps, pe)| *part == sel.part && (*ps, *pe) == (s, e))
            .map(|(i, ..)| *i);
        let mark = existing
            .map(|i| self.lessons.guide.marks[i].clone())
            .unwrap_or(GuideMark {
                guide: open.lesson.start.clone(),
                part: PARTS[sel.part].into(),
                anchor,
                highlight: None,
                underline: None,
                body: String::new(),
            });
        Some((mark, existing))
    }
    fn save_guide_mark(&mut self, m: GuideMark) {
        if let Some(store) = &mut self.store {
            let r = store.save_guide_mark(&m);
            if self.report(r).is_none() {
                return;
            }
        }
        self.load_guide_marks();
        self.sync_soon();
    }
    pub(crate) fn update_guide(&mut self, message: GuideMsg) -> iced::Task<Message> {
        match message {
            GuideMsg::Select(section, block, a, b, done) => {
                let Some(open) = &self.lessons.open else {
                    return iced::Task::none();
                };
                let part = open.prose.section_part.get(section).copied().unwrap_or(0);
                let Some(start) = open.prose.parts[part].block_start(section, block) else {
                    return iced::Task::none();
                };
                let text = open.prose.blocks[section][block].text();
                let units = |byte: usize| {
                    let byte = byte.min(text.len());
                    let mut b = byte;
                    while !text.is_char_boundary(b) {
                        b -= 1;
                    }
                    text[..b].encode_utf16().count()
                };
                let (s, e) = (start + units(a), start + units(b));
                self.lessons.guide.note = None;
                self.lessons.guide.selection = (s < e || !done).then_some(GuideSelection {
                    part,
                    start: s,
                    end: e,
                    done,
                });
                if done
                    && self.lessons.guide.selection.as_ref().is_some_and(|sel| {
                        open.prose.parts[sel.part]
                            .describe(sel.start, sel.end)
                            .is_none()
                    })
                {
                    self.lessons.guide.selection = None;
                }
            }
            GuideMsg::QuickMark(i) => {
                if let Some(preset) = self.preferences.presets().get(i).cloned()
                    && let Some((mark, _)) = self.selected_span()
                {
                    let current = match preset.kind {
                        MarkKind::Highlight => &mark.highlight,
                        MarkKind::Underline => &mark.underline,
                    };
                    let on = current.as_ref() == Some(&preset.color);
                    return self
                        .update_guide(GuideMsg::Mark(preset.kind, (!on).then_some(preset.color)));
                }
            }
            GuideMsg::Mark(kind, color) => {
                if let Some((mut mark, _)) = self.selected_span() {
                    match kind {
                        MarkKind::Highlight => mark.highlight = color,
                        MarkKind::Underline => mark.underline = color,
                    }
                    self.save_guide_mark(mark);
                }
            }
            GuideMsg::ClearMarks => {
                // Every span the selection touches loses its marks (a note stays).
                let Some(sel) = self.lessons.guide.selection.clone() else {
                    return iced::Task::none();
                };
                let touched: Vec<GuideMark> = self
                    .lessons
                    .guide
                    .placed
                    .iter()
                    .filter(|(_, part, s, e)| *part == sel.part && *s < sel.end && *e > sel.start)
                    .map(|(i, ..)| self.lessons.guide.marks[*i].clone())
                    .collect();
                for mut m in touched {
                    m.highlight = None;
                    m.underline = None;
                    if let Some(store) = &mut self.store {
                        let r = store.save_guide_mark(&m);
                        self.report(r);
                    }
                }
                self.load_guide_marks();
                self.sync_soon();
            }
            GuideMsg::OpenNote => {
                let body = self
                    .selected_span()
                    .map(|(m, _)| m.body)
                    .unwrap_or_default();
                self.lessons.guide.note = Some(text_editor::Content::with_text(&body));
                return crate::presented(iced::widget::operation::focus("guide-note"));
            }
            GuideMsg::EditNote(action) => {
                if let Some(note) = &mut self.lessons.guide.note {
                    note.perform(action);
                }
            }
            GuideMsg::SaveNote => {
                if let (Some(note), Some((mut mark, _))) =
                    (&self.lessons.guide.note, self.selected_span())
                {
                    mark.body = note.text().trim().to_string();
                    self.lessons.guide.note = None;
                    self.save_guide_mark(mark);
                }
            }
            GuideMsg::Dismiss => {
                self.lessons.guide.selection = None;
                self.lessons.guide.note = None;
            }
        }
        iced::Task::none()
    }

    /// One block of guide prose: its runs as selectable rich text, with marks and the selection drawn on them.
    pub(crate) fn guide_block<'a>(
        &self,
        section: usize,
        index: usize,
        block: &'a Block,
        size: f32,
    ) -> Element<'a, Message> {
        let p = self.p();
        let dark = self.preferences.dark;
        let open = self.lessons.open.as_ref().expect("open guide");
        let part = open.prose.section_part[section];
        let start = open.prose.parts[part]
            .block_start(section, index)
            .unwrap_or(0);
        let text_all = block.text();
        let len16 = text_all.encode_utf16().count();
        // The block's marks and selection, in UTF-16 units from the block's start.
        let mut ranges: Vec<Painted> = Vec::new();
        for (i, mp, s, e) in &self.lessons.guide.placed {
            if *mp == part && *s < start + len16 && *e > start {
                let m = &self.lessons.guide.marks[*i];
                ranges.push((
                    s.saturating_sub(start),
                    (*e - start).min(len16),
                    m.highlight.as_ref().map(|c| c.highlight(dark)),
                    m.underline.as_ref().map(|c| c.underline(dark)),
                    !m.body.trim().is_empty(),
                ));
            }
        }
        let selection = self
            .lessons
            .guide
            .selection
            .as_ref()
            .filter(|sel| sel.part == part && sel.start < start + len16 && sel.end > start)
            .map(|sel| {
                (
                    sel.start.saturating_sub(start),
                    (sel.end - start).min(len16),
                )
            });
        let mut cuts: Vec<usize> = vec![0, len16];
        for (s, e, ..) in &ranges {
            cuts.extend([*s, *e]);
        }
        if let Some((s, e)) = selection {
            cuts.extend([s, e]);
        }
        let base_font = design::serif();
        let mut spans: Vec<Span<'a, String, Font>> = Vec::new();
        let mut at16 = 0;
        for run in &block.runs {
            let run16 = run.text.encode_utf16().count();
            let mut points: Vec<usize> = cuts
                .iter()
                .filter(|c| **c > at16 && **c < at16 + run16)
                .map(|c| c - at16)
                .collect();
            points.push(0);
            points.push(run16);
            points.sort_unstable();
            points.dedup();
            for w in points.windows(2) {
                let (a, b) = (w[0], w[1]);
                let (ba, bb) = (
                    crate::marks::utf16_to_byte(&run.text, a).unwrap_or(0),
                    crate::marks::utf16_to_byte(&run.text, b).unwrap_or(run.text.len()),
                );
                let piece = run.text[ba..bb].to_string();
                let (g0, g1) = (at16 + a, at16 + b);
                let mut font = if run.italic {
                    design::serif_italic()
                } else {
                    base_font
                };
                if run.bold {
                    font = Font {
                        weight: font::Weight::Bold,
                        ..font
                    };
                }
                let mut sp: Span<'a, String, Font> = span(piece).font(font);
                if let Some(link) = &run.link {
                    sp = sp.color(p.accent).link(link.clone());
                }
                let covering = ranges.iter().filter(|(s, e, ..)| *s <= g0 && *e >= g1);
                let mut background = None;
                let mut underline = false;
                for (_, _, h, u, _) in covering {
                    if h.is_some() {
                        background = *h;
                    }
                    if let Some(u) = u {
                        underline = true;
                        sp = sp.color(*u);
                    }
                }
                if let Some((s, e)) = selection
                    && s <= g0
                    && e >= g1
                {
                    background = Some(Color { a: 0.55, ..p.gold });
                }
                if let Some(bg) = background {
                    sp = sp.background(bg);
                }
                if underline {
                    sp = sp.underline(true);
                }
                spans.push(sp);
            }
            at16 += run16;
        }
        let (size, line) = match block.kind {
            Kind::Heading(2) => (30.0, 38.0),
            Kind::Heading(_) => (22.0, 30.0),
            _ => (size, (size * 1.65).round()),
        };
        let inner = rich_text(spans.clone())
            .size(size)
            .line_height(iced::widget::text::LineHeight::Absolute(line.into()))
            .font(base_font)
            .on_link_click(|uri: String| Message::Lesson(crate::lessons_ui::LessonMsg::Link(uri)));
        let paragraph =
            rich_select::selectable(inner, spans, size, line, base_font, move |a, b, done| {
                msg(GuideMsg::Select(section, index, a, b, done))
            });
        let has_note = ranges.iter().any(|r| r.4);
        let paragraph: Element<'a, Message> = if has_note {
            row![
                container(paragraph).width(Fill),
                container(icon(&icons::NOTE_STICKY, p.muted, 12.)).padding(Padding::ZERO.top(8))
            ]
            .spacing(8)
            .into()
        } else {
            paragraph
        };
        match &block.kind {
            Kind::Quote => container(paragraph)
                .padding(Padding::ZERO.left(16))
                .style(move |_| container::Style {
                    border: Border {
                        color: p.rule,
                        width: 0.0,
                        radius: 0.0.into(),
                    },
                    shadow: iced::Shadow {
                        color: p.rule,
                        offset: iced::Vector::new(-3.0, 0.0),
                        blur_radius: 0.0,
                    },
                    ..Default::default()
                })
                .into(),
            Kind::Item(marker) => row![
                text(marker.clone()).size(size).font(base_font).width(22),
                container(paragraph).width(Fill)
            ]
            .into(),
            _ => paragraph,
        }
    }

    /// The floating bar for a selection in the guide (the website's selection menu for guide text).
    pub(crate) fn guide_bar(&self) -> Option<Element<'_, Message>> {
        let sel = self.lessons.guide.selection.as_ref().filter(|s| s.done)?;
        let open = self.lessons.open.as_ref()?;
        let (anchor, ..) = open.prose.parts[sel.part].describe(sel.start, sel.end)?;
        let p = self.p();
        let (mark, _) = self.selected_span()?;
        let quote = if anchor.exact.chars().count() > 60 {
            format!(
                "“{}…”",
                anchor.exact.chars().take(60).collect::<String>().trim_end()
            )
        } else {
            format!("“{}”", anchor.exact)
        };
        let mut presets = row![].spacing(6);
        for (i, preset) in self.preferences.presets().iter().enumerate() {
            let on = match preset.kind {
                MarkKind::Highlight => mark.highlight.as_ref() == Some(&preset.color),
                MarkKind::Underline => mark.underline.as_ref() == Some(&preset.color),
            };
            presets = presets.push(
                button(crate::view_marks::sample(
                    preset.kind,
                    &preset.color,
                    self.preferences.dark,
                    p.ink,
                ))
                .padding([6, 8])
                .on_press(msg(GuideMsg::QuickMark(i)))
                .style(move |_, status| button::Style {
                    background: Some(
                        if on || matches!(status, button::Status::Hovered) {
                            p.hover
                        } else {
                            p.card
                        }
                        .into(),
                    ),
                    border: Border {
                        color: if on { p.ink } else { p.rule },
                        width: if on { 2.0 } else { 1.0 },
                        radius: 8.0.into(),
                    },
                    ..Default::default()
                }),
            );
        }
        let round = |glyph: &'static icons::Icon, m: Message, label: &str| {
            self.hint(
                button(container(icon(glyph, p.ink, 13.)).center_x(32).center_y(32))
                    .padding(0)
                    .on_press(m)
                    .style(design::circle(p)),
                label.to_string(),
            )
        };
        let mut bar = column![
            row![
                column![
                    text("Guide").size(12).font(sans(font::Weight::Semibold)),
                    text(quote).font(design::serif()).size(13).color(p.muted),
                ]
                .spacing(2)
                .width(Fill),
                round(&icons::NOTE_STICKY, msg(GuideMsg::OpenNote), "Write a note"),
                round(&icons::TRASH, msg(GuideMsg::ClearMarks), "Remove marks"),
                round(&icons::XMARK, msg(GuideMsg::Dismiss), "Done"),
            ]
            .spacing(4)
            .align_y(Center),
            presets.wrap(),
        ]
        .spacing(10);
        if let Some(note) = &self.lessons.guide.note {
            bar = bar.push(
                text_editor(note)
                    .id("guide-note")
                    .placeholder("A note on these words")
                    .on_action(|a| msg(GuideMsg::EditNote(a)))
                    .size(14)
                    .height(96)
                    .padding(10),
            );
            bar = bar.push(
                button(
                    text("Save note")
                        .size(13)
                        .font(sans(font::Weight::Semibold))
                        .center()
                        .width(Fill),
                )
                .padding([8, 12])
                .width(Fill)
                .on_press(msg(GuideMsg::SaveNote))
                .style(design::active(p)),
            );
        } else if !mark.body.trim().is_empty() {
            bar = bar.push(text(mark.body.clone()).size(13).color(p.ink));
        }
        Some(
            container(bar)
                .padding(Padding::from([12, 14]))
                .width(440)
                .style(design::popover(p))
                .into(),
        )
    }
}
/// The selection as `describe` trims it.
fn trimmed(part: &PartText, start: usize, end: usize) -> (usize, usize) {
    part.describe(start, end)
        .map(|(_, s, e)| (s, e))
        .unwrap_or((start, end))
}
