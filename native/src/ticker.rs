// Keeps frames coming while an app transition runs.
/// While a transition runs, asks the window for its next frame after every frame, so motion keeps going without
/// input events. Rendered (invisibly, zero-sized) only while something animates; idle windows request nothing.
pub fn ticker<'a, Message: 'a>() -> iced::Element<'a, Message> {
    use iced::advanced::{Clipboard, Layout, Shell, Widget, layout, mouse, renderer, widget::Tree};
    use iced::{Event, Length, Rectangle, Size};
    struct Ticker;
    impl<Message> Widget<Message, iced::Theme, iced::Renderer> for Ticker {
        fn size(&self) -> Size<Length> {
            Size::new(Length::Fixed(0.0), Length::Fixed(0.0))
        }
        fn layout(&mut self, _: &mut Tree, _: &iced::Renderer, _: &layout::Limits) -> layout::Node {
            layout::Node::new(Size::ZERO)
        }
        fn draw(
            &self,
            _: &Tree,
            _: &mut iced::Renderer,
            _: &iced::Theme,
            _: &renderer::Style,
            _: Layout<'_>,
            _: mouse::Cursor,
            _: &Rectangle,
        ) {
        }
        fn update(
            &mut self,
            _: &mut Tree,
            event: &Event,
            _: Layout<'_>,
            _: mouse::Cursor,
            _: &iced::Renderer,
            _: &mut dyn Clipboard,
            shell: &mut Shell<'_, Message>,
            _: &Rectangle,
        ) {
            if let Event::Window(iced::window::Event::RedrawRequested(_)) = event {
                shell.request_redraw();
            }
        }
    }
    iced::Element::new(Ticker)
}
