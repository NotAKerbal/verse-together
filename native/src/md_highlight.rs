// Live Markdown styling for the journal editor, after the website's CodeMirror editor (`MarkdownEditor`,
// `markdownPreview.ts`): the Markdown text is never rewritten; headings are set bold, strong and emphasis in bold
// and italic, links in the rubric color, list markers in bold rubric, quotes and code quieter, and the syntax
// characters themselves in the soft foreground so the prose reads first. Line by line, with fenced code tracked
// across lines.
use iced::advanced::text::highlighter::{self, Highlighter};
use iced::{Color, Font, font};
use std::ops::Range;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Settings {
    pub ink: Color,
    pub muted: Color,
    pub faint: Color,
    pub rubric: Color,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Style {
    pub color: Option<Color>,
    pub font: Option<Font>,
}

pub fn format(style: &Style, _theme: &iced::Theme) -> highlighter::Format<Font> {
    highlighter::Format {
        color: style.color,
        font: style.font,
    }
}

pub struct Markdown {
    settings: Settings,
    /// Whether each line starts inside a fenced code block.
    fenced: Vec<bool>,
    current: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Marker,
    /// The marks around strong, emphasis or code: faint, in the same font as what they wrap, because the text
    /// engine picks a word's font from its first character.
    MarkerOf(Inner),
    Heading,
    Strong,
    Emphasis,
    Code,
    Link,
    ListMark,
    Quote,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Inner {
    Strong,
    Emphasis,
    Code,
}

impl Markdown {
    fn style(&self, kind: Kind) -> Style {
        let s = &self.settings;
        let serif = crate::design::serif();
        match kind {
            Kind::Marker => Style {
                color: Some(s.faint),
                font: None,
            },
            Kind::MarkerOf(inner) => Style {
                color: Some(s.faint),
                font: self
                    .style(match inner {
                        Inner::Strong => Kind::Strong,
                        Inner::Emphasis => Kind::Emphasis,
                        Inner::Code => Kind::Code,
                    })
                    .font,
            },
            Kind::Heading | Kind::Strong => Style {
                color: Some(s.ink),
                font: Some(Font {
                    weight: font::Weight::Bold,
                    ..serif
                }),
            },
            Kind::Emphasis => Style {
                color: None,
                font: Some(crate::design::serif_italic()),
            },
            Kind::Code => Style {
                color: Some(s.muted),
                font: Some(Font::MONOSPACE),
            },
            Kind::Link => Style {
                color: Some(s.rubric),
                font: None,
            },
            Kind::ListMark => Style {
                color: Some(s.rubric),
                font: Some(Font {
                    weight: font::Weight::Bold,
                    ..serif
                }),
            },
            Kind::Quote => Style {
                color: Some(s.muted),
                font: None,
            },
        }
    }
}

/// The styled ranges of one line (byte ranges), given whether it starts inside fenced code; and whether the next
/// line does.
fn line_ranges(line: &str, fenced: bool) -> (Vec<(Range<usize>, Kind)>, bool) {
    let trimmed = line.trim_start();
    let indent = line.len() - trimmed.len();
    if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
        return (vec![(0..line.len(), Kind::Marker)], !fenced);
    }
    if fenced {
        return (vec![(0..line.len(), Kind::Code)], true);
    }
    let mut out = vec![];
    // Headings: "# " to "###### ".
    let hashes = trimmed.bytes().take_while(|b| *b == b'#').count();
    if (1..=6).contains(&hashes) && trimmed[hashes..].starts_with(' ') {
        let marker_end = indent + hashes + 1;
        out.push((0..marker_end, Kind::Marker));
        out.push((marker_end..line.len(), Kind::Heading));
        return (out, false);
    }
    let mut body_start = 0;
    let mut quote = false;
    if let Some(rest) = trimmed.strip_prefix('>') {
        let end = indent + 1 + usize::from(rest.starts_with(' '));
        out.push((0..end, Kind::Marker));
        body_start = end;
        quote = true;
    } else if let Some(end) = list_marker(trimmed) {
        out.push((indent..indent + end, Kind::ListMark));
        body_start = indent + end;
    } else if matches!(trimmed.trim_end(), "---" | "***" | "___") {
        out.push((0..line.len(), Kind::ListMark));
        return (out, false);
    }
    let inline = inline_ranges(&line[body_start..]);
    if quote {
        out.push((body_start..line.len(), Kind::Quote));
    }
    out.extend(
        inline
            .into_iter()
            .map(|(r, k)| (r.start + body_start..r.end + body_start, k)),
    );
    (out, false)
}

/// "- ", "* ", "+ ", "1. ", "1) ": the marker's length with its space.
fn list_marker(text: &str) -> Option<usize> {
    let bytes = text.as_bytes();
    match bytes.first()? {
        b'-' | b'*' | b'+' if bytes.get(1) == Some(&b' ') => Some(2),
        b'0'..=b'9' => {
            let digits = bytes.iter().take_while(|b| b.is_ascii_digit()).count();
            matches!(bytes.get(digits), Some(b'.' | b')'))
                .then_some(())
                .filter(|_| bytes.get(digits + 1) == Some(&b' '))
                .map(|_| digits + 2)
        }
        _ => None,
    }
}

/// Inline syntax: code spans, links, strong and emphasis, with their markers.
fn inline_ranges(text: &str) -> Vec<(Range<usize>, Kind)> {
    let mut out = vec![];
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'`' => {
                if let Some(close) = text[i + 1..].find('`') {
                    let end = i + 1 + close;
                    out.push((i..i + 1, Kind::MarkerOf(Inner::Code)));
                    out.push((i + 1..end, Kind::Code));
                    out.push((end..end + 1, Kind::MarkerOf(Inner::Code)));
                    i = end + 1;
                    continue;
                }
            }
            b'[' => {
                if let Some(close) = text[i..].find("](")
                    && let Some(paren) = text[i + close + 2..].find(')')
                {
                    let label_end = i + close;
                    let end = i + close + 2 + paren + 1;
                    out.push((i..i + 1, Kind::Marker));
                    out.push((i + 1..label_end, Kind::Link));
                    out.push((label_end..end, Kind::Marker));
                    i = end;
                    continue;
                }
            }
            b'*' | b'_' => {
                let mark = bytes[i];
                let double = bytes.get(i + 1) == Some(&mark);
                let width = if double { 2 } else { 1 };
                let token = if double {
                    if mark == b'*' { "**" } else { "__" }
                } else if mark == b'*' {
                    "*"
                } else {
                    "_"
                };
                // An opening mark is followed by text, and (for "_") not inside a word.
                let opens = bytes
                    .get(i + width)
                    .is_some_and(|b| !b.is_ascii_whitespace())
                    && (mark == b'*' || i == 0 || !bytes[i - 1].is_ascii_alphanumeric());
                if opens
                    && let Some(close) = text[i + width..].find(token)
                    && close > 0
                {
                    let inner_end = i + width + close;
                    if !bytes[inner_end - 1].is_ascii_whitespace() {
                        let inner = if double {
                            Inner::Strong
                        } else {
                            Inner::Emphasis
                        };
                        out.push((i..i + width, Kind::MarkerOf(inner)));
                        out.push((
                            i + width..inner_end,
                            if double { Kind::Strong } else { Kind::Emphasis },
                        ));
                        out.push((inner_end..inner_end + width, Kind::MarkerOf(inner)));
                        i = inner_end + width;
                        continue;
                    }
                }
                i += width;
                continue;
            }
            _ => {}
        }
        i += text[i..].chars().next().map_or(1, char::len_utf8);
    }
    out
}

impl Highlighter for Markdown {
    type Settings = Settings;
    type Highlight = Style;
    type Iterator<'a> = std::vec::IntoIter<(Range<usize>, Style)>;

    fn new(settings: &Settings) -> Self {
        Self {
            settings: *settings,
            fenced: vec![false],
            current: 0,
        }
    }
    fn update(&mut self, new_settings: &Settings) {
        self.settings = *new_settings;
    }
    fn change_line(&mut self, line: usize) {
        self.fenced.truncate(line + 1);
        self.current = line.min(self.fenced.len().saturating_sub(1));
    }
    fn highlight_line(&mut self, line: &str) -> Self::Iterator<'_> {
        let fenced = self.fenced.get(self.current).copied().unwrap_or(false);
        let (ranges, next) = line_ranges(line, fenced);
        self.current += 1;
        if self.fenced.len() <= self.current {
            self.fenced.push(next);
        } else {
            self.fenced[self.current] = next;
        }
        // Later ranges are drawn over earlier ones; keep the outer quote first, then the inline styles.
        ranges
            .into_iter()
            .filter(|(r, _)| r.start < r.end)
            .map(|(r, k)| (r, self.style(k)))
            .collect::<Vec<_>>()
            .into_iter()
    }
    fn current_line(&self) -> usize {
        self.current
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds(line: &str) -> Vec<(&str, Kind)> {
        line_ranges(line, false)
            .0
            .into_iter()
            .map(|(r, k)| (&line[r], k))
            .collect()
    }

    #[test]
    fn markdown_is_styled_in_place_without_changing_the_text() {
        assert_eq!(
            kinds("## Seeds of faith"),
            [("## ", Kind::Marker), ("Seeds of faith", Kind::Heading)]
        );
        assert_eq!(
            kinds("A **mighty** change and *grace*"),
            [
                ("**", Kind::MarkerOf(Inner::Strong)),
                ("mighty", Kind::Strong),
                ("**", Kind::MarkerOf(Inner::Strong)),
                ("*", Kind::MarkerOf(Inner::Emphasis)),
                ("grace", Kind::Emphasis),
                ("*", Kind::MarkerOf(Inner::Emphasis))
            ]
        );
        assert_eq!(
            kinds("- see [Alma 32](https://example.org/alma/32)"),
            [
                ("- ", Kind::ListMark),
                ("[", Kind::Marker),
                ("Alma 32", Kind::Link),
                ("](https://example.org/alma/32)", Kind::Marker)
            ]
        );
        assert_eq!(kinds("> Ḥesed")[0], ("> ", Kind::Marker));
        assert_eq!(kinds("3. `code`")[0], ("3. ", Kind::ListMark));
        // Underscores inside words are text, not emphasis.
        assert!(kinds("snake_case_name").is_empty());
        // Fenced code continues across lines.
        let (_, inside) = line_ranges("```", false);
        assert!(inside);
        assert_eq!(
            line_ranges("let x = *y*;", inside).0,
            vec![(0..12, Kind::Code)]
        );
        assert!(!line_ranges("```", inside).1);
    }
}
