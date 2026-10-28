use iced::advanced::widget::{
    Id, Operation, operate,
    operation::{Outcome, scrollable::Scrollable},
};
use iced::widget::{operation, scrollable};
use iced::{Rectangle, Task, Vector};

// Query actual laid-out bounds instead of guessing from character counts. Font, wrapping and
// window width can all change the height of earlier verses.
pub fn to_verse<Message: Send + 'static>(verse: u32) -> Task<Message> {
    struct Find {
        target: Id,
        content_y: f32,
        target_y: Option<f32>,
    }
    impl Operation<f32> for Find {
        fn traverse(&mut self, children: &mut dyn FnMut(&mut dyn Operation<f32>)) {
            children(self);
        }
        fn container(&mut self, id: Option<&Id>, bounds: Rectangle) {
            if id == Some(&self.target) {
                self.target_y = Some(bounds.y);
            }
        }
        fn scrollable(
            &mut self,
            id: Option<&Id>,
            _: Rectangle,
            content: Rectangle,
            _: Vector,
            _: &mut dyn Scrollable,
        ) {
            if id == Some(&Id::from("reader")) {
                self.content_y = content.y;
            }
        }
        fn finish(&self) -> Outcome<f32> {
            match self.target_y {
                // Land the verse where the first verse sits: just below the floating header.
                Some(y) => Outcome::Some((y - self.content_y - crate::header::CONTENT_TOP).max(0.)),
                None => Outcome::None,
            }
        }
    }
    operate(Find {
        target: Id::from(format!("verse-{verse}")),
        content_y: 0.,
        target_y: None,
    })
    .then(|y| operation::scroll_to("reader", scrollable::AbsoluteOffset { x: 0., y }))
}
