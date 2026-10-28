use crate::icons::Icon;
use iced::advanced::graphics::text::font_system;
use iced::advanced::text::{self as core_text, Paragraph as _};
use iced::widget::{button, container, svg};
use iced::{Border, Color, Font, Pixels, Shadow, Size, Theme, Vector, color, font};
use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

pub const SANS: Font = Font::with_name("DM Sans");
pub const DM_SANS: &[u8] = include_bytes!("../assets/fonts/DM-Sans.ttf");
pub const PAGELLA: &[u8] = include_bytes!("../assets/fonts/texgyrepagella-regular.otf");
pub const PAGELLA_ITALIC: &[u8] = include_bytes!("../assets/fonts/texgyrepagella-italic.otf");
/// The website's `--font-serif-text` stack, ahead of Georgia: the first one installed is used, as in a browser.
/// TeX Gyre Pagella (a Palatino design, bundled) stands in when none are.
const SERIF_STACK: &[&str] = &[
    "Iowan Old Style",
    "Palatino Linotype",
    "Palatino",
    "Book Antiqua",
    "URW Palladio L",
    "P052",
];
const BUNDLED_SERIF: &str = "TeX Gyre Pagella";

/// Loads the bundled fonts into the shared font system, so text can be measured before the first frame (and in
/// tests). The application registers the same static bytes; the font system skips the duplicates.
pub fn load_fonts() {
    let mut fonts = font_system().write().expect("font system");
    for bytes in [DM_SANS, PAGELLA, PAGELLA_ITALIC] {
        fonts.load_font(Cow::Borrowed(bytes));
    }
}

/// The reading serif: the website's stack as resolved on this machine.
pub fn serif() -> Font {
    static FAMILY: OnceLock<&'static str> = OnceLock::new();
    let family = FAMILY.get_or_init(|| {
        let mut fonts = font_system().write().expect("font system");
        let db = fonts.raw().db();
        SERIF_STACK
            .iter()
            .copied()
            .find(|name| {
                db.faces()
                    .any(|face| face.families.iter().any(|(family, _)| family == name))
            })
            .unwrap_or(BUNDLED_SERIF)
    });
    Font::with_name(family)
}
pub fn serif_italic() -> Font {
    Font {
        style: font::Style::Italic,
        ..serif()
    }
}
pub fn sans(weight: font::Weight) -> Font {
    Font { weight, ..SANS }
}

/// The width of a single line of text as the renderer will lay it out.
pub fn measure(content: &str, size: f32, font: Font) -> f32 {
    // Remembered: views measure the same verse numbers and indents on every redraw.
    thread_local! {
        static MEASURED: std::cell::RefCell<std::collections::HashMap<(String, u32, Font), f32>> =
            Default::default();
    }
    let key = (content.to_string(), size.to_bits(), font);
    if let Some(width) = MEASURED.with(|m| m.borrow().get(&key).copied()) {
        return width;
    }
    let width = measure_uncached(content, size, font);
    MEASURED.with(|m| {
        let mut m = m.borrow_mut();
        if m.len() > 4096 {
            m.clear();
        }
        m.insert(key, width);
    });
    width
}
fn measure_uncached(content: &str, size: f32, font: Font) -> f32 {
    let paragraph =
        <iced::Renderer as core_text::Renderer>::Paragraph::with_text(core_text::Text {
            content,
            bounds: Size::INFINITE,
            size: Pixels(size),
            line_height: core_text::LineHeight::default(),
            font,
            align_x: core_text::Alignment::Left,
            align_y: iced::alignment::Vertical::Top,
            shaping: core_text::Shaping::Advanced,
            wrapping: core_text::Wrapping::None,
        });
    paragraph.min_bounds().width
}

#[derive(Clone, Copy)]
pub struct Colors {
    pub paper: Color,
    pub card: Color,
    pub card_strong: Color,
    pub soft: Color,
    pub hover: Color,
    pub ink: Color,
    /// `--foreground-muted`
    pub muted: Color,
    /// `--foreground-soft`
    pub faint: Color,
    /// `--surface-border`
    pub rule: Color,
    pub accent: Color,
    pub gold: Color,
    pub read: Color,
    pub shadow: Color,
    /// `--accent-goal`
    pub goal: Color,
    /// `--accent-note`: a selected journal entry.
    pub note: Color,
    /// `--accent-primary`: the calendar's entry dots.
    pub primary: Color,
    /// `--accent-mint`: read chapters, finished plans.
    pub mint: Color,
    /// `--accent-coral`: problems to fix.
    pub coral: Color,
    /// `--accent-sky-soft`
    pub sky_soft: Color,
    /// `--accent-rubric-line`: the `pill-tag` outline.
    pub rubric_line: Color,
    /// `--input-surface`
    pub input: Color,
}
impl Colors {
    pub fn new(dark: bool) -> Self {
        if dark {
            let ink = color!(0xebe6db);
            Self {
                paper: color!(0x181715),
                card: color!(0x201f1c),
                card_strong: color!(0x25231f),
                soft: color!(0x2a2824),
                hover: color!(0x2e2b26),
                ink,
                muted: Color { a: 0.76, ..ink },
                faint: Color { a: 0.58, ..ink },
                rule: color!(0x3d3a34),
                accent: color!(0xe3907a),
                gold: color!(0x443923),
                read: color!(0x8ea391),
                shadow: Color::from_rgba(0., 0., 0., 0.45),
                goal: color!(0xc9ad6a),
                note: color!(0x2c281d),
                primary: color!(0xc9ad6a),
                mint: color!(0x2a2e25),
                coral: color!(0x4a2c24),
                sky_soft: color!(0x26241f),
                rubric_line: Color::from_rgba8(227, 144, 122, 0.45),
                input: color!(0x201f1c),
            }
        } else {
            let ink = color!(0x1f1d1a);
            Self {
                paper: color!(0xf6f3ec),
                card: color!(0xfbf9f4),
                card_strong: color!(0xfffdf9),
                soft: color!(0xf1ede3),
                hover: color!(0xefe9dc),
                ink,
                muted: Color { a: 0.74, ..ink },
                faint: Color { a: 0.58, ..ink },
                rule: color!(0xd9d1c1),
                accent: color!(0x9a3020),
                gold: color!(0xecdcae),
                read: color!(0x6d8070),
                shadow: Color::from_rgba(31. / 255., 29. / 255., 26. / 255., 0.12),
                goal: color!(0x947026),
                note: color!(0xf2ead6),
                primary: color!(0xecdcae),
                mint: color!(0xe4e8d9),
                coral: color!(0xe8c6bb),
                sky_soft: color!(0xefe9dc),
                rubric_line: Color::from_rgba8(154, 48, 32, 0.4),
                input: color!(0xfffdf9),
            }
        }
    }
}
impl Colors {
    /// Every color at `alpha` of its opacity, for content fading in or out as a whole.
    pub fn faded(self, alpha: f32) -> Self {
        let f = |c| fade(c, alpha);
        Self {
            paper: f(self.paper),
            card: f(self.card),
            card_strong: f(self.card_strong),
            soft: f(self.soft),
            hover: f(self.hover),
            ink: f(self.ink),
            muted: f(self.muted),
            faint: f(self.faint),
            rule: f(self.rule),
            accent: f(self.accent),
            gold: f(self.gold),
            read: f(self.read),
            shadow: f(self.shadow),
            goal: f(self.goal),
            note: f(self.note),
            primary: f(self.primary),
            mint: f(self.mint),
            coral: f(self.coral),
            sky_soft: f(self.sky_soft),
            rubric_line: f(self.rubric_line),
            input: f(self.input),
        }
    }
}
/// `.panel-card`: the journal's and lessons' cards.
/// `--rule-strong`: a hovered card's border, link underlines.
pub fn rule_strong(p: Colors) -> Color {
    if p.paper.r < 0.5 {
        Color::from_rgb8(0x4a, 0x46, 0x3e)
    } else {
        Color::from_rgb8(0xc8, 0xbf, 0xad)
    }
}
pub fn card(p: Colors, radius: f32) -> impl Fn(&Theme) -> container::Style {
    move |_| container::Style {
        background: Some(p.card.into()),
        text_color: Some(p.ink),
        border: Border {
            color: p.rule,
            width: 1.0,
            radius: radius.into(),
        },
        ..Default::default()
    }
}
/// A bordered pill or circle control (`ICON_BUTTON_CLASS`, `PILL_BUTTON_CLASS`).
pub fn outlined(p: Colors, radius: f32) -> impl Fn(&Theme, button::Status) -> button::Style {
    move |_, status| button::Style {
        background: Some(if hovered(status) { p.hover } else { p.card }.into()),
        text_color: p.ink,
        border: Border {
            color: p.rule,
            width: 1.0,
            radius: radius.into(),
        },
        ..Default::default()
    }
}
/// A small text control drawn as an underlined word (`underline underline-offset-2`), tinting on hover.
pub fn underlined_link(p: Colors) -> impl Fn(&Theme, button::Status) -> button::Style {
    ghost(p, 8.0)
}
/// Underlined label text for `underlined_link` controls (`underline underline-offset-2`).
pub fn underlined<'a, M: 'a>(
    label: impl Into<String>,
    size: f32,
    color: Color,
    weight: iced::font::Weight,
) -> iced::Element<'a, M> {
    underlined_with(label, size, color, color, weight, 2.0)
}
/// Text with its underline in its own color and offset (`decoration-current/25 underline-offset-4`).
pub fn underlined_with<'a, M: 'a>(
    label: impl Into<String>,
    size: f32,
    color: Color,
    line: Color,
    weight: iced::font::Weight,
    offset: f32,
) -> iced::Element<'a, M> {
    iced::widget::column![
        iced::widget::text(label.into())
            .size(size)
            .color(color)
            .font(sans(weight))
            .wrapping(iced::widget::text::Wrapping::None),
        container(iced::widget::space())
            .width(iced::Fill)
            .height(1)
            .style(move |_| container::Style {
                background: Some(line.into()),
                ..Default::default()
            }),
    ]
    .spacing((offset - 1.0).max(0.0))
    .width(iced::Shrink)
    .into()
}
/// A text-only link-style control in the given color.
pub fn link(color: Color) -> impl Fn(&Theme, button::Status) -> button::Style {
    move |_, status| button::Style {
        background: None,
        text_color: if hovered(status) {
            mix(color, Color::BLACK, 0.15)
        } else {
            color
        },
        ..Default::default()
    }
}
pub fn fade(color: Color, alpha: f32) -> Color {
    Color {
        a: color.a * alpha,
        ..color
    }
}
pub fn mix(a: Color, b: Color, t: f32) -> Color {
    Color {
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t,
        a: a.a + (b.a - a.a) * t,
    }
}
/// `--surface-shadow-soft`, approximated with a single soft drop shadow.
pub fn soft_shadow(p: Colors) -> Shadow {
    Shadow {
        color: p.shadow,
        offset: Vector::new(0., 3.),
        blur_radius: 10.,
    }
}
/// The header's pills: card surface, hairline border, fully rounded.
pub fn pill(p: Colors) -> impl Fn(&Theme) -> container::Style {
    move |_| container::Style {
        background: Some(p.card.into()),
        text_color: Some(p.ink),
        border: Border {
            color: p.rule,
            width: 1.0,
            radius: 999.0.into(),
        },
        shadow: soft_shadow(p),
        ..Default::default()
    }
}
/// A floating panel opened from the header (search, chapters, settings).
pub fn popover(p: Colors) -> impl Fn(&Theme) -> container::Style {
    move |_| container::Style {
        background: Some(p.paper.into()),
        text_color: Some(p.ink),
        border: Border {
            color: p.rule,
            width: 1.0,
            radius: 12.0.into(),
        },
        shadow: Shadow {
            color: p.shadow,
            offset: Vector::new(0., 10.),
            blur_radius: 28.,
        },
        ..Default::default()
    }
}
fn hovered(status: button::Status) -> bool {
    matches!(status, button::Status::Hovered | button::Status::Pressed)
}
/// A transparent control that tints on hover, with the given corner radius.
pub fn ghost(p: Colors, radius: f32) -> impl Fn(&Theme, button::Status) -> button::Style {
    move |_, status| button::Style {
        background: hovered(status).then(|| p.hover.into()),
        text_color: p.ink,
        border: Border {
            radius: radius.into(),
            ..Default::default()
        },
        ..Default::default()
    }
}
/// Round 36px header controls.
pub fn circle(p: Colors) -> impl Fn(&Theme, button::Status) -> button::Style {
    ghost(p, 18.0)
}
pub fn quiet(p: Colors) -> impl Fn(&Theme, button::Status) -> button::Style {
    ghost(p, 11.2)
}
/// `--surface-button-active`: ink fill, paper text.
pub fn active(p: Colors) -> impl Fn(&Theme, button::Status) -> button::Style {
    move |_, _| button::Style {
        background: Some(p.ink.into()),
        text_color: p.paper,
        border: Border {
            radius: 11.2.into(),
            ..Default::default()
        },
        ..Default::default()
    }
}
/// One option of a segmented control, as in the website's Reader settings.
pub fn segment(p: Colors, chosen: bool) -> impl Fn(&Theme, button::Status) -> button::Style {
    move |_, status| button::Style {
        background: if chosen {
            Some(p.ink.into())
        } else if hovered(status) {
            Some(p.hover.into())
        } else {
            None
        },
        text_color: if chosen { p.paper } else { p.ink },
        border: Border::default(),
        ..Default::default()
    }
}
/// A Font Awesome solid icon, fitted to a `size` square like `<FontAwesomeIcon className="h-4 w-4">`.
pub fn icon<'a>(glyph: &Icon, color: Color, size: f32) -> svg::Svg<'a> {
    rotated_icon(glyph, color, size, 0.0)
}
/// An icon turned by `degrees` about its center. The turn is drawn into the SVG (in 6° steps, each parsed once),
/// so it renders the same on every backend.
pub fn rotated_icon<'a>(glyph: &Icon, color: Color, size: f32, degrees: f32) -> svg::Svg<'a> {
    static HANDLES: OnceLock<Mutex<HashMap<(&'static str, i32), svg::Handle>>> = OnceLock::new();
    let step = (degrees / 6.0).round() as i32;
    let handle = HANDLES
        .get_or_init(Default::default)
        .lock()
        .expect("icon cache")
        .entry((glyph.path, step))
        .or_insert_with(|| {
            // A square viewBox the size of the longer side, centered on the glyph, fits it at any angle.
            let side = glyph.width.max(glyph.height) as f32;
            let (w, h) = (glyph.width as f32, glyph.height as f32);
            svg::Handle::from_memory(
                format!(
                    r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="{} {} {side} {side}"><path fill="#000" transform="rotate({} {} {})" d="{}"/></svg>"##,
                    (w - side) / 2.0,
                    (h - side) / 2.0,
                    step * 6,
                    w / 2.0,
                    h / 2.0,
                    glyph.path
                )
                .into_bytes(),
            )
        })
        .clone();
    svg::Svg::new(handle)
        .width(size)
        .height(size)
        .style(move |_, _| svg::Style { color: Some(color) })
}
