// What the journal editor shows of each line of a note, after the website's CodeMirror editor
// (`MarkdownEditor.tsx`, `markdownPreview.ts`, `markdownHeadings.ts`): the Markdown is never rewritten; headings,
// emphasis, links, quotes, lists and code are styled, and their syntax is hidden on lines the caret is not on
// (heading prefixes, emphasis marks, link brackets and destinations, code backticks, quote markers), shown again
// for editing on lines it is. List markers and rules stay visible, styled. Only links `safe_note_url` allows can be
// followed (Ctrl-click or ⌘-click).
use std::ops::Range;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineKind {
    Plain,
    /// `cm-md-h1`…`cm-md-h6`.
    Heading(u8),
    /// `cm-md-quote`: a rule at the left, the text inset.
    Quote,
    /// `cm-md-code-block`: inside a fence, or a fence line itself.
    Code,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Hash)]
pub struct Style {
    pub strong: bool,
    pub em: bool,
    pub code: bool,
    pub link: bool,
    /// Syntax left visible (`cm-md-marker`): soft foreground.
    pub marker: bool,
    /// `cm-md-list-mark`: rubric, bold.
    pub list_mark: bool,
}
#[derive(Debug, Clone, PartialEq)]
pub struct Line {
    pub kind: LineKind,
    /// Styled source ranges (byte offsets in the line).
    pub styles: Vec<(Range<usize>, Style)>,
    /// Followable links: (range of the link text, href).
    pub links: Vec<(Range<usize>, String)>,
    /// Syntax hidden on this line (only when it isn't active).
    pub hidden: Vec<Range<usize>>,
}
/// A piece of a line as displayed: its source range and style.
#[derive(Debug, Clone, PartialEq)]
pub struct Piece {
    pub source: Range<usize>,
    pub style: Style,
    pub href: Option<String>,
}

/// `isSafeSourceHref`: a page in this app, no scheme, no "//", no controls, whitespace or direction marks.
pub fn is_safe_source_href(href: &str) -> bool {
    if href.is_empty() || href.encode_utf16().count() > 2048 {
        return false;
    }
    let bad = |c: char| {
        c.is_control()
            || ('\u{7f}'..='\u{9f}').contains(&c)
            || c.is_whitespace()
            || c == '\\'
            || matches!(c, '\u{200e}' | '\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
    };
    !href.chars().any(bad) && href.starts_with('/') && !href.starts_with("//")
}
/// `safeNoteUrl`: same-app paths and http(s)/mailto URLs; anything else stays plain text.
pub fn safe_note_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.starts_with('/') {
        return is_safe_source_href(trimmed).then(|| trimmed.to_string());
    }
    if trimmed.chars().any(|c| {
        c.is_control() || ('\u{7f}'..='\u{9f}').contains(&c) || c.is_whitespace() || c == '\\'
    }) {
        return None;
    }
    let lower = trimmed.to_ascii_lowercase();
    (lower.starts_with("http:") || lower.starts_with("https:") || lower.starts_with("mailto:"))
        .then(|| trimmed.to_string())
}

/// `HEADING_PREFIX`: up to 3 spaces, 1–6 hashes, then a space or tab. The level and the prefix's length.
fn heading_prefix(line: &str) -> Option<(u8, usize)> {
    let spaces = line.bytes().take_while(|b| *b == b' ').count();
    if spaces > 3 {
        return None;
    }
    let hashes = line[spaces..].bytes().take_while(|b| *b == b'#').count();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    let rest = &line[spaces + hashes..];
    let gap = rest
        .bytes()
        .take_while(|b| *b == b' ' || *b == b'\t')
        .count();
    (gap > 0).then_some((hashes as u8, spaces + hashes + gap))
}
/// A fence opener: up to 3 spaces, then 3+ backticks (no backtick after) or tildes. Its character and length.
fn fence_open(line: &str) -> Option<(u8, usize)> {
    let spaces = line.bytes().take_while(|b| *b == b' ').count();
    if spaces > 3 {
        return None;
    }
    let rest = &line[spaces..];
    let c = *rest.as_bytes().first()?;
    if c != b'`' && c != b'~' {
        return None;
    }
    let n = rest.bytes().take_while(|b| *b == c).count();
    if n < 3 || (c == b'`' && rest[n..].contains('`')) {
        return None;
    }
    Some((c, n))
}
fn fence_close(line: &str, fence: (u8, usize)) -> bool {
    let spaces = line.bytes().take_while(|b| *b == b' ').count();
    if spaces > 3 {
        return false;
    }
    let rest = &line[spaces..];
    let n = rest.bytes().take_while(|b| *b == fence.0).count();
    n >= fence.1 && rest[n..].trim_matches([' ', '\t']).is_empty()
}
/// A list marker ("- ", "* ", "+ ", "1. ", "1) "), after up to 3 spaces: its range (without the space).
fn list_mark(line: &str) -> Option<Range<usize>> {
    let spaces = line.bytes().take_while(|b| *b == b' ').count();
    if spaces > 3 {
        return None;
    }
    let rest = &line.as_bytes()[spaces..];
    let len = match rest.first()? {
        b'-' | b'*' | b'+' => 1,
        b'0'..=b'9' => {
            let digits = rest.iter().take_while(|b| b.is_ascii_digit()).count();
            if digits > 9 || !matches!(rest.get(digits), Some(b'.' | b')')) {
                return None;
            }
            digits + 1
        }
        _ => return None,
    };
    matches!(rest.get(len), None | Some(b' ' | b'\t')).then_some(spaces..spaces + len)
}
fn horizontal_rule(line: &str) -> bool {
    let t = line.trim_matches([' ', '\t']);
    let Some(c) = t.chars().next() else {
        return false;
    };
    matches!(c, '-' | '*' | '_')
        && line.len() - line.trim_start_matches(' ').len() <= 3
        && t.chars().filter(|x| *x == c).count() >= 3
        && t.chars().all(|x| x == c || x == ' ' || x == '\t')
}

/// Every line of a note, analysed. `active(i)` tells whether line `i` keeps its syntax visible.
pub fn analyze(lines: &[&str], active: &dyn Fn(usize) -> bool) -> Vec<Line> {
    let mut out = Vec::with_capacity(lines.len());
    let mut fence: Option<(u8, usize)> = None;
    for (i, raw) in lines.iter().enumerate() {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        let on = active(i);
        let mut l = Line {
            kind: LineKind::Plain,
            styles: vec![],
            links: vec![],
            hidden: vec![],
        };
        if let Some(f) = fence {
            l.kind = LineKind::Code;
            if fence_close(line, f) {
                fence = None;
                l.styles.push((0..line.len(), marker()));
            }
            out.push(l);
            continue;
        }
        if let Some(f) = fence_open(line) {
            fence = Some(f);
            l.kind = LineKind::Code;
            l.styles.push((0..line.len(), marker()));
            out.push(l);
            continue;
        }
        let mut body;
        if let Some((level, prefix)) = heading_prefix(line) {
            l.kind = LineKind::Heading(level);
            if on {
                l.styles.push((0..prefix, marker()));
            } else {
                l.hidden.push(0..prefix);
            }
            body = prefix;
        } else if horizontal_rule(line) && list_mark(line).is_none_or(|_| line.trim().len() > 1) {
            l.styles.push((0..line.len(), marker()));
            out.push(l);
            continue;
        } else {
            // Quote markers ("> ", one following space belongs to it), possibly nested.
            let mut at = 0;
            loop {
                let spaces = line[at..].bytes().take_while(|b| *b == b' ').count();
                if spaces <= 3 && line[at + spaces..].starts_with('>') {
                    let mut end = at + spaces + 1;
                    if line[end..].starts_with(' ') {
                        end += 1;
                    }
                    l.kind = LineKind::Quote;
                    if !on {
                        l.hidden.push(at + spaces..end);
                    }
                    at = end;
                } else {
                    break;
                }
            }
            body = at;
            if l.kind == LineKind::Quote
                && let Some((level, prefix)) = heading_prefix(&line[body..])
            {
                // A heading inside a quote is still a heading.
                l.kind = LineKind::Heading(level);
                let prefix = body..body + prefix;
                if on {
                    l.styles.push((prefix.clone(), marker()));
                } else {
                    l.hidden.push(prefix.clone());
                }
                body = prefix.end;
            } else if let Some(mark) = list_mark(&line[body..]) {
                let mark = mark.start + body..mark.end + body;
                l.styles.push((
                    mark.clone(),
                    Style {
                        list_mark: true,
                        ..Style::default()
                    },
                ));
                body = mark.end;
            }
        }
        inline(line, body..line.len(), on, Style::default(), &mut l);
        out.push(l);
    }
    out
}
fn marker() -> Style {
    Style {
        marker: true,
        ..Style::default()
    }
}

/// Inline syntax in `text[range]`: code spans, links, autolinks, strong and emphasis.
fn inline(text: &str, range: Range<usize>, on: bool, outer: Style, l: &mut Line) {
    let bytes = text.as_bytes();
    let mut i = range.start;
    let end = range.end;
    let hide = |l: &mut Line, r: Range<usize>| {
        if !on && r.start < r.end {
            l.hidden.push(r);
        }
    };
    while i < end {
        match bytes[i] {
            b'\\' if i + 1 < end && bytes[i + 1].is_ascii_punctuation() => {
                i += 2;
                continue;
            }
            b'`' => {
                let n = bytes[i..end].iter().take_while(|b| **b == b'`').count();
                let mut j = i + n;
                let mut close = None;
                while j < end {
                    if bytes[j] == b'`' {
                        let m = bytes[j..end].iter().take_while(|b| **b == b'`').count();
                        if m == n {
                            close = Some(j);
                            break;
                        }
                        j += m;
                    } else {
                        j += 1;
                    }
                }
                if let Some(c) = close {
                    l.styles.push((
                        i..c + n,
                        Style {
                            code: true,
                            ..outer
                        },
                    ));
                    hide(l, i..i + n);
                    hide(l, c..c + n);
                    i = c + n;
                } else {
                    i += n;
                }
                continue;
            }
            b'[' => {
                if let Some((close, dest, after)) = link_at(text, i, end) {
                    let href = safe_note_url(destination(&text[dest.clone()]));
                    let style = Style {
                        link: true,
                        ..outer
                    };
                    if i + 1 < close {
                        l.styles.push((i + 1..close, style));
                        if let Some(href) = href {
                            l.links.push((i + 1..close, href));
                        }
                    }
                    hide(l, i..i + 1);
                    hide(l, close..after);
                    inline(text, i + 1..close, on, style, l);
                    i = after;
                    continue;
                }
            }
            b'<' => {
                if let Some(close) = text[i + 1..end].find('>').map(|c| c + i + 1) {
                    let inner = &text[i + 1..close];
                    let scheme = inner.split_once(':').is_some_and(|(s, _)| {
                        (2..=32).contains(&s.len())
                            && s.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
                            && s.chars()
                                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'))
                    });
                    let email = inner.contains('@') && !inner.contains(':');
                    if (scheme || email) && !inner.chars().any(|c| c.is_whitespace() || c == '<') {
                        l.styles.push((
                            i + 1..close,
                            Style {
                                link: true,
                                ..outer
                            },
                        ));
                        if let Some(href) = safe_note_url(inner) {
                            l.links.push((i + 1..close, href));
                        }
                        hide(l, i..i + 1);
                        hide(l, close..close + 1);
                        i = close + 1;
                        continue;
                    }
                }
            }
            c @ (b'*' | b'_') => {
                let run = bytes[i..end].iter().take_while(|b| **b == c).count();
                let before = text[..i].chars().next_back();
                let next = text[i + run..end].chars().next();
                // An opener is followed by text, and an underscore isn't inside a word.
                let opens = next.is_some_and(|n| !n.is_whitespace())
                    && (c == b'*' || !before.is_some_and(char::is_alphanumeric));
                if opens {
                    let width = if run >= 2 { 2 } else { 1 };
                    let found = closer(text, i + width, end, c, width)
                        .map(|j| (j, width))
                        .or_else(|| {
                            if width == 2 {
                                closer(text, i + 1, end, c, 1).map(|j| (j, 1))
                            } else {
                                None
                            }
                        });
                    if let Some((j, w)) = found {
                        let style = if w == 2 {
                            Style {
                                strong: true,
                                ..outer
                            }
                        } else {
                            Style { em: true, ..outer }
                        };
                        l.styles.push((i..j + w, style));
                        hide(l, i..i + w);
                        hide(l, j..j + w);
                        inline(text, i + w..j, on, style, l);
                        i = j + w;
                        continue;
                    }
                }
                i += run;
                continue;
            }
            _ => {}
        }
        i += text[i..].chars().next().map(char::len_utf8).unwrap_or(1);
    }
}
/// The closing delimiter (`width` of `c`) for an opener ending at `from`: text before it isn't whitespace, and
/// an underscore closer isn't followed by a letter.
fn closer(text: &str, from: usize, end: usize, c: u8, width: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut j = from + 1;
    while j + width <= end {
        if bytes[j] == b'`' {
            // A code span inside is skipped whole.
            let n = bytes[j..end].iter().take_while(|b| **b == b'`').count();
            if let Some(close) = text[j + n..end].find(&"`".repeat(n)) {
                j += n + close + n;
                continue;
            }
        }
        if bytes[j..j + width].iter().all(|b| *b == c)
            && !text[..j]
                .chars()
                .next_back()
                .is_some_and(char::is_whitespace)
            && (width == 2
                || bytes.get(j + 1) != Some(&c)
                || bytes.get(j.wrapping_sub(1)) == Some(&c))
            && (c == b'*'
                || !text[j + width..]
                    .chars()
                    .next()
                    .is_some_and(char::is_alphanumeric))
        {
            if width == 1 && bytes.get(j + 1) == Some(&c) {
                // "**" here belongs to a strong run, not this emphasis.
                j += 2;
                continue;
            }
            return Some(j);
        }
        j += text[j..].chars().next().map(char::len_utf8).unwrap_or(1);
    }
    None
}
/// An inline link `[label](destination)` starting at `open`: the label's closing bracket, the destination's
/// range, and where the link ends.
fn link_at(text: &str, open: usize, end: usize) -> Option<(usize, Range<usize>, usize)> {
    let bytes = text.as_bytes();
    let mut depth = 0;
    let mut j = open + 1;
    let close = loop {
        if j >= end {
            return None;
        }
        match bytes[j] {
            b'\\' => j += 1,
            b'[' => depth += 1,
            b']' if depth == 0 => break j,
            b']' => depth -= 1,
            _ => {}
        }
        j += 1;
    };
    if bytes.get(close + 1) != Some(&b'(') {
        return None;
    }
    let start = close + 2;
    let mut j = start;
    if bytes.get(j) == Some(&b'<') {
        let gt = text[j..end].find('>')? + j;
        let paren = text[gt..end].find(')')? + gt;
        return Some((close, start..gt + 1, paren + 1));
    }
    let mut parens = 0;
    while j < end {
        match bytes[j] {
            b'\\' => j += 1,
            b'(' => parens += 1,
            b')' if parens == 0 => {
                let dest = text[start..j].split([' ', '\t']).next().unwrap_or("");
                return Some((close, start..start + dest.len(), j + 1));
            }
            b')' => parens -= 1,
            _ => {}
        }
        j += 1;
    }
    None
}
/// A destination as written, without the angle brackets of `[label](<url>)`.
fn destination(text: &str) -> &str {
    text.strip_prefix('<')
        .and_then(|t| t.strip_suffix('>'))
        .unwrap_or(text)
}

impl Line {
    /// The line's displayed pieces: everything not hidden, cut wherever the style changes.
    pub fn pieces(&self, len: usize, active: bool) -> Vec<Piece> {
        let mut cuts = vec![0, len];
        for (r, _) in &self.styles {
            cuts.extend([r.start, r.end]);
        }
        for (r, _) in &self.links {
            cuts.extend([r.start, r.end]);
        }
        let hidden: &[Range<usize>] = if active { &[] } else { &self.hidden };
        for r in hidden {
            cuts.extend([r.start, r.end]);
        }
        cuts.retain(|c| *c <= len);
        cuts.sort_unstable();
        cuts.dedup();
        let mut out: Vec<Piece> = vec![];
        for w in cuts.windows(2) {
            let (a, b) = (w[0], w[1]);
            if a >= b || hidden.iter().any(|h| h.start <= a && h.end >= b) {
                continue;
            }
            let mut style = Style::default();
            for (r, s) in &self.styles {
                if r.start <= a && r.end >= b {
                    style.strong |= s.strong;
                    style.em |= s.em;
                    style.code |= s.code;
                    style.link |= s.link;
                    style.marker |= s.marker;
                    style.list_mark |= s.list_mark;
                }
            }
            let href = self
                .links
                .iter()
                .find(|(r, _)| r.start <= a && r.end >= b)
                .map(|(_, h)| h.clone());
            match out.last_mut() {
                Some(last) if last.source.end == a && last.style == style && last.href == href => {
                    last.source.end = b
                }
                _ => out.push(Piece {
                    source: a..b,
                    style,
                    href,
                }),
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn shown(line: &str, active: bool) -> String {
        let l = &analyze(&[line], &|_| active)[0];
        l.pieces(line.len(), active)
            .iter()
            .map(|p| &line[p.source.clone()])
            .collect()
    }
    #[test]
    fn syntax_is_hidden_off_the_caret_line_and_shown_on_it() {
        assert_eq!(shown("## Covenant love", false), "Covenant love");
        assert_eq!(shown("## Covenant love", true), "## Covenant love");
        assert_eq!(
            shown("He is **mighty** to *save*, `always`.", false),
            "He is mighty to save, always."
        );
        assert_eq!(
            shown(
                "Read [Jeremiah 31](/browse/oldtestament/jeremiah/31) today",
                false
            ),
            "Read Jeremiah 31 today"
        );
        assert_eq!(shown("> Quoted words", false), "Quoted words");
        assert_eq!(shown("> > Nested", false), "Nested");
        assert_eq!(shown("> ## Quoted heading", false), "Quoted heading");
        // List markers and rules stay visible; "#faith" is no heading; text is never rewritten.
        assert_eq!(shown("- One item", false), "- One item");
        assert_eq!(shown("3. Third", false), "3. Third");
        assert_eq!(shown("#faith matters", false), "#faith matters");
        assert_eq!(
            shown("snake_case_name stays", false),
            "snake_case_name stays"
        );
        assert_eq!(shown("2 * 3 * 4", false), "2 * 3 * 4");
        assert_eq!(
            shown("Ḥesed — **covenant** love ✓", false),
            "Ḥesed — covenant love ✓"
        );
        assert_eq!(
            shown("<https://example.com/a>", false),
            "https://example.com/a"
        );
    }
    #[test]
    fn styles_and_links_follow_the_websites_rules() {
        let line = "**Bold _and em_** with [a link](https://www.versetogether.org/notes) and [bad](javascript:alert(1))";
        let l = &analyze(&[line], &|_| false)[0];
        let pieces = l.pieces(line.len(), false);
        let bold: String = pieces
            .iter()
            .filter(|p| p.style.strong)
            .map(|p| &line[p.source.clone()])
            .collect();
        assert_eq!(bold, "Bold and em");
        assert!(
            pieces
                .iter()
                .any(|p| p.style.strong && p.style.em && &line[p.source.clone()] == "and em")
        );
        // Only safe destinations can be followed.
        assert_eq!(l.links.len(), 1);
        assert_eq!(l.links[0].1, "https://www.versetogether.org/notes");
        assert!(
            pieces
                .iter()
                .any(|p| p.style.link && &line[p.source.clone()] == "bad")
        );
        assert_eq!(
            safe_note_url("/browse/oldtestament/jeremiah/31"),
            Some("/browse/oldtestament/jeremiah/31".into())
        );
        assert_eq!(safe_note_url("//evil.example"), None);
        assert_eq!(safe_note_url("/\\evil.example"), None);
        assert_eq!(safe_note_url("mailto:a@b.c"), Some("mailto:a@b.c".into()));
        assert_eq!(safe_note_url("javascript:alert(1)"), None);
        assert_eq!(safe_note_url("/a\u{202e}b"), None);
    }
    #[test]
    fn headings_quotes_and_fences_style_whole_lines() {
        let text = "# One\n## Two\n> quote\n```rust\nlet x = \"**not bold**\";\n```\n###### Six\n####### seven";
        let lines: Vec<&str> = text.split('\n').collect();
        let a = analyze(&lines, &|_| false);
        assert_eq!(a[0].kind, LineKind::Heading(1));
        assert_eq!(a[1].kind, LineKind::Heading(2));
        assert_eq!(a[2].kind, LineKind::Quote);
        assert_eq!(a[3].kind, LineKind::Code);
        assert_eq!(a[4].kind, LineKind::Code);
        assert!(a[4].hidden.is_empty() && a[4].styles.is_empty());
        assert_eq!(a[5].kind, LineKind::Code);
        assert_eq!(a[6].kind, LineKind::Heading(6));
        assert_eq!(a[7].kind, LineKind::Plain);
    }
}
