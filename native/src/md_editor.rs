// The journal's Markdown editor, after the website's CodeMirror editor (`MarkdownEditor.tsx`): the note is plain
// Markdown and is never rewritten; it is styled as it is written (headings at their sizes, bold, italics, links,
// quotes with a rule, lists, code), with the syntax hidden on every line the caret isn't on (`md_live`). A link is
// followed with Ctrl-click (⌘-click on a Mac) when it is one the website would follow; a plain click edits it.
//
// A real editor rather than Iced's stock one, which has one text size and can't hide text: each line is shaped
// on its own (only lines whose text or styling changed are shaped again), the caret and selection are drawn from
// the laid-out glyphs, and editing, selection, clipboard, input methods, scrolling and focus are handled here. The
// app owns the text (`Content`) and applies every action, so undo history and saving stay with the journal.
use crate::md_live::{self, LineKind};
use iced::advanced::graphics::text::Paragraph as GraphicsParagraph;
use iced::advanced::graphics::text::cosmic_text;
use iced::advanced::input_method::{self, InputMethod};
use iced::advanced::text::{self as core_text, Paragraph as _, Span};
use iced::advanced::widget::{Id, Operation, Tree, operation, tree};
use iced::advanced::{Clipboard, Layout, Shell, Widget, clipboard, layout, mouse, renderer};
use iced::keyboard::{self, key::Named};
use iced::widget::text::{LineHeight, Shaping, Wrapping};
use iced::{
    Border, Color, Element, Event, Font, Length, Pixels, Point, Rectangle, Size, Vector, font,
    window,
};
use std::hash::{Hash, Hasher};
use std::ops::Range;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// A place in the text: a line and a byte offset in it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Hash)]
pub struct Pos {
    pub line: usize,
    pub col: usize,
}
#[derive(Debug, Clone, PartialEq)]
pub enum Motion {
    Left,
    Right,
    WordLeft,
    WordRight,
    DocStart,
    DocEnd,
    To(Pos),
}
#[derive(Debug, Clone, PartialEq)]
pub enum Edit {
    Insert(char),
    Paste(Arc<String>),
    Enter,
    Backspace,
    Delete,
    WordBackspace,
    WordDelete,
}
#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    /// Move the caret, extending the selection or not.
    Move(Motion, bool),
    /// Select from one place to another (a double or triple click).
    Select(Pos, Pos),
    SelectAll,
    Edit(Edit),
}
impl Action {
    pub fn is_edit(&self) -> bool {
        matches!(self, Action::Edit(_))
    }
}

/// The note's text, caret and selection.
#[derive(Debug, Clone)]
pub struct Content {
    lines: Vec<String>,
    cursor: Pos,
    anchor: Option<Pos>,
    revision: u64,
}
impl Default for Content {
    fn default() -> Self {
        Self::new()
    }
}
fn prev_char(s: &str, col: usize) -> usize {
    s[..col]
        .chars()
        .next_back()
        .map(|c| col - c.len_utf8())
        .unwrap_or(0)
}
fn next_char(s: &str, col: usize) -> usize {
    s[col..]
        .chars()
        .next()
        .map(|c| col + c.len_utf8())
        .unwrap_or(col)
}
fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '\'' || c == '’'
}
impl Content {
    pub fn new() -> Self {
        Self::with_text("")
    }
    pub fn with_text(text: &str) -> Self {
        let lines = text
            .replace("\r\n", "\n")
            .split('\n')
            .map(str::to_string)
            .collect();
        Self {
            lines,
            cursor: Pos::default(),
            anchor: None,
            revision: 0,
        }
    }
    pub fn text(&self) -> String {
        self.lines.join("\n")
    }
    pub fn is_empty(&self) -> bool {
        self.lines.len() == 1 && self.lines[0].is_empty()
    }
    #[cfg(test)]
    pub fn cursor(&self) -> Pos {
        self.cursor
    }
    /// The selection, start before end; `None` when nothing is selected.
    pub fn selection(&self) -> Option<(Pos, Pos)> {
        let anchor = self.anchor?;
        (anchor != self.cursor).then(|| (anchor.min(self.cursor), anchor.max(self.cursor)))
    }
    pub fn selected_text(&self) -> Option<String> {
        let (a, b) = self.selection()?;
        if a.line == b.line {
            return Some(self.lines[a.line][a.col..b.col].to_string());
        }
        let mut out = self.lines[a.line][a.col..].to_string();
        for line in &self.lines[a.line + 1..b.line] {
            out.push('\n');
            out.push_str(line);
        }
        out.push('\n');
        out.push_str(&self.lines[b.line][..b.col]);
        Some(out)
    }
    fn clamp(&self, p: Pos) -> Pos {
        let line = p.line.min(self.lines.len() - 1);
        let text = &self.lines[line];
        let mut col = p.col.min(text.len());
        while !text.is_char_boundary(col) {
            col -= 1;
        }
        Pos { line, col }
    }
    /// Puts the caret where the text first differs from `previous` (after undo or redo).
    pub fn place_after_change(&mut self, previous: &str) {
        let now = self.text();
        let common = now
            .bytes()
            .zip(previous.bytes())
            .take_while(|(a, b)| a == b)
            .count();
        let tail = now
            .bytes()
            .rev()
            .zip(previous.bytes().rev())
            .take_while(|(a, b)| a == b)
            .count()
            .min(now.len() - common.min(now.len()));
        let mut at = (now.len() - tail).max(common.min(now.len()));
        while !now.is_char_boundary(at) {
            at -= 1;
        }
        self.cursor = self.pos_of(at);
        self.anchor = None;
        self.revision += 1;
    }
    fn pos_of(&self, mut offset: usize) -> Pos {
        for (line, text) in self.lines.iter().enumerate() {
            if offset <= text.len() {
                return Pos { line, col: offset };
            }
            offset -= text.len() + 1;
        }
        let line = self.lines.len() - 1;
        Pos {
            line,
            col: self.lines[line].len(),
        }
    }
    fn delete_range(&mut self, a: Pos, b: Pos) {
        if a.line == b.line {
            self.lines[a.line].replace_range(a.col..b.col, "");
        } else {
            let tail = self.lines[b.line][b.col..].to_string();
            self.lines[a.line].truncate(a.col);
            self.lines[a.line].push_str(&tail);
            self.lines.drain(a.line + 1..=b.line);
        }
        self.cursor = a;
        self.anchor = None;
    }
    fn delete_selection(&mut self) -> bool {
        match self.selection() {
            Some((a, b)) => {
                self.delete_range(a, b);
                true
            }
            None => {
                self.anchor = None;
                false
            }
        }
    }
    fn insert_str(&mut self, text: &str) {
        let text = text.replace("\r\n", "\n").replace('\r', "\n");
        let Pos { line, col } = self.cursor;
        let tail = self.lines[line].split_off(col);
        let mut parts = text.split('\n');
        self.lines[line].push_str(parts.next().unwrap_or(""));
        let mut at = line;
        for part in parts {
            at += 1;
            self.lines.insert(at, part.to_string());
        }
        let col = self.lines[at].len();
        self.lines[at].push_str(&tail);
        self.cursor = Pos { line: at, col };
    }
    fn word_left(&self, p: Pos) -> Pos {
        if p.col == 0 {
            return if p.line == 0 {
                p
            } else {
                Pos {
                    line: p.line - 1,
                    col: self.lines[p.line - 1].len(),
                }
            };
        }
        let s = &self.lines[p.line];
        let mut col = p.col;
        while col > 0
            && s[..col]
                .chars()
                .next_back()
                .is_some_and(char::is_whitespace)
        {
            col = prev_char(s, col);
        }
        let word = s[..col].chars().next_back().is_some_and(is_word);
        while col > 0
            && s[..col]
                .chars()
                .next_back()
                .is_some_and(|c| !c.is_whitespace() && is_word(c) == word)
        {
            col = prev_char(s, col);
        }
        Pos { line: p.line, col }
    }
    fn word_right(&self, p: Pos) -> Pos {
        let s = &self.lines[p.line];
        if p.col >= s.len() {
            return if p.line + 1 < self.lines.len() {
                Pos {
                    line: p.line + 1,
                    col: 0,
                }
            } else {
                p
            };
        }
        let mut col = p.col;
        while col < s.len() && s[col..].chars().next().is_some_and(char::is_whitespace) {
            col = next_char(s, col);
        }
        let word = s[col..].chars().next().is_some_and(is_word);
        while col < s.len()
            && s[col..]
                .chars()
                .next()
                .is_some_and(|c| !c.is_whitespace() && is_word(c) == word)
        {
            col = next_char(s, col);
        }
        Pos { line: p.line, col }
    }
    fn left(&self, p: Pos) -> Pos {
        if p.col > 0 {
            Pos {
                line: p.line,
                col: prev_char(&self.lines[p.line], p.col),
            }
        } else if p.line > 0 {
            Pos {
                line: p.line - 1,
                col: self.lines[p.line - 1].len(),
            }
        } else {
            p
        }
    }
    fn right(&self, p: Pos) -> Pos {
        if p.col < self.lines[p.line].len() {
            Pos {
                line: p.line,
                col: next_char(&self.lines[p.line], p.col),
            }
        } else if p.line + 1 < self.lines.len() {
            Pos {
                line: p.line + 1,
                col: 0,
            }
        } else {
            p
        }
    }
    /// The Markdown a new line continues with after `line` (CodeMirror's `insertNewlineContinueMarkup`): quote
    /// markers, and a list marker (the next number for an ordered list). `None` when the line has none; `Some("")`
    /// with `true` when the item is empty (Enter then ends the list instead).
    fn continuation(line: &str) -> Option<(String, usize, bool, usize)> {
        let mut at = 0;
        let mut prefix = String::new();
        loop {
            let spaces = line[at..].bytes().take_while(|b| *b == b' ').count();
            if spaces <= 3 && line[at + spaces..].starts_with('>') {
                let mut end = at + spaces + 1;
                if line[end..].starts_with(' ') {
                    end += 1;
                }
                prefix.push_str(&line[at..end]);
                at = end;
            } else {
                break;
            }
        }
        let rest = &line[at..];
        let indent = rest.bytes().take_while(|b| *b == b' ').count();
        let after = &rest[indent..];
        let bytes = after.as_bytes();
        let marker = match bytes.first() {
            Some(b'-' | b'*' | b'+') if bytes.get(1) == Some(&b' ') => {
                Some((format!("{}{} ", &rest[..indent], bytes[0] as char), 2))
            }
            Some(b'0'..=b'9') => {
                let digits = bytes.iter().take_while(|b| b.is_ascii_digit()).count();
                match (bytes.get(digits), bytes.get(digits + 1)) {
                    (Some(d @ (b'.' | b')')), Some(b' ')) if digits <= 9 => {
                        let n: u64 = after[..digits].parse().ok()?;
                        Some((
                            format!("{}{}{} ", &rest[..indent], n + 1, *d as char),
                            digits + 2,
                        ))
                    }
                    _ => None,
                }
            }
            _ => None,
        };
        match marker {
            Some((next, len)) => {
                let end = at + indent + len;
                let empty = line[end..].trim().is_empty();
                // An empty item keeps its quote markers when the list ends.
                Some((format!("{prefix}{next}"), end, empty, at))
            }
            None if !prefix.is_empty() => {
                let empty = line[at..].trim().is_empty();
                Some((prefix, at, empty, 0))
            }
            None => None,
        }
    }
    pub fn perform(&mut self, action: Action) {
        self.revision += 1;
        match action {
            Action::Move(motion, select) => {
                let collapsed = self.selection();
                if select {
                    self.anchor.get_or_insert(self.cursor);
                } else {
                    self.anchor = None;
                }
                let p = self.cursor;
                self.cursor = match motion {
                    // Without Shift, Left and Right first collapse a selection to its edge.
                    Motion::Left if !select && collapsed.is_some() => collapsed.unwrap().0,
                    Motion::Right if !select && collapsed.is_some() => collapsed.unwrap().1,
                    Motion::Left => self.left(p),
                    Motion::Right => self.right(p),
                    Motion::WordLeft => self.word_left(p),
                    Motion::WordRight => self.word_right(p),
                    Motion::DocStart => Pos::default(),
                    Motion::DocEnd => {
                        let line = self.lines.len() - 1;
                        Pos {
                            line,
                            col: self.lines[line].len(),
                        }
                    }
                    Motion::To(to) => self.clamp(to),
                };
            }
            Action::Select(a, b) => {
                self.anchor = Some(self.clamp(a));
                self.cursor = self.clamp(b);
            }
            Action::SelectAll => {
                self.anchor = Some(Pos::default());
                let line = self.lines.len() - 1;
                self.cursor = Pos {
                    line,
                    col: self.lines[line].len(),
                };
            }
            Action::Edit(edit) => match edit {
                Edit::Insert(c) => {
                    self.delete_selection();
                    self.insert_str(c.encode_utf8(&mut [0; 4]));
                }
                Edit::Paste(text) => {
                    self.delete_selection();
                    self.insert_str(&text);
                }
                Edit::Enter => {
                    if self.delete_selection() {
                        self.insert_str("\n");
                        return;
                    }
                    let Pos { line, col } = self.cursor;
                    match Self::continuation(&self.lines[line]) {
                        Some((_, end, true, keep)) if col >= end => {
                            // An empty item: Enter ends the list (or quote) instead of continuing it.
                            self.lines[line].truncate(keep);
                            self.cursor = Pos { line, col: keep };
                        }
                        Some((next, end, false, _)) if col >= end => {
                            self.insert_str(&format!("\n{next}"));
                        }
                        _ => self.insert_str("\n"),
                    }
                }
                Edit::Backspace => {
                    if self.delete_selection() {
                        return;
                    }
                    let p = self.cursor;
                    if p.col == 0 {
                        if p.line > 0 {
                            let start = Pos {
                                line: p.line - 1,
                                col: self.lines[p.line - 1].len(),
                            };
                            self.delete_range(start, p);
                        }
                        return;
                    }
                    // Right after a list or quote marker, Backspace removes the marker (`deleteMarkupBackward`).
                    if let Some((_, end, _, keep)) = Self::continuation(&self.lines[p.line])
                        && p.col == end
                    {
                        let line = &self.lines[p.line];
                        // The list marker (or, with none, the last quote marker) goes.
                        let from =
                            if keep > 0 || end > 0 && !line[..end].trim_start().starts_with('>') {
                                keep
                            } else {
                                line[..end.saturating_sub(1)].rfind('>').unwrap_or(0)
                            };
                        let from = if from < p.col {
                            from
                        } else {
                            prev_char(line, p.col)
                        };
                        self.delete_range(
                            Pos {
                                line: p.line,
                                col: from,
                            },
                            p,
                        );
                        return;
                    }
                    let from = self.left(p);
                    self.delete_range(from, p);
                }
                Edit::Delete => {
                    if self.delete_selection() {
                        return;
                    }
                    let p = self.cursor;
                    let to = self.right(p);
                    self.delete_range(p, to);
                }
                Edit::WordBackspace => {
                    if self.delete_selection() {
                        return;
                    }
                    let p = self.cursor;
                    let from = self.word_left(p);
                    self.delete_range(from, p);
                }
                Edit::WordDelete => {
                    if self.delete_selection() {
                        return;
                    }
                    let p = self.cursor;
                    let to = self.word_right(p);
                    self.delete_range(p, to);
                }
            },
        }
    }
}

/// Colors the editor draws with (the website's editor theme).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Palette {
    pub ink: Color,
    /// `--foreground-soft`: syntax left visible, the placeholder.
    pub soft: Color,
    /// `--accent-rubric`: the caret and list markers.
    pub rubric: Color,
    /// `--accent-secondary`: the quote rule.
    pub quote: Color,
    /// `--rule-strong`: link underlines.
    pub rule_strong: Color,
    /// `--surface-button-hover`: code.
    pub code: Color,
    /// `--accent-primary`: the selection.
    pub selection: Color,
}

pub struct MdEditor<'a, Message> {
    content: &'a Content,
    id: Option<Id>,
    placeholder: Option<String>,
    palette: Palette,
    size: f32,
    on_action: Box<dyn Fn(Action) -> Message + 'a>,
    on_undo: Option<Message>,
    on_redo: Option<Message>,
    on_link: Option<Box<dyn Fn(String) -> Message + 'a>>,
    read_only: bool,
}
pub fn md_editor<'a, Message>(
    content: &'a Content,
    palette: Palette,
    on_action: impl Fn(Action) -> Message + 'a,
) -> MdEditor<'a, Message> {
    MdEditor {
        content,
        id: None,
        placeholder: None,
        palette,
        size: 17.0,
        on_action: Box::new(on_action),
        on_undo: None,
        on_redo: None,
        on_link: None,
        read_only: false,
    }
}
impl<'a, Message> MdEditor<'a, Message> {
    pub fn id(mut self, id: impl Into<Id>) -> Self {
        self.id = Some(id.into());
        self
    }
    pub fn placeholder(mut self, placeholder: impl Into<String>) -> Self {
        self.placeholder = Some(placeholder.into());
        self
    }
    pub fn on_undo(mut self, m: Message) -> Self {
        self.on_undo = Some(m);
        self
    }
    pub fn on_redo(mut self, m: Message) -> Self {
        self.on_redo = Some(m);
        self
    }
    pub fn on_link(mut self, f: impl Fn(String) -> Message + 'a) -> Self {
        self.on_link = Some(Box::new(f));
        self
    }
    /// A published note (`NoteMarkdown` on the website): shown as rendered Markdown everywhere (syntax hidden on every
    /// line), selectable and copyable, its links followed with a plain click; nothing can be typed, pasted, cut or
    /// undone, and there is no caret or input method.
    pub fn read_only(mut self, read_only: bool) -> Self {
        self.read_only = read_only;
        self
    }
}

/// `.cm-content`: 0.25rem above, 2.5rem below; `.cm-line`: 2px either side.
const PAD_TOP: f32 = 4.0;
const PAD_BOTTOM: f32 = 40.0;
const PAD_X: f32 = 2.0;

struct LineLayout {
    key: u64,
    paragraph: GraphicsParagraph,
    /// (displayed range, source start) of each shown piece.
    segments: Vec<(Range<usize>, usize)>,
    /// Displayed ranges: inline code and links (for their backgrounds and underlines) and followable hrefs.
    code: Vec<Range<usize>>,
    links: Vec<(Range<usize>, Option<String>)>,
    kind: LineKind,
    /// Top of the line box in the content, the padding above its text, its height, and its text's left inset.
    top: f32,
    pad: f32,
    height: f32,
    inset: f32,
    line_height: f32,
    size: f32,
}
impl LineLayout {
    fn display_of(&self, col: usize) -> usize {
        let mut best = 0;
        for (d, s) in &self.segments {
            let len = d.end - d.start;
            if col < *s {
                return d.start.min(best.max(d.start));
            }
            if col <= s + len {
                return d.start + (col - s);
            }
            best = d.end;
        }
        best
    }
    fn source_of(&self, display: usize) -> usize {
        let mut last = 0;
        for (d, s) in &self.segments {
            if display <= d.end {
                return s + display.saturating_sub(d.start);
            }
            last = s + (d.end - d.start);
        }
        last
    }
}

struct State {
    focused: bool,
    window_focused: bool,
    lines: Vec<LineLayout>,
    width: f32,
    height: f32,
    scroll: f32,
    content_height: f32,
    dragging: bool,
    last_click: Option<(Instant, Point, u8)>,
    seen: (u64, Pos),
    preferred_x: Option<f32>,
    preedit: Option<input_method::Preedit>,
    modifiers: keyboard::Modifiers,
}
impl Default for State {
    fn default() -> Self {
        Self {
            focused: false,
            window_focused: true,
            lines: vec![],
            width: 0.0,
            height: 0.0,
            scroll: 0.0,
            content_height: 0.0,
            dragging: false,
            last_click: None,
            seen: (u64::MAX, Pos::default()),
            preferred_x: None,
            preedit: None,
            modifiers: keyboard::Modifiers::default(),
        }
    }
}
impl operation::Focusable for State {
    fn is_focused(&self) -> bool {
        self.focused
    }
    fn focus(&mut self) {
        self.focused = true;
    }
    fn unfocus(&mut self) {
        self.focused = false;
        self.dragging = false;
    }
}

/// The caret's place in laid-out text: x, and the top and height of its visual line.
fn caret_in(buffer: &cosmic_text::Buffer, offset: usize, line_height: f32) -> (f32, f32, f32) {
    let mut found: Option<(f32, f32, f32)> = None;
    for run in buffer.layout_runs() {
        let start = run.glyphs.first().map(|g| g.start).unwrap_or(0);
        let end = run.glyphs.last().map(|g| g.end).unwrap_or(0);
        if run.glyphs.is_empty() {
            return found.unwrap_or((0.0, run.line_top, run.line_height));
        }
        if offset < start {
            break;
        }
        if offset <= end {
            let x = run
                .glyphs
                .iter()
                .find(|g| g.start >= offset)
                .map(|g| g.x)
                .unwrap_or_else(|| run.glyphs.last().map(|g| g.x + g.w).unwrap_or(0.0));
            found = Some((x, run.line_top, run.line_height));
            // A caret at a wrap point belongs to the next line.
            if offset < end {
                break;
            }
        }
    }
    found.unwrap_or((0.0, 0.0, line_height))
}
/// Rectangles over a displayed range, per visual line; `to_end` carries the last one to the line's width.
fn rects(buffer: &cosmic_text::Buffer, range: Range<usize>, to_end: Option<f32>) -> Vec<Rectangle> {
    let mut out = vec![];
    for run in buffer.layout_runs() {
        let mut span: Option<(f32, f32)> = None;
        for g in run.glyphs {
            if g.start < range.end && g.end > range.start {
                span = Some(match span {
                    Some((a, b)) => (a.min(g.x), b.max(g.x + g.w)),
                    None => (g.x, g.x + g.w),
                });
            }
        }
        if let Some((a, b)) = span {
            out.push(Rectangle::new(
                Point::new(a, run.line_top),
                Size::new(b - a, run.line_height),
            ));
        }
    }
    if let Some(width) = to_end {
        match out.last_mut() {
            Some(last) => last.width = (width - last.x).max(last.width),
            None => {
                let (x, top, h) = caret_in(buffer, range.start, 0.0);
                out.push(Rectangle::new(
                    Point::new(x, top),
                    Size::new(6.0, h.max(1.0)),
                ));
            }
        }
    }
    out
}

impl<Message: Clone> MdEditor<'_, Message> {
    fn base_font() -> Font {
        crate::design::serif()
    }
    /// Lays out every line, reusing those whose shown text and styling are unchanged.
    fn lay_out(&self, state: &mut State, width: f32) {
        let content = self.content;
        let lines: Vec<&str> = content.lines.iter().map(String::as_str).collect();
        let (a, b) = content
            .selection()
            .unwrap_or((content.cursor, content.cursor));
        let active = |i: usize| state.focused && !self.read_only && i >= a.line && i <= b.line;
        let analysed = md_live::analyze(&lines, &active);
        let p = self.palette;
        let mut top = PAD_TOP;
        let mut out = Vec::with_capacity(lines.len());
        let mut old = std::mem::take(&mut state.lines);
        for (i, (line, info)) in lines.iter().zip(&analysed).enumerate() {
            let on = active(i);
            let pieces = info.pieces(line.len(), on);
            let base = self.size;
            // `.cm-md-h1`…: 1.6em/1.25 + 0.35em above, 1.3em/1.3 + 0.5em, 1.15em + 0.4em, 1.04em semibold.
            let (size, line_height, pad, weight) = match info.kind {
                LineKind::Heading(1) => (base * 1.6, base * 1.6 * 1.25, base * 1.6 * 0.35, None),
                LineKind::Heading(2) => (base * 1.3, base * 1.3 * 1.3, base * 1.3 * 0.5, None),
                LineKind::Heading(3) => (base * 1.15, base * 1.15 * 1.7, base * 1.15 * 0.4, None),
                LineKind::Heading(_) => (
                    base * 1.04,
                    base * 1.04 * 1.7,
                    0.0,
                    Some(font::Weight::Semibold),
                ),
                LineKind::Code => (base * 0.88, base * 0.88 * 1.7, 0.0, None),
                _ => (base, base * 1.7, 0.0, None),
            };
            let inset = PAD_X
                + if info.kind == LineKind::Quote {
                    3.0 + 0.85 * base
                } else {
                    0.0
                };
            let mut segments = vec![];
            let mut code = vec![];
            let mut links = vec![];
            let mut spans: Vec<(String, Font, Color, Option<f32>)> = vec![];
            let mut at = 0;
            for piece in &pieces {
                let text = &line[piece.source.clone()];
                let s = piece.style;
                let mut font = if info.kind == LineKind::Code || s.code {
                    Font::MONOSPACE
                } else if s.em {
                    crate::design::serif_italic()
                } else {
                    Self::base_font()
                };
                if s.strong || s.list_mark {
                    font.weight = font::Weight::Bold;
                } else if let Some(w) = weight {
                    font.weight = w;
                }
                let color = if s.list_mark {
                    p.rubric
                } else if s.marker {
                    p.soft
                } else {
                    p.ink
                };
                let range = at..at + text.len();
                if s.code && info.kind != LineKind::Code {
                    code.push(range.clone());
                }
                if s.link {
                    links.push((range.clone(), piece.href.clone()));
                }
                segments.push((range, piece.source.start));
                spans.push((
                    text.to_string(),
                    font,
                    color,
                    (s.code && info.kind != LineKind::Code).then_some(size * 0.88),
                ));
                at += text.len();
            }
            let mut h = std::collections::hash_map::DefaultHasher::new();
            for (t, f, c, sz) in &spans {
                t.hash(&mut h);
                f.hash(&mut h);
                c.into_rgba8().hash(&mut h);
                sz.map(f32::to_bits).hash(&mut h);
            }
            size.to_bits().hash(&mut h);
            line_height.to_bits().hash(&mut h);
            let text_width = (width - inset - PAD_X).max(1.0);
            text_width.to_bits().hash(&mut h);
            let key = h.finish();
            let reuse = old
                .iter()
                .position(|l| l.key == key)
                .map(|i| old.swap_remove(i));
            let paragraph = match reuse {
                Some(l) => l.paragraph,
                None => {
                    let list: Vec<Span<'_, (), Font>> = spans
                        .iter()
                        .map(|(t, f, c, sz)| {
                            let mut s = Span::new(t.as_str());
                            s.font = Some(*f);
                            s.color = Some(*c);
                            s.size = sz.map(Pixels);
                            s
                        })
                        .collect();
                    GraphicsParagraph::with_spans(core_text::Text {
                        content: list.as_slice(),
                        bounds: Size::new(text_width, f32::INFINITY),
                        size: Pixels(size),
                        line_height: LineHeight::Absolute(Pixels(line_height)),
                        font: Self::base_font(),
                        align_x: core_text::Alignment::Left,
                        align_y: iced::alignment::Vertical::Top,
                        shaping: Shaping::Advanced,
                        wrapping: Wrapping::WordOrGlyph,
                    })
                }
            };
            let text_height = paragraph.min_bounds().height.max(line_height);
            let height = pad + text_height;
            out.push(LineLayout {
                key,
                paragraph,
                segments,
                code,
                links,
                kind: info.kind,
                top,
                pad,
                height,
                inset,
                line_height,
                size,
            });
            top += height;
        }
        state.lines = out;
        state.content_height = top + PAD_BOTTOM;
        state.width = width;
    }
    /// The caret's rectangle in content coordinates.
    fn caret_rect(&self, state: &State, pos: Pos) -> Option<Rectangle> {
        let l = state.lines.get(pos.line)?;
        let (x, top, h) = caret_in(l.paragraph.buffer(), l.display_of(pos.col), l.line_height);
        Some(Rectangle::new(
            Point::new(l.inset + x, l.top + l.pad + top),
            Size::new(2.0, h),
        ))
    }
    /// The place nearest a point in content coordinates.
    fn pos_at(&self, state: &State, point: Point) -> Pos {
        if state.lines.is_empty() {
            return Pos::default();
        }
        let index = state
            .lines
            .iter()
            .position(|l| point.y < l.top + l.height)
            .unwrap_or(state.lines.len() - 1);
        let l = &state.lines[index];
        let y = (point.y - l.top - l.pad).clamp(0.0, (l.height - l.pad - 1.0).max(0.0));
        let x = (point.x - l.inset).max(0.0);
        let display = match l.paragraph.buffer().hit(x, y) {
            Some(c) => c.index,
            None => 0,
        };
        let col = l.source_of(display);
        self.content.clamp(Pos { line: index, col })
    }
    fn link_at(&self, state: &State, point: Point) -> Option<String> {
        let index = state
            .lines
            .iter()
            .position(|l| point.y < l.top + l.height)?;
        let l = &state.lines[index];
        let y = point.y - l.top - l.pad;
        let hit = l.paragraph.buffer().hit(point.x - l.inset, y)?;
        // Over the glyph the pointer is on, not just the nearest caret place.
        let at = match hit.affinity {
            cosmic_text::Affinity::Before => hit.index.saturating_sub(1),
            cosmic_text::Affinity::After => hit.index,
        };
        l.links
            .iter()
            .find(|(r, _)| r.start <= at && at < r.end)
            .and_then(|(_, href)| href.clone())
    }
    /// The place one visual line up or down from `pos`, at `x`.
    fn vertical(&self, state: &State, pos: Pos, x: f32, down: bool, lines: usize) -> Pos {
        let mut p = pos;
        for _ in 0..lines.max(1) {
            let Some(rect) = self.caret_rect(state, p) else {
                return p;
            };
            let y = if down {
                rect.y + rect.height + 1.0
            } else {
                rect.y - 1.0
            };
            if y < PAD_TOP {
                return Pos::default();
            }
            if y >= state.content_height - PAD_BOTTOM {
                let line = self.content.lines.len() - 1;
                return Pos {
                    line,
                    col: self.content.lines[line].len(),
                };
            }
            p = self.pos_at(state, Point::new(x, y));
        }
        p
    }
    fn visual_edge(&self, state: &State, pos: Pos, end: bool) -> Pos {
        let Some(rect) = self.caret_rect(state, pos) else {
            return pos;
        };
        let y = rect.y + rect.height / 2.0;
        self.pos_at(state, Point::new(if end { 1e6 } else { 0.0 }, y))
    }
    fn reveal(&self, state: &mut State) {
        if let Some(r) = self.caret_rect(state, self.content.cursor) {
            if r.y < state.scroll {
                state.scroll = (r.y - PAD_TOP).max(0.0);
            } else if r.y + r.height > state.scroll + state.height {
                state.scroll = r.y + r.height - state.height + 8.0;
            }
        }
        let max = (state.content_height - state.height).max(0.0);
        state.scroll = state.scroll.clamp(0.0, max);
    }
}

impl<Message: Clone> Widget<Message, iced::Theme, iced::Renderer> for MdEditor<'_, Message> {
    fn size(&self) -> Size<Length> {
        Size::new(Length::Fill, Length::Fill)
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
        let size = limits.resolve(Length::Fill, Length::Fill, Size::new(400.0, 192.0));
        state.height = size.height;
        self.lay_out(state, size.width);
        let now = (self.content.revision, self.content.cursor);
        if state.seen != now {
            if state.seen.0 != u64::MAX {
                self.reveal(state);
            }
            state.seen = now;
        }
        let max = (state.content_height - state.height).max(0.0);
        state.scroll = state.scroll.clamp(0.0, max);
        layout::Node::new(size)
    }
    fn operate(
        &mut self,
        tree: &mut Tree,
        layout: Layout<'_>,
        _renderer: &iced::Renderer,
        operation: &mut dyn Operation,
    ) {
        let state = tree.state.downcast_mut::<State>();
        operation.focusable(self.id.as_ref(), layout.bounds(), state);
    }
    fn update(
        &mut self,
        tree: &mut Tree,
        event: &Event,
        layout: Layout<'_>,
        cursor: mouse::Cursor,
        _renderer: &iced::Renderer,
        clipboard: &mut dyn Clipboard,
        shell: &mut Shell<'_, Message>,
        _viewport: &Rectangle,
    ) {
        let bounds = layout.bounds();
        let state = tree.state.downcast_mut::<State>();
        let to_content =
            |p: Point, scroll: f32| Point::new(p.x - bounds.x, p.y - bounds.y + scroll);
        match event {
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)) => {
                let Some(p) = cursor.position_over(bounds) else {
                    if state.focused {
                        state.focused = false;
                        state.dragging = false;
                        shell.invalidate_layout();
                        shell.request_redraw();
                    }
                    return;
                };
                let point = to_content(p, state.scroll);
                if !state.focused {
                    state.focused = true;
                    shell.invalidate_layout();
                }
                if (state.modifiers.command() || self.read_only)
                    && let (Some(href), Some(on_link)) = (self.link_at(state, point), &self.on_link)
                {
                    shell.publish(on_link(href));
                    shell.capture_event();
                    return;
                }
                let now = Instant::now();
                let clicks = match state.last_click {
                    Some((when, at, n))
                        if now.duration_since(when) < Duration::from_millis(450)
                            && at.distance(p) < 5.0 =>
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
                let pos = self.pos_at(state, point);
                state.preferred_x = None;
                let action = match clicks {
                    2 => {
                        let line = &self.content.lines[pos.line];
                        let r = crate::select_text::word_at(line, pos.col);
                        Action::Select(
                            Pos {
                                line: pos.line,
                                col: r.start,
                            },
                            Pos {
                                line: pos.line,
                                col: r.end,
                            },
                        )
                    }
                    3 => Action::Select(
                        Pos {
                            line: pos.line,
                            col: 0,
                        },
                        Pos {
                            line: pos.line,
                            col: self.content.lines[pos.line].len(),
                        },
                    ),
                    _ => Action::Move(Motion::To(pos), state.modifiers.shift()),
                };
                state.dragging = clicks == 1;
                shell.publish((self.on_action)(action));
                shell.capture_event();
            }
            Event::Mouse(mouse::Event::CursorMoved { position }) if state.dragging => {
                let p = match cursor {
                    mouse::Cursor::Available(p) | mouse::Cursor::Levitating(p) => p,
                    mouse::Cursor::Unavailable => *position,
                };
                // Past the top or bottom edge, the text scrolls along.
                if p.y < bounds.y {
                    state.scroll = (state.scroll - (bounds.y - p.y).min(40.0)).max(0.0);
                } else if p.y > bounds.y + bounds.height {
                    let max = (state.content_height - state.height).max(0.0);
                    state.scroll =
                        (state.scroll + (p.y - bounds.y - bounds.height).min(40.0)).min(max);
                }
                let pos = self.pos_at(state, to_content(p, state.scroll));
                if pos != self.content.cursor {
                    shell.publish((self.on_action)(Action::Move(Motion::To(pos), true)));
                }
            }
            Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)) if state.dragging => {
                state.dragging = false;
            }
            Event::Mouse(mouse::Event::WheelScrolled { delta }) if cursor.is_over(bounds) => {
                let dy = match delta {
                    mouse::ScrollDelta::Lines { y, .. } => -y * 3.0 * self.size * 1.7 / 2.0,
                    mouse::ScrollDelta::Pixels { y, .. } => -y,
                };
                let max = (state.content_height - state.height).max(0.0);
                let next = (state.scroll + dy).clamp(0.0, max);
                if next != state.scroll {
                    state.scroll = next;
                    shell.request_redraw();
                    shell.capture_event();
                }
            }
            Event::Keyboard(keyboard::Event::ModifiersChanged(m)) => {
                state.modifiers = *m;
                if cursor.is_over(bounds) {
                    shell.request_redraw();
                }
            }
            Event::Keyboard(keyboard::Event::KeyPressed {
                key,
                modifiers,
                text,
                ..
            }) if state.focused => {
                state.modifiers = *modifiers;
                let cmd = modifiers.command();
                let shift = modifiers.shift();
                let c = self.content;
                let publish = |shell: &mut Shell<'_, Message>, a: Action| {
                    if !(self.read_only && a.is_edit()) {
                        shell.publish((self.on_action)(a));
                    }
                    shell.capture_event();
                };
                let x_of = |state: &State| {
                    state.preferred_x.unwrap_or_else(|| {
                        self.caret_rect(state, c.cursor).map(|r| r.x).unwrap_or(0.0)
                    })
                };
                match key.as_ref() {
                    keyboard::Key::Named(Named::ArrowLeft) => {
                        state.preferred_x = None;
                        publish(
                            shell,
                            Action::Move(if cmd { Motion::WordLeft } else { Motion::Left }, shift),
                        );
                    }
                    keyboard::Key::Named(Named::ArrowRight) => {
                        state.preferred_x = None;
                        publish(
                            shell,
                            Action::Move(
                                if cmd {
                                    Motion::WordRight
                                } else {
                                    Motion::Right
                                },
                                shift,
                            ),
                        );
                    }
                    keyboard::Key::Named(
                        n @ (Named::ArrowUp | Named::ArrowDown | Named::PageUp | Named::PageDown),
                    ) => {
                        let x = x_of(state);
                        state.preferred_x = Some(x);
                        let down = matches!(n, Named::ArrowDown | Named::PageDown);
                        let count = if matches!(n, Named::PageUp | Named::PageDown) {
                            (state.height / (self.size * 1.7)).max(1.0) as usize
                        } else {
                            1
                        };
                        let to = self.vertical(state, c.cursor, x, down, count);
                        publish(shell, Action::Move(Motion::To(to), shift));
                    }
                    keyboard::Key::Named(Named::Home) => {
                        state.preferred_x = None;
                        let to = if cmd {
                            Motion::DocStart
                        } else {
                            Motion::To(self.visual_edge(state, c.cursor, false))
                        };
                        publish(shell, Action::Move(to, shift));
                    }
                    keyboard::Key::Named(Named::End) => {
                        state.preferred_x = None;
                        let to = if cmd {
                            Motion::DocEnd
                        } else {
                            Motion::To(self.visual_edge(state, c.cursor, true))
                        };
                        publish(shell, Action::Move(to, shift));
                    }
                    keyboard::Key::Named(Named::Enter) => publish(shell, Action::Edit(Edit::Enter)),
                    keyboard::Key::Named(Named::Backspace) => publish(
                        shell,
                        Action::Edit(if cmd {
                            Edit::WordBackspace
                        } else {
                            Edit::Backspace
                        }),
                    ),
                    keyboard::Key::Named(Named::Delete) => publish(
                        shell,
                        Action::Edit(if cmd { Edit::WordDelete } else { Edit::Delete }),
                    ),
                    keyboard::Key::Character(k) if cmd => match k.to_lowercase().as_str() {
                        "a" => publish(shell, Action::SelectAll),
                        "c" => {
                            if let Some(t) = c.selected_text() {
                                clipboard.write(clipboard::Kind::Standard, t);
                            }
                            shell.capture_event();
                        }
                        "x" => {
                            if let Some(t) = c.selected_text() {
                                clipboard.write(clipboard::Kind::Standard, t);
                                publish(shell, Action::Edit(Edit::Backspace));
                            }
                            shell.capture_event();
                        }
                        "v" => {
                            if let Some(t) = clipboard.read(clipboard::Kind::Standard) {
                                publish(shell, Action::Edit(Edit::Paste(Arc::new(t))));
                            }
                            shell.capture_event();
                        }
                        "z" => {
                            let m = if shift { &self.on_redo } else { &self.on_undo };
                            if let Some(m) = m.as_ref().filter(|_| !self.read_only) {
                                shell.publish(m.clone());
                            }
                            shell.capture_event();
                        }
                        "y" => {
                            if let Some(m) = self.on_redo.as_ref().filter(|_| !self.read_only) {
                                shell.publish(m.clone());
                            }
                            shell.capture_event();
                        }
                        _ => {}
                    },
                    _ => {
                        if !cmd
                            && let Some(t) = text
                            && !t.chars().any(char::is_control)
                        {
                            state.preferred_x = None;
                            let mut chars = t.chars();
                            match (chars.next(), chars.next()) {
                                (Some(one), None) => {
                                    publish(shell, Action::Edit(Edit::Insert(one)))
                                }
                                (Some(_), Some(_)) => publish(
                                    shell,
                                    Action::Edit(Edit::Paste(Arc::new(t.to_string()))),
                                ),
                                _ => {}
                            }
                        }
                    }
                }
            }
            Event::InputMethod(event) if state.focused && !self.read_only => match event {
                input_method::Event::Opened | input_method::Event::Closed => {
                    state.preedit = matches!(event, input_method::Event::Opened)
                        .then(input_method::Preedit::new);
                    shell.request_redraw();
                }
                input_method::Event::Preedit(content, selection) => {
                    state.preedit = Some(input_method::Preedit {
                        content: content.clone(),
                        selection: selection.clone(),
                        text_size: Some(Pixels(self.size)),
                    });
                    shell.request_redraw();
                }
                input_method::Event::Commit(text) => {
                    state.preedit = None;
                    shell.publish((self.on_action)(Action::Edit(Edit::Paste(Arc::new(
                        text.clone(),
                    )))));
                    shell.capture_event();
                }
            },
            Event::Window(window::Event::Focused) => state.window_focused = true,
            Event::Window(window::Event::Unfocused) => state.window_focused = false,
            Event::Window(window::Event::RedrawRequested(_))
                if state.focused && state.window_focused && !self.read_only =>
            {
                let caret = self
                    .caret_rect(state, self.content.cursor)
                    .unwrap_or_default();
                let at = Point::new(bounds.x + caret.x, bounds.y + caret.y - state.scroll);
                shell.request_input_method(&InputMethod::Enabled {
                    cursor: Rectangle::new(at, Size::new(1.0, caret.height)),
                    purpose: input_method::Purpose::Normal,
                    preedit: state.preedit.as_ref().map(input_method::Preedit::as_ref),
                });
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
        let Some(clip) = bounds.intersection(viewport) else {
            return;
        };
        let state = tree.state.downcast_ref::<State>();
        let p = self.palette;
        renderer.with_layer(clip, |renderer| {
            let origin = Vector::new(bounds.x, bounds.y - state.scroll);
            if self.content.is_empty()
                && let Some(placeholder) = &self.placeholder
            {
                let paragraph = GraphicsParagraph::with_text(core_text::Text {
                    content: placeholder.as_str(),
                    bounds: Size::new((bounds.width - 2.0 * PAD_X).max(1.0), f32::INFINITY),
                    size: Pixels(self.size),
                    line_height: LineHeight::Absolute(Pixels(self.size * 1.7)),
                    font: Self::base_font(),
                    align_x: core_text::Alignment::Left,
                    align_y: iced::alignment::Vertical::Top,
                    shaping: Shaping::Advanced,
                    wrapping: Wrapping::Word,
                });
                renderer.fill_paragraph(
                    &paragraph,
                    Point::new(bounds.x + PAD_X, bounds.y + PAD_TOP - state.scroll),
                    p.soft,
                    clip,
                );
            }
            let selection = self.content.selection();
            for (i, l) in state.lines.iter().enumerate() {
                let line_top = l.top - state.scroll;
                if line_top > bounds.height || line_top + l.height < 0.0 {
                    continue;
                }
                let buffer = l.paragraph.buffer();
                let text_origin = Vector::new(origin.x + l.inset, origin.y + l.top + l.pad);
                // `.cm-line.cm-md-code-block` and `.cm-md-quote`.
                if l.kind == LineKind::Code {
                    renderer.fill_quad(
                        renderer::Quad {
                            bounds: Rectangle::new(
                                Point::new(bounds.x, origin.y + l.top),
                                Size::new(bounds.width, l.height),
                            ),
                            ..Default::default()
                        },
                        p.code,
                    );
                }
                if l.kind == LineKind::Quote {
                    renderer.fill_quad(
                        renderer::Quad {
                            bounds: Rectangle::new(
                                Point::new(bounds.x + PAD_X, origin.y + l.top),
                                Size::new(3.0, l.height),
                            ),
                            ..Default::default()
                        },
                        p.quote,
                    );
                }
                for range in &l.code {
                    for r in rects(buffer, range.clone(), None) {
                        renderer.fill_quad(
                            renderer::Quad {
                                bounds: Rectangle::new(
                                    Point::new(r.x - 0.2 * l.size * 0.88, r.y + 2.0),
                                    Size::new(r.width + 0.4 * l.size * 0.88, r.height - 4.0),
                                ) + text_origin,
                                border: Border {
                                    radius: 4.0.into(),
                                    ..Default::default()
                                },
                                ..Default::default()
                            },
                            p.code,
                        );
                    }
                }
                if let Some((a, b)) = selection
                    && i >= a.line
                    && i <= b.line
                {
                    let from = if i == a.line { l.display_of(a.col) } else { 0 };
                    let to = if i == b.line {
                        l.display_of(b.col)
                    } else {
                        usize::MAX
                    };
                    let to_end = (i < b.line).then_some(state.width - l.inset - PAD_X);
                    for r in rects(buffer, from..to, to_end) {
                        renderer.fill_quad(
                            renderer::Quad {
                                bounds: r + text_origin,
                                ..Default::default()
                            },
                            p.selection,
                        );
                    }
                }
                // `.cm-md-link`: underlined in `--rule-strong`, 2px under the text.
                let baseline = crate::mark_layer::baseline(l.size, l.line_height);
                for (range, _) in &l.links {
                    for r in rects(buffer, range.clone(), None) {
                        renderer.fill_quad(
                            renderer::Quad {
                                bounds: Rectangle::new(
                                    Point::new(r.x, r.y + baseline + 2.0),
                                    Size::new(r.width, 1.0),
                                ) + text_origin,
                                ..Default::default()
                            },
                            p.rule_strong,
                        );
                    }
                }
                renderer.fill_paragraph(
                    &l.paragraph,
                    Point::new(text_origin.x, text_origin.y),
                    p.ink,
                    clip,
                );
            }
            if state.focused
                && !self.read_only
                && selection.is_none()
                && let Some(r) = self.caret_rect(state, self.content.cursor)
            {
                renderer.fill_quad(
                    renderer::Quad {
                        bounds: r + origin,
                        ..Default::default()
                    },
                    p.rubric,
                );
            }
            // A slim scrollbar when the note is longer than its space.
            if state.content_height > bounds.height + 0.5 {
                let ratio = bounds.height / state.content_height;
                let thumb = (bounds.height * ratio).max(24.0);
                let y = bounds.y
                    + (bounds.height - thumb)
                        * (state.scroll / (state.content_height - bounds.height));
                renderer.fill_quad(
                    renderer::Quad {
                        bounds: Rectangle::new(
                            Point::new(bounds.x + bounds.width - 6.0, y),
                            Size::new(4.0, thumb),
                        ),
                        border: Border {
                            radius: 2.0.into(),
                            ..Default::default()
                        },
                        ..Default::default()
                    },
                    p.rule_strong,
                );
            }
        });
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
        let point = Point::new(p.x - bounds.x, p.y - bounds.y + state.scroll);
        if (state.modifiers.command() || self.read_only) && self.link_at(state, point).is_some() {
            mouse::Interaction::Pointer
        } else {
            mouse::Interaction::Text
        }
    }
}

impl<'a, Message: Clone + 'a> From<MdEditor<'a, Message>> for Element<'a, Message> {
    fn from(editor: MdEditor<'a, Message>) -> Self {
        Element::new(editor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn typed(content: &mut Content, text: &str) {
        for c in text.chars() {
            content.perform(Action::Edit(if c == '\n' {
                Edit::Enter
            } else {
                Edit::Insert(c)
            }));
        }
    }
    #[test]
    fn editing_keeps_the_markdown_exactly_as_typed() {
        let mut c = Content::new();
        typed(&mut c, "# Ḥesed\nCovenant **love** ✓");
        assert_eq!(c.text(), "# Ḥesed\nCovenant **love** ✓");
        c.perform(Action::Edit(Edit::Backspace));
        c.perform(Action::Move(Motion::WordLeft, false));
        c.perform(Action::Move(Motion::WordLeft, true));
        assert_eq!(c.selected_text().as_deref(), Some("love"));
        c.perform(Action::Edit(Edit::Paste(Arc::new("great\nmercy".into()))));
        assert_eq!(c.text(), "# Ḥesed\nCovenant **great\nmercy** ");
        c.perform(Action::SelectAll);
        assert_eq!(c.selected_text().unwrap(), c.text());
        c.perform(Action::Edit(Edit::Delete));
        assert!(c.is_empty());
        // Unicode: Left and Backspace take whole characters.
        typed(&mut c, "a✓b");
        c.perform(Action::Move(Motion::Left, false));
        c.perform(Action::Edit(Edit::Backspace));
        assert_eq!(c.text(), "ab");
    }
    #[test]
    fn enter_continues_lists_and_quotes_like_the_website() {
        let mut c = Content::new();
        typed(&mut c, "- one\ntwo\n");
        assert_eq!(c.text(), "- one\n- two\n- ");
        // Enter on an empty item ends the list.
        c.perform(Action::Edit(Edit::Enter));
        assert_eq!(c.text(), "- one\n- two\n");
        let mut c = Content::new();
        typed(&mut c, "9. nine\nten\n\n> quoted\nmore");
        // The empty item's marker went; the quote is typed on that line.
        assert_eq!(c.text(), "9. nine\n10. ten\n> quoted\n> more");
        // Backspace right after a marker removes it.
        let mut c = Content::with_text("- ");
        c.perform(Action::Move(Motion::DocEnd, false));
        c.perform(Action::Edit(Edit::Backspace));
        assert_eq!(c.text(), "");
    }
    #[test]
    fn undo_places_the_caret_where_the_text_changed() {
        let mut c = Content::with_text("Alpha beta gamma");
        let before = c.text();
        c.perform(Action::Move(Motion::To(Pos { line: 0, col: 6 }), false));
        typed(&mut c, "very ");
        let mut undone = Content::with_text(&before);
        undone.place_after_change(&c.text());
        assert_eq!(undone.cursor(), Pos { line: 0, col: 6 });
    }
    #[test]
    fn lines_are_laid_out_with_heading_sizes_and_hidden_syntax() {
        crate::design::load_fonts();
        let content = Content::with_text(
            "# Title\nSome **bold** words and a [link](https://example.com).\n> quote",
        );
        let editor: MdEditor<'_, ()> = md_editor(
            &content,
            Palette {
                ink: Color::BLACK,
                soft: Color::BLACK,
                rubric: Color::BLACK,
                quote: Color::BLACK,
                rule_strong: Color::BLACK,
                code: Color::BLACK,
                selection: Color::BLACK,
            },
            |_| (),
        );
        let mut state = State::default();
        editor.lay_out(&mut state, 600.0);
        let title = &state.lines[0];
        let body = &state.lines[1];
        // Unfocused: every line hides its syntax; the heading is larger, with space above it.
        assert!(title.size > body.size * 1.5);
        assert!(title.pad > 0.0);
        assert_eq!(
            title.source_of(0),
            2,
            "the heading text starts after its hidden prefix"
        );
        assert_eq!(body.display_of(5), 5);
        assert_eq!(
            body.display_of(7),
            5,
            "inside the hidden ** the caret shows where the word starts"
        );
        // A click at the edge of hidden syntax lands before it; inside the word, in the word.
        assert_eq!(body.source_of(5), 5);
        assert_eq!(body.source_of(6), 8);
        assert_eq!(body.links.len(), 1);
        assert_eq!(body.links[0].1.as_deref(), Some("https://example.com"));
        assert!(state.lines[2].inset > title.inset);
        // Focused with the caret on the body line, its syntax shows again; the others stay hidden.
        state.focused = true;
        let mut content2 = content.clone();
        content2.perform(Action::Move(Motion::To(Pos { line: 1, col: 3 }), false));
        let editor2: MdEditor<'_, ()> = md_editor(&content2, editor.palette, |_| ());
        editor2.lay_out(&mut state, 600.0);
        assert_eq!(state.lines[1].display_of(7), 7);
        assert_eq!(state.lines[0].source_of(0), 2);
        // A link is found under the pointer on its words.
        let rect = rects(
            state.lines[1].paragraph.buffer(),
            {
                let l = &state.lines[1];
                l.links[0].0.clone()
            },
            None,
        )[0];
        let l = &state.lines[1];
        let point = Point::new(
            l.inset + rect.x + rect.width / 2.0,
            l.top + l.pad + rect.y + 5.0,
        );
        assert_eq!(
            editor2.link_at(&state, point).as_deref(),
            Some("https://example.com")
        );
    }
}
