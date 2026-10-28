// Shows a fraction of its child's natural width, clipped, like the website's `grid-template-columns: 0fr → 1fr`
// and `max-width` transitions. The child is always laid out at full size, so it never re-wraps while animating.
use iced::advanced::{
    Clipboard, Layout, Renderer as _, Shell, Widget, layout, mouse, renderer,
    widget::{Operation, Tree},
};
use iced::{Element, Event, Length, Rectangle, Size};

pub fn reveal<'a, Message: 'a>(
    child: impl Into<Element<'a, Message>>,
    fraction: f32,
    interactive: bool,
) -> Element<'a, Message> {
    Element::new(Reveal {
        child: child.into(),
        fraction: fraction.clamp(0.0, 1.0),
        interactive,
    })
}

struct Reveal<'a, Message> {
    child: Element<'a, Message>,
    fraction: f32,
    interactive: bool,
}

impl<Message> Widget<Message, iced::Theme, iced::Renderer> for Reveal<'_, Message> {
    fn size(&self) -> Size<Length> {
        Size::new(Length::Shrink, Length::Shrink)
    }
    fn children(&self) -> Vec<Tree> {
        vec![Tree::new(&self.child)]
    }
    fn diff(&self, tree: &mut Tree) {
        tree.diff_children(std::slice::from_ref(&self.child));
    }
    fn layout(
        &mut self,
        tree: &mut Tree,
        renderer: &iced::Renderer,
        limits: &layout::Limits,
    ) -> layout::Node {
        let natural =
            layout::Limits::new(Size::ZERO, Size::new(f32::INFINITY, limits.max().height));
        let child = self
            .child
            .as_widget_mut()
            .layout(&mut tree.children[0], renderer, &natural);
        let size = child.size();
        layout::Node::with_children(
            Size::new(size.width * self.fraction, size.height),
            vec![child],
        )
    }
    fn operate(
        &mut self,
        tree: &mut Tree,
        layout: Layout<'_>,
        renderer: &iced::Renderer,
        operation: &mut dyn Operation,
    ) {
        if let Some(child) = layout.children().next() {
            self.child
                .as_widget_mut()
                .operate(&mut tree.children[0], child, renderer, operation);
        }
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
        // Collapsed content is inert, as on the website, and the hidden part never takes clicks.
        if !self.interactive {
            return;
        }
        let cursor = if cursor.is_over(layout.bounds()) {
            cursor
        } else {
            mouse::Cursor::Unavailable
        };
        if let Some(child) = layout.children().next() {
            self.child.as_widget_mut().update(
                &mut tree.children[0],
                event,
                child,
                cursor,
                renderer,
                clipboard,
                shell,
                viewport,
            );
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
        let bounds = layout.bounds();
        if bounds.width <= 0.0 {
            return;
        }
        let Some(child) = layout.children().next() else {
            return;
        };
        let Some(clip) = bounds.intersection(viewport) else {
            return;
        };
        renderer.with_layer(clip, |renderer| {
            self.child.as_widget().draw(
                &tree.children[0],
                renderer,
                theme,
                style,
                child,
                cursor,
                &clip,
            );
        });
    }
    fn mouse_interaction(
        &self,
        tree: &Tree,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        viewport: &Rectangle,
        renderer: &iced::Renderer,
    ) -> mouse::Interaction {
        if !self.interactive || !cursor.is_over(layout.bounds()) {
            return mouse::Interaction::None;
        }
        layout
            .children()
            .next()
            .map(|child| {
                self.child.as_widget().mouse_interaction(
                    &tree.children[0],
                    child,
                    cursor,
                    viewport,
                    renderer,
                )
            })
            .unwrap_or_default()
    }
}
