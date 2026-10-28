// A native text editor with edits rejected by the app. Wheel input belongs to the enclosing
// reader, rather than an individual verse, so selecting text never traps page scrolling.
use iced::advanced::{
    Clipboard, Layout, Shell, Widget, layout, mouse, renderer,
    widget::{Operation, Tree, tree},
};
use iced::{Element, Event, Length, Rectangle, Size, Vector};

pub fn paragraph<'a, Message: 'a>(inner: Element<'a, Message>) -> Element<'a, Message> {
    Element::new(Paragraph(inner))
}
struct Paragraph<'a, Message>(Element<'a, Message>);
impl<Message> Widget<Message, iced::Theme, iced::Renderer> for Paragraph<'_, Message> {
    fn size(&self) -> Size<Length> {
        self.0.as_widget().size()
    }
    fn tag(&self) -> tree::Tag {
        self.0.as_widget().tag()
    }
    fn state(&self) -> tree::State {
        self.0.as_widget().state()
    }
    fn children(&self) -> Vec<Tree> {
        self.0.as_widget().children()
    }
    fn diff(&self, tree: &mut Tree) {
        self.0.as_widget().diff(tree);
    }
    fn layout(
        &mut self,
        tree: &mut Tree,
        renderer: &iced::Renderer,
        limits: &layout::Limits,
    ) -> layout::Node {
        self.0.as_widget_mut().layout(tree, renderer, limits)
    }
    fn operate(
        &mut self,
        tree: &mut Tree,
        layout: Layout<'_>,
        renderer: &iced::Renderer,
        operation: &mut dyn Operation,
    ) {
        self.0
            .as_widget_mut()
            .operate(tree, layout, renderer, operation);
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
        if matches!(
            event,
            Event::Mouse(iced::mouse::Event::WheelScrolled { .. })
        ) {
            return;
        }
        self.0.as_widget_mut().update(
            tree, event, layout, cursor, renderer, clipboard, shell, viewport,
        );
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
        self.0
            .as_widget()
            .draw(tree, renderer, theme, style, layout, cursor, viewport);
    }
    fn mouse_interaction(
        &self,
        tree: &Tree,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        viewport: &Rectangle,
        renderer: &iced::Renderer,
    ) -> mouse::Interaction {
        self.0
            .as_widget()
            .mouse_interaction(tree, layout, cursor, viewport, renderer)
    }
    fn overlay<'b>(
        &'b mut self,
        tree: &'b mut Tree,
        layout: Layout<'b>,
        renderer: &iced::Renderer,
        viewport: &Rectangle,
        translation: Vector,
    ) -> Option<iced::advanced::overlay::Element<'b, Message, iced::Theme, iced::Renderer>> {
        self.0
            .as_widget_mut()
            .overlay(tree, layout, renderer, viewport, translation)
    }
}
