// Settings → Release notes, after the website's `ReleaseNotes.tsx`: the website's own release history and
// screenshots (`src/lib/releaseNotes.ts`, exported to `native/assets/release-notes.json` by
// `native/scripts/generate-release-notes.mjs`; the screenshots are embedded from `public/release-notes/`). The
// upcoming changes show only while there are some; the three newest releases show, the rest under "Earlier
// releases"; a screenshot opens full size. This app is the desktop edition, so the notes say which releases they are
// and that the screenshots show the website; nothing here invents a desktop history.
use crate::account::background;
use crate::design::{self, icon, sans, serif};
use crate::icons;
use crate::{App, Message};
use iced::widget::{
    button, column, container, image, mouse_area, rich_text, row, space, span, text,
};
use iced::{Alignment::Center, Border, Color, Element, Fill, Length, Padding, Task, font};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;

mod embedded {
    include!(concat!(env!("OUT_DIR"), "/release_images.rs"));
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Screenshot {
    pub src: String,
    pub width: u32,
    pub height: u32,
    pub alt: String,
    pub caption: String,
    #[serde(default, rename = "currentInterface")]
    pub current_interface: bool,
}
#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Item {
    pub kind: String,
    pub text: String,
    pub screenshot: Option<Screenshot>,
}
#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Release {
    pub version: String,
    pub date: String,
    pub since: Option<String>,
    pub title: String,
    pub items: Vec<Item>,
}
#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Unreleased {
    pub title: String,
    pub items: Vec<Item>,
}
#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Notes {
    pub unreleased: Unreleased,
    pub releases: Vec<Release>,
}
/// The website's release history, newest first.
pub fn notes() -> &'static Notes {
    static NOTES: OnceLock<Notes> = OnceLock::new();
    NOTES.get_or_init(|| {
        serde_json::from_str(include_str!("../assets/release-notes.json"))
            .expect("release-notes.json is generated from src/lib/releaseNotes.ts")
    })
}
/// `RECENT_COUNT`: releases shown before "Earlier releases".
pub const RECENT_COUNT: usize = 3;
/// `.releaseFigure` (34rem) and `.releaseShot img` (20rem): the thumbnail's largest size.
pub const THUMB_WIDTH: f32 = 544.0;
pub const THUMB_HEIGHT: f32 = 320.0;
/// Thumbnails are decoded at this many pixels per point, so they stay sharp on denser screens.
const THUMB_DENSITY: f32 = 1.5;

/// `formatReleaseDate`: "October 27, 2026".
pub fn format_date(date: &str) -> String {
    const MONTHS: [&str; 12] = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    let mut parts = date.split('-').map(|p| p.parse::<usize>().unwrap_or(0));
    let (year, month, day) = (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    );
    match MONTHS.get(month.wrapping_sub(1)) {
        Some(name) => format!("{name} {day}, {year}"),
        None => date.to_string(),
    }
}
/// `releaseDates`: the day, or for a release gathering earlier work, "since – date".
pub fn release_dates(release: &Release) -> String {
    match &release.since {
        Some(since) => format!("{} – {}", format_date(since), format_date(&release.date)),
        None => format_date(&release.date),
    }
}
/// A screenshot's embedded WebP bytes.
pub fn image_bytes(src: &str) -> Option<&'static [u8]> {
    embedded::RELEASE_IMAGES
        .iter()
        .find(|(s, _)| *s == src)
        .map(|(_, b)| *b)
}
/// The size a screenshot is shown at in the list: the whole image scaled down to fit the thumbnail box.
pub fn thumb_size(shot: &Screenshot, column: f32) -> (f32, f32) {
    let (w, h) = (shot.width.max(1) as f32, shot.height.max(1) as f32);
    let scale = (THUMB_WIDTH.min(column) / w).min(THUMB_HEIGHT / h).min(1.0);
    (w * scale, h * scale)
}
/// Decodes a screenshot to RGBA, fitted within `max_w` × `max_h` pixels.
fn decode(src: &str, max_w: u32, max_h: u32) -> Option<image::Handle> {
    let decoded = ::image::load_from_memory(image_bytes(src)?)
        .ok()?
        .to_rgba8();
    let (w, h) = decoded.dimensions();
    let scale = (max_w as f32 / w as f32)
        .min(max_h as f32 / h as f32)
        .min(1.0);
    let rgba = if scale < 1.0 {
        ::image::imageops::resize(
            &decoded,
            ((w as f32 * scale).round() as u32).max(1),
            ((h as f32 * scale).round() as u32).max(1),
            ::image::imageops::FilterType::Triangle,
        )
    } else {
        decoded
    };
    let (w, h) = rgba.dimensions();
    Some(image::Handle::from_rgba(w, h, rgba.into_raw()))
}

#[derive(Default)]
pub struct ReleaseState {
    /// Thumbnails by `src`, decoded off the UI thread the first time the notes are shown.
    pub thumbs: HashMap<String, image::Handle>,
    pub loading: bool,
    pub earlier_open: bool,
    /// The screenshot open full size, and its full image once decoded.
    pub viewing: Option<Screenshot>,
    pub full: Option<(String, image::Handle)>,
}
#[derive(Debug, Clone)]
pub enum ReleaseMsg {
    Thumbs(Vec<(String, image::Handle)>),
    ToggleEarlier,
    Open(Screenshot),
    Full(String, Option<image::Handle>),
    Close,
}
fn msg(m: ReleaseMsg) -> Message {
    Message::Release(m)
}

impl App {
    /// Decodes the thumbnails once, in the background, when the notes are first shown.
    pub(crate) fn load_release_thumbs(&mut self) -> Task<Message> {
        if self.release.loading || !self.release.thumbs.is_empty() {
            return Task::none();
        }
        self.release.loading = true;
        Task::perform(background(decode_thumbs), |thumbs| {
            msg(ReleaseMsg::Thumbs(thumbs))
        })
    }
    pub(crate) fn update_release(&mut self, message: ReleaseMsg) -> Task<Message> {
        match message {
            ReleaseMsg::Thumbs(thumbs) => {
                self.release.loading = false;
                self.release.thumbs = thumbs.into_iter().collect();
            }
            ReleaseMsg::ToggleEarlier => self.release.earlier_open = !self.release.earlier_open,
            ReleaseMsg::Open(shot) => {
                let src = shot.src.clone();
                self.release.viewing = Some(shot);
                if self.release.full.as_ref().is_some_and(|(s, _)| *s == src) {
                    return Task::none();
                }
                return Task::perform(
                    background(move || {
                        let handle = decode(&src, 4096, 4096);
                        (src, handle)
                    }),
                    |(src, handle)| msg(ReleaseMsg::Full(src, handle)),
                );
            }
            ReleaseMsg::Full(src, handle) => {
                if let Some(handle) = handle {
                    self.release.full = Some((src, handle));
                }
            }
            ReleaseMsg::Close => self.release.viewing = None,
        }
        Task::none()
    }

    /// `ReleaseNotes`.
    pub(crate) fn release_notes_view(&self, column_width: f32) -> Element<'_, Message> {
        let p = self.p();
        let notes = notes();
        let Some(latest) = notes.releases.first() else {
            return space().into();
        };
        let current = rich_text::<(), _, _, _>([
            span("These are the Verse Together website's releases. The latest is "),
            span(format!("Verse Together {}", latest.version))
                .font(sans(font::Weight::Semibold))
                .color(p.ink),
            span(format!(
                ", released {}. This desktop app is Verse Together Native {}; the screenshots show the website.",
                format_date(&latest.date),
                env!("CARGO_PKG_VERSION")
            )),
        ])
        .size(13.1)
        .color(p.muted);
        let mut page = column![current].spacing(12);
        if !notes.unreleased.items.is_empty() {
            page = page.push(self.release_entry(
                "Unreleased".into(),
                "In development, coming in the next version".into(),
                &notes.unreleased.title,
                &notes.unreleased.items,
                true,
                column_width,
            ));
        }
        for release in notes.releases.iter().take(RECENT_COUNT) {
            page = page.push(self.release_card(release, column_width));
        }
        let earlier = &notes.releases[RECENT_COUNT.min(notes.releases.len())..];
        if let (Some(newest), Some(oldest)) = (earlier.first(), earlier.last()) {
            let open = self.release.earlier_open;
            let summary = button(
                row![
                    text("Earlier releases")
                        .size(13.1)
                        .font(sans(font::Weight::Medium)),
                    space::horizontal(),
                    text(format!("{}–{}", oldest.version, newest.version))
                        .size(11.5)
                        .color(p.muted),
                    design::rotated_icon(
                        &icons::CHEVRON_DOWN,
                        p.faint,
                        10.,
                        if open { 180.0 } else { 0.0 }
                    ),
                ]
                .spacing(8)
                .align_y(Center),
            )
            .padding([0, 12])
            .height(52)
            .width(Fill)
            .on_press(msg(ReleaseMsg::ToggleEarlier))
            .style(design::ghost(p, 8.0));
            let mut details = column![summary];
            if open {
                let mut list = column![].spacing(12);
                for release in earlier {
                    list = list.push(self.release_card(release, column_width - 8.0));
                }
                details = details.push(container(list).padding(Padding {
                    top: 8.0,
                    right: 4.0,
                    bottom: 4.0,
                    left: 4.0,
                }));
            }
            page = page.push(container(details).padding(4).width(Fill).style(move |_| {
                container::Style {
                    background: Some(p.soft.into()),
                    border: Border {
                        radius: 14.4.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                }
            }));
        }
        page.into()
    }
    fn release_card<'a>(&'a self, release: &'a Release, column_width: f32) -> Element<'a, Message> {
        self.release_entry(
            format!("Version {}", release.version),
            release_dates(release),
            &release.title,
            &release.items,
            false,
            column_width,
        )
    }
    /// `.releaseEntry`: its version and dates, title and items. The upcoming one is dashed, without a shadow.
    fn release_entry<'a>(
        &'a self,
        version: String,
        dates: String,
        title: &'a str,
        items: &'a [Item],
        upcoming: bool,
        column_width: f32,
    ) -> Element<'a, Message> {
        let p = self.p();
        let header = column![
            row![
                text(version)
                    .size(11.5)
                    .font(sans(font::Weight::Semibold))
                    .color(p.accent),
                text("·").size(11.5).color(p.muted),
                text(dates)
                    .size(11.5)
                    .font(sans(font::Weight::Medium))
                    .color(p.muted),
            ]
            .spacing(6),
            text(title).size(16.8).font(serif()).line_height(1.3),
        ]
        .spacing(2.4);
        let wide = column_width > 540.0;
        // The item column beside the 5.25rem kind column.
        let body_width = (column_width - 35.2 - if wide { 84.0 + 8.0 } else { 0.0 }).max(120.0);
        let mut list = column![].spacing(8.8);
        for item in items {
            let new = item.kind == "new";
            let kind = container(
                text(if new { "NEW" } else { "IMPROVED" })
                    .size(10.2)
                    .font(sans(font::Weight::Semibold))
                    .color(if new { p.accent } else { p.muted }),
            )
            .padding([0.8, 7.2])
            .style(move |_| container::Style {
                border: Border {
                    color: if new { p.rubric_line } else { p.rule },
                    width: 1.0,
                    radius: 999.0.into(),
                },
                ..Default::default()
            });
            let mut body = column![text(&item.text).size(13.1).line_height(1.5)].spacing(8);
            if let Some(shot) = &item.screenshot {
                body = body.push(self.release_figure(shot, body_width));
            }
            list = list.push(if wide {
                Element::from(
                    row![container(kind).width(84), body.width(Fill)]
                        .spacing(8)
                        .align_y(iced::Alignment::Start),
                )
            } else {
                column![kind, body].spacing(3.2).into()
            });
        }
        container(column![header, list].spacing(10.4))
            .padding(Padding {
                top: 16.0,
                right: 17.6,
                bottom: 17.6,
                left: 17.6,
            })
            .width(Fill)
            .style(move |_| container::Style {
                background: Some(p.card.into()),
                text_color: Some(p.ink),
                border: Border {
                    color: if upcoming {
                        p.rubric_line
                    } else {
                        Color::TRANSPARENT
                    },
                    width: if upcoming { 1.0 } else { 0.0 },
                    radius: 14.4.into(),
                },
                shadow: if upcoming {
                    Default::default()
                } else {
                    design::soft_shadow(p)
                },
                ..Default::default()
            })
            .into()
    }
    /// `Screenshot`: a capped thumbnail that opens full size, and its caption.
    fn release_figure<'a>(&'a self, shot: &'a Screenshot, width: f32) -> Element<'a, Message> {
        let p = self.p();
        let (w, h) = thumb_size(shot, width);
        let picture: Element<'_, Message> = match self.release.thumbs.get(&shot.src) {
            Some(handle) => image(handle.clone())
                .width(w)
                .height(h)
                .content_fit(iced::ContentFit::Contain)
                .border_radius(9.6)
                .into(),
            None => space().width(w).height(h).into(),
        };
        let thumb = button(picture)
            .padding(0)
            .on_press(msg(ReleaseMsg::Open(shot.clone())))
            .style(move |_, status| button::Style {
                background: Some(p.soft.into()),
                border: Border {
                    color: if matches!(status, button::Status::Hovered) {
                        p.rubric_line
                    } else {
                        p.rule
                    },
                    width: 1.0,
                    radius: 9.6.into(),
                },
                shadow: if matches!(status, button::Status::Hovered) {
                    design::soft_shadow(p)
                } else {
                    Default::default()
                },
                ..Default::default()
            });
        let mut caption: Vec<iced::widget::text::Span<'_, ()>> = vec![span(shot.caption.clone())];
        if shot.current_interface {
            // `.releaseShotNote` is italic; the bundled DM Sans has no italic face, so it stays upright here.
            caption.push(span(" Shown in today's interface."));
        }
        column![
            thumb,
            rich_text(caption)
                .size(11.5)
                .color(p.muted)
                .width(Length::Fixed(width.min(THUMB_WIDTH))),
        ]
        .spacing(4.8)
        .padding(Padding::ZERO.bottom(5.6))
        .into()
    }
    /// `ScreenshotViewer`: the screenshot at full size over the page; Escape, its button or a click outside close it.
    pub(crate) fn release_viewer(&self) -> Option<Element<'_, Message>> {
        let shot = self.release.viewing.as_ref()?;
        let p = self.p();
        let max_w = (self.window_width * 0.96).min(1280.0) - 24.0;
        let max_h = self.window_height * 0.94 - 72.0;
        let scale = (max_w / shot.width.max(1) as f32)
            .min(max_h / shot.height.max(1) as f32)
            .min(1.0);
        let (w, h) = (shot.width as f32 * scale, shot.height as f32 * scale);
        let handle = match &self.release.full {
            Some((src, handle)) if *src == shot.src => Some(handle.clone()),
            _ => self.release.thumbs.get(&shot.src).cloned(),
        };
        let picture: Element<'_, Message> = match handle {
            Some(handle) => image(handle)
                .width(w)
                .height(h)
                .content_fit(iced::ContentFit::Contain)
                .border_radius(8.0)
                .into(),
            None => space().width(w).height(h).into(),
        };
        let close = button(
            container(icon(&icons::XMARK, p.muted, 14.))
                .center_x(44)
                .center_y(44),
        )
        .padding(0)
        .on_press(msg(ReleaseMsg::Close))
        .style(design::ghost(p, 22.0));
        let dialog = container(
            column![
                picture,
                row![
                    text(shot.caption.clone())
                        .size(12.8)
                        .color(p.muted)
                        .width(Fill),
                    close
                ]
                .spacing(12)
                .align_y(Center),
            ]
            .spacing(8)
            .width(Length::Shrink),
        )
        .padding(12)
        .style(move |_| container::Style {
            background: Some(p.card_strong.into()),
            text_color: Some(p.ink),
            border: Border {
                radius: 14.4.into(),
                ..Default::default()
            },
            shadow: iced::Shadow {
                color: Color::from_rgba(0.0, 0.0, 0.0, 0.35),
                offset: iced::Vector::new(0.0, 24.0),
                blur_radius: 64.0,
            },
            ..Default::default()
        });
        // A click on the backdrop closes; one on the dialog doesn't reach it.
        let backdrop =
            mouse_area(
                container(space())
                    .width(Fill)
                    .height(Fill)
                    .style(|_| container::Style {
                        background: Some(Color::from_rgba(0.0, 0.0, 0.0, 0.6).into()),
                        ..Default::default()
                    }),
            )
            .on_press(msg(ReleaseMsg::Close));
        Some(
            iced::widget::stack![
                backdrop,
                container(iced::widget::opaque(dialog))
                    .center_x(Fill)
                    .center_y(Fill)
            ]
            .into(),
        )
    }
}
/// Every screenshot's thumbnail, sized for the list.
pub fn decode_thumbs() -> Vec<(String, image::Handle)> {
    all_screenshots()
        .filter_map(|shot| {
            let (w, h) = thumb_size(shot, THUMB_WIDTH);
            let handle = decode(
                &shot.src,
                (w * THUMB_DENSITY).ceil() as u32,
                (h * THUMB_DENSITY).ceil() as u32,
            )?;
            Some((shot.src.clone(), handle))
        })
        .collect()
}
/// Every screenshot in the notes, the upcoming ones first.
pub fn all_screenshots() -> impl Iterator<Item = &'static Screenshot> {
    let n = notes();
    n.unreleased
        .items
        .iter()
        .chain(n.releases.iter().flat_map(|r| r.items.iter()))
        .filter_map(|i| i.screenshot.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn the_release_history_is_the_websites_own() {
        // The exported notes match src/lib/releaseNotes.ts: every version and item text, in order.
        let source = include_str!("../../src/lib/releaseNotes.ts");
        let versions: Vec<&str> = source
            .lines()
            .filter_map(|l| l.trim().strip_prefix("version: \""))
            .filter_map(|l| l.split('"').next())
            .collect();
        let notes = notes();
        assert_eq!(
            notes
                .releases
                .iter()
                .map(|r| r.version.as_str())
                .collect::<Vec<_>>(),
            versions
        );
        assert_eq!(notes.releases[0].version, env!("WEB_VERSION"));
        for item in notes
            .releases
            .iter()
            .flat_map(|r| &r.items)
            .chain(&notes.unreleased.items)
        {
            let quoted = serde_json::to_string(&item.text).unwrap();
            assert!(source.contains(&quoted), "not in releaseNotes.ts: {quoted}");
            assert!(item.kind == "new" || item.kind == "improved");
        }
        // Every screenshot is embedded at the size the notes state.
        let mut count = 0;
        for shot in all_screenshots() {
            count += 1;
            let bytes =
                image_bytes(&shot.src).unwrap_or_else(|| panic!("{} not embedded", shot.src));
            let size = ::image::load_from_memory(bytes).unwrap();
            assert_eq!(
                (size.width(), size.height()),
                (shot.width, shot.height),
                "{}",
                shot.src
            );
            assert!(!shot.alt.is_empty() && !shot.caption.is_empty());
        }
        assert_eq!(count, embedded::RELEASE_IMAGES.len());
    }
    #[test]
    fn dates_and_thumbnails_are_shown_like_the_website() {
        assert_eq!(format_date("2026-10-27"), "October 27, 2026");
        assert_eq!(format_date("2026-09-05"), "September 5, 2026");
        let gathered = notes()
            .releases
            .iter()
            .find(|r| r.version == "2.0.0")
            .unwrap();
        assert_eq!(
            release_dates(gathered),
            "September 25, 2026 – October 23, 2026"
        );
        let shot = Screenshot {
            src: String::new(),
            width: 1600,
            height: 541,
            alt: String::new(),
            caption: String::new(),
            current_interface: false,
        };
        // Wide screenshots are capped by the 34rem column, tall ones by the 20rem height.
        assert_eq!(thumb_size(&shot, 800.0), (544.0, 541.0 * 544.0 / 1600.0));
        let tall = Screenshot {
            width: 800,
            height: 1600,
            ..shot
        };
        assert_eq!(thumb_size(&tall, 800.0), (160.0, 320.0));
    }
}
