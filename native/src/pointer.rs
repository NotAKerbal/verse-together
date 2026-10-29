// Where the pointer is in the window, kept without a message per move: the whole window is wrapped in `tracked`,
// which notes each pointer position in a shared cell before passing the event on. The selection menu is placed
// beside the words from where a selection was pressed and let go (the website places it beside the selection's
// own rectangle, which a scrolled `select_text` paragraph can't report in window coordinates).
use iced::advanced::widget::{Operation, Tree, tree};
use iced::advanced::{Clipboard, Layout, Shell, Widget, layout, mouse, overlay, renderer};
use iced::{Element, Event, Length, Point, Rectangle, Size, Theme, Vector};
use std::sync::{Arc, Mutex};

/// The pointer's last position in the window, shared by the app and the widget that notes it.
#[derive(Debug, Clone, Default)]
pub struct Pointer(Arc<Mutex<Option<Point>>>);
impl Pointer {
    pub fn get(&self) -> Option<Point> {
        *self.0.lock().expect("pointer")
    }
    pub fn set(&self, point: Point) {
        *self.0.lock().expect("pointer") = Some(point);
    }
}

pub struct Tracked<'a, Message> {
    content: Element<'a, Message>,
    pointer: Pointer,
}
pub fn tracked<'a, Message>(
    content: impl Into<Element<'a, Message>>,
    pointer: &Pointer,
) -> Tracked<'a, Message> {
    Tracked {
        content: content.into(),
        pointer: pointer.clone(),
    }
}
impl<'a, Message> Widget<Message, Theme, iced::Renderer> for Tracked<'a, Message> {
    fn size(&self) -> Size<Length> {
        self.content.as_widget().size()
    }
    fn tag(&self) -> tree::Tag {
        tree::Tag::stateless()
    }
    fn children(&self) -> Vec<Tree> {
        vec![Tree::new(&self.content)]
    }
    fn diff(&self, tree: &mut Tree) {
        tree.diff_children(std::slice::from_ref(&self.content));
    }
    fn layout(
        &mut self,
        tree: &mut Tree,
        renderer: &iced::Renderer,
        limits: &layout::Limits,
    ) -> layout::Node {
        self.content
            .as_widget_mut()
            .layout(&mut tree.children[0], renderer, limits)
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
        if let Event::Mouse(mouse::Event::CursorMoved { position }) = event {
            self.pointer.set(*position);
        }
        self.content.as_widget_mut().update(
            &mut tree.children[0],
            event,
            layout,
            cursor,
            renderer,
            clipboard,
            shell,
            viewport,
        );
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
        self.content.as_widget().draw(
            &tree.children[0],
            renderer,
            theme,
            style,
            layout,
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
        self.content.as_widget().mouse_interaction(
            &tree.children[0],
            layout,
            cursor,
            viewport,
            renderer,
        )
    }
    fn operate(
        &mut self,
        tree: &mut Tree,
        layout: Layout<'_>,
        renderer: &iced::Renderer,
        operation: &mut dyn Operation,
    ) {
        self.content
            .as_widget_mut()
            .operate(&mut tree.children[0], layout, renderer, operation);
    }
    fn overlay<'b>(
        &'b mut self,
        tree: &'b mut Tree,
        layout: Layout<'b>,
        renderer: &iced::Renderer,
        viewport: &Rectangle,
        translation: Vector,
    ) -> Option<overlay::Element<'b, Message, Theme, iced::Renderer>> {
        self.content.as_widget_mut().overlay(
            &mut tree.children[0],
            layout,
            renderer,
            viewport,
            translation,
        )
    }
}
impl<'a, Message: 'a> From<Tracked<'a, Message>> for Element<'a, Message> {
    fn from(t: Tracked<'a, Message>) -> Self {
        Element::new(t)
    }
}
