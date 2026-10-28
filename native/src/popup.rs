// A panel that opens below its anchor over the rest of the page (as a browser's date picker opens below its
// field), without moving anything: the anchor is laid out as usual and the panel is drawn as an overlay, kept
// inside the window. A press outside both, or Escape, dismisses it; other keys can be handed to the app while
// it is open (the date picker's arrows, Page Up/Down and Enter).
use iced::advanced::widget::{Operation, Tree};
use iced::advanced::{Clipboard, Layout, Shell, Widget, layout, mouse, overlay, renderer};
use iced::keyboard;
use iced::{Element, Event, Length, Point, Rectangle, Size, Vector};

/// Turns a key pressed while the panel is open into a message.
type KeyMap<'a, Message> = dyn Fn(&keyboard::Key, keyboard::Modifiers) -> Option<Message> + 'a;

pub struct Popup<'a, Message> {
    anchor: Element<'a, Message>,
    panel: Option<Element<'a, Message>>,
    on_dismiss: Option<Message>,
    on_key: Option<Box<KeyMap<'a, Message>>>,
    placement: Placement,
}
/// Where the panel goes: its gap from the anchor, its margin from the window's edges, and whether it lines up with
/// the anchor's right edge (else its left). Escape dismisses it unless the app handles that key itself.
#[derive(Debug, Clone, Copy)]
pub struct Placement {
    pub gap: f32,
    pub margin: f32,
    /// The room it needs to keep from the window's top or bottom edge to open on that side.
    pub clearance: f32,
    pub right: bool,
    pub escape: bool,
}
impl Default for Placement {
    fn default() -> Self {
        Self {
            gap: 6.0,
            margin: 8.0,
            clearance: 0.0,
            right: false,
            escape: true,
        }
    }
}
pub fn popup<'a, Message>(
    anchor: impl Into<Element<'a, Message>>,
    panel: Option<Element<'a, Message>>,
) -> Popup<'a, Message> {
    Popup {
        anchor: anchor.into(),
        panel,
        on_dismiss: None,
        on_key: None,
        placement: Placement::default(),
    }
}
impl<'a, Message> Popup<'a, Message> {
    pub fn on_dismiss(mut self, m: Message) -> Self {
        self.on_dismiss = Some(m);
        self
    }
    pub fn placement(mut self, placement: Placement) -> Self {
        self.placement = placement;
        self
    }
    pub fn on_key(
        mut self,
        f: impl Fn(&keyboard::Key, keyboard::Modifiers) -> Option<Message> + 'a,
    ) -> Self {
        self.on_key = Some(Box::new(f));
        self
    }
}

impl<Message: Clone> Widget<Message, iced::Theme, iced::Renderer> for Popup<'_, Message> {
    fn size(&self) -> Size<Length> {
        self.anchor.as_widget().size()
    }
    fn children(&self) -> Vec<Tree> {
        let mut c = vec![Tree::new(&self.anchor)];
        if let Some(panel) = &self.panel {
            c.push(Tree::new(panel));
        }
        c
    }
    fn diff(&self, tree: &mut Tree) {
        match &self.panel {
            Some(panel) => tree.diff_children(&[&self.anchor, panel]),
            None => tree.diff_children(std::slice::from_ref(&self.anchor)),
        }
    }
    fn layout(
        &mut self,
        tree: &mut Tree,
        renderer: &iced::Renderer,
        limits: &layout::Limits,
    ) -> layout::Node {
        self.anchor
            .as_widget_mut()
            .layout(&mut tree.children[0], renderer, limits)
    }
    fn operate(
        &mut self,
        tree: &mut Tree,
        layout: Layout<'_>,
        renderer: &iced::Renderer,
        operation: &mut dyn Operation,
    ) {
        self.anchor
            .as_widget_mut()
            .operate(&mut tree.children[0], layout, renderer, operation);
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
        self.anchor.as_widget_mut().update(
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
        theme: &iced::Theme,
        style: &renderer::Style,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        viewport: &Rectangle,
    ) {
        self.anchor.as_widget().draw(
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
        self.anchor.as_widget().mouse_interaction(
            &tree.children[0],
            layout,
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
        let (first, rest) = tree.children.split_at_mut(1);
        let anchor = self.anchor.as_widget_mut().overlay(
            &mut first[0],
            layout,
            renderer,
            viewport,
            translation,
        );
        let panel = match (&mut self.panel, rest.first_mut()) {
            (Some(panel), Some(tree)) => Some(overlay::Element::new(Box::new(Panel {
                panel,
                tree,
                anchor: layout.bounds() + translation,
                on_dismiss: self.on_dismiss.clone(),
                on_key: self.on_key.as_deref(),
                placement: self.placement,
            }))),
            _ => None,
        };
        match (anchor, panel) {
            (None, None) => None,
            (a, p) => {
                Some(overlay::Group::with_children(a.into_iter().chain(p).collect()).overlay())
            }
        }
    }
}

struct Panel<'a, 'b, Message> {
    panel: &'b mut Element<'a, Message>,
    tree: &'b mut Tree,
    anchor: Rectangle,
    on_dismiss: Option<Message>,
    on_key: Option<&'b KeyMap<'a, Message>>,
    placement: Placement,
}

impl<Message: Clone> overlay::Overlay<Message, iced::Theme, iced::Renderer>
    for Panel<'_, '_, Message>
{
    fn layout(&mut self, renderer: &iced::Renderer, bounds: Size) -> layout::Node {
        let node = self.panel.as_widget_mut().layout(
            self.tree,
            renderer,
            &layout::Limits::new(Size::ZERO, bounds),
        );
        let size = node.size();
        let Placement {
            gap,
            margin,
            clearance,
            right,
            ..
        } = self.placement;
        // Below the anchor, else above it; always inside the window.
        let mut y = self.anchor.y + self.anchor.height + gap;
        if y + size.height > bounds.height - clearance
            && self.anchor.y - gap - size.height >= clearance
        {
            y = self.anchor.y - gap - size.height;
        }
        let x = if right {
            self.anchor.x + self.anchor.width - size.width
        } else {
            self.anchor.x
        };
        let x = x.min(bounds.width - size.width - margin).max(margin);
        node.move_to(Point::new(x, y.max(margin)))
    }
    fn draw(
        &self,
        renderer: &mut iced::Renderer,
        theme: &iced::Theme,
        style: &renderer::Style,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
    ) {
        self.panel.as_widget().draw(
            self.tree,
            renderer,
            theme,
            style,
            layout,
            cursor,
            &Rectangle::with_size(Size::INFINITE),
        );
    }
    fn update(
        &mut self,
        event: &Event,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        renderer: &iced::Renderer,
        clipboard: &mut dyn Clipboard,
        shell: &mut Shell<'_, Message>,
    ) {
        let bounds = layout.bounds();
        self.panel.as_widget_mut().update(
            self.tree, event, layout, cursor, renderer, clipboard, shell, &bounds,
        );
        if shell.is_event_captured() {
            return;
        }
        match event {
            Event::Mouse(mouse::Event::ButtonPressed(_)) => {
                let inside = cursor.is_over(bounds);
                let on_anchor = cursor.is_over(self.anchor);
                if inside {
                    shell.capture_event();
                } else if !on_anchor && let Some(m) = &self.on_dismiss {
                    shell.publish(m.clone());
                }
            }
            Event::Keyboard(keyboard::Event::KeyPressed { key, modifiers, .. }) => {
                if matches!(key, keyboard::Key::Named(keyboard::key::Named::Escape)) {
                    if self.placement.escape
                        && let Some(m) = &self.on_dismiss
                    {
                        shell.publish(m.clone());
                        shell.capture_event();
                    }
                } else if let Some(f) = self.on_key
                    && let Some(m) = f(key, *modifiers)
                {
                    shell.publish(m);
                    shell.capture_event();
                }
            }
            _ => {}
        }
    }
    fn operate(
        &mut self,
        layout: Layout<'_>,
        renderer: &iced::Renderer,
        operation: &mut dyn Operation,
    ) {
        self.panel
            .as_widget_mut()
            .operate(self.tree, layout, renderer, operation);
    }
    fn mouse_interaction(
        &self,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        renderer: &iced::Renderer,
    ) -> mouse::Interaction {
        self.panel.as_widget().mouse_interaction(
            self.tree,
            layout,
            cursor,
            &layout.bounds(),
            renderer,
        )
    }
}

impl<'a, Message: Clone + 'a> From<Popup<'a, Message>> for Element<'a, Message> {
    fn from(p: Popup<'a, Message>) -> Self {
        Element::new(p)
    }
}
