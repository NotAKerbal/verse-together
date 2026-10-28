// Draws a verse's highlights and underlines beneath its selectable text. It wraps the verse's text editor: the runs
// are laid out exactly as the editor's text (same font, size, line height, width and word wrapping), only the marks
// are painted, then the editor draws on top, so native selection, copying and keys stay with the editor.
use iced::advanced::text::{self as core_text, Paragraph as _};
use iced::advanced::{
    Clipboard, Layout, Shell, Widget, layout, mouse, renderer,
    widget::{Operation, Tree, tree},
};
use iced::{Border, Color, Element, Event, Font, Length, Pixels, Rectangle, Size, Theme, Vector};

type Paragraph = <iced::Renderer as core_text::Renderer>::Paragraph;

#[derive(Debug, Clone, PartialEq)]
pub struct Run {
    pub text: String,
    pub highlight: Option<Color>,
    pub underline: Option<Color>,
}

pub struct MarkLayer<'a, Message> {
    inner: Element<'a, Message>,
    runs: Vec<Run>,
    font: Font,
    size: f32,
    line_height: f32,
}
/// Paints `runs` under `inner` (the verse's text editor), laid out at the editor's own width.
pub fn marks<'a, Message: 'a>(
    inner: Element<'a, Message>,
    runs: Vec<Run>,
    font: Font,
    size: f32,
    line_height: f32,
) -> Element<'a, Message> {
    if runs
        .iter()
        .all(|r| r.highlight.is_none() && r.underline.is_none())
    {
        return inner;
    }
    Element::new(MarkLayer {
        inner,
        runs,
        font,
        size,
        line_height,
    })
}

#[derive(Default)]
struct State {
    paragraph: Paragraph,
}

/// Where the first line's baseline sits in its line box (as `view::badge_top` assumes for these fonts).
pub fn baseline(size: f32, line: f32) -> f32 {
    (line - 1.15 * size) / 2.0 + 0.9 * size
}

impl<Message> Widget<Message, Theme, iced::Renderer> for MarkLayer<'_, Message> {
    fn tag(&self) -> tree::Tag {
        tree::Tag::of::<State>()
    }
    fn state(&self) -> tree::State {
        tree::State::new(State::default())
    }
    fn children(&self) -> Vec<Tree> {
        vec![Tree::new(&self.inner)]
    }
    fn diff(&self, tree: &mut Tree) {
        tree.diff_children(std::slice::from_ref(&self.inner));
    }
    fn size(&self) -> Size<Length> {
        self.inner.as_widget().size()
    }
    fn layout(
        &mut self,
        tree: &mut Tree,
        renderer: &iced::Renderer,
        limits: &layout::Limits,
    ) -> layout::Node {
        let node = self
            .inner
            .as_widget_mut()
            .layout(&mut tree.children[0], renderer, limits);
        let width = node.size().width;
        let spans: Vec<core_text::Span<'_, (), Font>> = self
            .runs
            .iter()
            .map(|run| core_text::Span::new(run.text.as_str()))
            .collect();
        tree.state.downcast_mut::<State>().paragraph = Paragraph::with_spans(core_text::Text {
            content: spans.as_slice(),
            bounds: Size::new(width, f32::INFINITY),
            size: Pixels(self.size),
            line_height: core_text::LineHeight::Absolute(Pixels(self.line_height)),
            font: self.font,
            align_x: core_text::Alignment::Left,
            align_y: iced::alignment::Vertical::Top,
            shaping: core_text::Shaping::Advanced,
            wrapping: core_text::Wrapping::Word,
        });
        layout::Node::with_children(node.size(), vec![node])
    }
    fn operate(
        &mut self,
        tree: &mut Tree,
        layout: Layout<'_>,
        renderer: &iced::Renderer,
        operation: &mut dyn Operation,
    ) {
        self.inner.as_widget_mut().operate(
            &mut tree.children[0],
            layout.children().next().unwrap_or(layout),
            renderer,
            operation,
        );
    }
    fn update(
        &mut self,
        tree: &mut Tree,
        event: &Event,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        renderer: &iced::Renderer,
        clipboard: &mut dyn Clipboard,
        shell: &mut Shell<'_, Message>,
        viewport: &Rectangle,
    ) {
        self.inner.as_widget_mut().update(
            &mut tree.children[0],
            event,
            layout.children().next().unwrap_or(layout),
            cursor,
            renderer,
            clipboard,
            shell,
            viewport,
        );
    }
    fn mouse_interaction(
        &self,
        tree: &Tree,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        viewport: &Rectangle,
        renderer: &iced::Renderer,
    ) -> mouse::Interaction {
        self.inner.as_widget().mouse_interaction(
            &tree.children[0],
            layout.children().next().unwrap_or(layout),
            cursor,
            viewport,
            renderer,
        )
    }
    fn overlay<'b>(
        &'b mut self,
        tree: &'b mut Tree,
        layout: Layout<'b>,
        renderer: &iced::Renderer,
        viewport: &Rectangle,
        translation: Vector,
    ) -> Option<iced::advanced::overlay::Element<'b, Message, Theme, iced::Renderer>> {
        self.inner.as_widget_mut().overlay(
            &mut tree.children[0],
            layout.children().next().unwrap_or(layout),
            renderer,
            viewport,
            translation,
        )
    }
    fn draw(
        &self,
        tree: &Tree,
        renderer: &mut iced::Renderer,
        theme: &Theme,
        style: &renderer::Style,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        viewport: &Rectangle,
    ) {
        use iced::advanced::Renderer as _;
        let bounds = layout.bounds();
        if bounds.intersects(viewport) {
            let paragraph = &tree.state.downcast_ref::<State>().paragraph;
            let origin = Vector::new(bounds.x, bounds.y);
            // `.verse-mark`: a 0.15em radius; underlines max(1.5px, 0.08em) thick, 0.22em under the baseline.
            let radius = 0.15 * self.size;
            let thickness = (0.08 * self.size).max(1.5);
            let under = baseline(self.size, self.line_height) + 0.22 * self.size;
            for (index, run) in self.runs.iter().enumerate() {
                if run.highlight.is_none() && run.underline.is_none() {
                    continue;
                }
                for rect in paragraph.span_bounds(index) {
                    let rect = rect + origin;
                    if let Some(color) = run.highlight {
                        renderer.fill_quad(
                            renderer::Quad {
                                bounds: rect,
                                border: Border {
                                    radius: radius.into(),
                                    ..Default::default()
                                },
                                ..Default::default()
                            },
                            color,
                        );
                    }
                    if let Some(color) = run.underline {
                        renderer.fill_quad(
                            renderer::Quad {
                                bounds: Rectangle::new(
                                    iced::Point::new(rect.x, rect.y + under),
                                    Size::new(rect.width, thickness),
                                ),
                                ..Default::default()
                            },
                            color,
                        );
                    }
                }
            }
        }
        self.inner.as_widget().draw(
            &tree.children[0],
            renderer,
            theme,
            style,
            layout.children().next().unwrap_or(layout),
            cursor,
            viewport,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn runs_cover_the_same_lines_as_the_text() {
        crate::design::load_fonts();
        let font = crate::design::serif();
        let text = "And now as I said concerning faith—faith is not to have a perfect knowledge of things; therefore if ye have faith ye hope for things which are not seen, which are true.";
        let split = text.find("faith is").unwrap();
        let spans = [
            core_text::Span::<(), Font>::new(&text[..split]),
            core_text::Span::new(&text[split..split + 12]),
            core_text::Span::new(&text[split + 12..]),
        ];
        let paragraph = Paragraph::with_spans(core_text::Text {
            content: spans.as_slice(),
            bounds: Size::new(300.0, f32::INFINITY),
            size: Pixels(16.0),
            line_height: core_text::LineHeight::Absolute(Pixels(28.0)),
            font,
            align_x: core_text::Alignment::Left,
            align_y: iced::alignment::Vertical::Top,
            shaping: core_text::Shaping::Advanced,
            wrapping: core_text::Wrapping::Word,
        });
        let plain = Paragraph::with_text(core_text::Text {
            content: text,
            bounds: Size::new(300.0, f32::INFINITY),
            size: Pixels(16.0),
            line_height: core_text::LineHeight::Absolute(Pixels(28.0)),
            font,
            align_x: core_text::Alignment::Left,
            align_y: iced::alignment::Vertical::Top,
            shaping: core_text::Shaping::Advanced,
            wrapping: core_text::Wrapping::Word,
        });
        // Splitting into runs never changes where the text wraps.
        assert_eq!(paragraph.min_bounds().height, plain.min_bounds().height);
        let marked = paragraph.span_bounds(1);
        assert!(!marked.is_empty());
        assert!(marked.iter().all(|r| r.height == 28.0 && r.width > 0.0));
    }
}
