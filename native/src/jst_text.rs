// The JST's reading of one KJV verse, drawn as the website's `JstVerseText`: shared wording reads normally, the
// JST's own wording has a quiet dotted underline (`.jst-added`), omitted KJV wording is struck through and muted
// (`.jst-omitted`), and the passage label and JST verse numbers are small sans numerals raised off the baseline
// (`.jst-passage-label`, `.jst-verse-number`). None of it is KJV text, so none of it is selectable for marks.
use iced::advanced::text::{self as core_text, Paragraph as _};
use iced::advanced::{Layout, Widget, layout, mouse, renderer, widget::Tree, widget::tree};
use iced::{Border, Color, Element, Font, Length, Pixels, Point, Rectangle, Size, Theme, Vector};

use crate::jst::{Piece, Row};

type Paragraph = <iced::Renderer as core_text::Renderer>::Paragraph;

#[derive(Debug, Clone, Copy, PartialEq)]
enum Kind {
    Same,
    Added,
    Omitted,
    /// `.jst-passage-label`: 0.68rem semibold, raised 0.35em.
    Label,
    /// `.jst-verse-number`: 0.62rem medium, raised 0.45em.
    Number,
    /// `.jst-no-wording`: 0.75rem italic, muted.
    Note,
}

struct Run {
    text: String,
    kind: Kind,
}

pub struct JstText {
    runs: Vec<Run>,
    font: Font,
    size: f32,
    line: f32,
    ink: Color,
    muted: Color,
}

/// The runs of a row as the website writes them out (`JstVerseText`).
fn runs(row: &Row, show_omitted: bool, prefix: &str) -> Vec<Run> {
    let mut out = vec![];
    if !prefix.is_empty() {
        out.push(Run {
            text: prefix.to_string(),
            kind: Kind::Same,
        });
    }
    if row.first {
        out.push(Run {
            // `margin-right: 0.4rem`, written as a space after the label.
            text: format!("{} ", crate::jst::passage_label(&row.label)),
            kind: Kind::Label,
        });
    }
    let (mut wrote, mut spaced) = (false, false);
    let space = |out: &mut Vec<Run>, spaced: bool| {
        if spaced {
            out.push(Run {
                text: " ".into(),
                kind: Kind::Same,
            });
        }
    };
    for piece in &row.pieces {
        match piece {
            Piece::Verse(number) => {
                // Before any wording, the passage label (first row) or the KJV numeral already says it.
                if !wrote && (row.first || *number == row.verse.to_string()) {
                    continue;
                }
                out.push(Run {
                    text: format!(" {number} "),
                    kind: Kind::Number,
                });
                spaced = false;
            }
            Piece::Omitted(text) => {
                if !show_omitted {
                    continue;
                }
                space(&mut out, spaced);
                spaced = true;
                out.push(Run {
                    text: text.clone(),
                    kind: Kind::Omitted,
                });
            }
            Piece::Same(text) | Piece::Added(text) => {
                space(&mut out, spaced);
                wrote = true;
                spaced = true;
                out.push(Run {
                    text: text.clone(),
                    kind: if matches!(piece, Piece::Added(_)) {
                        Kind::Added
                    } else {
                        Kind::Same
                    },
                });
            }
        }
    }
    if !wrote {
        out.push(Run {
            text: " The JST passage has no wording for this KJV verse.".into(),
            kind: Kind::Note,
        });
    }
    out
}

/// The row's wording as plain text, for tests and accessibility.
#[cfg(test)]
pub fn plain(row: &Row, show_omitted: bool) -> String {
    runs(row, show_omitted, "")
        .iter()
        .map(|r| r.text.as_str())
        .collect::<String>()
}

pub fn view<'a, Message: 'a>(
    row: &Row,
    show_omitted: bool,
    prefix: &str,
    font: Font,
    size: f32,
    line: f32,
    (ink, muted): (Color, Color),
) -> Element<'a, Message> {
    Element::new(JstText {
        runs: runs(row, show_omitted, prefix),
        font,
        size,
        line,
        ink,
        muted,
    })
}

#[derive(Default)]
struct State {
    paragraph: Paragraph,
}

impl JstText {
    fn small(kind: Kind) -> Option<(f32, Font, f32)> {
        let sans = |weight| crate::design::sans(weight);
        match kind {
            Kind::Label => Some((10.88, sans(iced::font::Weight::Semibold), 0.35)),
            Kind::Number => Some((9.92, sans(iced::font::Weight::Medium), 0.45)),
            _ => None,
        }
    }
    fn spans(&self) -> Vec<core_text::Span<'_, (), Font>> {
        self.runs
            .iter()
            .map(|run| {
                let span = core_text::Span::new(run.text.as_str());
                match run.kind {
                    Kind::Same | Kind::Added => span.color(self.ink),
                    Kind::Omitted => span.color(self.muted),
                    // Laid out at their own size to take their room, drawn raised in `draw`.
                    Kind::Label | Kind::Number => {
                        let (size, font, _) =
                            Self::small(run.kind).unwrap_or((12.0, self.font, 0.0));
                        span.size(size).font(font).color(Color::TRANSPARENT)
                    }
                    Kind::Note => span
                        .size(12.0)
                        .font(Font {
                            style: iced::font::Style::Italic,
                            ..crate::design::sans(iced::font::Weight::Normal)
                        })
                        .color(self.muted),
                }
            })
            .collect()
    }
}

impl<Message> Widget<Message, Theme, iced::Renderer> for JstText {
    fn tag(&self) -> tree::Tag {
        tree::Tag::of::<State>()
    }
    fn state(&self) -> tree::State {
        tree::State::new(State::default())
    }
    fn size(&self) -> Size<Length> {
        Size::new(Length::Fill, Length::Shrink)
    }
    fn layout(
        &mut self,
        tree: &mut Tree,
        _renderer: &iced::Renderer,
        limits: &layout::Limits,
    ) -> layout::Node {
        let width = limits.max().width;
        let spans = self.spans();
        let paragraph = Paragraph::with_spans(core_text::Text {
            content: spans.as_slice(),
            bounds: Size::new(width, f32::INFINITY),
            size: Pixels(self.size),
            line_height: core_text::LineHeight::Absolute(Pixels(self.line)),
            font: self.font,
            align_x: core_text::Alignment::Left,
            align_y: iced::alignment::Vertical::Top,
            shaping: core_text::Shaping::Advanced,
            wrapping: core_text::Wrapping::Word,
        });
        let height = paragraph.min_bounds().height.max(self.line);
        tree.state.downcast_mut::<State>().paragraph = paragraph;
        layout::Node::new(limits.resolve(Length::Fill, Length::Shrink, Size::new(width, height)))
    }
    fn draw(
        &self,
        tree: &Tree,
        renderer: &mut iced::Renderer,
        _theme: &Theme,
        _style: &renderer::Style,
        layout: Layout<'_>,
        _cursor: mouse::Cursor,
        viewport: &Rectangle,
    ) {
        use iced::advanced::Renderer as _;
        use iced::advanced::text::Renderer as _;
        let bounds = layout.bounds();
        if !bounds.intersects(viewport) {
            return;
        }
        let paragraph = &tree.state.downcast_ref::<State>().paragraph;
        renderer.fill_paragraph(paragraph, bounds.position(), self.ink, *viewport);
        let origin = Vector::new(bounds.x, bounds.y);
        let baseline = crate::mark_layer::baseline(self.size, self.line);
        for (index, run) in self.runs.iter().enumerate() {
            match run.kind {
                Kind::Added => {
                    // `underline dotted`, 0.09em thick, 0.24em under the baseline, currentColor at 55%.
                    let thickness = (0.09 * self.size).max(1.0);
                    let color = Color {
                        a: 0.55 * self.ink.a,
                        ..self.ink
                    };
                    for rect in paragraph.span_bounds(index) {
                        let rect = rect + origin;
                        let y = rect.y + baseline + 0.24 * self.size;
                        let mut x = rect.x;
                        while x + thickness <= rect.x + rect.width {
                            renderer.fill_quad(
                                renderer::Quad {
                                    bounds: Rectangle::new(
                                        Point::new(x, y),
                                        Size::new(thickness, thickness),
                                    ),
                                    border: Border {
                                        radius: (thickness / 2.0).into(),
                                        ..Default::default()
                                    },
                                    ..Default::default()
                                },
                                color,
                            );
                            x += thickness * 2.0;
                        }
                    }
                }
                Kind::Omitted => {
                    let color = Color {
                        a: 0.7 * self.muted.a,
                        ..self.muted
                    };
                    for rect in paragraph.span_bounds(index) {
                        let rect = rect + origin;
                        renderer.fill_quad(
                            renderer::Quad {
                                bounds: Rectangle::new(
                                    Point::new(rect.x, rect.y + baseline - 0.28 * self.size),
                                    Size::new(rect.width, (0.06 * self.size).max(1.0)),
                                ),
                                ..Default::default()
                            },
                            color,
                        );
                    }
                }
                Kind::Label | Kind::Number => {
                    let Some((size, font, raise)) = Self::small(run.kind) else {
                        continue;
                    };
                    let line = 1.15 * size;
                    for rect in paragraph.span_bounds(index) {
                        let rect = rect + origin;
                        let y = rect.y + baseline
                            - crate::mark_layer::baseline(size, line)
                            - raise * size;
                        renderer.fill_text(
                            core_text::Text {
                                content: run.text.clone(),
                                bounds: Size::new(rect.width + 4.0, line),
                                size: Pixels(size),
                                line_height: core_text::LineHeight::Absolute(Pixels(line)),
                                font,
                                align_x: core_text::Alignment::Left,
                                align_y: iced::alignment::Vertical::Top,
                                shaping: core_text::Shaping::Advanced,
                                wrapping: core_text::Wrapping::None,
                            },
                            Point::new(rect.x, y),
                            self.muted,
                            *viewport,
                        );
                    }
                }
                Kind::Same | Kind::Note => {}
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(first: bool, pieces: Vec<Piece>) -> Row {
        Row {
            verse: 43,
            excerpt_id: "jst-mark-9#1".into(),
            label: "JST, Mark 9:40–48".into(),
            compare_reference: "Mark 9:43–48".into(),
            first,
            pieces,
        }
    }

    #[test]
    fn rows_are_written_out_like_the_websites_jst_verse_text() {
        let pieces = vec![
            Piece::Omitted("And".into()),
            Piece::Verse("40".into()),
            Piece::Added("Therefore,".into()),
            Piece::Same("if thy hand offend thee,".into()),
            Piece::Verse("41".into()),
            Piece::Added("For it is better".into()),
        ];
        // The label stands in for the first JST number; later numbers are kept; omitted words only on request.
        assert_eq!(
            plain(&row(true, pieces.clone()), false),
            "JST 9:40–48 Therefore, if thy hand offend thee, 41 For it is better"
        );
        assert_eq!(
            plain(&row(true, pieces.clone()), true),
            "JST 9:40–48 And Therefore, if thy hand offend thee, 41 For it is better"
        );
        // Not the first row: the JST number is shown unless it repeats the KJV numeral.
        assert!(plain(&row(false, pieces), false).starts_with(" 40 Therefore,"));
        // A KJV verse the JST has no wording for says so.
        assert_eq!(
            plain(
                &row(false, vec![Piece::Omitted("Where their worm".into())]),
                false
            ),
            " The JST passage has no wording for this KJV verse."
        );
    }
}
