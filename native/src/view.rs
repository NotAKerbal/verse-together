use crate::design::{self, icon, sans, serif};
use crate::header::{self, CONTENT_TOP, PILL_HEIGHT, TOP, shell_inset};
use crate::icons;
use crate::margin;
use crate::marks;
use crate::select_text::{Paint, Shown, select_text};
use crate::store::{self, Location, TextWidth};
use crate::text_selection::Area;
use crate::{App, Message, Popover, Screen};
use iced::alignment::{Horizontal, Vertical};
use iced::widget::text::{LineHeight, Wrapping};
use iced::widget::{
    button, column, container, mouse_area, opaque, row, scrollable, slider, space, stack, text,
    text_editor, text_input,
};
use iced::{Alignment::Center, Border, Color, Element, Fill, Font, Length, Padding, Vector, font};

/// The study panel beside the reader, and the gap before it.
pub(crate) const PANEL_WIDTH: f32 = 300.0;
const PANEL_GAP: f32 = 12.0;
/// `--verse-gap` (0.75rem from 640px; the window is always wider).
const VERSE_GAP: f32 = 12.0;
/// The book and chapter picker's scrolling area, and one book row in it (13px label, 7px padding, 1px gap).
const LIBRARY_HEIGHT: f32 = 416.0;
const BOOK_ROW: f32 = 32.0;
/// `.verse-badge`: 0.72rem DM Sans 600, in a 1.1rem slot with a 0.4rem margin, raised 0.35em.
pub(crate) const BADGE_SIZE: f32 = 11.52;
const BADGE_SLOT: f32 = 17.6;
const BADGE_MARGIN: f32 = 6.4;
const BADGE_RAISE: f32 = 0.35 * BADGE_SIZE;
/// En, thin and hair spaces, widest first, so the indent comes within a hair of the slot width.
const INDENT_FILL: &[char] = &['\u{2002}', '\u{2009}', '\u{200A}'];

fn badge_font() -> Font {
    sans(font::Weight::Semibold)
}
/// Spaces as wide as the website's verse number slot, so the first line starts after the number and wrapped lines
/// return to the left edge, as with the website's inline `.verse-badge`.
pub fn verse_indent(number: &str, font: Font, size: f32) -> String {
    let target = design::measure(number, BADGE_SIZE, badge_font()).max(BADGE_SLOT) + BADGE_MARGIN;
    indent_to(target, font, size)
}
/// Spaces as wide as a verse number at `number_size` and its right margin, in the text's own font.
pub fn verse_indent_for(
    number: &str,
    number_size: f32,
    font: Font,
    size: f32,
    margin: f32,
) -> String {
    indent_to(
        design::measure(number, number_size, badge_font()) + margin,
        font,
        size,
    )
}
fn indent_to(target: f32, font: Font, size: f32) -> String {
    let base = design::measure("x", size, font);
    let width = |c: char| design::measure(&format!("{c}x"), size, font) - base;
    let mut indent = String::new();
    let mut remaining = target;
    for (i, c) in INDENT_FILL.iter().copied().enumerate() {
        let w = width(c);
        if w <= 0.05 {
            continue;
        }
        let last = i == INDENT_FILL.len() - 1;
        let count = if last {
            (remaining / w).ceil()
        } else {
            (remaining / w).floor()
        }
        .max(0.0) as usize;
        indent.extend(std::iter::repeat_n(c, count));
        remaining -= count as f32 * w;
        if remaining <= 0.01 {
            break;
        }
    }
    if remaining > 0.01 {
        // The finest space this font has, once more, so the slot is never narrower than the number.
        indent.push(' ');
    }
    indent
}
/// The website's `leading-7` remains 28px throughout its 85–130% text-size range.
fn line_height(_size: f32) -> f32 {
    28.0
}
/// Places the badge so its baseline sits 0.35em above the first line's baseline.
pub(crate) fn badge_top(size: f32, line: f32) -> f32 {
    let text_baseline = (line - 1.15 * size) / 2.0 + 0.9 * size;
    let badge_baseline = (12.0 - 1.302 * BADGE_SIZE) / 2.0 + 0.992 * BADGE_SIZE;
    (text_baseline - BADGE_RAISE - badge_baseline).max(0.0)
}

impl App {
    /// The reader column's width including the verses' 8px outer margins, or `None` for full width.
    fn column_width(&self) -> Option<f32> {
        let simple = self.focus;
        match self.preferences.text_width {
            TextWidth::Comfortable => Some(if simple { 672.0 } else { 896.0 } + 16.0),
            TextWidth::Wide => Some(if simple { 1024.0 } else { 1408.0 } + 16.0),
            TextWidth::Full => None,
        }
    }
    /// Whether opening the study panel narrows the text enough to re-wrap it.
    pub(crate) fn panel_reflows(&self) -> bool {
        self.column_width()
            .is_none_or(|w| self.reader_width(true) - self.reader_side() < w)
    }
    /// Horizontal padding around the reader column; the verses' 8px outer margins sit inside it.
    fn reader_side(&self) -> f32 {
        if self.preferences.text_width == TextWidth::Full {
            24.0 - 8.0
        } else {
            (self.window_width * 0.026).clamp(16.0, 32.0) - 8.0
        }
    }
    fn panel_inset(&self) -> f32 {
        shell_inset(self.window_width).min(32.0)
    }
    /// The width the reader's scroll area gets, with or without the study panel beside it.
    fn reader_width(&self, panel: bool) -> f32 {
        // In the phone layout the panel floats over the text, which keeps its width.
        if panel && !self.phone() {
            self.window_width - PANEL_WIDTH - PANEL_GAP - self.panel_inset()
        } else {
            self.window_width
        }
    }

    pub(crate) fn view(&self) -> Element<'_, Message> {
        let p = self.p();
        if self.store.is_none() {
            return container(
                column![
                    header::wordmark(p, 38.),
                    text("Your study data could not be opened.").size(18),
                    text(self.error.as_deref().unwrap_or("Unknown storage error")).color(p.accent),
                    button("Try again").on_press(Message::Retry)
                ]
                .spacing(20)
                .max_width(660),
            )
            .center_x(Fill)
            .center_y(Fill)
            .into();
        }
        let content = match self.screen {
            _ if self.content_hidden() => self.hidden_content_view(),
            Screen::Reader => self.reader(),
            Screen::Library => self.library_page_view(),
            Screen::Journal => self.journal_view(),
            Screen::Guides => self.guides_view(),
            Screen::Settings => self.settings_view(),
            Screen::SignIn => self.sign_in_view(),
            Screen::Plans => self.plans_view(),
        };
        // The phone layout's docked navigation keeps the bottom of the window; pages end above it.
        let docked = self.phone() && !(self.focus && self.screen == Screen::Reader);
        let content: Element<'_, Message> = if docked {
            container(content)
                .padding(Padding::ZERO.bottom(header::BOTTOM_NAV_CLEAR))
                .into()
        } else {
            content
        };
        // Stable layers, so opening a panel or animating the header never resets the reader's scroll position:
        // the page, a click-away layer under the header, the header, then panels and notices.
        let shade: Element<'_, Message> = if self.popover.is_some() {
            mouse_area(container(space()).width(Fill).height(Fill))
                .on_press(Message::ClosePopover)
                .into()
        } else {
            space().into()
        };
        let header: Element<'_, Message> = if self.focus && self.screen == Screen::Reader {
            space().into()
        } else {
            self.header()
        };
        let mut layers = stack![content, shade, header, self.overlay()]
            .width(Fill)
            .height(Fill);
        // The full-screen Your Bibles dialog covers everything, header included, as a modal `<dialog>` does.
        if let Some(dialog) = self.bibles_dialog() {
            layers = layers.push(dialog);
        }
        // So does the journal's goal editor (`showModal`).
        if self.screen == Screen::Journal
            && let Some(goals) = self.journal.goal_draft
        {
            layers = layers.push(self.goal_dialog(goals));
        }
        // Frames keep coming while the header, journal or Settings tabs move, or a selection drags the page along.
        if self.motion.is_animating(self.now)
            || self.journal.motion.is_animating(self.now)
            || self.journal.snap_list
            || self.settings_motion.is_animating(self.now)
            || (self.edge_scroll != 0.0 && self.drag.as_ref().is_some_and(|d| d.dragging))
        {
            layers = layers.push(crate::ticker::ticker());
        }
        crate::pointer::tracked(layers, &self.pointer).into()
    }

    fn overlay(&self) -> Element<'_, Message> {
        let p = self.p();
        let mut layers = stack![].width(Fill).height(Fill);
        // The docked navigation is under every panel, drawer and menu, as the website's dialogs cover it.
        if self.phone() && !(self.focus && self.screen == Screen::Reader) {
            layers = layers.push(self.bottom_nav());
        }
        if self.popover == Some(Popover::Contents) {
            layers = layers.push(self.contents_drawer());
        } else if let Some(popover) = self.popover {
            let (panel, width, right) = match popover {
                Popover::Search => (self.search_view(), 352.0, true),
                Popover::Library | Popover::Chapters => (self.library_view(), 600.0, true),
                Popover::ReaderSettings => (self.reader_settings(), 384.0, true),
                Popover::AppSettings => (self.account_menu(), 256.0, false),
                // Drawn as the drawer above.
                Popover::Contents => (space().into(), 0.0, false),
                Popover::LessonLog => (self.lesson_log_panel(), 340.0, true),
            };
            let inset = shell_inset(self.window_width);
            let width: f32 = f32::min(width, self.window_width - 2.0 * inset);
            layers = layers.push(
                container(container(opaque(panel)).width(width))
                    .padding(Padding {
                        top: TOP + PILL_HEIGHT + 8.0,
                        right: inset,
                        bottom: if self.phone() {
                            header::BOTTOM_NAV_CLEAR + 8.0
                        } else {
                            24.0
                        },
                        left: inset,
                    })
                    .width(Fill)
                    .height(Fill)
                    .align_x(if right {
                        Horizontal::Right
                    } else {
                        Horizontal::Left
                    }),
            );
        }
        if self.focus && self.screen == Screen::Reader {
            let exit = button(
                row![
                    icon(&icons::EYE_SLASH, p.ink, 14.),
                    text("Exit simple mode")
                        .size(13.6)
                        .font(sans(font::Weight::Semibold))
                ]
                .spacing(8)
                .align_y(Center),
            )
            .padding([0, 16])
            .height(44)
            .on_press(Message::ToggleFocus)
            .style(move |_, status| button::Style {
                background: Some(
                    if matches!(status, button::Status::Hovered) {
                        p.hover
                    } else {
                        p.card
                    }
                    .into(),
                ),
                text_color: p.ink,
                border: Border {
                    color: p.rule,
                    width: 1.,
                    radius: 999.0.into(),
                },
                shadow: design::soft_shadow(p),
                ..Default::default()
            });
            layers = layers.push(
                container(exit)
                    .padding(16)
                    .width(Fill)
                    .height(Fill)
                    .align_x(Horizontal::Right)
                    .align_y(Vertical::Bottom),
            );
        }
        if self.screen == crate::Screen::Guides
            && let Some(bar) = self.guide_bar()
        {
            layers = layers.push(
                container(opaque(bar))
                    .padding(24)
                    .width(Fill)
                    .height(Fill)
                    .align_x(Horizontal::Center)
                    .align_y(Vertical::Bottom),
            );
        }
        if self.screen == crate::Screen::Reader
            && !self.content_hidden()
            && let Some(menu) = self.selection_menu()
        {
            layers = layers.push(menu);
        }
        if self.screen == Screen::Settings
            && let Some(viewer) = self.release_viewer()
        {
            layers = layers.push(viewer);
        }
        if let Some(error) = &self.error {
            layers = layers.push(
                container(opaque(
                    container(
                        row![
                            text(error.as_str()).size(13).color(p.accent).width(Fill),
                            button(text("Dismiss").size(13))
                                .padding([6, 10])
                                .on_press(Message::DismissError)
                                .style(design::quiet(p))
                        ]
                        .spacing(12)
                        .align_y(Center),
                    )
                    .padding([8, 14])
                    .max_width(640)
                    .style(design::popover(p)),
                ))
                .padding(Padding {
                    top: 24.0,
                    right: 24.0,
                    bottom: if self.phone() {
                        header::BOTTOM_NAV_CLEAR + 8.0
                    } else {
                        24.0
                    },
                    left: 24.0,
                })
                .width(Fill)
                .height(Fill)
                .align_x(Horizontal::Center)
                .align_y(Vertical::Bottom),
            );
        }
        layers.into()
    }

    /// `AppMain`'s notice in place of a page this faith tradition hides.
    fn hidden_content_view(&self) -> Element<'_, Message> {
        let p = self.p();
        let link = |label: &'static str, m: Message| {
            button(design::underlined(label, 16., p.ink, font::Weight::Normal))
                .padding(0)
                .on_press(m)
                .style(design::link(p.ink))
        };
        let card = container(
            column![
                text("Content hidden by your faith tradition")
                    .size(20)
                    .font(sans(font::Weight::Semibold)),
                text("You can change your faith tradition in Settings → Reading.").size(16),
                row![
                    link(
                        "Browse the Bible",
                        Message::Library(crate::library_ui::LibraryMsg::Show(
                            crate::library_ui::LibraryPage::Home
                        ))
                    ),
                    link(
                        "Settings",
                        Message::SettingsTab(crate::settings_ui::SettingsTab::Reading)
                    ),
                ]
                .spacing(16)
                .padding(Padding::ZERO.top(8)),
            ]
            .spacing(8),
        )
        .padding(24)
        .width(Fill)
        .id("content-hidden")
        .style(design::card(p, 12.0));
        let inset = shell_inset(self.window_width);
        container(container(card).max_width(1180))
            .center_x(Fill)
            .padding(Padding {
                top: CONTENT_TOP + 8.0,
                right: inset,
                bottom: 48.0,
                left: inset,
            })
            .into()
    }

    pub(crate) fn scroll<'a>(
        &self,
        content: impl Into<Element<'a, Message>>,
    ) -> iced::widget::Scrollable<'a, Message> {
        let p = self.p();
        // A slim scrollbar drawn over the page edge, so it never shifts the centered column.
        scrollable(content)
            .direction(scrollable::Direction::Vertical(
                scrollable::Scrollbar::new()
                    .width(6)
                    .scroller_width(6)
                    .margin(2),
            ))
            .style(move |theme, status| {
                let mut style = scrollable::default(theme, status);
                style.vertical_rail.background = None;
                style.vertical_rail.border = Border::default();
                style.vertical_rail.scroller.background = p.rule.into();
                style.vertical_rail.scroller.border = Border {
                    radius: 3.0.into(),
                    ..Default::default()
                };
                style
            })
    }

    fn reader(&self) -> Element<'_, Message> {
        let p = self.p();
        let font = self.reading_font();
        let size = self.preferences.font_size;
        let line = line_height(size);
        let mut passage = column![].spacing(12);
        if self.focus {
            passage = passage.push(
                container(
                    text(self.reference())
                        .font(serif())
                        .size(20)
                        .color(p.faint)
                        .center()
                        .width(Fill),
                )
                .padding(Padding::ZERO.bottom(12)),
            );
        }
        if let Some(notices) = self.comparison_notices() {
            passage = passage.push(notices);
        }
        if let Some(status) = self.jst_status() {
            passage = passage.push(status);
        }
        for card in self.jst_leading_cards() {
            passage = passage.push(card);
        }
        // The reading log's passages: a rule down their verses and a check at each one's first verse.
        let read = self.read_passages();
        let mut verses = column![];
        for (index, verse) in self.verses.iter().enumerate() {
            let row = self.verse_row(index, verse.number, font, size, line);
            // The gap between verses belongs to the verse above, so a passage's rule runs across it.
            let gap = if index + 1 < self.verses.len() {
                VERSE_GAP
            } else {
                0.0
            };
            let row = container(row).padding(Padding::ZERO.bottom(gap));
            verses = verses.push(match read.get(&verse.number) {
                Some(run) => {
                    // `.reader-verse[data-read]::before`: from 2rem down on the first verse, to 0.5rem above the end
                    // of the last; the check (`.verse-read-marker`) at -0.75rem, 0.375rem.
                    let top = if run.start == verse.number { 32.0 } else { 0.0 };
                    let bottom = if run.end == verse.number {
                        8.0 + gap
                    } else {
                        0.0
                    };
                    let mut m = margin::margin(row).rule(top, bottom, self.read_color());
                    if run.start == verse.number {
                        m = m.marker(self.read_marker(run), Vector::new(-12.0, 6.0));
                    }
                    m.into()
                }
                None => Element::from(row),
            });
        }
        passage = passage.push(verses);
        if self.focus {
            passage = passage.push(self.chapter_links());
        }
        let passage = match self.column_width() {
            Some(width) => container(passage).max_width(width),
            None => container(passage).width(Fill),
        };
        let gutter = (self.window_width * 0.026).clamp(16.0, 32.0);
        let side = self.reader_side();
        let panel_open = (!self.selected.is_empty() || self.log_open || self.tools.panel.is_some())
            && !self.focus;
        let mut page = column![];
        let top = if self.focus {
            // Simple mode: the wordmark alone, scrolling with the page, as on the website.
            page = page.push(
                container(
                    container(header::wordmark(p, 24.))
                        .padding([8.8, 16.8])
                        .height(44)
                        .center_y(44)
                        .style(design::pill(p)),
                )
                .padding(Padding::ZERO.left(gutter).top(20.)),
            );
            40.0
        } else {
            CONTENT_TOP
        };
        page = page.push(container(passage).center_x(Fill).padding(Padding {
            top,
            // Beside the study panel, the panel's gap stands in for the right gutter.
            right: if panel_open && !self.phone() {
                0.0
            } else {
                side
            },
            bottom: 96.0,
            left: side,
        }));
        let reader = self
            .scroll(page)
            .id("reader")
            .on_scroll(|v| Message::ReaderScrolled(v.absolute_offset().y))
            .width(Fill)
            .height(Fill);
        if self.phone() {
            // Too narrow for the panel beside the text: it floats over it at the right, as a sheet.
            let mut layers = stack![reader].width(Fill).height(Fill);
            if panel_open {
                layers = layers.push(
                    container(opaque(
                        self.tools_panel().unwrap_or_else(|| self.study_panel()),
                    ))
                    .padding(Padding {
                        top: CONTENT_TOP,
                        right: self.panel_inset(),
                        bottom: 16.0,
                        left: self.panel_inset(),
                    })
                    .width(Fill)
                    .height(Fill)
                    .align_x(Horizontal::Right),
                );
            }
            return layers.into();
        }
        // Both slots are always present so opening study tools never discards the reader's scroll state.
        let panel: Element<'_, Message> = if panel_open {
            container(self.tools_panel().unwrap_or_else(|| self.study_panel()))
                .padding(Padding {
                    top: CONTENT_TOP,
                    right: self.panel_inset(),
                    bottom: 16.0,
                    left: PANEL_GAP,
                })
                .height(Fill)
                .into()
        } else {
            container(space()).width(0).height(Fill).into()
        };
        row![reader, panel].spacing(0).height(Fill).into()
    }

    fn verse_row(
        &self,
        index: usize,
        number: u32,
        font: Font,
        size: f32,
        line: f32,
    ) -> Element<'_, Message> {
        let p = self.p();
        if let Some(row) = self.jst_row(number) {
            return self.jst_verse_row(index, number, row, font, size, line);
        }
        let selected = self.selected.contains(&number);
        let annotation = self.annotations.iter().find(|a| a.verse == number);
        let bookmarked = annotation.is_some_and(|a| a.bookmarked);
        let has_note = annotation.is_some_and(|a| !a.note.trim().is_empty());
        let verse_text = &self.verses[index].text;
        // Read against other Bibles, the verse shows the Comparison view instead of its plain text.
        let comparisons = self.verse_comparisons(number, verse_text);
        let (size, line) = if comparisons.is_empty() {
            (size, line)
        } else {
            (14.0, 24.0)
        };
        let words: Element<'_, Message> = if !comparisons.is_empty() {
            let prefix = verse_indent(&number.to_string(), font, size);
            self.comparison_text(index, &prefix, comparisons, font)
        } else {
            match self.verse_shown(index) {
                Some(shown) => self.verse_words(index, shown, font, size, line),
                None => space().into(),
            }
        };
        let label = number.to_string();
        let digits_width = design::measure(&label, BADGE_SIZE, badge_font());
        let mut badge = column![
            text(label)
                .size(BADGE_SIZE)
                .font(badge_font())
                .line_height(LineHeight::Absolute(12.0.into()))
                .color(if selected { p.ink } else { p.accent })
                .wrapping(Wrapping::None)
        ]
        .spacing(2.3);
        if selected {
            badge = badge.push(
                container(space())
                    .width(digits_width)
                    .height(2)
                    .style(move |_| container::Style {
                        background: Some(p.accent.into()),
                        ..Default::default()
                    }),
            );
        }
        let slot = (digits_width.max(BADGE_SLOT) + BADGE_MARGIN).round();
        let number_button =
            button(container(badge).padding(Padding::ZERO.top(badge_top(size, line))))
                .padding(0)
                .width(slot)
                .height(line)
                .on_press(Message::SelectVerse(number))
                .style(|_, _| button::Style::default());
        let mut markers = column![].spacing(6).align_x(Center);
        if bookmarked {
            markers = markers.push(icon(&icons::BOOKMARK, p.accent, 12.));
        }
        if has_note {
            markers = markers.push(icon(&icons::NOTE_STICKY, p.muted, 12.));
        }
        let path_marker = self.path_marker(number);
        let has_path = path_marker.is_some();
        if let Some(marker) = path_marker {
            markers = markers.push(marker);
        }
        // The website's "Note" / "N notes" link to the journal notes that link this passage.
        let note_marker = self.note_link_marker(number);
        let has_link = note_marker.is_some();
        if let Some(marker) = note_marker {
            markers = markers.push(marker);
        }
        let raised = if has_path || has_link { 8.0 } else { 0.0 };
        let marker_slot = if bookmarked || has_note || has_path || has_link {
            container(markers).padding(
                Padding::ZERO
                    .left(8)
                    .top(((line - 12.0) / 2.0 - raised).max(0.0)),
            )
        } else {
            container(space()).width(0)
        };
        // The note picker floats over the page (see `note_links::floating`), so opening it moves nothing.
        let verse_line =
            row![stack![words, number_button], marker_slot].align_y(iced::Alignment::Start);
        container(verse_line)
            .id(format!("verse-{number}"))
            .padding([8, 12])
            .width(Fill)
            .style(move |_| container::Style {
                background: if selected { Some(p.hover.into()) } else { None },
                border: Border {
                    radius: 6.0.into(),
                    color: if selected { p.rule } else { Color::TRANSPARENT },
                    width: if selected { 2.0 } else { 0. },
                },
                ..Default::default()
            })
            .into()
    }

    /// A verse's words as selectable text, with the reader's highlights and underlines painted on exactly the
    /// marked words and the selection over them. `shown` maps what is displayed back to the verse's text.
    pub(crate) fn verse_words<'a>(
        &'a self,
        index: usize,
        shown: Shown<'a>,
        font: Font,
        size: f32,
        line: f32,
    ) -> Element<'a, Message> {
        let p = self.p();
        let dark = self.preferences.dark;
        let number = self.verses[index].number;
        let text = self.verses[index].text.as_str();
        let mut paints = vec![];
        if let Some(a) = self
            .annotations
            .iter()
            .find(|a| a.verse == number && a.is_marked())
        {
            for s in marks::segments(&a.marks, text) {
                if s.highlight.is_none() && s.underline.is_none() {
                    continue;
                }
                for range in shown.map.displayed(s.start..s.end) {
                    paints.push(Paint {
                        range,
                        highlight: s.highlight.as_ref().map(|c| c.highlight(dark)),
                        underline: s.underline.as_ref().map(|c| c.underline(dark)),
                    });
                }
            }
        }
        let selection = self
            .drag
            .as_ref()
            .and_then(|d| d.in_block(Area::Reader, index, shown.map.len()));
        let dragging = self
            .drag
            .as_ref()
            .is_some_and(|d| d.dragging && d.area == Area::Reader);
        select_text(shown.pieces, size, line, font, p.ink)
            .paints(paints)
            .selection(selection, Color { a: 0.55, ..p.gold })
            .dragging(dragging)
            .on_pick(move |at, phase| Message::Pick(Area::Reader, index, at, phase))
            .into()
    }

    /// Previous and next at the end of the chapter, in the website's simple-mode chapter link style.
    fn chapter_links(&self) -> Element<'_, Message> {
        let p = self.p();
        let link = |label: &'static str, message: Option<Message>| -> Element<'_, Message> {
            match message {
                Some(message) => button(text(label).size(14.4).font(sans(font::Weight::Semibold)))
                    .padding([0, 4])
                    .height(44)
                    .on_press(message)
                    .style(move |_, status| button::Style {
                        background: None,
                        text_color: if matches!(status, button::Status::Hovered) {
                            p.ink
                        } else {
                            p.muted
                        },
                        ..Default::default()
                    })
                    .into(),
                None => space().into(),
            }
        };
        let previous =
            store::adjacent(&self.books, &self.preferences.last, -1).map(|_| Message::Adjacent(-1));
        let next =
            store::adjacent(&self.books, &self.preferences.last, 1).map(|_| Message::Adjacent(1));
        container(
            row![
                link("← Previous", previous),
                space::horizontal(),
                link("Next →", next)
            ]
            .align_y(Center),
        )
        .padding(Padding::ZERO.top(36).left(4).right(4))
        .into()
    }

    fn study_panel(&self) -> Element<'_, Message> {
        let p = self.p();
        let close = button(
            container(icon(&icons::XMARK, p.ink, 14.))
                .center_x(32)
                .center_y(32),
        )
        .padding(0)
        .on_press(Message::ToggleLog)
        .style(design::circle(p));
        let mut panel = column![].spacing(14);
        if self.selected.is_empty() {
            panel = panel.push(
                row![
                    column![
                        text("Log").size(15).font(sans(font::Weight::Semibold)),
                        text(self.reference()).size(13).color(p.muted)
                    ]
                    .spacing(2),
                    space::horizontal(),
                    close
                ]
                .align_y(Center),
            );
            let read = self.read;
            panel = panel.push(
                button(
                    row![
                        icon(&icons::CHECK, if read { p.paper } else { p.read }, 13.),
                        text(if read {
                            "Chapter read"
                        } else {
                            "Mark chapter read"
                        })
                        .size(13)
                        .font(sans(font::Weight::Semibold))
                    ]
                    .spacing(8)
                    .align_y(Center),
                )
                .padding([9, 12])
                .width(Fill)
                .on_press(Message::MarkRead)
                .style(move |_, status| button::Style {
                    background: Some(
                        if read {
                            p.read
                        } else if matches!(status, button::Status::Hovered) {
                            p.hover
                        } else {
                            p.soft
                        }
                        .into(),
                    ),
                    text_color: if read { p.paper } else { p.ink },
                    border: Border {
                        radius: 11.2.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                }),
            );
            let marked: Vec<_> = self.annotations.iter().filter(|a| !a.is_empty()).collect();
            if marked.is_empty() {
                panel = panel.push(
                    text("No notes or marks in this chapter.")
                        .size(13)
                        .color(p.muted),
                );
            } else {
                let mut list = column![].spacing(2);
                for a in marked {
                    let mut title = row![
                        text(format!("Verse {}", a.verse))
                            .size(13)
                            .font(sans(font::Weight::Semibold)),
                        space::horizontal()
                    ]
                    .spacing(6)
                    .align_y(Center);
                    for (kind, color) in [
                        (marks::MarkKind::Highlight, a.marks.highlight.as_ref()),
                        (marks::MarkKind::Underline, a.marks.underline.as_ref()),
                    ] {
                        if let Some(color) = color {
                            title = title.push(crate::view_marks::sample(
                                kind,
                                color,
                                self.preferences.dark,
                                p.ink,
                            ));
                        }
                    }
                    if !a.marks.text_marks.is_empty() {
                        title = title.push(icon(&icons::HIGHLIGHTER, p.accent, 12.));
                    }
                    if a.bookmarked {
                        title = title.push(icon(&icons::BOOKMARK, p.accent, 12.));
                    }
                    let mut item = column![title].spacing(4);
                    let note = a.note.trim();
                    if !note.is_empty() {
                        let preview = if note.chars().count() > 140 {
                            format!("{}…", note.chars().take(140).collect::<String>())
                        } else {
                            note.to_string()
                        };
                        item = item.push(text(preview).size(13).color(p.muted));
                    }
                    list = list.push(
                        button(item)
                            .padding([8, 10])
                            .width(Fill)
                            .style(design::quiet(p))
                            .on_press(Message::Navigate(
                                self.preferences.last.clone(),
                                Some(a.verse),
                            )),
                    );
                }
                panel = panel.push(list);
            }
        } else {
            let selected_text = self
                .verses
                .iter()
                .filter(|v| self.selected.contains(&v.number))
                .map(|v| v.text.as_str())
                .collect::<Vec<_>>()
                .join("\n\n");
            panel = panel
                .push(
                    row![
                        text(self.selected_reference())
                            .font(serif())
                            .size(20)
                            .width(Fill),
                        close
                    ]
                    .align_y(Center),
                )
                .push(
                    self.scroll(
                        text(selected_text)
                            .font(serif())
                            .size(15)
                            .line_height(1.6)
                            .color(p.muted),
                    )
                    .height(Length::Fixed(140.)),
                );
            let action = |glyph: &icons::Icon, label: &'static str, message: Message| {
                button(
                    row![icon(glyph, p.accent, 14.), text(label).size(13)]
                        .spacing(12)
                        .align_y(Center),
                )
                .padding([9, 10])
                .width(Fill)
                .style(design::quiet(p))
                .on_press(message)
            };
            panel = panel.push(
                column![
                    action(
                        if self.copied {
                            &icons::CHECK
                        } else {
                            &icons::COPY
                        },
                        if self.copied {
                            "Copied"
                        } else {
                            "Copy passage"
                        },
                        Message::Copy
                    ),
                    action(
                        &icons::BOOKMARK,
                        if self.selection_bookmarked() {
                            "Remove bookmark"
                        } else {
                            "Bookmark"
                        },
                        Message::Bookmark
                    ),
                    action(
                        &icons::PEN_TO_SQUARE,
                        "Add to a journal note",
                        Message::VersesInJournal
                    ),
                    // Lesson resources are Latter-day Saint study content (`onResources` only for that tradition).
                    if self.show_lds() {
                        Element::from(action(
                            &icons::BOOK_BIBLE,
                            "Resources · Lessons & more",
                            Message::Tools(crate::reader_tools::ToolsMsg::Resources),
                        ))
                    } else {
                        space().height(0).into()
                    },
                    action(
                        if self.copied_link {
                            &icons::CHECK
                        } else {
                            &icons::SHARE_NODES
                        },
                        if self.copied_link {
                            "Share link copied"
                        } else {
                            "Copy share link"
                        },
                        Message::CopyShareLink
                    ),
                ]
                .spacing(2),
            );
            panel = panel.push(self.mark_tools(false));
            let first = self.selected.first().copied().unwrap_or(1);
            panel = panel.push(
                text(if self.selected.len() > 1 {
                    format!("Note · verse {first}")
                } else {
                    "Note".into()
                })
                .size(12)
                .font(sans(font::Weight::Medium))
                .color(p.muted),
            );
            panel = panel.push(
                text_editor(&self.note)
                    .id("verse-note")
                    .placeholder("What stands out to you?")
                    .on_action(Message::EditNote)
                    .size(15)
                    .height(170)
                    .padding(12)
                    .style(move |_, _| text_editor::Style {
                        background: p.card_strong.into(),
                        border: Border {
                            radius: 8.0.into(),
                            width: 1.,
                            color: p.rule,
                        },
                        placeholder: p.faint,
                        value: p.ink,
                        selection: p.gold,
                    }),
            );
            if self.note_dirty {
                panel = panel.push(
                    button(
                        text("Save note")
                            .size(13)
                            .font(sans(font::Weight::Semibold))
                            .center()
                            .width(Fill),
                    )
                    .padding([9, 12])
                    .width(Fill)
                    .on_press(Message::SaveNote)
                    .style(design::active(p)),
                );
            } else if !self.note.text().trim().is_empty() {
                panel = panel.push(
                    row![
                        icon(&icons::CHECK, p.faint, 12.),
                        text("Saved").size(12).color(p.faint)
                    ]
                    .spacing(6)
                    .align_y(Center),
                );
            }
        }
        container(self.scroll(panel))
            .width(PANEL_WIDTH)
            .height(Fill)
            .padding(18)
            .style(move |_| container::Style {
                background: Some(p.card.into()),
                text_color: Some(p.ink),
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 16.0.into(),
                },
                shadow: design::soft_shadow(p),
                ..Default::default()
            })
            .into()
    }

    fn library_view(&self) -> Element<'_, Message> {
        let p = self.p();
        let mut volumes = column![].spacing(2);
        let mut seen: Vec<(&str, &str)> = Vec::new();
        for b in &self.books {
            // Other denominations see the Bible's volumes only (`ScriptureQuickNav`).
            if !seen.iter().any(|(id, _)| *id == b.volume)
                && (self.show_lds() || !crate::faith::is_lds_volume(&b.volume))
            {
                seen.push((b.volume.as_str(), b.volume_title.as_str()));
            }
        }
        for (id, title) in seen {
            let chosen = self.library_volume == id;
            let b = button(text(title).size(13))
                .padding([8, 12])
                .width(Fill)
                .on_press(Message::LibraryVolume(id.to_string()));
            volumes = volumes.push(if chosen {
                b.style(design::active(p))
            } else {
                b.style(design::quiet(p))
            });
        }
        let detail: Element<'_, Message> = match self.library_book.as_ref().and_then(|id| {
            self.books
                .iter()
                .find(|b| b.volume == self.library_volume && &b.id == id)
        }) {
            Some(book) => {
                let mut grid = column![].spacing(6);
                let mut line = row![].spacing(6);
                for n in 1..=book.chapters {
                    let current = book.volume == self.preferences.last.volume
                        && book.id == self.preferences.last.book
                        && n == self.preferences.last.chapter;
                    let b = button(text(n.to_string()).size(13).center().width(Fill))
                        .width(42)
                        .padding([9, 0])
                        .on_press(Message::Navigate(
                            Location {
                                volume: book.volume.clone(),
                                book: book.id.clone(),
                                chapter: n,
                            },
                            None,
                        ));
                    line = line.push(if current {
                        b.style(design::active(p))
                    } else {
                        b.style(move |_, status| button::Style {
                            background: Some(
                                if matches!(status, button::Status::Hovered) {
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
                                radius: 8.0.into(),
                            },
                            ..Default::default()
                        })
                    });
                    if n % 8 == 0 {
                        grid = grid.push(line);
                        line = row![].spacing(6);
                    }
                }
                if book.chapters % 8 != 0 {
                    grid = grid.push(line);
                }
                column![
                    row![
                        button(
                            container(icon(&icons::CHEVRON_LEFT, p.ink, 12.))
                                .center_x(28)
                                .center_y(28)
                        )
                        .padding(0)
                        .on_press(Message::LibraryBook(None))
                        .style(design::circle(p)),
                        text(&book.label).font(serif()).size(20)
                    ]
                    .spacing(8)
                    .align_y(Center),
                    // Scrolls once the grid is taller than the panel allows (Psalms has 150 chapters).
                    self.scroll(grid).height(
                        (book.chapters.div_ceil(8) as f32 * 42.0 - 6.0).min(LIBRARY_HEIGHT - 52.0)
                    )
                ]
                .spacing(12)
                .into()
            }
            None => {
                let mut list = column![].spacing(1);
                for book in self
                    .books
                    .iter()
                    .filter(|b| b.volume == self.library_volume)
                {
                    let current = book.volume == self.preferences.last.volume
                        && book.id == self.preferences.last.book;
                    list = list.push(
                        button(
                            row![
                                text(&book.label)
                                    .size(13)
                                    .font(sans(if current {
                                        font::Weight::Semibold
                                    } else {
                                        font::Weight::Normal
                                    }))
                                    .width(Fill),
                                text(book.chapters.to_string()).size(11).color(p.faint)
                            ]
                            .align_y(Center),
                        )
                        .padding([7, 10])
                        .width(Fill)
                        .style(design::quiet(p))
                        .on_press(Message::LibraryBook(Some(book.id.clone()))),
                    );
                }
                let count = self
                    .books
                    .iter()
                    .filter(|b| b.volume == self.library_volume)
                    .count();
                self.scroll(list)
                    .height((count as f32 * BOOK_ROW).min(LIBRARY_HEIGHT))
                    .into()
            }
        };
        container(
            row![
                container(volumes).width(180),
                container(space())
                    .width(1)
                    .height(Fill)
                    .style(move |_| container::Style {
                        background: Some(p.rule.into()),
                        ..Default::default()
                    }),
                container(detail).width(Fill)
            ]
            .spacing(12)
            .height(Length::Shrink),
        )
        .padding(12)
        .max_height(LIBRARY_HEIGHT + 24.0)
        .style(design::popover(p))
        .into()
    }

    fn search_view(&self) -> Element<'_, Message> {
        let p = self.p();
        let input = text_input("Search scriptures or a reference", &self.query)
            .id("search")
            .on_input(Message::SearchInput)
            .on_submit(Message::SubmitSearch)
            .size(15)
            .padding([10, 4])
            .style(move |_, _| text_input::Style {
                background: Color::TRANSPARENT.into(),
                border: Border::default(),
                icon: p.muted,
                placeholder: p.faint,
                value: p.ink,
                selection: p.gold,
            });
        let mut scopes = row![].spacing(4).align_y(Center);
        for (scope, label) in [
            (None, "All"),
            (Some("oldtestament"), "OT"),
            (Some("newtestament"), "NT"),
            (Some("bookofmormon"), "BoM"),
            (Some("doctrineandcovenants"), "D&C"),
            (Some("pearl"), "PGP"),
        ] {
            if scope.is_some_and(crate::faith::is_lds_volume) && !self.show_lds() {
                continue;
            }
            let chosen = self.scope.as_deref() == scope;
            let b = button(text(label).size(12))
                .padding([5, 9])
                .on_press(Message::SearchScope(scope.map(String::from)));
            scopes = scopes.push(if chosen {
                b.style(design::active(p))
            } else {
                b.style(design::quiet(p))
            });
        }
        let mut contents = column![
            container(
                row![icon(&icons::MAGNIFYING_GLASS, p.muted, 14.), input]
                    .spacing(8)
                    .align_y(Center)
            )
            .padding([0, 12])
            .style(move |_| container::Style {
                background: Some(p.card_strong.into()),
                border: Border {
                    color: p.rule,
                    width: 1.,
                    radius: 999.0.into(),
                },
                ..Default::default()
            }),
            scopes
        ]
        .spacing(10);
        if !self.query.trim().is_empty() {
            let mut results = column![].spacing(2);
            if self.searching && self.results.hits.is_empty() {
                results = results.push(text("Searching…").size(13).color(p.muted));
            } else if self.results.hits.is_empty() {
                results = results.push(text("No passages found").size(13).color(p.muted));
            } else {
                results = results.push(
                    container(
                        text(format!(
                            "{}{} passages",
                            self.results.hits.len(),
                            if self.results.more { "+" } else { "" }
                        ))
                        .size(11)
                        .color(p.faint),
                    )
                    .padding([2, 10]),
                );
                for hit in &self.results.hits {
                    let preview = if hit.text.chars().count() > 160 {
                        format!("{}…", hit.text.chars().take(160).collect::<String>())
                    } else {
                        hit.text.clone()
                    };
                    results = results.push(
                        button(
                            column![
                                text(&hit.reference)
                                    .size(13)
                                    .font(sans(font::Weight::Semibold)),
                                text(preview)
                                    .font(serif())
                                    .size(14)
                                    .line_height(1.5)
                                    .color(p.muted)
                            ]
                            .spacing(3),
                        )
                        .padding([8, 10])
                        .width(Fill)
                        .style(design::quiet(p))
                        .on_press(Message::Navigate(hit.location.clone(), Some(hit.verse))),
                    );
                }
            }
            contents = contents.push(self.scroll(results).height(Length::Shrink));
        }
        container(contents)
            .padding(12)
            .max_height(520)
            .style(design::popover(p))
            .into()
    }

    pub(crate) fn setting_label<'a>(
        &self,
        label: impl text::IntoFragment<'a>,
    ) -> Element<'a, Message> {
        text(label)
            .size(12)
            .font(sans(font::Weight::Medium))
            .color(self.p().muted)
            .into()
    }

    pub(crate) fn segmented<'a, T: Copy + PartialEq + 'a>(
        &self,
        options: &[(T, &'static str)],
        current: T,
        message: impl Fn(T) -> Message + 'a,
    ) -> Element<'a, Message> {
        let p = self.p();
        let mut line = row![];
        for (i, (value, label)) in options.iter().copied().enumerate() {
            if i > 0 {
                line = line.push(container(space()).width(1).height(32).style(move |_| {
                    container::Style {
                        background: Some(p.rule.into()),
                        ..Default::default()
                    }
                }));
            }
            line = line.push(
                button(text(label).size(13).center().width(Fill))
                    .padding([7, 12])
                    .height(32)
                    .width(Fill)
                    .on_press(message(value))
                    .style(design::segment(p, value == current)),
            );
        }
        container(line)
            .clip(true)
            .style(move |_| container::Style {
                border: Border {
                    color: p.rule,
                    width: 1.,
                    radius: 6.0.into(),
                },
                ..Default::default()
            })
            .into()
    }

    fn reader_settings(&self) -> Element<'_, Message> {
        let p = self.p();
        let on = self.focus;
        // The website's marker switch: 48 × 27, gold when on.
        let switch = button(
            container(container(space()).width(17.6).height(17.6).style(move |_| {
                container::Style {
                    background: Some(if on { p.ink } else { p.card }.into()),
                    border: Border {
                        color: p.rule,
                        width: 1.,
                        radius: 999.0.into(),
                    },
                    ..Default::default()
                }
            }))
            .padding(Padding::ZERO.left(if on { 24.8 } else { 3.2 }))
            .center_y(27.2),
        )
        .width(48)
        .height(27.2)
        .padding(0)
        .on_press(Message::ToggleFocus)
        .style(move |_, _| button::Style {
            background: Some(if on { p.gold } else { p.card }.into()),
            border: Border {
                color: p.rule,
                width: 1.,
                radius: 999.0.into(),
            },
            ..Default::default()
        });
        let size = self.preferences.font_size;
        let percent = (size / store::DEFAULT_FONT_SIZE * 100.0).round();
        let rule = || {
            container(space())
                .height(1)
                .width(Fill)
                .style(move |_| container::Style {
                    background: Some(p.rule.into()),
                    ..Default::default()
                })
        };
        container(
            column![
                row![
                    column![
                        self.setting_label("Simple mode"),
                        text("Hide study tools and navigation. Just the text.")
                            .size(11)
                            .color(p.faint)
                    ]
                    .spacing(2)
                    .width(Fill),
                    switch
                ]
                .spacing(12)
                .align_y(Center),
                rule(),
                column![
                    self.setting_label(format!("Text size - {percent}%")),
                    slider(
                        store::MIN_FONT_SIZE..=store::MAX_FONT_SIZE,
                        size,
                        Message::FontSize
                    )
                    .step(store::DEFAULT_FONT_SIZE * 0.01)
                ]
                .spacing(8),
                column![
                    self.setting_label("Typeface"),
                    self.segmented(
                        &[(true, "Serif"), (false, "Sans")],
                        self.preferences.serif,
                        Message::SetSerif
                    )
                ]
                .spacing(8),
                column![
                    self.setting_label("Text width"),
                    self.segmented(
                        &[
                            (TextWidth::Comfortable, "Comfortable"),
                            (TextWidth::Wide, "Wide"),
                            (TextWidth::Full, "Full")
                        ],
                        self.preferences.text_width,
                        Message::SetTextWidth
                    )
                ]
                .spacing(8),
                column![
                    self.setting_label("Comparison view"),
                    self.segmented(
                        &[(false, "Inline"), (true, "Side by side")],
                        self.preferences.side_by_side,
                        Message::SetSideBySide
                    )
                ]
                .spacing(8),
            ]
            .push(match self.bibles_settings(true) {
                Some(b) => Element::from(column![rule(), b].spacing(16)),
                None => space().height(0).into(),
            })
            // `/account#reading`, closing the panel.
            .push(column![
                rule(),
                space().height(12),
                button(
                    text("All settings")
                        .size(12)
                        .font(sans(font::Weight::Medium))
                )
                .padding(0)
                .height(36)
                .on_press(Message::SettingsTab(
                    crate::settings_ui::SettingsTab::Reading
                ))
                .style(move |_, status| button::Style {
                    text_color: if matches!(status, button::Status::Hovered) {
                        p.ink
                    } else {
                        design::fade(p.ink, 0.7)
                    },
                    ..Default::default()
                }),
            ])
            .spacing(16),
        )
        .padding(14)
        .style(design::popover(p))
        .into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn badge_sits_above_the_first_lines_baseline() {
        // At the website's 16px / 28px the badge box starts a few pixels into the first line, never above it.
        let top = badge_top(16.0, 28.0);
        assert!((3.0..8.0).contains(&top), "{top}");
        assert!(badge_top(24.0, line_height(24.0)) > top);
        assert_eq!(line_height(16.0), 28.0);
    }
}
