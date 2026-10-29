// A verse in the reading log, as the website draws it (`.reader-verse[data-read]::before` and `.verse-read-marker`):
// a 2px rule down the verse's left edge, and a marker placed partly outside that edge (`left: -0.75rem`). Both are
// positioned absolutely on the website, so neither moves the verse's text; here the verse is laid out as usual and the
// rule and marker are placed over it, the marker free to reach past the verse's bounds.
use iced::advanced::widget::{Operation, Tree};
use iced::advanced::{Clipboard, Layout, Shell, Widget, layout, mouse, overlay, renderer};
use iced::{Color, Element, Event, Length, Rectangle, Size, Vector};

pub struct Margin<'a, Message> {
    content: Element<'a, Message>,
    marker: Option<(Element<'a, Message>, Vector)>,
    /// The rule's insets from the top and bottom, and its color.
    rule: Option<(f32, f32, Color)>,
}
pub fn margin<'a, Message>(content: impl Into<Element<'a, Message>>) -> Margin<'a, Message> {
    Margin {
        content: content.into(),
        marker: None,
        rule: None,
    }
}
impl<'a, Message> Margin<'a, Message> {
    /// A marker at `offset` from the content's top left (it may lie outside the content).
    pub fn marker(mut self, marker: impl Into<Element<'a, Message>>, offset: Vector) -> Self {
        self.marker = Some((marker.into(), offset));
        self
    }
    /// A 2px rule down the left edge, `top` and `bottom` in from the ends.
    pub fn rule(mut self, top: f32, bottom: f32, color: Color) -> Self {
        self.rule = Some((top, bottom, color));
        self
    }
    fn elements(&self) -> Vec<&Element<'a, Message>> {
        std::iter::once(&self.content)
            .chain(self.marker.as_ref().map(|(m, _)| m))
            .collect()
    }
}

impl<Message> Widget<Message, iced::Theme, iced::Renderer> for Margin<'_, Message> {
    fn size(&self) -> Size<Length> {
        self.content.as_widget().size()
    }
    fn children(&self) -> Vec<Tree> {
        self.elements().into_iter().map(Tree::new).collect()
    }
    fn diff(&self, tree: &mut Tree) {
        tree.diff_children(&self.elements());
    }
    fn layout(
        &mut self,
        tree: &mut Tree,
        renderer: &iced::Renderer,
        limits: &layout::Limits,
    ) -> layout::Node {
        let content = self
            .content
            .as_widget_mut()
            .layout(&mut tree.children[0], renderer, limits);
        let size = content.size();
        let mut children = vec![content];
        if let Some((marker, offset)) = &mut self.marker {
            let node = marker.as_widget_mut().layout(
                &mut tree.children[1],
                renderer,
                &layout::Limits::new(Size::ZERO, Size::INFINITE),
            );
            children.push(node.move_to(iced::Point::ORIGIN + *offset));
        }
        layout::Node::with_children(size, children)
    }
    fn operate(
        &mut self,
        tree: &mut Tree,
        layout: Layout<'_>,
        renderer: &iced::Renderer,
        operation: &mut dyn Operation,
    ) {
        let mut layouts = layout.children();
        self.content.as_widget_mut().operate(
            &mut tree.children[0],
            layouts.next().expect("content"),
            renderer,
            operation,
        );
        if let (Some((marker, _)), Some(l)) = (&mut self.marker, layouts.next()) {
            marker
                .as_widget_mut()
                .operate(&mut tree.children[1], l, renderer, operation);
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
        let mut layouts = layout.children();
        let content = layouts.next().expect("content");
        // The marker sits over the verse, so it gets the pointer first.
        if let (Some((marker, _)), Some(l)) = (&mut self.marker, layouts.next()) {
            marker.as_widget_mut().update(
                &mut tree.children[1],
                event,
                l,
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
        self.content.as_widget_mut().update(
            &mut tree.children[0],
            event,
            content,
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
        theme: &iced::Theme,
        style: &renderer::Style,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        viewport: &Rectangle,
    ) {
        use iced::advanced::Renderer as _;
        let mut layouts = layout.children();
        let content = layouts.next().expect("content");
        self.content.as_widget().draw(
            &tree.children[0],
            renderer,
            theme,
            style,
            content,
            cursor,
            viewport,
        );
        let bounds = layout.bounds();
        if let Some((top, bottom, color)) = self.rule {
            let height = bounds.height - top - bottom;
            if height > 0.0 {
                renderer.fill_quad(
                    renderer::Quad {
                        bounds: Rectangle::new(
                            iced::Point::new(bounds.x, bounds.y + top),
                            Size::new(2.0, height),
                        ),
                        ..Default::default()
                    },
                    color,
                );
            }
        }
        if let (Some((marker, _)), Some(l)) = (&self.marker, layouts.next()) {
            marker.as_widget().draw(
                &tree.children[1],
                renderer,
                theme,
                style,
                l,
                cursor,
                viewport,
            );
        }
    }
    fn mouse_interaction(
        &self,
        tree: &Tree,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        viewport: &Rectangle,
        renderer: &iced::Renderer,
    ) -> mouse::Interaction {
        let mut layouts = layout.children();
        let content = layouts.next().expect("content");
        if let (Some((marker, _)), Some(l)) = (&self.marker, layouts.next()) {
            let over = marker.as_widget().mouse_interaction(
                &tree.children[1],
                l,
                cursor,
                viewport,
                renderer,
            );
            if over != mouse::Interaction::None {
                return over;
            }
        }
        self.content.as_widget().mouse_interaction(
            &tree.children[0],
            content,
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
    ) -> Option<overlay::Element<'b, Message, iced::Theme, iced::Renderer>> {
        let mut layouts = layout.children();
        let content = layouts.next().expect("content");
        let marker_layout = layouts.next();
        let (first, rest) = tree.children.split_at_mut(1);
        let mut overlays = vec![];
        if let Some(o) = self.content.as_widget_mut().overlay(
            &mut first[0],
            content,
            renderer,
            viewport,
            translation,
        ) {
            overlays.push(o);
        }
        if let (Some((marker, _)), Some(l), Some(tree)) =
            (&mut self.marker, marker_layout, rest.first_mut())
            && let Some(o) =
                marker
                    .as_widget_mut()
                    .overlay(tree, l, renderer, viewport, translation)
        {
            overlays.push(o);
        }
        (!overlays.is_empty()).then(|| overlay::Group::with_children(overlays).overlay())
    }
}

impl<'a, Message: 'a> From<Margin<'a, Message>> for Element<'a, Message> {
    fn from(m: Margin<'a, Message>) -> Self {
        Element::new(m)
    }
}
