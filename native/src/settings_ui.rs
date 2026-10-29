// Settings, after the website's `/account` page (`src/app/account/page.tsx`, `features/settings/settingsTabs.ts`,
// `page.module.css`): six sections in a pill of tabs, the open one dark with its name and the others as icons, one
// section open at a time. Wide windows put the pill at the header's right, beside the navigation; simple mode keeps
// it at the top of the page. Left and Right step along the tabs (wrapping), Home and End go to the ends.
use crate::anim::{EASE, FADE, NAV, NAV_EASE, TINT, Transition};
use crate::design::{self, Colors, icon, sans, serif};
use crate::header::{CONTENT_TOP, CONTROL, PILL_HEIGHT};
use crate::icons;
use crate::store::{self, TextWidth};
use crate::{App, Message};
use iced::widget::{button, column, container, rich_text, row, slider, space, span, text};
use iced::{Alignment::Center, Border, Color, Element, Fill, Length, Padding, font};

/// `SETTINGS_TABS`, in order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SettingsTab {
    #[default]
    Account,
    Reading,
    BibleTranslations,
    StudyTools,
    ReleaseNotes,
    Feedback,
}
pub const SETTINGS_TABS: [SettingsTab; 6] = [
    SettingsTab::Account,
    SettingsTab::Reading,
    SettingsTab::BibleTranslations,
    SettingsTab::StudyTools,
    SettingsTab::ReleaseNotes,
    SettingsTab::Feedback,
];
impl SettingsTab {
    /// The website's hash for the section (`#reading`).
    pub fn id(self) -> &'static str {
        match self {
            Self::Account => "account",
            Self::Reading => "reading",
            Self::BibleTranslations => "bible-translations",
            Self::StudyTools => "study-tools",
            Self::ReleaseNotes => "release-notes",
            Self::Feedback => "feedback",
        }
    }
    /// The tab's name (`TABS[tab].label`).
    pub fn label(self) -> &'static str {
        match self {
            Self::Account => "Account",
            Self::Reading => "Reading",
            Self::BibleTranslations => "Translations",
            Self::StudyTools => "Study tools",
            Self::ReleaseNotes => "Release notes",
            Self::Feedback => "Feedback",
        }
    }
    pub fn icon(self) -> &'static icons::Icon {
        match self {
            Self::Account => &icons::USER,
            Self::Reading => &icons::BOOK_OPEN,
            Self::BibleTranslations => &icons::BOOK_BIBLE,
            Self::StudyTools => &icons::HIGHLIGHTER,
            Self::ReleaseNotes => &icons::CLOCK_ROTATE_LEFT,
            Self::Feedback => &icons::COMMENT_DOTS,
        }
    }
    /// The section's heading and the line under it.
    pub fn title(self) -> &'static str {
        match self {
            Self::Account => "Account",
            Self::Reading => "Reading & appearance",
            Self::BibleTranslations => "Bible translations",
            Self::StudyTools => "Study tools",
            Self::ReleaseNotes => "Release notes",
            Self::Feedback => "Feedback",
        }
    }
    pub fn lead(self) -> &'static str {
        match self {
            Self::Account => "Your profile, sign-in methods and devices.",
            Self::Reading => {
                "How scripture chapters look in the reader. The reader's settings menu has the same choices."
            }
            Self::BibleTranslations => {
                "Choose your default Bible and manage saved translations. Saved on this device; also available in Reader settings."
            }
            Self::StudyTools => {
                "The marks at the top of the selection menu when you choose verses."
            }
            Self::ReleaseNotes => "What has changed in Verse Together, release by release.",
            Self::Feedback => {
                "Ideas, problems, or requests for Verse Together. Every message is read."
            }
        }
    }
}
/// `tabFromHash`: "#reading" opens Reading; anything that isn't a tab opens Account. (This app has no URL; the
/// website's links into Settings are its section ids, kept here so they mean the same tabs.)
#[cfg(test)]
pub fn tab_from_hash(hash: &str) -> SettingsTab {
    let id = hash.strip_prefix('#').unwrap_or(hash);
    SETTINGS_TABS
        .into_iter()
        .find(|t| t.id() == id)
        .unwrap_or_default()
}
/// `tabForKey`: Left and Right step along the row and wrap, Home and End go to the ends; other keys do nothing.
pub fn tab_for_key(key: &str, current: SettingsTab) -> Option<SettingsTab> {
    let index = SETTINGS_TABS
        .iter()
        .position(|t| *t == current)
        .unwrap_or(0);
    let last = SETTINGS_TABS.len() - 1;
    match key {
        "ArrowRight" => Some(SETTINGS_TABS[if index == last { 0 } else { index + 1 }]),
        "ArrowLeft" => Some(SETTINGS_TABS[if index == 0 { last } else { index - 1 }]),
        "Home" => Some(SETTINGS_TABS[0]),
        "End" => Some(SETTINGS_TABS[last]),
        _ => None,
    }
}
/// `SETTINGS_HEADER_QUERY`: from 900px the tabs sit in the header (outside simple mode).
pub const HEADER_MIN_WIDTH: f32 = 900.0;
/// Where the open section's columns go side by side (`@container (min-width: 42rem)`).
const TWO_COLUMNS: f32 = 672.0;

/// `.settingsCard` / `.profileCard`: rounded card on the soft shadow, 8px inside.
pub fn settings_card<'a>(
    p: Colors,
    content: impl Into<Element<'a, Message>>,
) -> Element<'a, Message> {
    container(content)
        .padding(8)
        .width(Fill)
        .style(move |_| container::Style {
            background: Some(p.card.into()),
            text_color: Some(p.ink),
            border: Border {
                radius: 14.4.into(),
                ..Default::default()
            },
            shadow: design::soft_shadow(p),
            ..Default::default()
        })
        .into()
}
/// `.preferences`: a card's inner padding.
fn preferences<'a>(content: impl Into<Element<'a, Message>>) -> Element<'a, Message> {
    container(content).padding([8, 12]).width(Fill).into()
}
/// `John 1:1–3`, public-domain King James text (`SAMPLE_VERSES`).
const SAMPLE_VERSES: [(u32, &str); 3] = [
    (
        1,
        "In the beginning was the Word, and the Word was with God, and the Word was God.",
    ),
    (2, "The same was in the beginning with God."),
    (
        3,
        "All things were made by him; and without him was not any thing made that was made.",
    ),
];

/// The tabs' transitions (`page.module.css`): the open tab's name reveals as its `max-width` grows to 10rem and its
/// `margin-left` to .375rem, with the header tab's padding (.6 → .75rem) and the page tab's `flex-grow` (1 → 3), all
/// over 280ms `cubic-bezier(0.22, 0.61, 0.36, 1)`; the name fades in over 180ms `ease`; the dark fill and the
/// icon's color change over 120ms `ease`. The tab left does the reverse. Reduced motion jumps (`transition: none`).
#[derive(Debug, Clone)]
pub struct TabMotion {
    pub label: [Transition; 6],
    pub opacity: [Transition; 6],
    pub tint: [Transition; 6],
}
impl TabMotion {
    pub fn new(active: SettingsTab, now: std::time::Instant) -> Self {
        let on = |i: usize| if SETTINGS_TABS[i] == active { 1.0 } else { 0.0 };
        Self {
            label: std::array::from_fn(|i| Transition::new(on(i), NAV, NAV_EASE, now)),
            opacity: std::array::from_fn(|i| Transition::new(on(i), FADE, EASE, now)),
            tint: std::array::from_fn(|i| Transition::new(on(i), TINT, EASE, now)),
        }
    }
    pub fn set(&mut self, active: SettingsTab, now: std::time::Instant, animate: bool) {
        for (i, tab) in SETTINGS_TABS.iter().enumerate() {
            let on = if *tab == active { 1.0 } else { 0.0 };
            self.label[i].set(on, now, animate);
            self.opacity[i].set(on, now, animate);
            self.tint[i].set(on, now, animate);
        }
    }
    pub fn is_animating(&self, now: std::time::Instant) -> bool {
        self.label
            .iter()
            .chain(&self.opacity)
            .chain(&self.tint)
            .any(|t| t.is_animating(now))
    }
}
/// `.tabLabel`'s open `max-width` (10rem) and `margin-left` (.375rem).
const LABEL_MAX: f32 = 160.0;
const LABEL_GAP: f32 = 6.0;
/// The page tabs' widths (`flex: 1 1 0`, the open one `flex-grow: 3` and never narrower than its content, the others
/// at least 2.75rem), sharing `space` as CSS flexbox resolves it.
pub fn page_tab_widths(space: f32, grow: [f32; 6], min: [f32; 6]) -> [f32; 6] {
    let mut frozen = [false; 6];
    let mut widths = [0.0; 6];
    loop {
        let free = space
            - (0..6)
                .filter(|i| frozen[*i])
                .map(|i| widths[i])
                .sum::<f32>();
        let total: f32 = (0..6).filter(|i| !frozen[*i]).map(|i| grow[i]).sum();
        let mut violated = false;
        for i in (0..6).filter(|i| !frozen[*i]) {
            widths[i] = free * grow[i] / total.max(f32::EPSILON);
        }
        for i in 0..6 {
            if !frozen[i] && widths[i] < min[i] {
                widths[i] = min[i];
                frozen[i] = true;
                violated = true;
            }
        }
        if !violated || frozen.iter().all(|f| *f) {
            return widths;
        }
    }
}

impl App {
    /// Whether the tabs sit in the header (`useSettingsTabsFitHeader`).
    pub(crate) fn settings_tabs_in_header(&self) -> bool {
        self.window_width >= HEADER_MIN_WIDTH && !self.focus
    }
    /// The section's width inside the page.
    pub(crate) fn settings_width(&self) -> f32 {
        let inset = crate::header::shell_inset(self.window_width);
        let max = if self.window_width >= HEADER_MIN_WIDTH {
            1180.0
        } else {
            1024.0
        };
        (self.window_width - inset * 2.0).min(max)
    }
    /// The sections' tabs (`SettingsTabs`): a pill, the open one dark with its name, the others as icons.
    pub(crate) fn settings_tabs(&self, in_header: bool) -> Element<'_, Message> {
        let p = self.p();
        let selected = self.settings_tab;
        let now = self.now;
        let m = &self.settings_motion;
        let label_size = if in_header { 13.0 } else { 12.8 };
        let height = if in_header { CONTROL } else { 44.0 };
        // Each tab at this moment: its name's shown width and gap, its padding and its content's width.
        let parts: Vec<(f32, f32, f32, f32)> = SETTINGS_TABS
            .iter()
            .enumerate()
            .map(|(i, tab)| {
                let l = m.label[i].value(now);
                let full =
                    design::measure(tab.label(), label_size, sans(font::Weight::Medium)).ceil();
                let shown = full.min(LABEL_MAX * l);
                let gap = LABEL_GAP * l;
                let pad = if in_header { 9.6 + 2.4 * l } else { 9.6 };
                (shown, gap, pad, 2.0 * pad + 16.8 + gap + shown)
            })
            .collect();
        let widths = (!in_header).then(|| {
            let pill = self.settings_width().min(480.0);
            let space = pill - 10.0 - 4.0 * 5.0;
            let grow = std::array::from_fn(|i| 1.0 + 2.0 * m.label[i].value(now));
            // The open tab is never narrower than its content (`min-width: max-content`), the others 2.75rem.
            let min = std::array::from_fn(|i| {
                if SETTINGS_TABS[i] == selected {
                    parts[i].3.max(44.0)
                } else {
                    44.0
                }
            });
            page_tab_widths(space, grow, min)
        });
        let mut tabs = row![]
            .spacing(if in_header { 6 } else { 4 })
            .align_y(Center);
        for (i, tab) in SETTINGS_TABS.into_iter().enumerate() {
            let on = tab == selected;
            let tint = m.tint[i].value(now);
            let mix = |a: Color, b: Color| Color {
                r: a.r + (b.r - a.r) * tint,
                g: a.g + (b.g - a.g) * tint,
                b: a.b + (b.b - a.b) * tint,
                a: 1.0,
            };
            let color = mix(p.ink, p.paper);
            let (shown, gap, pad, _) = parts[i];
            let mut content = row![icon(tab.icon(), color, 16.8)].align_y(Center);
            if shown > 0.0 {
                content = content.push(space().width(gap)).push(
                    container(
                        text(tab.label())
                            .size(label_size)
                            .font(sans(font::Weight::Medium))
                            .color(Color {
                                a: m.opacity[i].value(now),
                                ..color
                            })
                            .wrapping(text::Wrapping::None),
                    )
                    .width(shown)
                    .clip(true),
                );
            }
            let b = button(container(content).center_y(height).center_x(if in_header {
                Length::Shrink
            } else {
                Fill
            }))
            .padding([0.0, pad])
            .height(height)
            .on_press(Message::SettingsTab(tab))
            .style(move |_, status| button::Style {
                background: if !on
                    && matches!(status, button::Status::Hovered | button::Status::Pressed)
                {
                    Some(p.hover.into())
                } else if tint > 0.0 {
                    Some(Color { a: tint, ..p.ink }.into())
                } else {
                    None
                },
                text_color: color,
                border: Border {
                    radius: if in_header { 11.2 } else { 999.0 }.into(),
                    ..Default::default()
                },
                ..Default::default()
            });
            let b: Element<'_, Message> = match &widths {
                None => b.width(Length::Shrink).into(),
                // In the page the tabs share the row, the open one three times as wide.
                Some(w) => b.width(Length::Fixed(w[i])).into(),
            };
            // The pill shows only the open section's name, so the others name themselves on hover.
            tabs = tabs.push(if on {
                Element::from(container(b).id(format!("settings-tab-{}", tab.id())))
            } else {
                container(self.hint(b, tab.label().to_string()))
                    .id(format!("settings-tab-{}", tab.id()))
                    .into()
            });
        }
        let pill = container(tabs)
            .padding(if in_header {
                Padding::from([5.0, 6.0])
            } else {
                Padding::from(5.0)
            })
            .id("settings-tabs")
            .style(design::pill(p));
        if in_header {
            pill.height(PILL_HEIGHT).center_y(PILL_HEIGHT).into()
        } else {
            pill.width(Length::Fixed(self.settings_width().min(480.0)))
                .into()
        }
    }
    /// The website's `/account` Settings: the tabs (here or in the header) and the open section.
    pub(crate) fn settings_view(&self) -> Element<'_, Message> {
        let p = self.p();
        let tab = self.settings_tab;
        let width = self.settings_width();
        let wide = self.window_width >= HEADER_MIN_WIDTH;
        let mut page = column![].spacing(0);
        if !self.settings_tabs_in_header() {
            page =
                page.push(container(self.settings_tabs(false)).padding(Padding::ZERO.bottom(20)));
        }
        let mut header = column![
            text(tab.title()).size(21.6).font(serif()).line_height(1.2),
            text(tab.lead()).size(12.8).color(p.muted),
        ]
        .spacing(3.2);
        if wide {
            header = header.padding(Padding::ZERO.bottom(14.4));
        }
        let header: Element<'_, Message> = if wide {
            column![
                header,
                container(space())
                    .height(1)
                    .width(Fill)
                    .style(move |_| container::Style {
                        background: Some(p.rule.into()),
                        ..Default::default()
                    })
            ]
            .into()
        } else {
            header.into()
        };
        let body = match tab {
            SettingsTab::Account => self.account_panel(width),
            SettingsTab::Reading => self.reading_panel(width),
            SettingsTab::BibleTranslations => container(settings_card(
                p,
                preferences(
                    column![
                        self.bibles_settings(false).unwrap_or_else(|| space().into()),
                        text("Open a Bible chapter and use Reader settings to show saved translations beside your default Bible.")
                            .size(12)
                            .color(Color { a: 0.6, ..p.ink }),
                    ]
                    .spacing(12),
                ),
            ))
            .max_width(640)
            .into(),
            SettingsTab::StudyTools => settings_card(p, preferences(self.preset_settings())),
            SettingsTab::ReleaseNotes => self.release_notes_view(width),
            SettingsTab::Feedback => container(self.feedback_view()).max_width(672).into(),
        };
        page = page.push(column![header, body].spacing(14.4));
        // Below every section, as on the website: a quiet link to the privacy policy (`.policyLink`).
        page = page.push(
            container(
                button(design::underlined_with(
                    "Privacy policy",
                    12.8,
                    p.faint,
                    design::rule_strong(p),
                    font::Weight::Normal,
                    3.0,
                ))
                .padding(0)
                .on_press(Message::OpenLink(format!(
                    "{}/privacy",
                    crate::cloud::DEFAULT_SITE
                )))
                .style(|_, _| iced::widget::button::Style::default()),
            )
            .padding(Padding::ZERO.top(32)),
        );
        let inset = crate::header::shell_inset(self.window_width);
        self.scroll(
            container(container(page).width(Length::Fixed(width)))
                .center_x(Fill)
                .padding(Padding {
                    // In the phone layout the header holds nothing here, so the page starts at the top.
                    top: if self.phone() {
                        crate::header::TOP
                    } else {
                        CONTENT_TOP + 16.0
                    },
                    right: inset,
                    bottom: 48.0,
                    left: inset,
                }),
        )
        .id("account")
        .height(Fill)
        .into()
    }
    /// Account: the profile column beside sign-in methods and sessions (`.accountManager`).
    fn account_panel(&self, width: f32) -> Element<'_, Message> {
        self.account_manager(width >= TWO_COLUMNS)
    }

    /// Reading (`ReadingSettings`): the sample and faith tradition beside scripture appearance and simple mode.
    fn reading_panel(&self, width: f32) -> Element<'_, Message> {
        let left = column![self.reading_sample(), self.faith_tradition_card()]
            .spacing(12)
            .width(Length::FillPortion(11));
        let right = column![
            self.appearance_card(),
            settings_card(
                self.p(),
                preferences(self.toggle_setting(
                    "Simple mode",
                    if self.focus {
                        "Study tools hidden · This device"
                    } else {
                        "Study tools visible · This device"
                    },
                    self.focus,
                    Message::ToggleFocus,
                )),
            ),
            // This app's own: the website follows the system's appearance.
            settings_card(
                self.p(),
                preferences(self.toggle_setting(
                    "Dark appearance",
                    "This device",
                    self.preferences.dark,
                    Message::SetDark(!self.preferences.dark),
                )),
            ),
        ]
        .spacing(12)
        .width(Length::FillPortion(10));
        if width >= TWO_COLUMNS {
            row![left, right].spacing(12).into()
        } else {
            column![left, right].spacing(12).into()
        }
    }
    /// The preview of John 1:1–3 at the reader's size, typeface and width.
    fn reading_sample(&self) -> Element<'_, Message> {
        let p = self.p();
        let prefs = &self.preferences;
        let percent = (prefs.font_size / store::DEFAULT_FONT_SIZE * 100.0).round();
        let width = match prefs.text_width {
            TextWidth::Comfortable => "Comfortable",
            TextWidth::Wide => "Wide",
            TextWidth::Full => "Full",
        };
        let font = self.reading_font();
        let mut verses = column![].spacing(0);
        for (n, words) in SAMPLE_VERSES {
            verses = verses.push(
                container(
                    rich_text::<(), _, _, _>([
                        span(format!("{n}\u{2002}"))
                            .size(crate::view::BADGE_SIZE)
                            .font(sans(font::Weight::Semibold))
                            .color(p.accent),
                        span(words),
                    ])
                    .size(prefs.font_size)
                    .font(font)
                    .line_height(iced::widget::text::LineHeight::Absolute(28.0.into())),
                )
                .padding([8, 4]),
            );
        }
        let caption = row![
            text("Preview · John 1:1–3")
                .size(11.2)
                .color(p.muted)
                .width(Fill),
            text(format!(
                "{percent}% · {} · {width} width",
                if prefs.serif { "Serif" } else { "Sans" }
            ))
            .size(11.2)
            .color(p.muted),
        ];
        settings_card(
            p,
            container(column![
                container(caption).padding(Padding::ZERO.bottom(9.6)),
                container(space())
                    .height(1)
                    .width(Fill)
                    .style(move |_| container::Style {
                        background: Some(p.rule.into()),
                        ..Default::default()
                    }),
                container(verses).padding(Padding::ZERO.top(8)),
            ])
            .padding(Padding {
                top: 12.0,
                right: 16.0,
                bottom: 16.0,
                left: 16.0,
            }),
        )
    }
    /// `FaithTraditionSettings`: the two traditions as radio choices.
    fn faith_tradition_card(&self) -> Element<'_, Message> {
        let p = self.p();
        let mut choices = column![].spacing(8);
        for (id, label) in crate::faith::FAITH_TRADITIONS {
            let on = self.preferences.faith_tradition == id;
            let fg = if on { p.paper } else { p.ink };
            let radio = container(if on {
                Element::from(container(space()).width(7).height(7).style(move |_| {
                    container::Style {
                        background: Some(fg.into()),
                        border: Border {
                            radius: 4.0.into(),
                            ..Default::default()
                        },
                        ..Default::default()
                    }
                }))
            } else {
                space().into()
            })
            .center_x(14)
            .center_y(14)
            .style(move |_| container::Style {
                border: Border {
                    color: fg,
                    width: 1.5,
                    radius: 7.0.into(),
                },
                ..Default::default()
            });
            choices = choices.push(
                button(
                    row![radio, text(label).size(14).line_height(1.5).color(fg)]
                        .spacing(12)
                        .align_y(Center),
                )
                .padding([14, 16])
                .width(Fill)
                .on_press(Message::SetFaith(id))
                .style(move |_, status| button::Style {
                    background: Some(
                        if on {
                            p.ink
                        } else if matches!(status, button::Status::Hovered) {
                            p.hover
                        } else {
                            p.card
                        }
                        .into(),
                    ),
                    text_color: fg,
                    border: Border {
                        color: if on { p.ink } else { p.rule },
                        width: 1.0,
                        radius: 10.0.into(),
                    },
                    ..Default::default()
                }),
            );
        }
        settings_card(
            p,
            preferences(
                column![
                    text("Faith tradition").size(13.1).font(sans(font::Weight::Medium)),
                    text("Choose the content you see · This device. Other denominations keeps Bible reading and your journal, and hides Latter-day Saint scriptures, Come Follow Me, Joseph Smith Translation and study resources.")
                        .size(14)
                        .color(p.muted),
                    container(choices).padding(Padding::ZERO.top(12)),
                ]
                .spacing(4),
            ),
        )
    }
    /// Scripture appearance (`ReaderAppearanceControls` with descriptions) and its Reset.
    fn appearance_card(&self) -> Element<'_, Message> {
        let p = self.p();
        let prefs = &self.preferences;
        let at_defaults = (prefs.font_size - store::DEFAULT_FONT_SIZE).abs()
            < 0.005 * store::DEFAULT_FONT_SIZE
            && prefs.serif
            && prefs.text_width == TextWidth::Comfortable
            && !prefs.side_by_side;
        let faded = |c: Color| {
            if at_defaults {
                Color { a: c.a * 0.45, ..c }
            } else {
                c
            }
        };
        let reset = button(
            container(
                row![
                    icon(&icons::ROTATE_LEFT, faded(p.muted), 12.),
                    text("Reset").size(11.8).color(faded(p.muted)),
                ]
                .spacing(5.6)
                .align_y(Center),
            )
            .center_y(34),
        )
        .padding([0.0, 9.6])
        .height(36)
        .on_press_maybe((!at_defaults).then_some(Message::ResetAppearance))
        .style(move |_, status| button::Style {
            background: (matches!(status, button::Status::Hovered) && !at_defaults)
                .then(|| p.soft.into()),
            text_color: p.muted,
            border: Border {
                color: p.rule,
                width: 1.0,
                radius: 7.2.into(),
            },
            ..Default::default()
        });
        let label = |s: String| {
            text(s)
                .size(12)
                .font(sans(font::Weight::Medium))
                .color(Color { a: 0.8, ..p.ink })
        };
        let describe = |s: &'static str| text(s).size(11).color(Color { a: 0.6, ..p.ink });
        let percent = (prefs.font_size / store::DEFAULT_FONT_SIZE * 100.0).round();
        let controls = column![
            column![
                row![
                    label("Text size".into()).width(Fill),
                    text(format!("{percent}%"))
                        .size(12)
                        .color(Color { a: 0.6, ..p.ink }),
                ],
                slider(
                    store::MIN_FONT_SIZE..=store::MAX_FONT_SIZE,
                    prefs.font_size,
                    Message::FontSize
                )
                .step(store::DEFAULT_FONT_SIZE * 0.01),
            ]
            .spacing(4),
            column![
                label("Typeface".into()),
                self.segmented(
                    &[(true, "Serif"), (false, "Sans")],
                    prefs.serif,
                    Message::SetSerif
                ),
                describe("The typeface for scripture text. Controls and labels stay the same."),
            ]
            .spacing(8),
            column![
                label("Text width".into()),
                self.segmented(
                    &[
                        (TextWidth::Comfortable, "Comfortable"),
                        (TextWidth::Wide, "Wide"),
                        (TextWidth::Full, "Full")
                    ],
                    prefs.text_width,
                    Message::SetTextWidth
                ),
                describe(match prefs.text_width {
                    TextWidth::Comfortable => "A centered column for steady reading.",
                    TextWidth::Wide => "A wider column on large screens.",
                    TextWidth::Full => "Verses run the full width of the window.",
                }),
            ]
            .spacing(8),
            column![
                label("Comparison view".into()),
                self.segmented(
                    &[(false, "Inline"), (true, "Side by side")],
                    prefs.side_by_side,
                    Message::SetSideBySide
                ),
                describe(if prefs.side_by_side {
                    "Compared translations sit beside each verse that differs."
                } else {
                    "Compared translations follow each verse that differs."
                }),
            ]
            .spacing(8),
        ]
        .spacing(16);
        settings_card(
            p,
            preferences(column![
                row![
                    column![
                        text("Scripture appearance")
                            .size(13.1)
                            .font(sans(font::Weight::Medium)),
                        text("This device · Also in Reader settings")
                            .size(11.2)
                            .color(p.muted),
                    ]
                    .spacing(2.4)
                    .width(Fill),
                    reset,
                ]
                .spacing(12)
                .padding(Padding::ZERO.top(8).bottom(16)),
                controls,
            ]),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // The cases are the website's own (tests/settingsTabs.test.ts).
    #[test]
    fn the_hash_opens_its_tab_and_anything_else_opens_account() {
        assert_eq!(tab_from_hash("#reading"), SettingsTab::Reading);
        assert_eq!(
            tab_from_hash("#bible-translations"),
            SettingsTab::BibleTranslations
        );
        assert_eq!(tab_from_hash("#release-notes"), SettingsTab::ReleaseNotes);
        assert_eq!(tab_from_hash("#feedback"), SettingsTab::Feedback);
        assert_eq!(tab_from_hash("study-tools"), SettingsTab::StudyTools);
        assert_eq!(tab_from_hash(""), SettingsTab::Account);
        assert_eq!(tab_from_hash("#"), SettingsTab::Account);
        assert_eq!(tab_from_hash("#profile"), SettingsTab::Account);
    }
    #[test]
    fn left_and_right_step_and_wrap_home_and_end_go_to_the_ends() {
        use SettingsTab::*;
        assert_eq!(tab_for_key("ArrowRight", Account), Some(Reading));
        assert_eq!(tab_for_key("ArrowRight", Reading), Some(BibleTranslations));
        assert_eq!(
            tab_for_key("ArrowLeft", StudyTools),
            Some(BibleTranslations)
        );
        assert_eq!(tab_for_key("ArrowRight", StudyTools), Some(ReleaseNotes));
        assert_eq!(tab_for_key("ArrowRight", ReleaseNotes), Some(Feedback));
        assert_eq!(tab_for_key("ArrowRight", Feedback), Some(Account));
        assert_eq!(tab_for_key("ArrowLeft", Reading), Some(Account));
        assert_eq!(tab_for_key("ArrowLeft", Account), Some(Feedback));
        assert_eq!(tab_for_key("ArrowLeft", Feedback), Some(ReleaseNotes));
        assert_eq!(tab_for_key("ArrowDown", Reading), None);
        assert_eq!(tab_for_key("ArrowUp", Reading), None);
        assert_eq!(tab_for_key("Home", StudyTools), Some(Account));
        assert_eq!(tab_for_key("End", Account), Some(Feedback));
        assert_eq!(tab_for_key("Enter", Account), None);
        assert_eq!(tab_for_key("Tab", Reading), None);
        assert_eq!(SETTINGS_TABS.last(), Some(&Feedback));
        let labels: Vec<_> = SETTINGS_TABS.iter().map(|t| t.label()).collect();
        assert_eq!(
            labels,
            [
                "Account",
                "Reading",
                "Translations",
                "Study tools",
                "Release notes",
                "Feedback"
            ]
        );
    }
}
