// Selectable rich text: a paragraph of styled spans (Iced's rich text, so bold, italics and links keep their
// formatting) that the reader can drag across to select words. Dragging reports the selected range as byte offsets
// into the paragraph's text; the app draws the selection and any marks as span backgrounds and underlines, so what
// is shown is always the app's own state. A press on a link is the link's (the rich text handles it).
use iced::advanced::text::{self as core_text, Paragraph as _, Span};
use iced::advanced::{
    Clipboard, Layout, Shell, Widget, layout, mouse, renderer,
    widget::{Operation, Tree, tree},
};
use iced::widget::text::{LineHeight, Shaping, Wrapping};
use iced::{Element, Event, Font, Length, Point, Rectangle, Size, Vector};

type Paragraph = <iced::Renderer as core_text::Renderer>::Paragraph;

pub struct Selectable<'a, Message> {
    inner: Element<'a, Message>,
    spans: Vec<Span<'a, String, Font>>,
    size: f32,
    line_height: f32,
    font: Font,
    on_select: Box<dyn Fn(usize, usize, bool) -> Message + 'a>,
}
/// `spans` must be the ones `inner` (a rich text) draws, with the same size, line height and font.
pub fn selectable<'a, Message: 'a>(
    inner: impl Into<Element<'a, Message>>,
    spans: Vec<Span<'a, String, Font>>,
    size: f32,
    line_height: f32,
    font: Font,
    on_select: impl Fn(usize, usize, bool) -> Message + 'a,
) -> Element<'a, Message> {
    Element::new(Selectable {
        inner: inner.into(),
        spans,
        size,
        line_height,
        font,
        on_select: Box::new(on_select),
    })
}
#[derive(Default)]
struct State {
    anchor: Option<usize>,
    last: Option<usize>,
}
impl<Message> Selectable<'_, Message> {
    fn text_len(&self) -> usize {
        self.spans.iter().map(|s| s.text.len()).sum()
    }
    /// The byte offset in the paragraph's text nearest `point` (relative to the paragraph's top left).
    fn offset_at(&self, width: f32, height: f32, point: Point) -> usize {
        if point.y < 0.0 {
            return 0;
        }
        if point.y >= height {
            return self.text_len();
        }
        let paragraph = Paragraph::with_spans(core_text::Text {
            content: self.spans.as_slice(),
            bounds: Size::new(width, f32::INFINITY),
            size: self.size.into(),
            line_height: LineHeight::Absolute(self.line_height.into()),
            font: self.font,
            align_x: core_text::Alignment::Default,
            align_y: iced::alignment::Vertical::Top,
            shaping: Shaping::Advanced,
            wrapping: Wrapping::WordOrGlyph,
        });
        let x = point.x.clamp(0.0, width);
        match paragraph.hit_test(Point::new(x, point.y)) {
            Some(core_text::Hit::CharOffset(i)) => i.min(self.text_len()),
            None => self.text_len(),
        }
    }
}
impl<Message> Widget<Message, iced::Theme, iced::Renderer> for Selectable<'_, Message> {
    fn size(&self) -> Size<Length> {
        self.inner.as_widget().size()
    }
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
    fn layout(
        &mut self,
        tree: &mut Tree,
        renderer: &iced::Renderer,
        limits: &layout::Limits,
    ) -> layout::Node {
        let child = self
            .inner
            .as_widget_mut()
            .layout(&mut tree.children[0], renderer, limits);
        let size = child.size();
        layout::Node::with_children(size, vec![child])
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
            layout.children().next().unwrap(),
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
        let dragging = tree.state.downcast_ref::<State>().anchor.is_some();
        if !dragging {
            self.inner.as_widget_mut().update(
                &mut tree.children[0],
                event,
                layout.children().next().unwrap(),
                cursor,
                renderer,
                clipboard,
                shell,
                viewport,
            );
            if shell.is_event_captured() {
                return;
            }
        }
        let bounds = layout.bounds();
        let relative = |p: Point| Point::new(p.x - bounds.x, p.y - bounds.y);
        match event {
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)) => {
                if let Some(p) = cursor.position_over(bounds) {
                    let at = self.offset_at(bounds.width, bounds.height, relative(p));
                    let state = tree.state.downcast_mut::<State>();
                    state.anchor = Some(at);
                    state.last = Some(at);
                    shell.publish((self.on_select)(at, at, false));
                    shell.capture_event();
                }
            }
            Event::Mouse(mouse::Event::CursorMoved { position }) if dragging => {
                // The event's position is the window's; `cursor` is translated into this (scrolled) layout.
                let point = cursor.position().unwrap_or(*position);
                let at = self.offset_at(bounds.width, bounds.height, relative(point));
                let state = tree.state.downcast_mut::<State>();
                if state.last != Some(at) {
                    state.last = Some(at);
                    let anchor = state.anchor.unwrap_or(at);
                    shell.publish((self.on_select)(anchor.min(at), anchor.max(at), false));
                }
            }
            Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)) if dragging => {
                let state = tree.state.downcast_mut::<State>();
                let (anchor, at) = (state.anchor.take().unwrap_or(0), state.last.unwrap_or(0));
                shell.publish((self.on_select)(anchor.min(at), anchor.max(at), true));
                shell.capture_event();
            }
            _ => {}
        }
    }
    fn draw(
        &self,
        tree: &Tree,
        renderer: &mut iced::Renderer,
        theme: &iced::Theme,
        style: &renderer::Style,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        viewport: &Rectangle,
    ) {
        self.inner.as_widget().draw(
            &tree.children[0],
            renderer,
            theme,
            style,
            layout.children().next().unwrap(),
            cursor,
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
        let inner = self.inner.as_widget().mouse_interaction(
            &tree.children[0],
            layout.children().next().unwrap(),
            cursor,
            viewport,
            renderer,
        );
        if inner != mouse::Interaction::None {
            inner
        } else if cursor.is_over(layout.bounds()) {
            mouse::Interaction::Text
        } else {
            mouse::Interaction::None
        }
    }
    fn overlay<'b>(
        &'b mut self,
        tree: &'b mut Tree,
        layout: Layout<'b>,
        renderer: &iced::Renderer,
        viewport: &Rectangle,
        translation: Vector,
    ) -> Option<iced::advanced::overlay::Element<'b, Message, iced::Theme, iced::Renderer>> {
        self.inner.as_widget_mut().overlay(
            &mut tree.children[0],
            layout.children().next().unwrap(),
            renderer,
            viewport,
            translation,
        )
    }
}
