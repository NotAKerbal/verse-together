// Verse marks as the website stores them (convex/annotationRules.ts): a whole-verse highlight and underline,
// each in a palette or custom color, plus exact text ranges. Range offsets count UTF-16 code units of the verse's
// scripture text, as JavaScript strings do, so marks made here and on the website mean the same words.
use iced::Color;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// The palette, in the website's order. Red is the rubric underline every underline had before colors.
pub const PALETTE: [&str; 6] = ["red", "yellow", "blue", "green", "pink", "purple"];

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum MarkColor {
    Named(&'static str),
    /// Lowercase `#rrggbb`.
    Custom(String),
}
impl MarkColor {
    pub fn parse(value: &str) -> Option<Self> {
        if let Some(name) = PALETTE.iter().find(|n| **n == value) {
            return Some(Self::Named(name));
        }
        let hex = value.strip_prefix('#')?;
        (hex.len() == 6
            && hex
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))
        .then(|| Self::Custom(value.to_string()))
    }
    /// A custom color typed by the reader, in any case, with or without `#`.
    pub fn parse_input(value: &str) -> Option<Self> {
        let value = value.trim().trim_start_matches('#').to_ascii_lowercase();
        Self::parse(&format!("#{value}")).or_else(|| Self::parse(&value))
    }
    pub fn as_str(&self) -> &str {
        match self {
            Self::Named(n) => n,
            Self::Custom(hex) => hex,
        }
    }
    pub fn label(&self) -> String {
        match self {
            Self::Named(n) => {
                let mut c = n.chars();
                c.next()
                    .map(|f| f.to_uppercase().chain(c).collect())
                    .unwrap_or_default()
            }
            Self::Custom(hex) => format!("Custom {hex}"),
        }
    }
    fn rgb(&self) -> (u8, u8, u8) {
        let hex = match self {
            Self::Named(n) => swatch_hex(n),
            Self::Custom(h) => h.as_str(),
        };
        let v = u32::from_str_radix(&hex[1..], 16).unwrap_or(0xe2574c);
        ((v >> 16) as u8, (v >> 8) as u8, v as u8)
    }
    /// `--verse-swatch-*`, or the custom color itself.
    pub fn swatch(&self) -> Color {
        let (r, g, b) = self.rgb();
        Color::from_rgb8(r, g, b)
    }
    /// `--verse-mark-*` for the theme; a custom color at `55` (33%) alpha, as the website draws it.
    pub fn highlight(&self, dark: bool) -> Color {
        let (r, g, b, a) = match (self, dark) {
            (Self::Custom(_), _) => {
                let (r, g, b) = self.rgb();
                (r, g, b, 0x55 as f32 / 255.0)
            }
            (Self::Named("red"), false) => (226, 84, 70, 0.26),
            (Self::Named("yellow"), false) => (240, 200, 64, 0.46),
            (Self::Named("blue"), false) => (110, 165, 230, 0.34),
            (Self::Named("green"), false) => (64, 196, 136, 0.3),
            (Self::Named("pink"), false) => (240, 120, 182, 0.3),
            (Self::Named("purple"), false) => (164, 134, 248, 0.32),
            (Self::Named("red"), true) => (226, 96, 80, 0.32),
            (Self::Named("yellow"), true) => (214, 178, 56, 0.34),
            (Self::Named("blue"), true) => (96, 150, 220, 0.34),
            (Self::Named("green"), true) => (52, 186, 128, 0.3),
            (Self::Named("pink"), true) => (232, 104, 166, 0.32),
            (Self::Named(_), true) => (156, 126, 244, 0.36),
            (Self::Named(_), false) => (164, 134, 248, 0.32),
        };
        Color::from_rgba8(r, g, b, a)
    }
    /// `--verse-underline-*` for the theme (red is the rubric accent).
    pub fn underline(&self, dark: bool) -> Color {
        let hex = match (self, dark) {
            (Self::Custom(h), _) => h.as_str(),
            (Self::Named("red"), false) => "#9a3020",
            (Self::Named("red"), true) => "#e3907a",
            (Self::Named("yellow"), false) => "#c99a06",
            (Self::Named("blue"), false) => "#2f6fc0",
            (Self::Named("green"), false) => "#1f8a5a",
            (Self::Named("pink"), false) => "#c93d86",
            (Self::Named(_), false) => "#7650d8",
            (Self::Named("yellow"), true) => "#e6c14d",
            (Self::Named("blue"), true) => "#7fb0ee",
            (Self::Named("green"), true) => "#5fd09c",
            (Self::Named("pink"), true) => "#f08cc0",
            (Self::Named(_), true) => "#b29df6",
        };
        let v = u32::from_str_radix(&hex[1..], 16).unwrap_or(0);
        Color::from_rgb8((v >> 16) as u8, (v >> 8) as u8, v as u8)
    }
}
fn swatch_hex(name: &str) -> &'static str {
    match name {
        "red" => "#e2574c",
        "yellow" => "#ecc94b",
        "blue" => "#6ea5e6",
        "green" => "#4cc58f",
        "pink" => "#ef7fb8",
        _ => "#a38af2",
    }
}
impl Serialize for MarkColor {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(self.as_str())
    }
}
impl<'de> Deserialize<'de> for MarkColor {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let value = String::deserialize(d)?;
        Self::parse(&value).ok_or_else(|| serde::de::Error::custom("invalid mark color"))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MarkKind {
    Highlight,
    Underline,
}
impl MarkKind {
    pub fn label(self) -> &'static str {
        match self {
            Self::Highlight => "highlight",
            Self::Underline => "underline",
        }
    }
}

/// One quick button in the selection tools: a highlight or an underline in one color, optionally named.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MarkPreset {
    pub kind: MarkKind,
    pub color: MarkColor,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}
pub const PRESET_NAME_MAX: usize = 40;
pub const PRESETS_MAX: usize = 12;
impl MarkPreset {
    pub fn new(kind: MarkKind, color: MarkColor) -> Self {
        Self {
            kind,
            color,
            name: None,
        }
    }
    pub fn same_mark(&self, other: &Self) -> bool {
        self.kind == other.kind && self.color == other.color
    }
    /// "Yellow highlight", or "Blessings (yellow highlight)" when named.
    pub fn label(&self) -> String {
        let style = format!("{} {}", self.color.label(), self.kind.label());
        match &self.name {
            Some(name) => format!("{name} ({})", style.to_lowercase()),
            None => style,
        }
    }
}
/// What a reader who never chose sees: the five highlight colors and the rubric underline.
pub fn default_presets() -> Vec<MarkPreset> {
    let mut presets: Vec<_> = PALETTE[1..]
        .iter()
        .map(|c| MarkPreset::new(MarkKind::Highlight, MarkColor::Named(c)))
        .collect();
    presets.push(MarkPreset::new(
        MarkKind::Underline,
        MarkColor::Named("red"),
    ));
    presets
}
/// A preset name as stored: whitespace and control runs collapsed, trimmed, at most 40 characters; empty is none.
pub fn normalize_preset_name(value: &str) -> Option<String> {
    let mut out = String::new();
    for word in value.split(|c: char| c.is_whitespace() || c.is_control()) {
        if !word.is_empty() {
            if !out.is_empty() {
                out.push(' ');
            }
            out.push_str(word);
        }
    }
    let out: String = out.chars().take(PRESET_NAME_MAX).collect();
    let out = out.trim().to_string();
    (!out.is_empty()).then_some(out)
}
/// Each mark once (its first place), at most the maximum.
pub fn normalize_presets(presets: Vec<MarkPreset>) -> Vec<MarkPreset> {
    let mut out: Vec<MarkPreset> = Vec::new();
    for mut preset in presets {
        if out.iter().any(|p| p.same_mark(&preset)) {
            continue;
        }
        preset.name = preset.name.as_deref().and_then(normalize_preset_name);
        out.push(preset);
        if out.len() == PRESETS_MAX {
            break;
        }
    }
    out
}

/// A mark on exact words of a verse: UTF-16 offsets into the scripture text, and the words themselves so a mark
/// is never drawn on different text.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TextMark {
    pub start: usize,
    pub end: usize,
    pub text: String,
    pub kind: MarkKind,
    pub color: MarkColor,
}
pub const TEXT_MARKS_MAX: usize = 1000;
/// The selected portion of a verse, in UTF-16 offsets of its text.
#[derive(Debug, Clone, PartialEq)]
pub struct TextRange {
    pub start: usize,
    pub end: usize,
}

/// A verse's marks.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct VerseMarks {
    pub highlight: Option<MarkColor>,
    pub underline: Option<MarkColor>,
    pub text_marks: Vec<TextMark>,
}
impl VerseMarks {
    pub fn is_empty(&self) -> bool {
        self.highlight.is_none() && self.underline.is_none() && self.text_marks.is_empty()
    }
    pub fn base(&self, kind: MarkKind) -> Option<&MarkColor> {
        match kind {
            MarkKind::Highlight => self.highlight.as_ref(),
            MarkKind::Underline => self.underline.as_ref(),
        }
    }
}

/// A change to marks. `None` leaves a kind as it is; `Some(None)` removes it; `Some(Some(color))` sets it.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct MarksPatch {
    pub highlight: Option<Option<MarkColor>>,
    pub underline: Option<Option<MarkColor>>,
}
impl MarksPatch {
    pub fn set(kind: MarkKind, color: Option<MarkColor>) -> Self {
        match kind {
            MarkKind::Highlight => Self {
                highlight: Some(color),
                underline: None,
            },
            MarkKind::Underline => Self {
                highlight: None,
                underline: Some(color),
            },
        }
    }
    fn of(&self, kind: MarkKind) -> Option<&Option<MarkColor>> {
        match kind {
            MarkKind::Highlight => self.highlight.as_ref(),
            MarkKind::Underline => self.underline.as_ref(),
        }
    }
}

pub fn utf16_len(text: &str) -> usize {
    text.encode_utf16().count()
}
/// The UTF-16 offset of a byte index (which must be a char boundary).
pub fn byte_to_utf16(text: &str, byte: usize) -> usize {
    utf16_len(&text[..byte.min(text.len())])
}
/// The byte index of a UTF-16 offset, or `None` when it is past the end or splits a surrogate pair.
pub fn utf16_to_byte(text: &str, offset: usize) -> Option<usize> {
    let mut units = 0;
    for (byte, c) in text.char_indices() {
        if units == offset {
            return Some(byte);
        }
        units += c.len_utf16();
        if units > offset {
            return None;
        }
    }
    (units == offset).then_some(text.len())
}
fn utf16_slice(text: &str, start: usize, end: usize) -> Option<&str> {
    let a = utf16_to_byte(text, start)?;
    let b = utf16_to_byte(text, end)?;
    (a <= b).then(|| &text[a..b])
}

/// Never draw a stored range on different words (an edited verse, another translation).
pub fn matching_text_marks<'a>(marks: &'a [TextMark], text: &str) -> Vec<&'a TextMark> {
    marks
        .iter()
        .filter(|m| m.start < m.end && utf16_slice(text, m.start, m.end) == Some(m.text.as_str()))
        .collect()
}

/// Why a range can't be marked, or `None` if it can.
pub fn range_problem(text: &str, range: &TextRange) -> Option<&'static str> {
    match utf16_slice(text, range.start, range.end) {
        Some(words) if range.start < range.end && !words.trim().is_empty() => None,
        _ => Some("Invalid text selection"),
    }
}

fn cut(mark: &TextMark, start: usize, end: usize) -> Vec<TextMark> {
    let mut out = Vec::new();
    let units: Vec<u16> = mark.text.encode_utf16().collect();
    let piece = |from: usize, to: usize| String::from_utf16(&units[from..to]).ok();
    if mark.start < start
        && let Some(text) = piece(0, start - mark.start)
    {
        out.push(TextMark {
            end: start,
            text,
            ..mark.clone()
        });
    }
    if mark.end > end
        && let Some(text) = piece(end - mark.start, units.len())
    {
        out.push(TextMark {
            start: end,
            text,
            ..mark.clone()
        });
    }
    out.retain(|m| !m.text.trim().is_empty());
    out
}

/// A verse's marks after a change (`applyVerseMarks`). Without a range the whole verse changes and that kind's
/// word marks are cleared; with one, only the requested kind inside the range changes, splitting marks at its edges.
pub fn apply(
    existing: &VerseMarks,
    patch: &MarksPatch,
    text: &str,
    range: Option<&TextRange>,
) -> VerseMarks {
    let Some(range) = range else {
        let mut next = existing.clone();
        if let Some(color) = &patch.highlight {
            next.highlight = color.clone();
            next.text_marks.retain(|m| m.kind != MarkKind::Highlight);
        }
        if let Some(color) = &patch.underline {
            next.underline = color.clone();
            next.text_marks.retain(|m| m.kind != MarkKind::Underline);
        }
        return next;
    };
    let full = utf16_len(text);
    let mut marks = existing.text_marks.clone();
    let mut next = VerseMarks {
        highlight: existing.highlight.clone(),
        underline: existing.underline.clone(),
        text_marks: vec![],
    };
    for kind in [MarkKind::Highlight, MarkKind::Underline] {
        let Some(color) = patch.of(kind) else {
            continue;
        };
        // A whole-verse mark becomes a word mark across the verse, so the selection can be cut from it.
        let base = match kind {
            MarkKind::Highlight => next.highlight.take(),
            MarkKind::Underline => next.underline.take(),
        };
        if let Some(base) = base {
            marks.insert(
                0,
                TextMark {
                    start: 0,
                    end: full,
                    text: text.to_string(),
                    kind,
                    color: base,
                },
            );
        }
        marks = marks
            .into_iter()
            .flat_map(|m| {
                if m.kind == kind
                    && m.end > range.start
                    && m.start < range.end
                    && utf16_slice(text, m.start, m.end) == Some(m.text.as_str())
                {
                    cut(&m, range.start, range.end)
                } else {
                    vec![m]
                }
            })
            .collect();
        if let (Some(color), Some(words)) = (color, utf16_slice(text, range.start, range.end)) {
            marks.push(TextMark {
                start: range.start,
                end: range.end,
                text: words.to_string(),
                kind,
                color: color.clone(),
            });
        }
    }
    marks.sort_by(|a, b| {
        a.kind
            .label()
            .cmp(b.kind.label())
            .then(a.start.cmp(&b.start))
    });
    // Merge adjacent pieces of the same style so repeated edits don't grow the list.
    for mark in marks {
        if let Some(last) = next.text_marks.last_mut()
            && last.kind == mark.kind
            && last.color == mark.color
            && last.end == mark.start
        {
            last.end = mark.end;
            last.text.push_str(&mark.text);
            continue;
        }
        next.text_marks.push(mark);
    }
    next.text_marks.truncate(TEXT_MARKS_MAX);
    next
}

/// The colors over a verse (or the selected part of it) for one kind: one entry per differently-marked piece.
pub fn colors_over(
    marks: &VerseMarks,
    text: &str,
    kind: MarkKind,
    range: Option<&TextRange>,
) -> Vec<Option<MarkColor>> {
    let base = marks.base(kind).cloned();
    let Some(range) = range else {
        let words: Vec<_> = matching_text_marks(&marks.text_marks, text)
            .into_iter()
            .filter(|m| m.kind == kind)
            .collect();
        if words.is_empty() {
            return vec![base];
        }
        return pieces(text, &words, 0, utf16_len(text))
            .into_iter()
            .map(|(from, to)| {
                words
                    .iter()
                    .rev()
                    .find(|m| m.start <= from && m.end >= to)
                    .map(|m| m.color.clone())
                    .or_else(|| base.clone())
            })
            .collect();
    };
    let words: Vec<_> = matching_text_marks(&marks.text_marks, text)
        .into_iter()
        .filter(|m| m.kind == kind)
        .collect();
    pieces(text, &words, range.start, range.end)
        .into_iter()
        .map(|(from, to)| {
            words
                .iter()
                .rev()
                .find(|m| m.start <= from && m.end >= to)
                .map(|m| m.color.clone())
                .or_else(|| base.clone())
        })
        .collect()
}
fn pieces(_text: &str, marks: &[&TextMark], start: usize, end: usize) -> Vec<(usize, usize)> {
    let mut edges: Vec<usize> = [start, end]
        .into_iter()
        .chain(marks.iter().flat_map(|m| [m.start, m.end]))
        .filter(|e| *e >= start && *e <= end)
        .collect();
    edges.sort_unstable();
    edges.dedup();
    edges.windows(2).map(|w| (w[0], w[1])).collect()
}

/// A run of verse text and how it is drawn, as byte ranges of the text (`VerseMarkedText`).
#[derive(Debug, Clone, PartialEq)]
pub struct Segment {
    pub start: usize,
    pub end: usize,
    pub highlight: Option<MarkColor>,
    pub underline: Option<MarkColor>,
}
pub fn segments(marks: &VerseMarks, text: &str) -> Vec<Segment> {
    let words = matching_text_marks(&marks.text_marks, text);
    if words.is_empty() {
        return vec![Segment {
            start: 0,
            end: text.len(),
            highlight: marks.highlight.clone(),
            underline: marks.underline.clone(),
        }];
    }
    pieces(text, &words, 0, utf16_len(text))
        .into_iter()
        .filter_map(|(from, to)| {
            let active = |kind| {
                words
                    .iter()
                    .rev()
                    .find(|m| m.kind == kind && m.start <= from && m.end >= to)
                    .map(|m| m.color.clone())
                    .or_else(|| marks.base(kind).cloned())
            };
            Some(Segment {
                start: utf16_to_byte(text, from)?,
                end: utf16_to_byte(text, to)?,
                highlight: active(MarkKind::Highlight),
                underline: active(MarkKind::Underline),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    const TEXT: &str =
        "And now as I said concerning faith—faith is not to have a perfect knowledge of things";
    fn yellow() -> MarkColor {
        MarkColor::Named("yellow")
    }
    fn range(text: &str, words: &str) -> TextRange {
        let byte = text.find(words).unwrap();
        TextRange {
            start: byte_to_utf16(text, byte),
            end: byte_to_utf16(text, byte + words.len()),
        }
    }
    #[test]
    fn colors_parse_like_the_website() {
        assert_eq!(MarkColor::parse("blue"), Some(MarkColor::Named("blue")));
        assert_eq!(
            MarkColor::parse("#a1b2c3"),
            Some(MarkColor::Custom("#a1b2c3".into()))
        );
        // Hex is lowercase RRGGBB only; anything else is refused.
        for bad in ["#A1B2C3", "#abc", "orange", "", "#12345g"] {
            assert_eq!(MarkColor::parse(bad), None, "{bad}");
        }
        assert_eq!(
            MarkColor::parse_input(" A1B2C3 "),
            Some(MarkColor::Custom("#a1b2c3".into()))
        );
        let json = serde_json::to_string(&MarkPreset::new(MarkKind::Underline, yellow())).unwrap();
        assert_eq!(json, r#"{"kind":"underline","color":"yellow"}"#);
        assert!(serde_json::from_str::<MarkColor>(r##""#zzzzzz""##).is_err());
    }
    #[test]
    fn offsets_count_utf16_units_like_javascript() {
        // "—" is one UTF-16 unit but three bytes; an astral character is two units.
        let text = "faith—hope 𝔄 charity";
        assert_eq!(utf16_len(text), 21);
        let byte = text.find("hope").unwrap();
        assert_eq!(byte, 8);
        assert_eq!(byte_to_utf16(text, byte), 6);
        assert_eq!(utf16_to_byte(text, 6), Some(8));
        let astral = text.find('𝔄').unwrap();
        let unit = byte_to_utf16(text, astral);
        assert_eq!(
            utf16_to_byte(text, unit + 1),
            None,
            "inside a surrogate pair"
        );
        assert_eq!(utf16_to_byte(text, unit + 2), Some(astral + 4));
        assert_eq!(utf16_to_byte(text, 21), Some(text.len()));
        assert_eq!(utf16_to_byte(text, 22), None);
    }
    #[test]
    fn whole_verse_marks_set_and_clear_without_touching_the_other_kind() {
        let mut marks = apply(
            &VerseMarks::default(),
            &MarksPatch::set(MarkKind::Highlight, Some(yellow())),
            TEXT,
            None,
        );
        marks = apply(
            &marks,
            &MarksPatch::set(MarkKind::Underline, Some(MarkColor::Named("red"))),
            TEXT,
            None,
        );
        assert_eq!(marks.highlight, Some(yellow()));
        assert_eq!(marks.underline, Some(MarkColor::Named("red")));
        marks = apply(
            &marks,
            &MarksPatch::set(MarkKind::Highlight, None),
            TEXT,
            None,
        );
        assert_eq!(marks.highlight, None);
        assert_eq!(marks.underline, Some(MarkColor::Named("red")));
    }
    #[test]
    fn range_marks_split_whole_verse_marks_at_the_selection() {
        let whole = VerseMarks {
            highlight: Some(yellow()),
            ..Default::default()
        };
        let r = range(TEXT, "faith is not");
        let marks = apply(
            &whole,
            &MarksPatch::set(MarkKind::Highlight, Some(MarkColor::Named("blue"))),
            TEXT,
            Some(&r),
        );
        assert_eq!(marks.highlight, None, "the base became word marks");
        let colors: Vec<_> = marks
            .text_marks
            .iter()
            .map(|m| (m.color.as_str().to_string(), m.text.clone()))
            .collect();
        assert_eq!(colors.len(), 3);
        assert_eq!(colors[1], ("blue".into(), "faith is not".into()));
        assert!(colors[0].1.ends_with("faith—"));
        // Every stored mark spans exactly its words, in UTF-16 units.
        for m in &marks.text_marks {
            assert_eq!(utf16_slice(TEXT, m.start, m.end), Some(m.text.as_str()));
        }
        let segs = segments(&marks, TEXT);
        let blue = segs
            .iter()
            .find(|s| s.highlight == Some(MarkColor::Named("blue")))
            .unwrap();
        assert_eq!(&TEXT[blue.start..blue.end], "faith is not");
        // Removing the range's highlight leaves the rest, merging nothing across the gap.
        let cleared = apply(
            &marks,
            &MarksPatch::set(MarkKind::Highlight, None),
            TEXT,
            Some(&r),
        );
        assert_eq!(cleared.text_marks.len(), 2);
        assert!(cleared.text_marks.iter().all(|m| m.color == yellow()));
        // Re-marking the gap yellow merges the pieces into one mark.
        let merged = apply(
            &cleared,
            &MarksPatch::set(MarkKind::Highlight, Some(yellow())),
            TEXT,
            Some(&r),
        );
        assert_eq!(merged.text_marks.len(), 1);
        assert_eq!(merged.text_marks[0].text, TEXT);
    }
    #[test]
    fn marks_on_changed_words_are_not_drawn() {
        let mark = TextMark {
            start: 0,
            end: 3,
            text: "And".into(),
            kind: MarkKind::Underline,
            color: yellow(),
        };
        assert_eq!(
            matching_text_marks(std::slice::from_ref(&mark), TEXT).len(),
            1
        );
        assert!(matching_text_marks(&[mark], "But now").is_empty());
        assert!(
            range_problem(TEXT, &TextRange { start: 3, end: 4 }).is_some(),
            "space only"
        );
        assert!(range_problem(TEXT, &TextRange { start: 0, end: 999 }).is_some());
    }
    #[test]
    fn selection_colors_report_mixed_pieces() {
        let r = range(TEXT, "faith is not");
        let marks = apply(
            &VerseMarks::default(),
            &MarksPatch::set(MarkKind::Highlight, Some(yellow())),
            TEXT,
            Some(&r),
        );
        assert_eq!(
            colors_over(&marks, TEXT, MarkKind::Highlight, Some(&r)),
            vec![Some(yellow())]
        );
        let whole = colors_over(&marks, TEXT, MarkKind::Highlight, None);
        assert!(whole.contains(&None) && whole.contains(&Some(yellow())));
    }
    #[test]
    fn presets_normalize_names_and_duplicates() {
        assert_eq!(default_presets().len(), 6);
        let presets = normalize_presets(vec![
            MarkPreset {
                name: Some("  Blessings \n of God ".into()),
                ..MarkPreset::new(MarkKind::Highlight, yellow())
            },
            MarkPreset::new(MarkKind::Highlight, yellow()),
            MarkPreset {
                name: Some("   ".into()),
                ..MarkPreset::new(MarkKind::Underline, yellow())
            },
        ]);
        assert_eq!(presets.len(), 2);
        assert_eq!(presets[0].name.as_deref(), Some("Blessings of God"));
        assert_eq!(presets[0].label(), "Blessings of God (yellow highlight)");
        assert_eq!(presets[1].name, None);
        assert_eq!(
            normalize_preset_name(&"x".repeat(60)).unwrap().len(),
            PRESET_NAME_MAX
        );
    }
}
