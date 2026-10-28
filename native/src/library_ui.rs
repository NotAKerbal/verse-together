// The Library (`/browse`), after the website's BrowseSelector: one grid of cards (this week's Come, Follow Me,
// Continue reading where the reader left off, the Journal, then the five volumes with their art), a volume's books
// with their art and categories, and a book's chapters, read ones and the current one marked. Volumes and books
// switch in place; a chapter opens in the reader. The navigation's Browse link opens the Library from the reader,
// and from anywhere else returns to where browsing was left (the reader, or a Library page), as the website does.
use crate::design::{self, Colors, icon, sans, serif};
use crate::header::CONTENT_TOP;
use crate::icons;
use crate::store::Location;
use crate::{App, Message, Screen};
use iced::widget::{button, column, container, image, mouse_area, row, space, stack, text};
use iced::{Alignment::Center, Border, Color, Element, Fill, Length, Padding, Task, font};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

mod art {
    include!(concat!(env!("OUT_DIR"), "/book_art.rs"));
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum LibraryPage {
    #[default]
    Home,
    Volume(String),
    Book(String, String),
}
#[derive(Debug, Clone)]
pub enum LibraryMsg {
    /// The navigation's Browse link.
    Nav,
    Show(LibraryPage),
    Back,
    Chapter(Location),
    Continue,
    Journal,
    ComeFollowMe,
    Hover(Option<String>),
}
fn msg(m: LibraryMsg) -> Message {
    Message::Library(m)
}

/// One-book volumes open straight to their book (`SINGLE_BOOK_VOLUMES`).
fn only_book(volume: &str) -> Option<&'static str> {
    (volume == "doctrineandcovenants").then_some("doctrineandcovenants")
}
/// `BOOK_GROUPS`: each book's category on its volume page.
fn category(volume: &str, book: &str) -> Option<&'static str> {
    const GROUPS: &[(&str, &str, &[&str])] = &[
        (
            "oldtestament",
            "Law",
            &["genesis", "exodus", "leviticus", "numbers", "deuteronomy"],
        ),
        (
            "oldtestament",
            "History",
            &[
                "joshua",
                "judges",
                "ruth",
                "1samuel",
                "2samuel",
                "1kings",
                "2kings",
                "1chronicles",
                "2chronicles",
                "ezra",
                "nehemiah",
                "esther",
            ],
        ),
        (
            "oldtestament",
            "Wisdom",
            &["job", "psalms", "proverbs", "ecclesiastes", "songofsolomon"],
        ),
        (
            "oldtestament",
            "Major Prophets",
            &["isaiah", "jeremiah", "lamentations", "ezekiel", "daniel"],
        ),
        (
            "oldtestament",
            "Minor Prophets",
            &[
                "hosea",
                "joel",
                "amos",
                "obadiah",
                "jonah",
                "micah",
                "nahum",
                "habakkuk",
                "zephaniah",
                "haggai",
                "zechariah",
                "malachi",
            ],
        ),
        (
            "newtestament",
            "Gospels",
            &["matthew", "mark", "luke", "john"],
        ),
        ("newtestament", "History", &["acts"]),
        (
            "newtestament",
            "Pauline Epistles",
            &[
                "romans",
                "1corinthians",
                "2corinthians",
                "galatians",
                "ephesians",
                "philippians",
                "colossians",
                "1thessalonians",
                "2thessalonians",
                "1timothy",
                "2timothy",
                "titus",
                "philemon",
                "hebrews",
            ],
        ),
        (
            "newtestament",
            "General Epistles",
            &[
                "james", "1peter", "2peter", "1john", "2john", "3john", "jude",
            ],
        ),
        ("newtestament", "Apocalypse", &["revelation"]),
        (
            "bookofmormon",
            "Small Plates",
            &["1nephi", "2nephi", "jacob", "enos", "jarom", "omni"],
        ),
        (
            "bookofmormon",
            "Mormon's Record",
            &[
                "wordsofmormon",
                "mosiah",
                "alma",
                "helaman",
                "3nephi",
                "4nephi",
                "mormon",
            ],
        ),
        ("bookofmormon", "Jaredite Record", &["ether"]),
        ("bookofmormon", "Moroni's Writings", &["moroni"]),
        ("pearl", "Moses and Abraham", &["moses", "abraham"]),
        (
            "pearl",
            "Joseph Smith's Writings",
            &[
                "josephsmithmatthew",
                "josephsmithhistory",
                "articlesoffaith",
            ],
        ),
    ];
    GROUPS
        .iter()
        .find(|(v, _, books)| *v == volume && books.contains(&book))
        .map(|(_, label, _)| *label)
}

/// Art bytes by name: the Library cards' scenery (`VOLUME_ART` and the study cards) and each book's art.
fn art_bytes(name: &str) -> Option<&'static [u8]> {
    let card: Option<&'static [u8]> = match name {
        "bookofmormon" => Some(include_bytes!("../../public/art/browse-bookofmormon.webp")),
        "oldtestament" => Some(include_bytes!("../../public/art/browse-oldtestament.webp")),
        "newtestament" => Some(include_bytes!("../../public/art/browse-newtestament.webp")),
        "doctrineandcovenants" => Some(include_bytes!(
            "../../public/art/browse-doctrineandcovenants.webp"
        )),
        "pearl" => Some(include_bytes!("../../public/art/browse-pearl.webp")),
        "come-follow-me" => Some(include_bytes!(
            "../../public/art/browse-come-follow-me.webp"
        )),
        "continue-reading" => Some(include_bytes!(
            "../../public/art/browse-continue-reading.webp"
        )),
        "notes" => Some(include_bytes!("../../public/art/browse-notes.webp")),
        _ => None,
    };
    card.or_else(|| {
        art::BOOK_ART
            .iter()
            .find(|(n, _)| *n == name)
            .map(|(_, b)| *b)
    })
}
/// A square artwork shown `object-fit: cover` (centered) in a `width` × `height` frame. Decoded once.
fn art(
    name: &str,
    width: f32,
    height: f32,
    radius: iced::border::Radius,
) -> Element<'static, Message> {
    static HANDLES: OnceLock<Mutex<HashMap<String, image::Handle>>> = OnceLock::new();
    let Some(bytes) = art_bytes(name) else {
        return space().width(width).height(height).into();
    };
    let handle = HANDLES
        .get_or_init(Default::default)
        .lock()
        .expect("art cache")
        .entry(name.to_string())
        .or_insert_with(|| image::Handle::from_bytes(bytes))
        .clone();
    // The website's art is square; crop the middle of it to the frame.
    let side = 640.0_f32;
    let frame = (width / height.max(1.0)).max(0.01);
    let (cw, ch) = if frame >= 1.0 {
        (side, side / frame)
    } else {
        (side * frame, side)
    };
    let scale = |v: f32| v.round().max(1.0) as u32;
    let size = image_side(name);
    let k = size as f32 / side;
    image(handle)
        .crop(iced::Rectangle {
            x: scale((side - cw) / 2.0 * k).min(size - 1),
            y: scale((side - ch) / 2.0 * k).min(size - 1),
            width: scale(cw * k).min(size),
            height: scale(ch * k).min(size),
        })
        .content_fit(iced::ContentFit::Cover)
        .width(width)
        .height(height)
        .border_radius(radius)
        .into()
}
/// Card scenery is 640px square, book art 256px.
fn image_side(name: &str) -> u32 {
    if art::BOOK_ART.iter().any(|(n, _)| *n == name) {
        256
    } else {
        640
    }
}

/// `ChevronIcon` in its 32px ring (`border-2`, card background).
fn chevron<'a>(p: Colors) -> Element<'a, Message> {
    container(icon(&icons::CHEVRON_RIGHT, p.ink, 13.0))
        .center_x(32)
        .center_y(32)
        .style(move |_| container::Style {
            background: Some(p.card.into()),
            border: Border {
                color: p.rule,
                width: 2.0,
                radius: 999.0.into(),
            },
            ..Default::default()
        })
        .into()
}

impl App {
    pub(crate) fn update_library(&mut self, message: LibraryMsg) -> Task<Message> {
        match message {
            LibraryMsg::Nav => {
                if matches!(self.screen, Screen::Reader | Screen::Library) {
                    self.library = LibraryPage::Home;
                    return self.show_library();
                }
                // Back to where browsing was left, unless that is content this faith tradition hides
                // (`useBrowseNavHref`): then the Library itself.
                let left = if self.browse_in_reader {
                    let l = &self.preferences.last;
                    format!("/browse/{}/{}/{}", l.volume, l.book, l.chapter)
                } else {
                    match &self.library {
                        LibraryPage::Home => "/browse".to_string(),
                        LibraryPage::Volume(v) => format!("/browse/{v}"),
                        LibraryPage::Book(v, b) => format!("/browse/{v}/{b}"),
                    }
                };
                if !self.show_lds() && crate::faith::is_lds_content_path(&left) {
                    self.library = LibraryPage::Home;
                    return self.show_library();
                }
                if self.browse_in_reader {
                    return self.update(Message::SetScreen(Screen::Reader));
                }
                return self.show_library();
            }
            LibraryMsg::Show(page) => {
                // A one-book volume opens its book; a one-chapter book opens its chapter.
                let page = match page {
                    LibraryPage::Volume(v) if only_book(&v).is_some() => {
                        LibraryPage::Book(v.clone(), only_book(&v).unwrap().to_string())
                    }
                    other => other,
                };
                if let LibraryPage::Book(v, b) = &page
                    && self
                        .books
                        .iter()
                        .find(|x| &x.volume == v && &x.id == b)
                        .is_some_and(|x| x.chapters == 1)
                {
                    let l = Location {
                        volume: v.clone(),
                        book: b.clone(),
                        chapter: 1,
                    };
                    return self.navigate(l, None);
                }
                self.library = page;
                return self.show_library();
            }
            LibraryMsg::Back => {
                self.library = match &self.library {
                    LibraryPage::Book(v, _) if only_book(v).is_none() => {
                        LibraryPage::Volume(v.clone())
                    }
                    _ => LibraryPage::Home,
                };
                return self.show_library();
            }
            LibraryMsg::Chapter(l) => return self.navigate(l, None),
            LibraryMsg::Continue => {
                let l = self.preferences.last.clone();
                return self.navigate(l, None);
            }
            LibraryMsg::Journal => return self.update(Message::SetScreen(Screen::Journal)),
            LibraryMsg::ComeFollowMe => {
                self.lessons.open = None;
                return self.update(Message::SetScreen(Screen::Guides));
            }
            LibraryMsg::Hover(card) => self.library_hover = card,
        }
        Task::none()
    }
    fn show_library(&mut self) -> Task<Message> {
        if !self.save_note() || !self.save_journal_note() {
            return Task::none();
        }
        self.focus = false;
        self.popover = None;
        self.library_hover = None;
        // A book's read chapters, read once for its page.
        self.library_read = match (&self.library, &self.store) {
            (LibraryPage::Book(v, b), Some(s)) => s.read_chapters(v, b).unwrap_or_default(),
            _ => vec![],
        };
        self.set_screen(Screen::Library);
        crate::presented(iced::widget::operation::scroll_to(
            "library",
            iced::widget::scrollable::AbsoluteOffset { x: 0.0, y: 0.0 },
        ))
    }

    pub(crate) fn library_page_view(&self) -> Element<'_, Message> {
        let inset = crate::header::shell_inset(self.window_width);
        let body: Element<'_, Message> = match &self.library {
            LibraryPage::Home => self.library_home(),
            LibraryPage::Volume(v) => self.volume_page(v),
            LibraryPage::Book(v, b) => self.book_page(v, b),
        };
        self.scroll(
            container(container(body).max_width(1180.0))
                .center_x(Fill)
                .padding(Padding {
                    top: CONTENT_TOP,
                    right: inset,
                    bottom: 64.0,
                    left: inset,
                }),
        )
        .id("library")
        .width(Fill)
        .height(Fill)
        .into()
    }
    /// `.browse-grid`: one column on phones, two from 640px, three from 1024px.
    fn library_columns(&self) -> usize {
        if self.window_width >= 1024.0 {
            3
        } else if self.window_width >= 640.0 {
            2
        } else {
            1
        }
    }
    fn grid<'a>(&self, cards: Vec<Element<'a, Message>>) -> Element<'a, Message> {
        let columns = self.library_columns();
        let count = cards.len();
        let mut grid = column![].spacing(14.4);
        let mut cards = cards.into_iter().enumerate().peekable();
        while cards.peek().is_some() {
            let mut line = row![].spacing(14.4);
            let mut used = 0;
            while used < columns {
                let Some((i, card)) = cards.next() else { break };
                // A last card alone on a two-column row takes the whole row.
                let lone = columns == 2 && i == count - 1 && count % 2 == 1;
                line =
                    line.push(container(card).width(Length::FillPortion(if lone { 2 } else { 1 })));
                used += if lone { 2 } else { 1 };
            }
            for _ in used..columns {
                line = line.push(space().width(Length::FillPortion(1)));
            }
            grid = grid.push(line);
        }
        grid.into()
    }
    /// `BrowseCard`: a whole-card link with an eyebrow, a chevron, a title and a line beneath, art at the right
    /// fading out to the left.
    fn browse_card<'a>(
        &self,
        key: &str,
        art_name: &str,
        eyebrow: String,
        title: String,
        description: Option<String>,
        message: Message,
    ) -> Element<'a, Message> {
        let p = self.p();
        let hovered = self.library_hover.as_deref() == Some(key);
        let background = if hovered { p.hover } else { p.card };
        let columns = self.library_columns() as f32;
        let inner =
            1180.0_f32.min(self.window_width - 2.0 * crate::header::shell_inset(self.window_width));
        let width = ((inner - 14.4 * (columns - 1.0)) / columns).max(120.0);
        let height = 156.0;
        let media_width = (width * 0.46).round();
        // The art keeps the card's rounded right corners; it starts a pixel in, under the fade's opaque edge.
        let corners = iced::border::Radius {
            top_left: 0.0,
            top_right: 8.6,
            bottom_right: 8.6,
            bottom_left: 0.0,
        };
        let media = container(stack![
            container(art(art_name, media_width - 2.0, height - 2.0, corners))
                .padding(Padding::ZERO.left(2)),
            // `mask-image: linear-gradient(to left, #000 45%, transparent)`: the art fades into the card.
            container(space())
                .width(Fill)
                .height(Fill)
                .style(move |_| container::Style {
                    background: Some(
                        iced::gradient::Linear::new(iced::Degrees(90.0))
                            .add_stop(0.0, background)
                            .add_stop(
                                0.55,
                                Color {
                                    a: 0.0,
                                    ..background
                                }
                            )
                            .into()
                    ),
                    ..Default::default()
                }),
        ])
        .width(media_width)
        .height(height - 2.0);
        let title_size = (16.0 + 0.01 * self.window_width).clamp(19.2, 21.6);
        let mut text_col = column![
            text(title)
                .font(serif())
                .size(title_size)
                .line_height(1.05)
                .color(p.ink)
        ];
        if let Some(d) = description {
            text_col = text_col.push(
                container(
                    text(d)
                        .size(12)
                        .font(sans(font::Weight::Semibold))
                        .color(p.muted),
                )
                .padding(Padding::ZERO.top(4)),
            );
        }
        let content = column![
            row![
                container(
                    text(eyebrow.to_uppercase())
                        .size(10.88)
                        .font(sans(font::Weight::Bold))
                        .color(p.muted)
                )
                .width(Length::FillPortion(62)),
                space().width(Length::FillPortion(38)),
                chevron(p)
            ]
            .align_y(iced::Alignment::Start),
            space().height(Fill),
            container(text_col).width(Length::FillPortion(62)),
        ]
        .padding(20)
        .height(height - 2.0);
        let card = button(
            stack![container(media).width(Fill).align_right(Fill), content]
                .width(Fill)
                .height(height - 2.0),
        )
        .padding(1)
        .width(Fill)
        .height(height)
        .on_press(message)
        .style(move |_, _| button::Style {
            background: Some(background.into()),
            text_color: p.ink,
            border: Border {
                color: if hovered {
                    design::rule_strong(p)
                } else {
                    p.rule
                },
                width: 1.0,
                radius: 9.6.into(),
            },
            ..Default::default()
        });
        let key = key.to_string();
        mouse_area(card)
            .on_enter(msg(LibraryMsg::Hover(Some(key))))
            .on_exit(msg(LibraryMsg::Hover(None)))
            .into()
    }
    /// The Library: study cards first (hidden in simple mode on the website), then the volumes.
    fn library_home(&self) -> Element<'_, Message> {
        let mut cards = vec![];
        // `ComeFollowMeCard`: this week's block, or the guide index outside the schedule.
        let today = crate::store::today();
        let week = self
            .lessons
            .weeks
            .iter()
            .find(|w| w.start <= today && today <= w.end);
        // Come, Follow Me is Latter-day Saint content (`BrowseSelector`).
        let show_lds = self.show_lds();
        cards.extend(show_lds.then(|| match week {
            Some(w) => {
                let guide = crate::lessons::guides()
                    .iter()
                    .any(|g| g.start_date == w.start);
                self.browse_card(
                    "cfm",
                    "come-follow-me",
                    format!("Come, Follow Me · {}", week_range(&w.start, &w.end)),
                    w.block.clone(),
                    Some(
                        if guide {
                            "This week's study guide"
                        } else {
                            "This week's reading"
                        }
                        .into(),
                    ),
                    msg(LibraryMsg::ComeFollowMe),
                )
            }
            None => self.browse_card(
                "cfm",
                "come-follow-me",
                "Come, Follow Me".into(),
                "Study guides".into(),
                None,
                msg(LibraryMsg::ComeFollowMe),
            ),
        }));
        // `ContinueReadingCard`: the chapter the reader had open, unless its volume is hidden.
        if let Some(book) = self
            .book()
            .filter(|b| show_lds || !crate::faith::is_lds_volume(&b.volume))
        {
            let label = if book.id == "doctrineandcovenants" {
                "D&C".to_string()
            } else {
                book.label.clone()
            };
            let delineation = if book.volume == "doctrineandcovenants" {
                "section"
            } else {
                "chapter"
            };
            cards.push(self.browse_card(
                "continue",
                "continue-reading",
                "Continue reading".into(),
                format!("{label} {}", self.preferences.last.chapter),
                Some(format!("Pick up the {delineation} you had open.")),
                msg(LibraryMsg::Continue),
            ));
        }
        cards.push(self.browse_card(
            "journal",
            "notes",
            "Study journal".into(),
            "Journal".into(),
            Some("Your notes and reading".into()),
            msg(LibraryMsg::Journal),
        ));
        let mut volumes: Vec<(String, String, u32, usize)> = vec![];
        for b in &self.books {
            if !show_lds && crate::faith::is_lds_volume(&b.volume) {
                continue;
            }
            match volumes.iter_mut().find(|v| v.0 == b.volume) {
                Some(v) => {
                    v.2 += b.chapters;
                    v.3 += 1;
                }
                None => volumes.push((b.volume.clone(), b.volume_title.clone(), b.chapters, 1)),
            }
        }
        for (id, title, chapters, count) in volumes {
            let eyebrow = if id == "doctrineandcovenants" {
                format!("{chapters} sections")
            } else {
                format!(
                    "{} · {chapters} chapters",
                    crate::journal::plural(count, "book", "books")
                )
            };
            cards.push(self.browse_card(
                &id,
                &id,
                eyebrow,
                title,
                None,
                msg(LibraryMsg::Show(LibraryPage::Volume(id.clone()))),
            ));
        }
        self.grid(cards)
    }
    /// The title a volume or book page shows in the header.
    pub(crate) fn library_title(&self) -> Option<String> {
        match &self.library {
            LibraryPage::Home => None,
            LibraryPage::Volume(v) => self
                .books
                .iter()
                .find(|b| &b.volume == v)
                .map(|b| b.volume_title.clone()),
            LibraryPage::Book(v, b) => self
                .books
                .iter()
                .find(|x| &x.volume == v && &x.id == b)
                .map(|x| x.label.clone()),
        }
    }
    /// `SelectionHeader`, shown at the header's right as on wide screens: back, the title, and the search.
    pub(crate) fn selection_header<'a>(&self, title: String) -> Element<'a, Message> {
        let p = self.p();
        let round = |glyph: &'static icons::Icon, m: Message, label: &str| {
            self.hint(
                button(container(icon(glyph, p.ink, 14.)).center_x(36).center_y(36))
                    .padding(0)
                    .on_press(m)
                    .style(move |_, status| button::Style {
                        background: matches!(
                            status,
                            button::Status::Hovered | button::Status::Pressed
                        )
                        .then(|| p.hover.into()),
                        border: Border {
                            radius: 999.0.into(),
                            ..Default::default()
                        },
                        ..Default::default()
                    }),
                label.to_string(),
            )
        };
        container(
            row![
                round(&icons::CHEVRON_LEFT, msg(LibraryMsg::Back), "Go back"),
                text(title).font(serif()).size(20).color(p.ink).width(Fill),
                round(
                    &icons::MAGNIFYING_GLASS,
                    Message::TogglePopover(crate::Popover::Search),
                    "Search scriptures or jump to a reference"
                ),
            ]
            .spacing(8)
            .align_y(Center),
        )
        .padding([0, 6])
        .width(380)
        .height(crate::header::PILL_HEIGHT)
        .center_y(crate::header::PILL_HEIGHT)
        .style(design::pill(p))
        .into()
    }
    /// A volume's books (`VolumeBookBrowser`): art, category, title and chapters.
    fn volume_page(&self, volume: &str) -> Element<'_, Message> {
        let p = self.p();
        let title = self
            .books
            .iter()
            .find(|b| b.volume == volume)
            .map(|b| b.volume_title.clone())
            .unwrap_or_default();
        let mut cards = vec![];
        for b in self.books.iter().filter(|b| b.volume == volume) {
            let key = format!("{}/{}", b.volume, b.id);
            let hovered = self.library_hover.as_deref() == Some(key.as_str());
            let art_name = if volume == "doctrineandcovenants" {
                "doctrineandcovenants".to_string()
            } else {
                format!("{volume}-{}", b.id)
            };
            let mut info = column![];
            if let Some(c) = category(volume, &b.id) {
                info = info.push(
                    container(
                        text(c.to_uppercase())
                            .size(10.24)
                            .font(sans(font::Weight::Bold))
                            .color(p.faint),
                    )
                    .padding(Padding::ZERO.bottom(4)),
                );
            }
            info = info.push(text(b.label.clone()).font(serif()).size(19.2).color(p.ink));
            info = info.push(
                text(crate::journal::plural(
                    b.chapters as usize,
                    "chapter",
                    "chapters",
                ))
                .size(12.8)
                .font(sans(font::Weight::Semibold))
                .color(p.muted),
            );
            let content = row![
                container(art(&art_name, 80.0, 80.0, 8.0.into()))
                    .width(80)
                    .height(80),
                info.width(Fill),
                container(icon(&icons::CHEVRON_RIGHT, p.ink, 13.0))
                    .center_x(32)
                    .center_y(32)
                    .style(move |_| container::Style {
                        border: Border {
                            color: p.rule,
                            width: 2.0,
                            radius: 999.0.into(),
                        },
                        ..Default::default()
                    }),
            ]
            .spacing(16)
            .align_y(Center);
            let card = button(content)
                .padding(16)
                .width(Fill)
                .on_press(msg(LibraryMsg::Show(LibraryPage::Book(
                    b.volume.clone(),
                    b.id.clone(),
                ))))
                .style(move |_, _| button::Style {
                    background: Some(if hovered { p.hover } else { p.card }.into()),
                    text_color: p.ink,
                    border: Border {
                        color: if hovered {
                            design::rule_strong(p)
                        } else {
                            p.rule
                        },
                        width: 1.0,
                        radius: 9.6.into(),
                    },
                    ..Default::default()
                });
            cards.push(
                mouse_area(card)
                    .on_enter(msg(LibraryMsg::Hover(Some(key))))
                    .on_exit(msg(LibraryMsg::Hover(None)))
                    .into(),
            );
        }
        let _ = title;
        self.grid(cards)
    }
    /// A book's chapters (`ChapterGrid`): read chapters in mint, the current one in the primary accent.
    fn book_page(&self, volume: &str, book: &str) -> Element<'_, Message> {
        let p = self.p();
        let Some(b) = self
            .books
            .iter()
            .find(|x| x.volume == volume && x.id == book)
        else {
            return text("No chapter list available.").into();
        };
        let delineation = if volume == "doctrineandcovenants" {
            ("section", "sections")
        } else {
            ("chapter", "chapters")
        };
        let read = &self.library_read;
        let current =
            if self.preferences.last.volume == volume && self.preferences.last.book == book {
                Some(self.preferences.last.chapter)
            } else {
                read.iter().max().copied()
            };
        // `.browse-chapter-grid`: 9 columns from 1024px (12 for a one-book volume), 6 (8) from 640px.
        let compact = only_book(volume) == Some(book);
        let columns: usize = match (self.window_width >= 1024.0, compact) {
            (true, false) => 9,
            (true, true) => 12,
            (false, false) => 6,
            (false, true) => 8,
        };
        let mut grid = column![].spacing(14.4);
        let mut line = row![].spacing(14.4);
        for n in 1..=b.chapters {
            let is_read = read.contains(&n);
            let is_current = current == Some(n);
            let key = format!("{volume}/{book}/{n}");
            let hovered = self.library_hover.as_deref() == Some(key.as_str());
            let background = if is_current {
                p.primary
            } else if is_read {
                p.mint
            } else if hovered {
                p.hover
            } else {
                p.card
            };
            let ink = if is_current {
                Color::from_rgb8(0x17, 0x16, 0x1a)
            } else {
                p.ink
            };
            let cell = button(
                text(n.to_string())
                    .font(serif())
                    .size(18.4)
                    .color(ink)
                    .center()
                    .width(Fill),
            )
            .padding([8, 8])
            .height(54.4)
            .width(Fill)
            .on_press(msg(LibraryMsg::Chapter(Location {
                volume: volume.to_string(),
                book: book.to_string(),
                chapter: n,
            })))
            .style(move |_, _| button::Style {
                background: Some(background.into()),
                text_color: ink,
                border: Border {
                    color: if hovered {
                        design::rule_strong(p)
                    } else {
                        p.rule
                    },
                    width: 2.0,
                    radius: 13.6.into(),
                },
                ..Default::default()
            });
            line = line.push(
                mouse_area(container(cell).center_y(54.4))
                    .on_enter(msg(LibraryMsg::Hover(Some(key))))
                    .on_exit(msg(LibraryMsg::Hover(None))),
            );
            if (n as usize).is_multiple_of(columns) {
                grid = grid.push(line);
                line = row![].spacing(14.4);
            }
        }
        let rest = b.chapters as usize % columns;
        if rest != 0 {
            for _ in rest..columns {
                line = line.push(space().width(Fill));
            }
            grid = grid.push(line);
        }
        let count = format!(
            "{} {}",
            b.chapters,
            if b.chapters == 1 {
                delineation.0
            } else {
                delineation.1
            }
        );
        column![
            container(
                text(count.to_uppercase())
                    .size(11.52)
                    .font(sans(font::Weight::Bold))
                    .color(p.faint)
            )
            .padding([0, 4]),
            grid
        ]
        .spacing(24)
        .into()
    }
}

/// `formatWeekRange`: "Oct 26 – Nov 1".
pub fn week_range(start: &str, end: &str) -> String {
    let short = |day: &str| {
        crate::journal::date(day)
            .map(|d| d.format("%b %-d").to_string())
            .unwrap_or_else(|| day.to_string())
    };
    format!("{} – {}", short(start), short(end))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_book_has_its_websites_art_and_category() {
        crate::design::load_fonts();
        let dir = std::env::temp_dir().join(format!("verse-library-{}", std::process::id()));
        let app = App::from_directory(&dir);
        for b in &app.books {
            if b.volume == "doctrineandcovenants" {
                continue;
            }
            assert!(
                art_bytes(&format!("{}-{}", b.volume, b.id)).is_some(),
                "art for {} {}",
                b.volume,
                b.id
            );
            assert!(
                category(&b.volume, &b.id).is_some(),
                "category for {}",
                b.id
            );
        }
        for card in [
            "come-follow-me",
            "continue-reading",
            "notes",
            "pearl",
            "oldtestament",
        ] {
            assert!(art_bytes(card).is_some());
        }
        assert_eq!(week_range("2026-10-26", "2026-11-01"), "Oct 26 – Nov 1");
        drop(app);
        let _ = std::fs::remove_dir_all(dir);
    }
}
