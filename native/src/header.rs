// The app header, after the website's Navbar and ChapterHeader: one row with the navigation pill at the left and,
// on a chapter, the reader controls pill at the right. Geometry and motion follow src/app/globals.css.
use crate::anim::{EASE, FADE, NAV, NAV_EASE, TINT, Transition};
use crate::design::{self, Colors, fade, icon, mix, sans, serif, serif_italic};
use crate::icons;
use crate::reveal::reveal;
use crate::{App, Message, Popover, Screen};
use iced::widget::{button, container, row, space, stack, text, tooltip};
use iced::{Alignment::Center, Border, Element, Fill, Length, Padding, font};
use std::time::Instant;

/// `--desktop-nav-control-size`
pub const CONTROL: f32 = 36.0;
/// Gap between navigation links (`0.375rem`).
pub const LINK_GAP: f32 = 6.0;
pub const PILL_HEIGHT: f32 = 48.0;
pub const TOP: f32 = 16.0;
/// Where page content starts: below the header and a 16px gap.
pub const CONTENT_TOP: f32 = TOP + PILL_HEIGHT + 16.0;
pub const NAV_ITEMS: [(&str, &icons::Icon, Screen); 3] = [
    ("Browse", &icons::BOOK_OPEN, Screen::Reader),
    ("Journal", &icons::PENCIL, Screen::Journal),
    ("Come Follow Me", &icons::SHOE_PRINTS, Screen::Guides),
];
pub const LABEL_SIZE: f32 = 13.0;

pub fn label_font() -> iced::Font {
    sans(font::Weight::Medium)
}
pub fn measure_labels() -> [f32; 3] {
    NAV_ITEMS.map(|(label, _, _)| design::measure(label, LABEL_SIZE, label_font()).ceil())
}
/// The navigation link a screen belongs to; Settings and Sign in have none (the website shows no active label).
pub fn screen_index(screen: Screen) -> Option<usize> {
    if screen == Screen::Library {
        return Some(0);
    }
    NAV_ITEMS.iter().position(|(_, _, s)| *s == screen)
}

/// The header's running transitions. Every value is derived from the clock, so changing the target part way through
/// continues smoothly from what is on screen.
#[derive(Debug, Clone)]
pub struct Motion {
    pub animate: bool,
    pub collapsed: bool,
    pub active: usize,
    /// Visible fraction of the collapsible navigation (`grid-template-columns` 1fr → 0fr).
    pub open: Transition,
    pub content_opacity: Transition,
    /// 0 → 1 rotates the toggle chevron by 180°.
    pub chevron: Transition,
    /// Per link: how much of its label shows (`max-width`, `margin-left`, link width).
    pub label: [Transition; 3],
    pub label_opacity: [Transition; 3],
    /// Per link: icon color, from ink (0) to active text (1).
    pub tint: [Transition; 3],
    /// The active indicator's offset in links, and the width of the label it wraps.
    pub indicator_index: Transition,
    pub indicator_label: Transition,
    /// The indicator's opacity: it fades out on a screen with no link.
    pub indicator_shown: Transition,
}

impl Motion {
    pub fn new(active: usize, widths: [f32; 3], animate: bool, now: Instant) -> Self {
        let on = |i: usize| if i == active { 1.0 } else { 0.0 };
        Self {
            animate,
            collapsed: false,
            active,
            open: Transition::new(1.0, NAV, NAV_EASE, now),
            content_opacity: Transition::new(1.0, FADE, EASE, now),
            chevron: Transition::new(0.0, NAV, NAV_EASE, now),
            label: [0, 1, 2].map(|i| Transition::new(on(i), NAV, NAV_EASE, now)),
            label_opacity: [0, 1, 2].map(|i| Transition::new(on(i), FADE, EASE, now)),
            tint: [0, 1, 2].map(|i| Transition::new(on(i), TINT, EASE, now)),
            indicator_index: Transition::new(active as f32, NAV, NAV_EASE, now),
            indicator_label: Transition::new(widths[active], NAV, NAV_EASE, now),
            indicator_shown: Transition::new(1.0, FADE, EASE, now),
        }
    }
    pub fn set_active(&mut self, active: Option<usize>, widths: [f32; 3], now: Instant) {
        for i in 0..3 {
            let on = if Some(i) == active { 1.0 } else { 0.0 };
            self.label[i].set(on, now, self.animate);
            self.label_opacity[i].set(on, now, self.animate);
            self.tint[i].set(on, now, self.animate);
        }
        self.indicator_shown
            .set(if active.is_some() { 1.0 } else { 0.0 }, now, self.animate);
        let Some(active) = active else {
            self.active = usize::MAX;
            return;
        };
        // From no link, the indicator appears where it is going rather than sliding from the last one.
        let from_none = self.active == usize::MAX;
        self.active = active;
        self.indicator_index
            .set(active as f32, now, self.animate && !from_none);
        self.indicator_label
            .set(widths[active], now, self.animate && !from_none);
    }
    pub fn set_collapsed(&mut self, collapsed: bool, now: Instant) {
        self.collapsed = collapsed;
        let open = if collapsed { 0.0 } else { 1.0 };
        self.open.set(open, now, self.animate);
        self.content_opacity.set(open, now, self.animate);
        self.chevron.set(1.0 - open, now, self.animate);
    }
    pub fn is_animating(&self, now: Instant) -> bool {
        [
            &self.open,
            &self.content_opacity,
            &self.chevron,
            &self.indicator_index,
            &self.indicator_label,
            &self.indicator_shown,
        ]
        .into_iter()
        .chain(&self.label)
        .chain(&self.label_opacity)
        .chain(&self.tint)
        .any(|t| t.is_animating(now))
    }
    /// Width of each link at `now`: the icon square, plus the gap and label as it reveals.
    pub fn link_widths(&self, widths: [f32; 3], now: Instant) -> [f32; 3] {
        [0, 1, 2].map(|i| CONTROL + (LINK_GAP + widths[i]) * self.label[i].value(now))
    }
    /// The indicator's x offset within the links and its width at `now`.
    pub fn indicator(&self, now: Instant) -> (f32, f32) {
        (
            self.indicator_index.value(now) * (CONTROL + LINK_GAP),
            CONTROL + LINK_GAP + self.indicator_label.value(now),
        )
    }
    /// Collapsed content stays visible while it slides away, then hides (`visibility` after 280ms).
    pub fn content_visible(&self, now: Instant) -> bool {
        self.open.value(now) > 0.0
    }
}

/// The shell's horizontal inset: `max(--shell-gutter, (100% - 1180px) / 2)`.
pub fn shell_inset(width: f32) -> f32 {
    let gutter = (width * 0.026).clamp(16.0, 32.0);
    ((width - 1180.0) / 2.0).max(gutter)
}

fn vrule<'a>(p: Colors, height: f32, alpha: f32) -> Element<'a, Message> {
    container(space())
        .width(1)
        .height(height)
        .style(move |_| container::Style {
            background: Some(fade(p.rule, alpha).into()),
            ..Default::default()
        })
        .into()
}

pub fn wordmark<'a>(p: Colors, size: f32) -> Element<'a, Message> {
    row![
        text("Verse").font(serif()).size(size).color(p.ink),
        text("Together")
            .font(serif_italic())
            .size(size)
            .color(p.accent)
    ]
    .align_y(Center)
    .into()
}

fn hint<'a>(
    content: impl Into<Element<'a, Message>>,
    label: &'a str,
    p: Colors,
) -> Element<'a, Message> {
    tooltip(
        content,
        container(text(label).size(12).color(p.paper))
            .padding([4, 8])
            .style(move |_| container::Style {
                background: Some(p.ink.into()),
                border: Border {
                    radius: 6.0.into(),
                    ..Default::default()
                },
                ..Default::default()
            }),
        tooltip::Position::Bottom,
    )
    .gap(6)
    .into()
}

impl App {
    pub(crate) fn header(&self) -> Element<'_, Message> {
        let inset = shell_inset(self.window_width);
        let mut line = row![self.nav_pill()].spacing(12).align_y(Center);
        if self.content_hidden() {
            // Hidden content has no page controls (`AppMain` shows its notice in place of the page).
        } else if self.screen == Screen::Reader {
            line = line.push(space::horizontal()).push(self.reader_pill());
        } else if self.screen == Screen::Settings && self.settings_tabs_in_header() {
            line = line
                .push(space::horizontal())
                .push(self.settings_tabs(true));
        } else if self.screen == Screen::Guides && self.lessons.open.is_some() {
            line = line.push(space::horizontal()).push(self.lesson_pill());
        } else if self.screen == Screen::Library {
            let right = match self.library_title() {
                Some(title) => self.selection_header(title),
                None => self.library_search(),
            };
            line = line.push(space::horizontal()).push(right);
        }
        container(line)
            .padding(Padding {
                top: TOP,
                right: inset,
                bottom: 0.0,
                left: inset,
            })
            .width(Fill)
            .into()
    }

    fn nav_pill(&self) -> Element<'_, Message> {
        let p = self.p();
        let now = self.now;
        let m = &self.motion;
        let widths = self.label_widths;
        let alpha = m.content_opacity.value(now);
        let indicator_alpha = alpha * m.indicator_shown.value(now);
        let links_widths = m.link_widths(widths, now);
        let mut links = row![].spacing(LINK_GAP).align_y(Center);
        let shown_links = self.nav_count();
        for (i, (label, glyph, screen)) in NAV_ITEMS.iter().enumerate().take(shown_links) {
            let tint = m.tint[i].value(now);
            let color = fade(mix(p.ink, p.paper, tint), alpha);
            let shown = m.label[i].value(now);
            let label_text = text(*label)
                .size(LABEL_SIZE)
                .font(label_font())
                .color(fade(color, m.label_opacity[i].value(now)))
                .wrapping(iced::widget::text::Wrapping::None);
            let content = row![
                icon(glyph, color, 16.8),
                container(reveal(label_text, shown, true))
                    .padding(Padding::ZERO.left(LINK_GAP * shown))
            ]
            .align_y(Center);
            let link = button(
                container(content)
                    .center_y(CONTROL)
                    .center_x(links_widths[i]),
            )
            .padding(0)
            .width(links_widths[i])
            .height(CONTROL)
            .on_press(if *screen == Screen::Reader {
                Message::Library(crate::library_ui::LibraryMsg::Nav)
            } else {
                Message::SetScreen(*screen)
            })
            .style(move |_, status| {
                let hovered = matches!(status, button::Status::Hovered | button::Status::Pressed);
                button::Style {
                    background: (hovered && i != m.active).then(|| p.hover.into()),
                    text_color: p.ink,
                    border: Border {
                        radius: 11.2.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                }
            });
            let link = if i == m.active {
                Element::from(link)
            } else {
                hint(link, label, p)
            };
            links = links.push(container(link).id(format!("nav-{i}")));
        }
        let total: f32 = links_widths.iter().take(shown_links).sum::<f32>()
            + LINK_GAP * (shown_links.saturating_sub(1)) as f32;
        let (x, w) = m.indicator(now);
        let indicator = container(container(space()).width(w).height(CONTROL).style(move |_| {
            container::Style {
                background: Some(fade(p.ink, indicator_alpha).into()),
                border: Border {
                    radius: 11.2.into(),
                    ..Default::default()
                },
                ..Default::default()
            }
        }))
        .padding(Padding::ZERO.left(x))
        .width(total)
        .height(CONTROL)
        .clip(true);
        let links = stack![indicator, links];
        // Signed out, the gear opens Settings; signed in, the avatar opens the account menu (`AccountControl`).
        let settings_open = self.popover == Some(Popover::AppSettings)
            || matches!(self.screen, Screen::Settings | Screen::SignIn);
        let glyph: Element<'_, Message> = match &self.account.session {
            Some(session) => container(
                text(crate::account_ui::initials(
                    &session.user.name,
                    &session.user.email,
                ))
                .size(11)
                .font(crate::design::sans(iced::font::Weight::Bold))
                .color(fade(p.paper, alpha)),
            )
            .center_x(CONTROL - 12.0)
            .center_y(CONTROL - 12.0)
            .style(move |_| container::Style {
                background: Some(fade(p.ink, alpha).into()),
                border: Border {
                    radius: 999.0.into(),
                    ..Default::default()
                },
                ..Default::default()
            })
            .into(),
            None => icon(&icons::GEAR, fade(p.ink, alpha), 16.).into(),
        };
        let account = button(container(glyph).center_x(CONTROL).center_y(CONTROL))
            .padding(0)
            .on_press(if self.account.session.is_some() {
                Message::TogglePopover(Popover::AppSettings)
            } else {
                Message::SetScreen(Screen::Settings)
            })
            .style(move |_, status| button::Style {
                background: Some(
                    fade(
                        if settings_open || matches!(status, button::Status::Hovered) {
                            p.hover
                        } else {
                            p.soft
                        },
                        alpha,
                    )
                    .into(),
                ),
                text_color: p.ink,
                border: Border {
                    radius: 18.0.into(),
                    ..Default::default()
                },
                ..Default::default()
            });
        let content = row![
            space().width(12),
            vrule(p, CONTROL, alpha),
            space().width(12),
            links,
            space().width(12),
            vrule(p, CONTROL, alpha),
            space().width(12),
            container(hint(account, "Settings", p)).id("nav-settings"),
        ]
        .align_y(Center);
        let shown = m.open.value(now);
        let interactive = !m.collapsed;
        let content: Element<'_, Message> = if m.content_visible(now) {
            // Opacity fades with the website's 180ms ease while the width follows the 280ms curve.
            reveal(content, shown, interactive)
        } else {
            space().width(0).into()
        };
        let chevron = design::rotated_icon(
            &icons::CHEVRON_LEFT,
            p.ink,
            14.,
            180.0 * m.chevron.value(now),
        );
        let toggle = button(container(chevron).center_x(32).center_y(CONTROL))
            .padding(0)
            .on_press(Message::ToggleNav)
            .style(design::quiet(p));
        let toggle = hint(
            toggle,
            if m.collapsed {
                "Expand navigation"
            } else {
                "Collapse navigation"
            },
            p,
        );
        let brand = button(wordmark(p, 20.))
            .padding(0)
            .on_press(Message::SetScreen(Screen::Reader))
            .style(|_, _| button::Style::default());
        container(
            row![brand, content, space().width(4), toggle]
                .align_y(Center)
                .height(CONTROL),
        )
        .padding(Padding {
            top: 5.0,
            right: 6.0,
            bottom: 5.0,
            left: 16.0,
        })
        .height(PILL_HEIGHT)
        .id("nav-pill")
        .style(design::pill(p))
        .into()
    }

    /// The Library's search in the header (`LibrarySearch` "header"): opens the search panel.
    fn library_search(&self) -> Element<'_, Message> {
        let p = self.p();
        let open = self.popover == Some(Popover::Search);
        button(
            container(
                row![
                    icon(&icons::MAGNIFYING_GLASS, p.faint, 14.),
                    text(if self.show_lds() {
                        "Search or jump to 1 Ne 3:7"
                    } else {
                        "Search or jump to John 3:16"
                    })
                    .size(14)
                    .color(p.faint)
                    .wrapping(iced::widget::text::Wrapping::None),
                ]
                .spacing(10)
                .align_y(Center),
            )
            .center_y(Fill),
        )
        .padding([0, 18])
        .width(352)
        .height(PILL_HEIGHT)
        .on_press(Message::TogglePopover(Popover::Search))
        .style(move |_, status| button::Style {
            background: Some(
                if open || matches!(status, button::Status::Hovered) {
                    p.hover
                } else {
                    p.card
                }
                .into(),
            ),
            text_color: p.ink,
            border: Border {
                color: p.rule,
                width: 1.0,
                radius: 999.0.into(),
            },
            shadow: design::soft_shadow(p),
            ..Default::default()
        })
        .into()
    }

    fn nav_width(&self) -> f32 {
        let wordmark = design::measure("Verse", 20.0, serif())
            + design::measure("Together", 20.0, serif_italic());
        let links = self.motion.link_widths(self.label_widths, self.now);
        let content = 12.0
            + 1.0
            + 12.0
            + links.iter().sum::<f32>()
            + 2.0 * LINK_GAP
            + 12.0
            + 1.0
            + 12.0
            + CONTROL;
        16.0 + wordmark + self.motion.open.value(self.now) * content + 4.0 + 32.0 + 6.0
    }

    fn reader_pill(&self) -> Element<'_, Message> {
        let p = self.p();
        let control = |glyph: &icons::Icon, size: f32, message: Message, open: bool| {
            button(
                container(icon(glyph, p.ink, size))
                    .center_x(CONTROL)
                    .center_y(CONTROL),
            )
            .padding(0)
            .on_press(message)
            .style(move |_, status| button::Style {
                background: (open
                    || matches!(status, button::Status::Hovered | button::Status::Pressed))
                .then(|| p.hover.into()),
                text_color: p.ink,
                border: Border {
                    radius: 18.0.into(),
                    ..Default::default()
                },
                ..Default::default()
            })
        };
        let search = hint(
            control(
                &icons::MAGNIFYING_GLASS,
                14.,
                Message::TogglePopover(Popover::Search),
                self.popover == Some(Popover::Search),
            ),
            "Search scriptures or jump to a reference",
            p,
        );
        let crumb = |label: String, current: bool, message: Message, open: bool| {
            button(
                text(label)
                    .size(13)
                    .font(sans(if current {
                        font::Weight::Semibold
                    } else {
                        font::Weight::Normal
                    }))
                    .wrapping(iced::widget::text::Wrapping::None),
            )
            .padding([6, 8])
            .on_press(message)
            .style(move |_, status| {
                let hovered =
                    open || matches!(status, button::Status::Hovered | button::Status::Pressed);
                button::Style {
                    background: hovered.then(|| p.hover.into()),
                    text_color: if current || hovered { p.ink } else { p.muted },
                    border: Border {
                        radius: 11.2.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                }
            })
        };
        let volume = self
            .book()
            .map(|b| b.volume_title.clone())
            .unwrap_or_else(|| "Library".into());
        // The website shrinks the trail before its navigation or action buttons. Reserve their
        // natural widths, then ellipsize the two breadcrumb labels inside the remaining space.
        let max_width =
            self.window_width - 2.0 * shell_inset(self.window_width) - self.nav_width() - 12.0;
        let slash = design::measure("/", 13.0, sans(font::Weight::Normal)) + 4.0;
        let log_width = design::measure("Log", 13.0, sans(font::Weight::Semibold)) + 42.0;
        let actions = 1.0 + 5.0 + log_width + 2.0 * CONTROL + 16.0;
        let trail = (max_width - 12.0 - 6.0 - CONTROL - 4.0 - slash - actions).max(48.0);
        let current = self.reference();
        let current_width = (design::measure(&current, 13.0, sans(font::Weight::Semibold)) + 16.0)
            .min((trail - 32.0).max(16.0));
        let volume_width = (trail - current_width).max(16.0);
        let volume = ellipsize(&volume, volume_width - 16.0, sans(font::Weight::Normal));
        let current = ellipsize(&current, current_width - 16.0, sans(font::Weight::Semibold));
        let crumbs = row![
            hint(
                crumb(
                    volume,
                    false,
                    Message::TogglePopover(Popover::Library),
                    self.popover == Some(Popover::Library) && self.library_book.is_none(),
                ),
                "Choose a book",
                p
            ),
            container(text("/").size(13).color(p.faint)).padding([0, 2]),
            hint(
                crumb(
                    current,
                    true,
                    Message::TogglePopover(Popover::Chapters),
                    self.popover == Some(Popover::Chapters),
                ),
                "Choose a chapter",
                p
            ),
        ]
        .align_y(Center);
        let log_open = self.log_open;
        let log = button(
            container(
                row![
                    icon(&icons::BOOK, if log_open { p.paper } else { p.ink }, 12.),
                    text("Log").size(13).font(sans(font::Weight::Semibold))
                ]
                .spacing(6)
                .align_y(Center),
            )
            .center_y(CONTROL),
        )
        .padding([0, 12])
        .height(CONTROL)
        .on_press(Message::ToggleLog)
        .style(move |_, status| button::Style {
            background: if log_open {
                Some(p.ink.into())
            } else if matches!(status, button::Status::Hovered | button::Status::Pressed) {
                Some(p.hover.into())
            } else {
                None
            },
            text_color: if log_open { p.paper } else { p.ink },
            border: Border {
                radius: 11.2.into(),
                ..Default::default()
            },
            ..Default::default()
        });
        let log = container(log).center_y(CONTROL);
        let simple = hint(
            control(&icons::EYE, 16., Message::ToggleFocus, false),
            "Turn simple mode on",
            p,
        );
        let settings = hint(
            control(
                &icons::GEAR,
                16.,
                Message::TogglePopover(Popover::ReaderSettings),
                self.popover == Some(Popover::ReaderSettings),
            ),
            "Reader settings",
            p,
        );
        let nav = row![search, crumbs].spacing(4).align_y(Center);
        let actions = row![
            vrule(p, CONTROL, 1.0),
            space().width(5),
            hint(log, "Log a note or reading", p),
            simple,
            settings
        ]
        .spacing(4)
        .align_y(Center);
        container(
            row![nav, actions]
                .spacing(6)
                .align_y(Center)
                .height(CONTROL),
        )
        .padding([5, 6])
        .height(PILL_HEIGHT)
        .width(Length::Shrink)
        .max_width(max_width)
        .id("reader-pill")
        .style(design::pill(p))
        .into()
    }
}

fn ellipsize(label: &str, width: f32, font: iced::Font) -> String {
    // Adding and removing button padding can round a measured width down by a few ULPs.
    let width = width + 0.01;
    if design::measure(label, LABEL_SIZE, font) <= width {
        return label.to_owned();
    }
    let mut shortened = label.to_owned();
    while !shortened.is_empty() {
        shortened.pop();
        let candidate = format!("{shortened}…");
        if design::measure(&candidate, LABEL_SIZE, font) <= width {
            return candidate;
        }
    }
    "…".into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    const WIDTHS: [f32; 3] = [45.0, 48.0, 104.0];
    #[test]
    fn fitting_breadcrumbs_survive_padding_rounding() {
        design::load_fonts();
        let font = sans(font::Weight::Semibold);
        for label in ["Alma 32", "Alma 50", "Doctrine and Covenants 138"] {
            let width = design::measure(label, LABEL_SIZE, font);
            let available = (width + 16.0) - 16.0;
            assert_eq!(ellipsize(label, available, font), label);
        }
        assert_ne!(ellipsize("Alma 50", 32.0, font), "Alma 50");
    }
    #[test]
    fn only_the_active_link_shows_its_label() {
        let now = Instant::now();
        let m = Motion::new(0, WIDTHS, true, now);
        // The website's active Browse link is 87px (36 + 6 + 45); the others are 36px icons.
        assert_eq!(m.link_widths(WIDTHS, now), [87.0, 36.0, 36.0]);
        assert_eq!(m.indicator(now), (0.0, 87.0));
        assert!(!m.is_animating(now));
    }
    #[test]
    fn switching_screens_glides_the_indicator_and_swaps_labels() {
        let t0 = Instant::now();
        let mut m = Motion::new(0, WIDTHS, true, t0);
        m.set_active(Some(1), WIDTHS, t0);
        assert!(m.is_animating(t0));
        let mid = t0 + Duration::from_millis(100);
        let (x, w) = m.indicator(mid);
        assert!(x > 0.0 && x < 42.0, "indicator moves continuously: {x}");
        assert!(w > 87.0 && w < 90.0);
        let links = m.link_widths(WIDTHS, mid);
        assert!(links[0] > 36.0 && links[0] < 87.0);
        assert!(links[1] > 36.0 && links[1] < 90.0);
        // Labels fade over 180ms, faster than the 280ms width change.
        let fade_done = t0 + Duration::from_millis(180);
        assert_eq!(m.label_opacity[0].value(fade_done), 0.0);
        assert!(m.label[0].value(fade_done) > 0.0);
        let end = t0 + Duration::from_millis(280);
        assert!(!m.is_animating(end));
        assert_eq!(m.indicator(end), (42.0, 90.0));
        assert_eq!(m.link_widths(WIDTHS, end), [36.0, 90.0, 36.0]);
    }
    #[test]
    fn collapsing_can_be_reversed_mid_animation() {
        let t0 = Instant::now();
        let mut m = Motion::new(0, WIDTHS, true, t0);
        m.set_collapsed(true, t0);
        let mid = t0 + Duration::from_millis(90);
        let open = m.open.value(mid);
        assert!(open > 0.0 && open < 1.0);
        assert!(m.chevron.value(mid) > 0.0);
        m.set_collapsed(false, mid);
        assert!(
            (m.open.value(mid) - open).abs() < 1e-4,
            "no jump on reversal"
        );
        assert!(m.content_visible(mid));
        let settled = mid + Duration::from_millis(280);
        assert_eq!(m.open.value(settled), 1.0);
        assert_eq!(m.chevron.value(settled), 0.0);
        assert!(!m.is_animating(settled));
    }
    #[test]
    fn collapsed_content_hides_once_the_slide_ends() {
        let t0 = Instant::now();
        let mut m = Motion::new(2, WIDTHS, true, t0);
        m.set_collapsed(true, t0);
        assert!(m.content_visible(t0 + Duration::from_millis(279)));
        assert!(!m.content_visible(t0 + Duration::from_millis(280)));
    }
    #[test]
    fn reduced_motion_settles_immediately() {
        let t0 = Instant::now();
        let mut m = Motion::new(0, WIDTHS, false, t0);
        m.set_active(Some(2), WIDTHS, t0);
        m.set_collapsed(true, t0);
        assert!(!m.is_animating(t0));
        assert_eq!(m.indicator(t0), (84.0, 42.0 + 104.0));
        assert!(!m.content_visible(t0));
    }
    #[test]
    fn shell_inset_matches_the_website_at_common_widths() {
        assert_eq!(shell_inset(1280.0), 50.0);
        assert_eq!(shell_inset(1000.0), 26.0);
        assert_eq!(shell_inset(1600.0), 210.0);
    }
}
