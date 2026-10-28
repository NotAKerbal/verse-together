// Selectable text for reading: a paragraph of styled pieces (fonts, colors, links) that the reader drags across to
// select words, as a browser selects text. A drag may run on into the next paragraphs: every paragraph of the same
// area reports where the pointer is while the app says a drag is under way, so a selection can cover several
// verses or blocks of a guide. The app owns the selection and the marks and passes them back as byte ranges to
// paint; the text is shaped once per change of text or width, and selections and marks are painted from the laid
// out glyphs, so dragging never reshapes text. The text itself is never editable.
use iced::advanced::graphics::text::Paragraph as GraphicsParagraph;
use iced::advanced::graphics::text::cosmic_text;
use iced::advanced::text::{self as core_text, Paragraph as _, Span};
use iced::advanced::{
    Clipboard, Layout, Shell, Widget, layout, mouse, renderer,
    widget::{Tree, tree},
};
use iced::widget::text::{LineHeight, Shaping, Wrapping};
use iced::{Border, Color, Element, Event, Font, Length, Pixels, Point, Rectangle, Size};
use std::borrow::Cow;
use std::hash::{Hash, Hasher};
use std::ops::Range;
use std::time::{Duration, Instant};

/// A run of text with its own style. `link` makes a click on it open the link.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Piece<'a> {
    pub text: Cow<'a, str>,
    pub font: Option<Font>,
    pub color: Option<Color>,
    pub size: Option<f32>,
    pub link: Option<String>,
}
impl<'a> Piece<'a> {
    pub fn new(text: impl Into<Cow<'a, str>>) -> Self {
        Self {
            text: text.into(),
            ..Default::default()
        }
    }
    pub fn font(mut self, font: Font) -> Self {
        self.font = Some(font);
        self
    }
    pub fn color(mut self, color: Color) -> Self {
        self.color = Some(color);
        self
    }
    pub fn link(mut self, link: String) -> Self {
        self.link = Some(link);
        self
    }
}
/// A highlight and/or underline over a byte range of the paragraph's text.
#[derive(Debug, Clone, PartialEq)]
pub struct Paint {
    pub range: Range<usize>,
    pub highlight: Option<Color>,
    pub underline: Option<Color>,
}
/// What the pointer did, at a byte offset of the paragraph's text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    /// A press: one, two (a word) or three (the whole paragraph) clicks.
    Press { clicks: u8 },
    /// The pointer moved during a drag, over this paragraph.
    Drag,
    /// The drag ended.
    Release,
}

pub struct SelectText<'a, Message> {
    pieces: Vec<Piece<'a>>,
    paints: Vec<Paint>,
    selection: Option<(Range<usize>, Color)>,
    size: f32,
    line_height: f32,
    font: Font,
    color: Color,
    width: Length,
    wrapping: Wrapping,
    dragging: bool,
    on_pick: Option<Box<dyn Fn(usize, Phase) -> Message + 'a>>,
    on_link: Option<Box<dyn Fn(String) -> Message + 'a>>,
}

pub fn select_text<'a, Message>(
    pieces: Vec<Piece<'a>>,
    size: f32,
    line_height: f32,
    font: Font,
    color: Color,
) -> SelectText<'a, Message> {
    SelectText {
        pieces,
        paints: vec![],
        selection: None,
        size,
        line_height,
        font,
        color,
        width: Length::Fill,
        wrapping: Wrapping::Word,
        dragging: false,
        on_pick: None,
        on_link: None,
    }
}

impl<'a, Message> SelectText<'a, Message> {
    pub fn paints(mut self, paints: Vec<Paint>) -> Self {
        self.paints = paints;
        self
    }
    pub fn selection(mut self, range: Option<Range<usize>>, color: Color) -> Self {
        self.selection = range.filter(|r| r.start < r.end).map(|r| (r, color));
        self
    }
    /// Whether a drag that started in this paragraph's area is under way (so the pointer is reported here too).
    pub fn dragging(mut self, dragging: bool) -> Self {
        self.dragging = dragging;
        self
    }
    pub fn on_pick(mut self, f: impl Fn(usize, Phase) -> Message + 'a) -> Self {
        self.on_pick = Some(Box::new(f));
        self
    }
    pub fn on_link(mut self, f: impl Fn(String) -> Message + 'a) -> Self {
        self.on_link = Some(Box::new(f));
        self
    }
    pub fn wrapping(mut self, wrapping: Wrapping) -> Self {
        self.wrapping = wrapping;
        self
    }
    fn text_len(&self) -> usize {
        self.pieces.iter().map(|p| p.text.len()).sum()
    }
    fn key(&self) -> u64 {
        let mut h = std::collections::hash_map::DefaultHasher::new();
        for p in &self.pieces {
            p.text.hash(&mut h);
            p.font.hash(&mut h);
            p.size.map(f32::to_bits).hash(&mut h);
            p.color.map(|c| c.into_rgba8()).hash(&mut h);
        }
        self.size.to_bits().hash(&mut h);
        self.line_height.to_bits().hash(&mut h);
        self.font.hash(&mut h);
        (self.wrapping as u8).hash(&mut h);
        h.finish()
    }
}

struct State {
    paragraph: GraphicsParagraph,
    key: u64,
    width: f32,
    /// Where each line of the text (split at '\n') starts.
    line_starts: Vec<usize>,
    /// Pressed here: the drag belongs to this paragraph until release.
    pressed: bool,
    /// Where the press was, and the link under it, followed if the button comes up without a drag.
    press_at: Option<usize>,
    moved: bool,
    link: Option<String>,
    last_click: Option<(Instant, Point, u8)>,
    last_reported: Option<usize>,
}
impl Default for State {
    fn default() -> Self {
        Self {
            paragraph: GraphicsParagraph::default(),
            key: 0,
            width: -1.0,
            line_starts: vec![0],
            pressed: false,
            press_at: None,
            moved: false,
            link: None,
            last_click: None,
            last_reported: None,
        }
    }
}

/// The pointer's position wherever it is, including over a layer above (where it "levitates").
fn position(cursor: mouse::Cursor) -> Option<Point> {
    match cursor {
        mouse::Cursor::Available(p) | mouse::Cursor::Levitating(p) => Some(p),
        mouse::Cursor::Unavailable => None,
    }
}

/// Rectangles covering a byte range of laid-out text, one per visual line (relative to the paragraph's top left).
pub fn range_rects(
    buffer: &cosmic_text::Buffer,
    line_starts: &[usize],
    range: Range<usize>,
) -> Vec<Rectangle> {
    let mut out = Vec::new();
    if range.start >= range.end {
        return out;
    }
    for run in buffer.layout_runs() {
        let base = line_starts.get(run.line_i).copied().unwrap_or(0);
        let mut span: Option<(f32, f32)> = None;
        for g in run.glyphs {
            let (s, e) = (base + g.start, base + g.end);
            if s < range.end && e > range.start {
                let (x0, x1) = (g.x, g.x + g.w);
                span = Some(match span {
                    Some((a, b)) => (a.min(x0), b.max(x1)),
                    None => (x0, x1),
                });
            }
        }
        if let Some((a, b)) = span
            && b > a
        {
            out.push(Rectangle::new(
                Point::new(a, run.line_top),
                Size::new(b - a, run.line_height),
            ));
        }
    }
    out
}

/// The word around a byte offset, as a browser's double click selects it.
pub fn word_at(text: &str, offset: usize) -> Range<usize> {
    let word = |c: char| c.is_alphanumeric() || matches!(c, '\'' | '’' | '-');
    let mut at = offset.min(text.len());
    while !text.is_char_boundary(at) {
        at -= 1;
    }
    let after = text[at..].chars().next();
    let before = text[..at].chars().next_back();
    if !after.is_some_and(word) {
        if before.is_some_and(word) {
            at -= before.map(char::len_utf8).unwrap_or(0);
        } else {
            let end = at + after.map(char::len_utf8).unwrap_or(0);
            return at..end;
        }
    }
    let mut start = at;
    while let Some(c) = text[..start].chars().next_back()
        && word(c)
    {
        start -= c.len_utf8();
    }
    let mut end = at;
    while let Some(c) = text[end..].chars().next()
        && word(c)
    {
        end += c.len_utf8();
    }
    start..end
}

impl<Message> SelectText<'_, Message> {
    fn shape(&self, state: &mut State, width: f32) {
        let key = self.key();
        if state.key == key && state.width >= 0.0 {
            if (state.width - width).abs() > 0.01 {
                state
                    .paragraph
                    .resize(Size::new(width.max(1.0), f32::INFINITY));
                state.width = width;
            }
            return;
        }
        let spans: Vec<Span<'_, (), Font>> = self
            .pieces
            .iter()
            .map(|p| {
                let mut s = Span::new(p.text.as_ref());
                s.font = p.font;
                s.color = p.color;
                s.size = p.size.map(Pixels);
                s
            })
            .collect();
        state.paragraph = GraphicsParagraph::with_spans(core_text::Text {
            content: spans.as_slice(),
            bounds: Size::new(width.max(1.0), f32::INFINITY),
            size: Pixels(self.size),
            line_height: LineHeight::Absolute(Pixels(self.line_height)),
            font: self.font,
            align_x: core_text::Alignment::Left,
            align_y: iced::alignment::Vertical::Top,
            shaping: Shaping::Advanced,
            wrapping: self.wrapping,
        });
        state.line_starts = std::iter::once(0)
            .chain(
                self.pieces
                    .iter()
                    .flat_map(|p| p.text.chars())
                    .scan(0usize, |at, c| {
                        *at += c.len_utf8();
                        Some((*at, c))
                    })
                    .filter(|(_, c)| *c == '\n')
                    .map(|(at, _)| at),
            )
            .collect();
        state.key = key;
        state.width = width;
    }
    fn offset_at(&self, state: &State, point: Point, height: f32) -> usize {
        let len = self.text_len();
        if point.y < 0.0 {
            return 0;
        }
        if point.y >= height {
            return len;
        }
        let x = point.x.clamp(0.0, state.width.max(0.0));
        match state.paragraph.buffer().hit(x, point.y) {
            Some(c) => (state.line_starts.get(c.line).copied().unwrap_or(0) + c.index).min(len),
            None => len,
        }
    }
}

impl<Message> Widget<Message, iced::Theme, iced::Renderer> for SelectText<'_, Message> {
    fn size(&self) -> Size<Length> {
        Size::new(self.width, Length::Shrink)
    }
    fn tag(&self) -> tree::Tag {
        tree::Tag::of::<State>()
    }
    fn state(&self) -> tree::State {
        tree::State::new(State::default())
    }
    fn layout(
        &mut self,
        tree: &mut Tree,
        _renderer: &iced::Renderer,
        limits: &layout::Limits,
    ) -> layout::Node {
        let state = tree.state.downcast_mut::<State>();
        let width = limits.max().width;
        let width = if width.is_finite() { width } else { 1e6 };
        self.shape(state, width);
        let height = state.paragraph.min_bounds().height.max(self.line_height);
        let size = limits.resolve(self.width, Length::Shrink, Size::new(width, height));
        layout::Node::new(Size::new(size.width, height))
    }
    fn update(
        &mut self,
        tree: &mut Tree,
        event: &Event,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        _renderer: &iced::Renderer,
        _clipboard: &mut dyn Clipboard,
        shell: &mut Shell<'_, Message>,
        _viewport: &Rectangle,
    ) {
        let Some(on_pick) = &self.on_pick else {
            return;
        };
        let bounds = layout.bounds();
        let state = tree.state.downcast_mut::<State>();
        let relative = |p: Point| Point::new(p.x - bounds.x, p.y - bounds.y);
        match event {
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)) => {
                let Some(p) = cursor.position_over(bounds) else {
                    return;
                };
                let at = self.offset_at(state, relative(p), bounds.height);
                let now = Instant::now();
                let clicks = match state.last_click {
                    Some((when, where_, n))
                        if now.duration_since(when) < Duration::from_millis(450)
                            && where_.distance(p) < 5.0 =>
                    {
                        if n >= 3 {
                            1
                        } else {
                            n + 1
                        }
                    }
                    _ => 1,
                };
                state.last_click = Some((now, p, clicks));
                state.pressed = true;
                state.moved = false;
                state.press_at = Some(at);
                state.last_reported = Some(at);
                state.link = if clicks == 1 {
                    state
                        .paragraph
                        .hit_span(relative(p))
                        .and_then(|i| self.pieces.get(i))
                        .and_then(|piece| piece.link.clone())
                } else {
                    None
                };
                shell.publish(on_pick(at, Phase::Press { clicks }));
                shell.capture_event();
            }
            Event::Mouse(mouse::Event::CursorMoved { .. }) if state.pressed || self.dragging => {
                let Some(p) = position(cursor) else {
                    return;
                };
                // Over this paragraph's lines, whatever the horizontal position; elsewhere another paragraph
                // of the area has the pointer.
                if p.y < bounds.y || p.y >= bounds.y + bounds.height {
                    return;
                }
                let at = self.offset_at(state, relative(p), bounds.height);
                if state.last_reported != Some(at) {
                    state.last_reported = Some(at);
                    if state.press_at != Some(at) {
                        state.moved = true;
                    }
                    shell.publish(on_pick(at, Phase::Drag));
                }
            }
            Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)) if state.pressed => {
                state.pressed = false;
                let at = state.press_at.take().unwrap_or(0);
                if !state.moved
                    && let (Some(link), Some(on_link)) = (state.link.take(), &self.on_link)
                {
                    shell.publish(on_link(link));
                } else {
                    shell.publish(on_pick(state.last_reported.unwrap_or(at), Phase::Release));
                }
                state.link = None;
                shell.capture_event();
            }
            _ => {}
        }
    }
    fn draw(
        &self,
        tree: &Tree,
        renderer: &mut iced::Renderer,
        _theme: &iced::Theme,
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
        let state = tree.state.downcast_ref::<State>();
        let buffer = state.paragraph.buffer();
        let origin = iced::Vector::new(bounds.x, bounds.y);
        // `.verse-mark`: a 0.15em radius; underlines max(1.5px, 0.08em) thick, 0.22em under the baseline.
        let radius = 0.15 * self.size;
        let thickness = (0.08 * self.size).max(1.5);
        let under = crate::mark_layer::baseline(self.size, self.line_height) + 0.22 * self.size;
        for paint in &self.paints {
            if paint.highlight.is_none() && paint.underline.is_none() {
                continue;
            }
            for rect in range_rects(buffer, &state.line_starts, paint.range.clone()) {
                let rect = rect + origin;
                if let Some(color) = paint.highlight {
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
                if let Some(color) = paint.underline {
                    renderer.fill_quad(
                        renderer::Quad {
                            bounds: Rectangle::new(
                                Point::new(rect.x, rect.y + under),
                                Size::new(rect.width, thickness),
                            ),
                            ..Default::default()
                        },
                        color,
                    );
                }
            }
        }
        if let Some((range, color)) = &self.selection {
            for rect in range_rects(buffer, &state.line_starts, range.clone()) {
                renderer.fill_quad(
                    renderer::Quad {
                        bounds: rect + origin,
                        ..Default::default()
                    },
                    *color,
                );
            }
        }
        renderer.fill_paragraph(&state.paragraph, bounds.position(), self.color, *viewport);
    }
    fn mouse_interaction(
        &self,
        tree: &Tree,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        _viewport: &Rectangle,
        _renderer: &iced::Renderer,
    ) -> mouse::Interaction {
        let bounds = layout.bounds();
        let Some(p) = cursor.position_over(bounds) else {
            return mouse::Interaction::None;
        };
        let state = tree.state.downcast_ref::<State>();
        let over_link = state
            .paragraph
            .hit_span(Point::new(p.x - bounds.x, p.y - bounds.y))
            .and_then(|i| self.pieces.get(i))
            .is_some_and(|piece| piece.link.is_some());
        if over_link && self.on_link.is_some() {
            mouse::Interaction::Pointer
        } else if self.on_pick.is_some() {
            mouse::Interaction::Text
        } else {
            mouse::Interaction::None
        }
    }
}

impl<'a, Message: 'a> From<SelectText<'a, Message>> for Element<'a, Message> {
    fn from(widget: SelectText<'a, Message>) -> Self {
        Element::new(widget)
    }
}

/// How displayed text maps back to the text it shows: each displayed byte range either is a range of the source
/// (the scripture's own words) or was added for display (a verse number's indent, another Bible's words), which a
/// selection never takes. Text shown more than once (the KJV beside each of several Bibles) is in numbered groups,
/// and a selection takes its words from the first group it reaches, as the website takes the first copy.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct DisplayMap {
    /// (displayed range, source range, group) in bytes; `None` for text that isn't the source's.
    pub segments: Vec<(Range<usize>, Option<Range<usize>>, usize)>,
    group: usize,
}
impl DisplayMap {
    pub fn push(&mut self, displayed_len: usize, source: Option<Range<usize>>) {
        let start = self.len();
        if displayed_len > 0 {
            self.segments
                .push((start..start + displayed_len, source, self.group));
        }
    }
    /// What follows shows the source again.
    pub fn next_group(&mut self) {
        self.group += 1;
    }
    pub fn len(&self) -> usize {
        self.segments.last().map(|s| s.0.end).unwrap_or(0)
    }
    /// The source byte range a displayed range selects: from the first source byte at or after its start to the
    /// last before its end, within the first group it reaches; `None` when it takes no source text.
    pub fn source_range(&self, displayed: Range<usize>) -> Option<Range<usize>> {
        let mut found: Option<(usize, usize, usize)> = None;
        for (d, s, group) in &self.segments {
            let Some(s) = s else { continue };
            let (a, b) = (displayed.start.max(d.start), displayed.end.min(d.end));
            if a >= b || found.is_some_and(|f| f.2 != *group) {
                continue;
            }
            let (sa, sb) = (s.start + (a - d.start), s.start + (b - d.start));
            found = Some(match found {
                Some((start, _, g)) => (start, sb, g),
                None => (sa, sb, *group),
            });
        }
        found.and_then(|(a, b, _)| (a < b).then_some(a..b))
    }
    /// Displayed byte ranges showing a source range (it may be shown more than once, or in pieces).
    pub fn displayed(&self, source: Range<usize>) -> Vec<Range<usize>> {
        self.segments
            .iter()
            .filter_map(|(d, s, _)| {
                let s = s.as_ref()?;
                let (a, b) = (source.start.max(s.start), source.end.min(s.end));
                (a < b).then(|| d.start + (a - s.start)..d.start + (b - s.start))
            })
            .collect()
    }
}
/// A paragraph's pieces as displayed, with its map back to its source.
#[derive(Debug, Clone, Default)]
pub struct Shown<'a> {
    pub pieces: Vec<Piece<'a>>,
    pub map: DisplayMap,
}
impl<'a> Shown<'a> {
    pub fn push(&mut self, piece: Piece<'a>, source: Option<Range<usize>>) {
        self.map.push(piece.text.len(), source);
        self.pieces.push(piece);
    }
    pub fn text(&self) -> String {
        self.pieces.iter().map(|p| p.text.as_ref()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn displayed_text_maps_back_to_its_source_only() {
        // "␣␣␣And it came / Then it was to pass" showing "And it came to pass".
        let source = "And it came to pass";
        let mut map = DisplayMap::default();
        map.push(3, None); // indent
        map.push(11, Some(0..11)); // "And it came"
        map.push(14, None); // " / Then it was"
        map.push(8, Some(11..19)); // " to pass"
        assert_eq!(map.len(), 36);
        // Selecting across the inserted words takes only the scripture's own.
        assert_eq!(map.source_range(0..36), Some(0..19));
        assert_eq!(map.source_range(7..30), Some(4..13));
        assert_eq!(&source[4..13], "it came t");
        // Only inserted text selected: nothing.
        assert_eq!(map.source_range(15..25), None);
        assert_eq!(map.displayed(4..15), vec![7..14, 28..32]);
        // Shown twice: a selection from the end of the first copy into the second takes the first copy's words.
        let mut twice = DisplayMap::default();
        twice.push(19, Some(0..19));
        twice.push(3, None);
        twice.next_group();
        twice.push(19, Some(0..19));
        assert_eq!(twice.source_range(12..30), Some(12..19));
        assert_eq!(twice.source_range(25..30), Some(3..8));
        assert_eq!(twice.displayed(0..3), vec![0..3, 22..25]);
    }
    #[test]
    fn a_double_click_takes_the_word() {
        let t = "for God so lov’d the world—that";
        assert_eq!(&t[word_at(t, 5)], "God");
        assert_eq!(&t[word_at(t, 4)], "God");
        assert_eq!(&t[word_at(t, 7)], "God");
        let at = t.find("lov").unwrap() + 4;
        assert_eq!(&t[word_at(t, at)], "lov’d");
        let dash = t.find('—').unwrap();
        assert_eq!(&t[word_at(t, dash)], "world");
    }
    #[test]
    fn selections_are_painted_on_exactly_the_laid_out_glyphs() {
        crate::design::load_fonts();
        let font = crate::design::serif();
        let text = "And now as I said concerning faith—faith is not to have a perfect knowledge of things; therefore if ye have faith ye hope for things which are not seen, which are true.";
        let paragraph = GraphicsParagraph::with_text(core_text::Text {
            content: text,
            bounds: Size::new(300.0, f32::INFINITY),
            size: Pixels(16.0),
            line_height: LineHeight::Absolute(Pixels(28.0)),
            font,
            align_x: core_text::Alignment::Left,
            align_y: iced::alignment::Vertical::Top,
            shaping: Shaping::Advanced,
            wrapping: Wrapping::Word,
        });
        let lines = paragraph.min_bounds().height / 28.0;
        assert!(lines >= 3.0);
        let all = range_rects(paragraph.buffer(), &[0], 0..text.len());
        assert_eq!(all.len() as f32, lines.round());
        let start = text.find("faith—faith").unwrap();
        let some = range_rects(paragraph.buffer(), &[0], start..start + 5);
        assert_eq!(some.len(), 1);
        assert!(some[0].width > 10.0 && some[0].width < 60.0);
        assert_eq!(some[0].height, 28.0);
        // A hit inside the word lands inside it.
        let hit = paragraph
            .buffer()
            .hit(some[0].x + some[0].width / 2.0, some[0].y + 14.0)
            .unwrap();
        assert!(hit.index > start && hit.index < start + 5);
    }
}
