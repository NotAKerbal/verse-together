// The reader tools' views: the side panel (study paths, Explore a word, lesson resources), study path markers,
// other Bibles under each verse with their changed words, JST passages, and Your Bibles in Reader settings.
use crate::bible_catalog;
use crate::design::{self, Colors, icon, sans, serif};
use crate::icons;
use crate::reader_tools::{
    self, BiblesView, Diff, Guide, HelpBlock, HelpInline, Load, Panel, StudyPath, ToolsMsg,
};
use crate::select_text::{Piece, Shown};
use crate::{App, Message};
use iced::widget::{
    button, column, container, markdown, opaque, rich_text, row, space, span, stack, text,
    text_input,
};
use iced::{Alignment::Center, Border, Color, Element, Fill, Length, Padding, font};

fn msg(m: ToolsMsg) -> Message {
    Message::Tools(m)
}
fn eyebrow<'a>(p: Colors, label: impl Into<String>) -> Element<'a, Message> {
    text(label.into().to_uppercase())
        .size(11.2)
        .font(sans(font::Weight::Semibold))
        .color(p.accent)
        .into()
}
fn muted<'a>(p: Colors, value: impl Into<String>) -> Element<'a, Message> {
    text(value.into()).size(13).color(p.muted).into()
}
fn link_button<'a>(p: Colors, label: impl Into<String>, m: Message) -> Element<'a, Message> {
    button(
        text(label.into())
            .size(13)
            .font(sans(font::Weight::Semibold))
            .color(p.accent),
    )
    .padding(0)
    .on_press(m)
    .style(design::link(p.accent))
    .into()
}
fn close<'a>(p: Colors, m: Message) -> Element<'a, Message> {
    button(
        container(icon(&icons::XMARK, p.ink, 14.))
            .center_x(32)
            .center_y(32),
    )
    .padding(0)
    .on_press(m)
    .style(design::circle(p))
    .into()
}
fn boxed<'a>(p: Colors, content: impl Into<Element<'a, Message>>) -> Element<'a, Message> {
    container(content)
        .padding([10, 12])
        .width(Fill)
        .style(move |_| container::Style {
            background: Some(p.soft.into()),
            border: Border {
                color: p.rule,
                width: 1.0,
                radius: 14.4.into(),
            },
            ..Default::default()
        })
        .into()
}

/// `JST_SOURCE_DOCS_URL`.
const JST_SOURCE_DOCS_URL: &str = "https://openscriptureapi.org/docs/study-helps";

impl App {
    /// The verse's study path marker (`VerseStudyPathMarker`), when the chapter has a path tagging it.
    pub(crate) fn path_marker(&self, verse: u32) -> Option<Element<'_, Message>> {
        if self.focus || self.tools.paths_for(verse).is_empty() {
            return None;
        }
        let p = self.p();
        let open = self.tools.panel == Some(Panel::Paths(verse));
        Some(
            self.hint(
                button(
                    container(icon(
                        &icons::LIGHTBULB,
                        if open { p.accent } else { p.faint },
                        13.,
                    ))
                    .center_x(28)
                    .center_y(28),
                )
                .padding(0)
                .on_press(msg(ToolsMsg::OpenPaths(verse)))
                .style(move |_, status| button::Style {
                    background: (open || matches!(status, button::Status::Hovered))
                        .then(|| p.hover.into()),
                    border: Border {
                        color: if open { p.accent } else { Color::TRANSPARENT },
                        width: 1.0,
                        radius: 14.0.into(),
                    },
                    ..Default::default()
                }),
                "A study path is available".to_string(),
            ),
        )
    }

    /// The other Bibles whose wording of this verse differs from the KJV's (`verseComparisons`): label, color and
    /// text, in the order they are shown.
    pub(crate) fn verse_comparisons(&self, number: u32, kjv: &str) -> Vec<(String, Color, &str)> {
        let base = reader_tools::normalize_compare(kjv);
        self.tools
            .compare
            .iter()
            .enumerate()
            .filter_map(|(i, (id, state))| {
                let Load::Ready(verses) = state else {
                    return None;
                };
                let v = verses.iter().find(|v| v.number == number)?;
                (reader_tools::normalize_compare(&v.text) != base).then(|| {
                    (
                        self.compare_label(id),
                        self.compare_color(i),
                        v.text.as_str(),
                    )
                })
            })
            .collect()
    }
    /// The default Bible's fallback notice (`translationNotice`), then Bibles that couldn't be loaded for this chapter
    /// (`translationNotices`).
    pub(crate) fn comparison_notices(&self) -> Option<Element<'_, Message>> {
        let failed: Vec<String> = self
            .primary_notice()
            .into_iter()
            .chain(
                self.tools
                    .compare
                    .iter()
                    .filter(|(_, state)| matches!(state, Load::Failed(_)))
                    .map(|(id, _)| {
                        format!(
                            "Could not load overlay translation \"{}\".",
                            id.to_uppercase()
                        )
                    }),
            )
            .collect();
        if failed.is_empty() {
            return None;
        }
        let color = if self.preferences.dark {
            Color::from_rgb8(0xfd, 0xe6, 0x8a)
        } else {
            Color::from_rgb8(0x78, 0x35, 0x0f)
        };
        let mut c = column![].spacing(2);
        for notice in failed {
            c = c.push(text(notice).size(12).color(color));
        }
        Some(container(c).padding([0, 12]).into())
    }
    /// The base text's label (`primaryTranslationLabel`: "KJV" for other denominations, a featured Bible's short
    /// label, else its id in capitals) and its amber.
    fn primary_label(&self) -> (String, Color) {
        let id = self.primary_translation();
        let label = if id == crate::faith::LDS_BIBLE_ID {
            if self.show_lds() { "LDS" } else { "KJV" }.to_string()
        } else {
            reader_tools::featured_bibles()
                .into_iter()
                .find(|b| b.id.eq_ignore_ascii_case(id))
                .and_then(|b| b.abbreviation)
                .unwrap_or_else(|| id.to_uppercase())
        };
        (
            label,
            if self.preferences.dark {
                Color::from_rgb8(0xfc, 0xd3, 0x4d)
            } else {
                Color::from_rgb8(0xb4, 0x53, 0x09)
            },
        )
    }
    /// A verse as the reader displays it, for selecting its words: its indent and text, or, read against other
    /// Bibles in the inline Comparison view, the KJV with each change shown as "KJV / other" (`renderInlineDiff`),
    /// where only the KJV's own words map back to the verse; side by side, the KJV box's text. `None` for a verse
    /// read with the JST (its JST wording isn't the text marks are saved on).
    pub(crate) fn verse_shown(&self, index: usize) -> Option<Shown<'_>> {
        let verse = self.verses.get(index)?;
        if self.jst_row(verse.number).is_some() {
            return None;
        }
        let kjv = verse.text.as_str();
        let comparisons = self.verse_comparisons(verse.number, kjv);
        let mut shown = Shown::default();
        if comparisons.is_empty() {
            let prefix = self.verse_prefix.get(index).map(String::as_str)?;
            shown.push(Piece::new(prefix), None);
            shown.push(Piece::new(kjv), Some(0..kjv.len()));
            return Some(shown);
        }
        if self.preferences.side_by_side {
            shown.push(Piece::new(kjv), Some(0..kjv.len()));
            return Some(shown);
        }
        let p = self.p();
        let (_, amber) = self.primary_label();
        let faint = Color { a: 0.35, ..p.ink };
        let prefix =
            crate::view::verse_indent(&verse.number.to_string(), self.reading_font(), 14.0);
        shown.push(Piece::new(prefix), None);
        for (i, (_, color, other)) in comparisons.iter().enumerate() {
            if i > 0 {
                shown.push(Piece::new("  |  ").color(faint), None);
                shown.map.next_group();
            }
            for piece in reader_tools::diff_words(kjv, other) {
                match piece {
                    Diff::Same(r) => shown.push(Piece::new(&kjv[r.clone()]), Some(r)),
                    Diff::Changed(r, changed) => {
                        let lead = kjv[r.clone()].len() - kjv[r.clone()].trim_start().len();
                        let start = r.start + lead;
                        shown.push(Piece::new(" "), None);
                        if start < r.end {
                            shown.push(
                                Piece::new(&kjv[start..r.end]).color(amber),
                                Some(start..r.end),
                            );
                        } else {
                            shown.push(Piece::new("-").color(faint), None);
                        }
                        shown.push(Piece::new(" / ").color(Color { a: 0.4, ..p.ink }), None);
                        shown.push(
                            if changed.is_empty() {
                                Piece::new("-").color(faint)
                            } else {
                                Piece::new(changed).color(*color)
                            },
                            None,
                        );
                        shown.push(Piece::new(" "), None);
                    }
                }
            }
        }
        Some(shown)
    }
    /// A verse read against other Bibles, in the reader's Comparison view: inline (the KJV with each change shown
    /// as "KJV / other") or side by side (`ChapterReader`'s comparison rows). The KJV's words select and mark as in
    /// a plain verse; the other Bibles' words are never taken.
    pub(crate) fn comparison_text<'a>(
        &'a self,
        index: usize,
        prefix: &str,
        comparisons: Vec<(String, Color, &'a str)>,
        font: iced::Font,
    ) -> Element<'a, Message> {
        let p = self.p();
        let (primary, amber) = self.primary_label();
        let line = 24.0;
        let Some(shown) = self.verse_shown(index) else {
            return space().into();
        };
        if !self.preferences.side_by_side {
            return self.verse_words(index, shown, font, 14.0, line);
        }
        let wide = self.window_width >= 768.0;
        let shade = if self.preferences.dark {
            Color::from_rgba(1.0, 1.0, 1.0, 0.05)
        } else {
            Color::from_rgba(0.0, 0.0, 0.0, 0.03)
        };
        let cell = move |label: String, color: Color, body: Element<'a, Message>| {
            container(column![text(label.to_uppercase()).size(10).color(color), body,].spacing(2))
                .padding([6, 8])
                .width(Fill)
                .style(move |_| container::Style {
                    background: Some(shade.into()),
                    border: Border {
                        radius: 4.0.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                })
        };
        let mut boxes = column![].spacing(8);
        for (label, color, other) in comparisons {
            let base = cell(
                primary.clone(),
                amber,
                self.verse_words(index, shown.clone(), font, 14.0, line),
            );
            let them = cell(
                label,
                color,
                text(other)
                    .size(14)
                    .font(font)
                    .line_height(iced::widget::text::LineHeight::Absolute(line.into()))
                    .into(),
            );
            let pair: Element<'_, Message> = if wide {
                row![base, them].spacing(8).into()
            } else {
                column![base, them].spacing(8).into()
            };
            boxes = boxes.push(container(pair).padding(8).width(Fill).style(move |_| {
                container::Style {
                    border: Border {
                        color: p.rule,
                        width: 1.0,
                        radius: 6.0.into(),
                    },
                    ..Default::default()
                }
            }));
        }
        column![
            text(prefix.to_string())
                .size(14)
                .line_height(iced::widget::text::LineHeight::Absolute(line.into())),
            boxes
        ]
        .spacing(4)
        .into()
    }
    /// The website's `compareColorClasses`, by the Bible's place among those shown.
    pub(crate) fn compare_color(&self, index: usize) -> Color {
        const LIGHT: [u32; 6] = [0x0369a1, 0x047857, 0x4d7c0f, 0xbe123c, 0x0e7490, 0xa21caf];
        const DARK: [u32; 6] = [0x7dd3fc, 0x6ee7b7, 0xbef264, 0xfda4af, 0x67e8f9, 0xf0abfc];
        let hex = if self.preferences.dark { DARK } else { LIGHT }[index % 6];
        Color::from_rgb8((hex >> 16) as u8, (hex >> 8) as u8, hex as u8)
    }
    /// A Bible's short label (`formatTranslationShortLabel`).
    pub(crate) fn compare_label(&self, id: &str) -> String {
        self.preferences
            .bibles
            .iter()
            .find(|b| b.id.eq_ignore_ascii_case(id))
            .and_then(|b| b.abbreviation.clone())
            .unwrap_or_else(|| id.to_uppercase())
    }
    /// The JST row standing in for a KJV verse, when the chapter is read with the JST.
    pub(crate) fn jst_row(&self, verse: u32) -> Option<&crate::jst::Row> {
        match &self.tools.jst {
            Some(Load::Ready(_)) if self.jst_enabled() => self.tools.jst_reading.rows.get(&verse),
            _ => None,
        }
    }
    /// The excerpts shown whole before the text (`jstReading.leading`).
    pub(crate) fn jst_leading_cards(&self) -> Vec<Element<'_, Message>> {
        match &self.tools.jst {
            Some(Load::Ready(excerpts)) if self.jst_enabled() => self
                .tools
                .jst_reading
                .leading
                .iter()
                .filter_map(|&i| excerpts.get(i))
                .map(|e| container(self.jst_card(e)).padding([0, 12]).into())
                .collect(),
            _ => vec![],
        }
    }
    /// The line under the reader's header while the JST is on (`ChapterReader`'s JST status).
    pub(crate) fn jst_status(&self) -> Option<Element<'_, Message>> {
        if !self.jst_enabled() {
            return None;
        }
        let p = self.p();
        let small = |s: String| text(s).size(12).color(Color { a: 0.55, ..p.ink });
        let link = |label: &'static str, m: ToolsMsg| {
            button(
                rich_text::<(), _, _, _>([span(label).underline(true)])
                    .size(12)
                    .color(Color { a: 0.55, ..p.ink }),
            )
            .padding(0)
            .on_press(msg(m))
            .style(|_, _| button::Style::default())
        };
        let line: Element<'_, Message> = match &self.tools.jst {
            None | Some(Load::Loading) => {
                small("Loading Joseph Smith Translation excerpts…".into()).into()
            }
            Some(Load::Ready(excerpts)) if excerpts.is_empty() => {
                small("The JST appendix has no excerpts for this chapter.".into()).into()
            }
            Some(Load::Ready(_)) => {
                let reading = &self.tools.jst_reading;
                let count = reading.integrated.len();
                let mut spans: Vec<iced::widget::text::Span<'_, ToolsMsg>> = if count > 0 {
                    vec![
                        span(format!(
                            "{} read in place of the KJV; ",
                            if count == 1 {
                                "1 JST passage".to_string()
                            } else {
                                format!("{count} JST passages")
                            }
                        )),
                        span("JST wording").underline(true),
                        span(" is underlined. Turn off the JST to highlight or note those verses."),
                    ]
                } else {
                    vec![span("The JST appendix has a note for this chapter.")]
                };
                if reading.omits_wording() {
                    spans.push(span(" "));
                    spans.push(
                        span(if self.tools.jst_omitted {
                            "Hide omitted KJV words"
                        } else {
                            "Show omitted KJV words"
                        })
                        .underline(true)
                        .link(ToolsMsg::ToggleJstOmitted),
                    );
                }
                rich_text(spans)
                    .size(12)
                    .color(Color { a: 0.55, ..p.ink })
                    .on_link_click(msg)
                    .into()
            }
            Some(Load::Failed(e)) => row![
                text(format!(
                    "Couldn't load Joseph Smith Translation excerpts. {e}"
                ))
                .size(12)
                .color(p.accent),
                link("Retry", ToolsMsg::RetryJst),
            ]
            .spacing(8)
            .wrap()
            .into(),
        };
        Some(container(line).padding([0, 12]).into())
    }
    /// A verse read with the JST (`data-jst` rows): the KJV number, the JST's wording in place of the KJV's, other
    /// Bibles' plain wording beneath, and a note when the reader's marks are on the hidden KJV wording.
    pub(crate) fn jst_verse_row<'a>(
        &'a self,
        index: usize,
        number: u32,
        row: &'a crate::jst::Row,
        font: iced::Font,
        size: f32,
        line: f32,
    ) -> Element<'a, Message> {
        let p = self.p();
        let prefix = self
            .verse_prefix
            .get(index)
            .map(String::as_str)
            .unwrap_or("");
        let words = crate::jst_text::view(
            row,
            self.tools.jst_omitted,
            prefix,
            font,
            size,
            line,
            (p.ink, p.muted),
        );
        let badge = container(
            text(number.to_string())
                .size(crate::view::BADGE_SIZE)
                .font(sans(font::Weight::Semibold))
                .line_height(iced::widget::text::LineHeight::Absolute(12.0.into()))
                .color(p.accent)
                .wrapping(iced::widget::text::Wrapping::None),
        )
        .padding(Padding::ZERO.top(crate::view::badge_top(size, line)));
        let mut first_line = row![stack![words, badge]].align_y(iced::Alignment::Start);
        if let Some(marker) = self.path_marker(number) {
            first_line = first_line.push(
                container(marker).padding(
                    Padding::ZERO
                        .left(8)
                        .top(((line - 12.0) / 2.0 - 8.0).max(0.0)),
                ),
            );
        }
        if let Some(marker) = self.note_link_marker(number) {
            first_line = first_line.push(
                container(marker)
                    .padding(Padding::ZERO.left(8).top(((line - 28.0) / 2.0).max(0.0))),
            );
        }
        let mut body = column![first_line].spacing(4);
        for (i, (id, state)) in self.tools.compare.iter().enumerate() {
            let Load::Ready(verses) = state else { continue };
            let Some(v) = verses.iter().find(|v| v.number == number) else {
                continue;
            };
            let kjv = self
                .verses
                .get(index)
                .map(|v| v.text.as_str())
                .unwrap_or("");
            if reader_tools::normalize_compare(&v.text) == reader_tools::normalize_compare(kjv) {
                continue;
            }
            body = body.push(
                rich_text::<(), _, _, _>([
                    span(format!("{}  ", self.compare_label(id).to_uppercase()))
                        .size(10)
                        .color(self.compare_color(i)),
                    span(v.text.clone()).size(14).font(font),
                ])
                .line_height(iced::widget::text::LineHeight::Absolute(24.0.into())),
            );
        }
        if self
            .annotations
            .iter()
            .any(|a| a.verse == number && a.is_marked())
        {
            body = body.push(
                text("Your marks on this verse are on its KJV wording. Turn off the JST to see them.")
                    .size(12)
                    .font(iced::Font {
                        style: font::Style::Italic,
                        ..sans(font::Weight::Normal)
                    })
                    .color(p.muted),
            );
        }
        container(body)
            .id(format!("verse-{number}"))
            .padding([8, 12])
            .width(Fill)
            .into()
    }
    /// `JstExcerptCard`.
    fn jst_card<'a>(&self, excerpt: &'a reader_tools::JstExcerpt) -> Element<'a, Message> {
        let p = self.p();
        let mut card = column![
            row![
                text(excerpt.label.to_uppercase())
                    .size(11)
                    .font(sans(font::Weight::Semibold)),
                text(if excerpt.compare_reference.is_empty() {
                    "THE SOURCE GIVES NO MATCHING KJV VERSE".to_string()
                } else {
                    format!("COMPARE {}", excerpt.compare_reference.to_uppercase())
                })
                .size(11)
                .color(p.faint),
            ]
            .spacing(8),
        ]
        .spacing(4);
        for v in &excerpt.verses {
            card = card.push(rich_text::<(), _, _, _>([
                span(format!("{}  ", v.number))
                    .size(11)
                    .font(sans(font::Weight::Semibold))
                    .color(p.faint),
                span(v.text.clone()).size(14),
            ]));
        }
        if let Some(note) = &excerpt.note {
            card = card.push(text(note.clone()).size(14).color(p.muted));
        }
        container(card)
            .padding(Padding {
                top: 8.0,
                right: 12.0,
                bottom: 8.0,
                left: 14.0,
            })
            .width(Fill)
            .style(move |_| container::Style {
                background: Some(p.card.into()),
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 6.0.into(),
                },
                shadow: iced::Shadow {
                    color: p.primary,
                    offset: iced::Vector::new(-3.0, 0.0),
                    blur_radius: 0.0,
                },
                ..Default::default()
            })
            .into()
    }

    /// The tools' side panel, in the study panel's place.
    pub(crate) fn tools_panel(&self) -> Option<Element<'_, Message>> {
        let panel = self.tools.panel.as_ref()?;
        let p = self.p();
        let content: Element<'_, Message> = match panel {
            Panel::Paths(verse) => self.paths_view(*verse),
            Panel::Explore => self.explore_view()?,
            Panel::Resources(verses) => self.resources_view(verses),
        };
        Some(
            // Room on the right for the slim scrollbar drawn over the panel's edge.
            container(self.scroll(container(content).padding(Padding::ZERO.right(10))))
                .width(crate::view::PANEL_WIDTH)
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
                .into(),
        )
    }

    /// `VerseStudyPaths`.
    fn paths_view(&self, verse: u32) -> Element<'_, Message> {
        let p = self.p();
        let paths = self.tools.paths_for(verse);
        let mut list = column![
            row![
                container(icon(&icons::LIGHTBULB, p.ink, 15.))
                    .center_x(36)
                    .center_y(36)
                    .style(move |_| container::Style {
                        background: Some(p.primary.into()),
                        border: Border {
                            color: p.rule,
                            width: 2.0,
                            radius: 18.0.into(),
                        },
                        ..Default::default()
                    }),
                column![
                    text("Study paths").size(16).font(sans(font::Weight::Bold)),
                    text(if paths.len() == 1 {
                        "1 direction to explore".to_string()
                    } else {
                        format!("{} directions to explore", paths.len())
                    })
                    .size(12)
                    .color(p.muted),
                ]
                .width(Fill),
                close(p, msg(ToolsMsg::ClosePanel)),
            ]
            .spacing(12)
            .align_y(Center),
        ]
        .spacing(16);
        for path in paths {
            list = list.push(self.path_section(path));
        }
        list.into()
    }
    fn path_section<'a>(&self, path: &'a StudyPath) -> Element<'a, Message> {
        let p = self.p();
        let verses = path
            .verse_numbers
            .iter()
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(", ");
        let mut section = column![
            row![
                container(
                    text(reader_tools::kind_label(&path.kind).to_uppercase())
                        .size(11)
                        .font(sans(font::Weight::Bold))
                )
                .padding([2, 8])
                .style(move |_| container::Style {
                    background: Some(p.note.into()),
                    border: Border {
                        color: p.rule,
                        width: 2.0,
                        radius: 999.0.into(),
                    },
                    ..Default::default()
                }),
                text(format!(
                    "{} {verses}",
                    if path.verse_numbers.len() == 1 {
                        "VERSE"
                    } else {
                        "VERSES"
                    }
                ))
                .size(11)
                .font(sans(font::Weight::Bold))
                .color(p.faint),
            ]
            .spacing(8)
            .align_y(Center),
            text(path.title.clone())
                .size(17)
                .font(sans(font::Weight::Bold)),
            text(path.direction.clone()).size(14).line_height(1.5),
            text(path.why.clone())
                .size(14)
                .color(p.muted)
                .line_height(1.5),
        ]
        .spacing(6);
        let mut notice = column![
            text("AS YOU REREAD, NOTICE")
                .size(11)
                .font(sans(font::Weight::Bold))
                .color(p.muted)
        ]
        .spacing(3);
        for item in &path.look_for {
            notice = notice.push(text(format!("•  {item}")).size(14).line_height(1.45));
        }
        section = section.push(boxed(p, notice));
        if !path.scripture_links.is_empty() {
            let mut links = row![].spacing(10);
            for l in &path.scripture_links {
                let href = format!(
                    "/browse/{}/{}/{}#v-{}",
                    l.volume, l.book, l.chapter, l.verse_start
                );
                links = links.push(link_button(
                    p,
                    l.reference.clone(),
                    msg(ToolsMsg::Link(href)),
                ));
            }
            section = section.push(links.wrap());
        }
        for source in &path.sources {
            let host = source
                .url
                .split("//")
                .nth(1)
                .and_then(|r| r.split('/').next())
                .unwrap_or("source")
                .trim_start_matches("www.")
                .to_string();
            section = section.push(
                button(
                    row![
                        text(format!(
                            "{}{}",
                            if source.format == "video" {
                                "Video · "
                            } else {
                                ""
                            },
                            source.title
                        ))
                        .size(13)
                        .font(sans(font::Weight::Semibold))
                        .color(p.accent),
                        text(host).size(12).color(p.faint),
                        icon(&icons::ARROW_UP_RIGHT_FROM_SQUARE, p.faint, 10.),
                    ]
                    .spacing(6)
                    .align_y(Center),
                )
                .padding(0)
                .on_press(Message::OpenLink(source.url.clone()))
                .style(design::link(p.accent)),
            );
        }
        container(section)
            .padding(Padding::ZERO.top(12))
            .style(move |_| container::Style {
                border: Border {
                    color: p.rule,
                    width: 0.0,
                    radius: 0.0.into(),
                },
                ..Default::default()
            })
            .into()
    }

    /// `WordStudyPanel` ("Explore Word").
    fn explore_view(&self) -> Option<Element<'_, Message>> {
        let p = self.p();
        let e = self.tools.explore.as_ref()?;
        let mut panel = column![
            row![
                column![
                    eyebrow(p, "Explore Word"),
                    text(e.word.clone()).size(28).font(serif()),
                ]
                .spacing(4)
                .width(Fill),
                close(p, msg(ToolsMsg::ClosePanel)),
            ]
            .align_y(Center),
        ]
        .spacing(10);
        if let Some((guide, _, state)) = &e.entry {
            panel = panel.push(link_button(
                p,
                "‹ Back to sources",
                msg(ToolsMsg::CloseHelp),
            ));
            panel = panel.push(match state {
                Load::Loading => muted(p, format!("Loading the {}…", guide.label())),
                Load::Failed(err) => text(err.clone()).size(13).color(p.accent).into(),
                Load::Ready(entry) => self.help_entry(*guide, entry),
            });
            return Some(panel.into());
        }
        let helps_found = e
            .helps
            .iter()
            .any(|(_, m)| !m.entries.is_empty() || !m.related.is_empty());
        let english_found = matches!(&e.dictionary, Load::Ready(d) if !d.groups.is_empty() || !d.etymology.is_empty());
        let hebrew_found = matches!(&e.hebrew, Load::Ready(l) if !l.matches.is_empty());
        let greek_found = matches!(&e.greek, Load::Ready(l) if !l.matches.is_empty());
        let settled = |s: bool, l: bool| s || l;
        let all_settled = settled(
            matches!(e.dictionary, Load::Ready(_)),
            matches!(e.dictionary, Load::Failed(_)),
        ) && !matches!(e.hebrew, Load::Loading)
            && !matches!(e.greek, Load::Loading);
        if all_settled && !helps_found && !english_found && !hebrew_found && !greek_found {
            return Some(
                panel
                    .push(text(format!("Nothing found for “{}”.", e.word)).size(14))
                    .push(muted(
                        p,
                        "None of our sources have this word. Try selecting its base form, or search the sources below.",
                    ))
                    .into(),
            );
        }
        // Scripture helps
        if helps_found {
            let mut body = column![].spacing(10);
            for (guide, matches) in &e.helps {
                if matches.entries.is_empty() && matches.related.is_empty() {
                    continue;
                }
                let mut g = column![
                    text(guide.label())
                        .size(13)
                        .font(sans(font::Weight::Semibold)),
                    muted(p, guide.description()),
                ]
                .spacing(4);
                for (title, slug) in &matches.entries {
                    g = g.push(link_button(
                        p,
                        title.clone(),
                        msg(ToolsMsg::OpenHelp(*guide, slug.clone())),
                    ));
                }
                if !matches.related.is_empty() {
                    let mut related = row![muted(p, "Related:")].spacing(8);
                    for (title, slug) in &matches.related {
                        related = related.push(link_button(
                            p,
                            title.clone(),
                            msg(ToolsMsg::OpenHelp(*guide, slug.clone())),
                        ));
                    }
                    g = g.push(related.wrap());
                }
                body = body.push(g);
            }
            let count: usize = e
                .helps
                .iter()
                .map(|(_, m)| m.entries.len() + m.related.len())
                .sum();
            panel = panel.push(self.explore_section(
                0,
                "Scripture study helps",
                "Bible Dictionary · Guide · Topical Guide",
                Some(crate::journal::plural(count, "topic", "topics")),
                body.into(),
            ));
        }
        // Biblical languages
        let lexicon = |state: &'_ Load<reader_tools::Lexicon>,
                       label: &'static str|
         -> Option<Element<'_, Message>> {
            match state {
                Load::Loading => Some(muted(p, format!("Looking up {label}…"))),
                Load::Failed(_) => Some(
                    column![
                        text(format!("We couldn’t load the {label} lexicon. Check your connection and try again."))
                            .size(13)
                            .color(p.accent),
                        link_button(p, "Try again", msg(ToolsMsg::RetryLexicon)),
                    ]
                    .spacing(4)
                    .into(),
                ),
                Load::Ready(l) if l.matches.is_empty() => None,
                Load::Ready(l) => {
                    let mut c = column![text(l.title.clone()).size(13).font(sans(font::Weight::Semibold))].spacing(8);
                    for m in &l.matches {
                        c = c.push(
                            column![
                                rich_text::<(), _, _, _>([
                                    span(format!("{}  ", m.id)).size(12).font(sans(font::Weight::Bold)).color(p.accent),
                                    span(m.lemma.clone()).size(18).font(serif()),
                                    span(format!("  {}", m.transliteration)).size(13).color(p.muted),
                                ]),
                                text(m.definition.clone()).size(13).line_height(1.45),
                                text(format!("KJV: {}", m.kjv)).size(12).color(p.muted),
                            ]
                            .spacing(2),
                        );
                    }
                    if l.total > l.matches.len() {
                        c = c.push(muted(p, format!("{} more in the full lexicon", l.total - l.matches.len())));
                    }
                    Some(c.into())
                }
            }
        };
        let testament_new = self.preferences.last.volume == "newtestament";
        let mut languages = column![].spacing(12);
        let order = if testament_new {
            [(&e.greek, "Greek"), (&e.hebrew, "Hebrew")]
        } else {
            [(&e.hebrew, "Hebrew"), (&e.greek, "Greek")]
        };
        let mut lang_any = false;
        for (state, label) in order {
            if let Some(view) = lexicon(state, label) {
                lang_any = true;
                languages = languages.push(view);
            }
        }
        if lang_any {
            panel = panel.push(self.explore_section(
                1,
                "Biblical languages",
                "Strong’s Hebrew · Greek",
                None,
                languages.into(),
            ));
        }
        // English meanings
        let english: Option<Element<'_, Message>> = match &e.dictionary {
            Load::Loading => Some(muted(p, format!("Looking up {}…", e.word))),
            Load::Failed(_) => Some(
                column![
                    text("We couldn’t load dictionary entries for this word. Check your connection and try again.")
                        .size(13)
                        .color(p.accent),
                    link_button(p, "Try again", msg(ToolsMsg::RetryDictionary)),
                ]
                .spacing(4)
                .into(),
            ),
            Load::Ready(d) if d.groups.is_empty() && d.etymology.is_empty() => None,
            Load::Ready(d) => {
                let mut c = column![].spacing(10);
                for (_, source, entries) in &d.groups {
                    for (i, entry) in entries.iter().enumerate() {
                        c = c.push(
                            column![
                                text(if entries.len() > 1 {
                                    format!("{source} · entry {}", i + 1)
                                } else {
                                    source.clone()
                                })
                                .size(11)
                                .color(p.faint),
                                text(entry.heading.clone().unwrap_or_else(|| entry.word.clone()))
                                    .size(15)
                                    .font(sans(font::Weight::Semibold)),
                                text(strip_tags(&entry.entry_text)).size(13).line_height(1.5),
                            ]
                            .spacing(2),
                        );
                    }
                }
                for item in &d.etymology {
                    c = c.push(
                        column![
                            text(format!("Word history · {}", item.source)).size(11).color(p.faint),
                            text(item.word.clone()).size(15).font(sans(font::Weight::Semibold)),
                            text(strip_tags(&item.text)).size(13).line_height(1.5),
                        ]
                        .spacing(2),
                    );
                }
                Some(c.into())
            }
        };
        if let Some(english) = english {
            panel = panel.push(self.explore_section(
                2,
                "English meanings",
                "Definitions · Word history",
                None,
                english,
            ));
        }
        Some(panel.into())
    }
    fn explore_section<'a>(
        &self,
        index: usize,
        title: &'static str,
        summary: &'static str,
        count: Option<String>,
        body: Element<'a, Message>,
    ) -> Element<'a, Message> {
        let p = self.p();
        let open = self
            .tools
            .explore
            .as_ref()
            .is_some_and(|e| e.open == Some(index));
        let head = button(
            row![
                column![
                    text(title).size(14).font(sans(font::Weight::Semibold)),
                    text(summary).size(12).color(p.muted),
                ]
                .spacing(2)
                .width(Fill),
                text(count.unwrap_or_default()).size(12).color(p.faint),
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
        .padding([10, 12])
        .width(Fill)
        .on_press(msg(ToolsMsg::ToggleSection(index)))
        .style(design::ghost(p, 12.0));
        let mut section = column![head];
        if open {
            section = section.push(container(body).padding(Padding {
                top: 4.0,
                right: 12.0,
                bottom: 12.0,
                left: 12.0,
            }));
        }
        container(section)
            .width(Fill)
            .style(move |_| container::Style {
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 12.0.into(),
                },
                ..Default::default()
            })
            .into()
    }
    /// A study helps entry (`StudyHelpArticle`): its links open in the reader, the guide, or the browser.
    fn help_entry<'a>(
        &self,
        guide: Guide,
        entry: &'a reader_tools::HelpEntry,
    ) -> Element<'a, Message> {
        let p = self.p();
        let mut c = column![
            eyebrow(p, guide.label()),
            text(entry.title.clone()).size(22).font(serif()),
        ]
        .spacing(8);
        let spans_of = |content: &'a [HelpInline]| -> Element<'a, Message> {
            let mut out = Vec::new();
            inline_spans(content, p, &mut out, None);
            rich_text(out)
                .size(14)
                .line_height(1.55)
                .on_link_click(|href: String| msg(ToolsMsg::Link(href)))
                .into()
        };
        for block in &entry.blocks {
            c = c.push(match block {
                HelpBlock::Heading { content } => text(reader_tools::inline_text(content))
                    .size(15)
                    .font(sans(font::Weight::Semibold))
                    .into(),
                HelpBlock::Paragraph { content, .. } => spans_of(content),
                HelpBlock::List { items } => {
                    let mut list = column![].spacing(4);
                    for item in items {
                        list = list.push(row![text("•").size(14), spans_of(item)].spacing(8));
                    }
                    list.into()
                }
            });
        }
        if entry.truncated {
            c = c.push(muted(p, "This entry continues at its source."));
        }
        c = c.push(link_button(
            p,
            format!("Read in the {} ↗", guide.label()),
            Message::OpenLink(entry.url.clone()),
        ));
        c.into()
    }

    /// `VerseResourcesPanel`.
    fn resources_view(&self, verses: &[u32]) -> Element<'_, Message> {
        let p = self.p();
        let reference = format!(
            "{}:{}",
            self.reference(),
            crate::journal::verse_spec(verses)
        );
        let mut panel = column![
            row![
                column![
                    eyebrow(p, "Resources"),
                    text(reference.clone()).size(20).font(serif()),
                ]
                .spacing(4)
                .width(Fill),
                close(p, msg(ToolsMsg::ClosePanel)),
            ]
            .align_y(Center),
        ]
        .spacing(14);
        match &self.tools.resources {
            None | Some(Load::Loading) => {
                panel = panel.push(muted(p, "Looking for resources for these verses…"));
            }
            Some(Load::Failed(e)) => {
                panel = panel.push(
                    column![
                        text(e.clone()).size(13).color(p.accent),
                        link_button(p, "Try again", msg(ToolsMsg::RetryResources)),
                    ]
                    .spacing(4),
                );
            }
            Some(Load::Ready(list)) if list.is_empty() => {
                panel = panel.push(muted(
                    p,
                    "No resources for these verses in our published lessons yet. Search the web for more Come, Follow Me resources.",
                ));
            }
            Some(Load::Ready(list)) => {
                for (r, items) in list {
                    let mut card = column![
                        text(r.reference.clone()).size(12).color(p.faint),
                        text(r.title.clone()).size(17).font(serif()),
                        text(format!("{} · {}", r.lesson_title, r.date_label))
                            .size(12)
                            .color(p.muted),
                        markdown::view(
                            items,
                            markdown::Settings::with_text_size(
                                14,
                                markdown::Style::from(self.theme())
                            )
                        )
                        .map(|uri| msg(ToolsMsg::Link(uri.to_string()))),
                        link_button(p, "Read in lesson →", Message::OpenLink(r.href.clone())),
                    ]
                    .spacing(6);
                    if !r.sources.is_empty() {
                        let mut sources = column![
                            text("Cited in this section")
                                .size(12)
                                .font(sans(font::Weight::Semibold))
                        ]
                        .spacing(4);
                        for s in &r.sources {
                            sources = sources.push(link_button(
                                p,
                                s.title.clone(),
                                Message::OpenLink(s.url.clone()),
                            ));
                        }
                        card = card.push(sources);
                    }
                    panel = panel.push(boxed(p, card));
                }
            }
        }
        if !matches!(self.tools.resources, None | Some(Load::Loading)) {
            let q = format!("Come Follow Me {reference}");
            panel = panel.push(
                column![
                    muted(p, format!("Find more resources for {reference}")),
                    link_button(
                        p,
                        "Search Come, Follow Me on the web ↗",
                        Message::OpenLink(format!(
                            "https://www.google.com/search?q={}",
                            q.replace(' ', "+").replace(':', "%3A")
                        )),
                    ),
                ]
                .spacing(4),
            );
        }
        panel.into()
    }

    /// Your Bibles and the JST switch (`BibleTranslationControls`): in Reader settings for a Bible chapter
    /// (`in_reader`, with each Bible's Show switch), and in Settings → Translations, where the saved library is managed.
    pub(crate) fn bibles_settings(&self, in_reader: bool) -> Option<Element<'_, Message>> {
        if in_reader && !reader_tools::is_bible(&self.preferences.last.volume) {
            return None;
        }
        let p = self.p();
        let mut c = column![].spacing(12);
        // "Your Bibles" with a button opening it full screen, the website's note, then the list.
        c = c.push(
            row![
                text("Your Bibles")
                    .size(14)
                    .font(sans(font::Weight::Medium))
                    .width(Fill),
                self.hint(
                    button(expand_icon(Color { a: 0.55, ..p.ink }, 16.0))
                        .padding(6)
                        .on_press(msg(ToolsMsg::BiblesView(BiblesView::List)))
                        .style(design::quiet(p)),
                    "Full screen".into(),
                ),
            ]
            .align_y(Center),
        );
        c = c.push(
            text("Your default Bible is the main text when you open Bible chapters. Removing it restores the King James Bible.")
                .size(12)
                .color(Color { a: 0.6, ..p.ink }),
        );
        c = c.push(self.bible_list(in_reader));
        // The JST is Latter-day Saint content: its switch shows only for that tradition, in a disclosure.
        if self.show_lds() {
            let open = self.tools.jst_details;
            c = c.push(
                button(
                    row![
                        design::rotated_icon(
                            &icons::CHEVRON_DOWN,
                            Color { a: 0.7, ..p.ink },
                            9.,
                            if open { 0.0 } else { -90.0 },
                        ),
                        text("Joseph Smith Translation")
                            .size(12)
                            .color(Color { a: 0.7, ..p.ink }),
                    ]
                    .spacing(6)
                    .align_y(Center),
                )
                .padding([8, 0])
                .on_press(msg(ToolsMsg::JstDetails))
                .style(|_, _| button::Style::default()),
            );
            if open {
                c = c.push(
                    row![
                        column![
                            text("When the LDS edition is the main text, show selected JST passages in place of the KJV verses they revise, with the JST's own wording underlined.")
                                .size(11)
                                .color(Color { a: 0.6, ..p.ink }),
                            button(design::underlined(
                                "Source",
                                11.,
                                Color { a: 0.6, ..p.ink },
                                font::Weight::Normal,
                            ))
                            .padding(0)
                            .on_press(Message::OpenLink(JST_SOURCE_DOCS_URL.into()))
                            .style(design::underlined_link(p)),
                        ]
                        .spacing(2)
                        .width(Fill),
                        self.switch(self.preferences.jst, msg(ToolsMsg::ToggleJst)),
                    ]
                    .spacing(12)
                    .align_y(iced::Alignment::Start),
                );
            }
            if let Some(Load::Failed(e)) = &self.tools.jst {
                c = c.push(
                    text(format!("JST passages couldn't be loaded: {e}"))
                        .size(12)
                        .color(p.accent),
                );
            }
        }
        Some(c.into())
    }
    /// `BibleList`: the bundled Bible and each saved one (in the reader, also those shown but not saved), each with
    /// Make default, its Show switch in the reader, and Remove (or Save); then "+ Add Bible", which opens the catalog
    /// full screen.
    fn bible_list(&self, in_reader: bool) -> Element<'_, Message> {
        let p = self.p();
        let default = self.preferences.default_bible.clone();
        let same = |a: &str, b: &str| a.eq_ignore_ascii_case(b);
        let mut c = column![].spacing(12);
        let make_default = |id: &str| -> Element<'_, Message> {
            let current = same(&default, id);
            button(design::underlined(
                if current { "Default" } else { "Make default" },
                12.,
                p.ink,
                font::Weight::Medium,
            ))
            .padding([6, 8])
            .on_press(msg(ToolsMsg::SetDefault(id.to_string())))
            .style(design::underlined_link(p))
            .into()
        };
        let base = crate::faith::base_bible_label(self.show_lds());
        let mut list = column![
            container(
                row![
                    column![
                        text(base).size(14).font(sans(font::Weight::Medium)),
                        text("English · Available offline")
                            .size(12)
                            .color(Color { a: 0.6, ..p.ink }),
                    ]
                    .spacing(2)
                    .width(Fill),
                    make_default(crate::faith::LDS_BIBLE_ID),
                ]
                .spacing(8)
                .align_y(Center),
            )
            .padding([10, 12])
        ];
        // Saved Bibles, then (in the reader) any shown but not saved (`rows`).
        let mut rows: Vec<(reader_tools::FavoriteBible, bool)> = self
            .preferences
            .bibles
            .iter()
            .map(|b| (b.clone(), true))
            .collect();
        if in_reader {
            for id in &self.preferences.compare_bibles {
                if !rows.iter().any(|(b, _)| same(&b.id, id)) {
                    let known = reader_tools::featured_bibles()
                        .into_iter()
                        .find(|b| same(&b.id, id))
                        .unwrap_or(reader_tools::FavoriteBible {
                            id: id.clone(),
                            label: id.clone(),
                            language: None,
                            abbreviation: None,
                        });
                    rows.push((known, false));
                }
            }
        }
        for (bible, saved) in rows {
            let shown = self
                .preferences
                .compare_bibles
                .iter()
                .any(|t| same(t, &bible.id));
            let detail = [
                bible.language.clone(),
                bible.abbreviation.clone(),
                (!saved).then(|| "Not saved".to_string()),
            ]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join(" · ");
            let id = bible.id.clone();
            let mut line = row![
                column![
                    text(bible.label.clone())
                        .size(14)
                        .font(sans(font::Weight::Medium)),
                    text(detail).size(12).color(Color { a: 0.6, ..p.ink }),
                ]
                .spacing(2)
                .width(Fill),
            ]
            .spacing(8)
            .align_y(Center);
            if saved {
                line = line.push(make_default(&id));
            }
            if in_reader && !same(&default, &id) {
                line = line.push(self.switch(shown, msg(ToolsMsg::ShowBible(id.clone(), !shown))));
            }
            line = line.push(if saved {
                Element::from(
                    button(icon(&icons::TRASH, Color { a: 0.5, ..p.ink }, 13.))
                        .padding(8)
                        .on_press(msg(ToolsMsg::RemoveBible(id)))
                        .style(design::quiet(p)),
                )
            } else {
                button(design::underlined("Save", 12., p.ink, font::Weight::Medium))
                    .padding([6, 8])
                    .on_press(msg(ToolsMsg::SaveBible(bible.clone())))
                    .style(design::underlined_link(p))
                    .into()
            });
            list = list.push(divider(p));
            list = list.push(container(line).padding([10, 12]));
        }
        c = c.push(
            container(list)
                .width(Fill)
                .style(move |_| container::Style {
                    border: Border {
                        color: p.rule,
                        width: 1.0,
                        radius: 12.0.into(),
                    },
                    ..Default::default()
                }),
        );
        if self.preferences.bibles.is_empty() {
            c = c.push(
                text("Add a Bible to read it verse by verse beside the base text.")
                    .size(12)
                    .color(Color { a: 0.6, ..p.ink }),
            );
        }
        c = c.push(
            button(
                text("+ Add Bible")
                    .size(14)
                    .font(sans(font::Weight::Medium))
                    .center()
                    .width(Fill),
            )
            .padding([10, 12])
            .width(Fill)
            .on_press(msg(ToolsMsg::BiblesView(BiblesView::Add)))
            .style(design::outlined(p, 8.0)),
        );
        c.into()
    }
    /// The website's full-screen Your Bibles dialog (`<dialog>` in `BibleTranslationControls`): over everything, a
    /// header with ‹ Back (in the catalog and language chooser), the view's title and Done, and the list of Bibles,
    /// the catalog ("Add a Bible") or the language chooser ("Choose a language") in a 36rem column that scrolls.
    pub(crate) fn bibles_dialog(&self) -> Option<Element<'_, Message>> {
        let view = self.tools.bibles_dialog.clone()?;
        let p = self.p();
        let in_reader = self.screen != crate::Screen::Settings;
        let choosing = view == BiblesView::Add
            && self.tools.choosing_language
            && matches!(self.tools.catalog, Some(Load::Ready(_)));
        let title = match (&view, choosing) {
            (BiblesView::List, _) => "Your Bibles",
            (_, false) => "Add a Bible",
            (_, true) => "Choose a language",
        };
        let back: Element<'_, Message> = match (&view, choosing) {
            (BiblesView::List, _) => space().width(80).into(),
            (_, true) => link_button(p, "‹ Back", msg(ToolsMsg::ChooseLanguage(false))),
            (_, false) => link_button(p, "‹ Back", msg(ToolsMsg::BiblesView(BiblesView::List))),
        };
        let done = button(text("Done").size(14).font(sans(font::Weight::Medium)))
            .padding([8, 16])
            .on_press(msg(ToolsMsg::CloseBibles))
            .style(design::outlined(p, 8.0));
        let wide = self.bibles_dialog_wide();
        let bar = container(
            row![
                container(back).width(80),
                text(title)
                    .size(16)
                    .font(sans(font::Weight::Medium))
                    .center()
                    .width(Fill),
                container(done)
                    .width(80)
                    .align_x(iced::alignment::Horizontal::Right),
            ]
            .spacing(8)
            .align_y(Center),
        )
        .max_width(if wide { f32::INFINITY } else { 576.0 })
        .padding(if wide { [12, 20] } else { [12, 16] });
        let header = column![
            container(bar).center_x(Fill),
            container(space())
                .width(Fill)
                .height(1)
                .style(move |_| container::Style {
                    background: Some(p.rule.into()),
                    ..Default::default()
                }),
        ];
        let list = view == BiblesView::List;
        let body: Element<'_, Message> = match view {
            BiblesView::List => self.bible_list(in_reader),
            BiblesView::Add if choosing => self.language_chooser(),
            BiblesView::Add => self.catalog_picker(),
        };
        let body = if wide {
            container(body).padding([24, 32]).width(Fill)
        } else {
            container(container(body).max_width(576).padding([20, 16])).center_x(Fill)
        };
        let body = self.scroll(body).id("bibles-dialog");
        if !wide {
            // Phones and narrow windows: the whole window, as `h-dvh w-screen`.
            return Some(opaque(
                container(column![header, body.height(Fill)])
                    .width(Fill)
                    .height(Fill)
                    .style(move |_| container::Style {
                        background: Some(p.paper.into()),
                        text_color: Some(p.ink),
                        ..Default::default()
                    }),
            ));
        }
        // From 768px, a centered panel over the dimmed page: the list narrow and as tall as its rows, the catalog
        // and language chooser wide with a steady height so the panel doesn't jump while searching.
        let (w, h) = (self.window_width, self.window_height);
        let (width, height) = if list {
            ((w - 64.0).min(576.0), None)
        } else {
            ((w - 64.0).min(960.0), Some((h - 64.0).min(768.0)))
        };
        let panel = container(column![
            header,
            match height {
                Some(_) => body.height(Fill),
                None => body.height(Length::Shrink),
            }
        ])
        .width(width)
        .max_height(h - 64.0)
        .style(move |_| container::Style {
            background: Some(p.paper.into()),
            text_color: Some(p.ink),
            border: Border {
                color: p.rule,
                width: 1.0,
                radius: 16.0.into(),
            },
            shadow: iced::Shadow {
                color: design::fade(p.ink, 0.22),
                offset: iced::Vector::new(0.0, 18.0),
                blur_radius: 48.0,
            },
            ..Default::default()
        });
        let panel = match height {
            Some(height) => panel.height(height),
            None => panel,
        };
        // The backdrop closes it; the panel takes its own clicks, so nothing reaches the page behind.
        let backdrop =
            iced::widget::mouse_area(container(space()).width(Fill).height(Fill).style(|_| {
                container::Style {
                    background: Some(iced::Color::from_rgba(0.0, 0.0, 0.0, 0.4).into()),
                    ..Default::default()
                }
            }))
            .on_press(msg(ToolsMsg::CloseBibles));
        Some(opaque(
            iced::widget::stack![
                backdrop,
                container(opaque(panel)).center_x(Fill).center_y(Fill),
            ]
            .width(Fill)
            .height(Fill),
        ))
    }
    /// Whether the Bibles dialog is a centered panel (`md:`, from 768px) rather than the whole window.
    pub(crate) fn bibles_dialog_wide(&self) -> bool {
        self.window_width >= 768.0
    }
    /// The language chooser's options: "All languages" (while the search fits it), then the matching languages.
    pub(crate) fn language_options(&self) -> Vec<bible_catalog::Language> {
        let Some(Load::Ready(catalog)) = &self.tools.catalog else {
            return vec![];
        };
        let query = self.tools.language_query.trim().to_lowercase();
        let mut options = vec![];
        if "all languages".starts_with(&query) {
            options.push(bible_catalog::Language {
                id: bible_catalog::ALL_LANGUAGES.into(),
                label: "All languages".into(),
                native_name: None,
                count: catalog.len(),
            });
        }
        options.extend(bible_catalog::search_languages(
            &bible_catalog::languages(catalog),
            &self.tools.language_query,
        ));
        options
    }
    /// `LanguageChooser`: a search, then languages by how many Bibles each has, the current one checked.
    fn language_chooser(&self) -> Element<'_, Message> {
        let p = self.p();
        let options = self.language_options();
        let mut c = column![
            container(
                text_input(
                    "Search languages, e.g. Spanish or español",
                    &self.tools.language_query
                )
                .id("language-search")
                .on_input(|q| msg(ToolsMsg::LanguageQuery(q)))
                .on_submit(msg(ToolsMsg::LanguageFirst))
                .padding([9, 12])
                .size(13)
            )
            .max_width(if self.bibles_dialog_wide() {
                448.0
            } else {
                f32::INFINITY
            })
        ]
        .spacing(10);
        if options.is_empty() {
            c = c.push(muted(
                p,
                format!(
                    "No language matches “{}”.",
                    self.tools.language_query.trim()
                ),
            ));
            return c.into();
        }
        let columns = if !self.bibles_dialog_wide() {
            1
        } else if self.window_width >= 1024.0 {
            3
        } else {
            2
        };
        let option = |l: &bible_catalog::Language| {
            let current = l.id == self.tools.catalog_language;
            button(
                row![
                    text(bible_catalog::language_display(l))
                        .size(13)
                        .width(Fill),
                    text(if current { "✓" } else { "" }).size(13),
                ]
                .align_y(Center),
            )
            .padding(if columns > 1 { [9, 12] } else { [9, 14] })
            .width(Fill)
            .on_press(msg(ToolsMsg::CatalogLanguage(l.id.clone())))
            .style(move |_, status| button::Style {
                background: if matches!(status, button::Status::Hovered) {
                    Some(p.hover.into())
                } else if current && columns > 1 {
                    Some(p.soft.into())
                } else {
                    None
                },
                text_color: p.ink,
                border: iced::Border {
                    radius: if columns > 1 { 8.0 } else { 0.0 }.into(),
                    ..Default::default()
                },
                ..Default::default()
            })
        };
        let shown: Vec<_> = options.iter().take(self.tools.language_limit).collect();
        let list: Element<'_, Message> = if columns == 1 {
            let mut list = column![].spacing(0);
            for (i, l) in shown.iter().enumerate() {
                if i > 0 {
                    list = list.push(divider(p));
                }
                list = list.push(option(l));
            }
            list.into()
        } else {
            // `md:grid md:grid-cols-2 md:gap-1 md:p-1.5 lg:grid-cols-3`.
            let mut grid = column![].spacing(4);
            for chunk in shown.chunks(columns) {
                let mut line = row![].spacing(4);
                for l in chunk {
                    line = line.push(container(option(l)).width(Fill));
                }
                for _ in chunk.len()..columns {
                    line = line.push(space().width(Fill));
                }
                grid = grid.push(line);
            }
            container(grid).padding(6).into()
        };
        c = c.push(boxed(p, list));
        if options.len() > self.tools.language_limit {
            c = c.push(more_button(p, msg(ToolsMsg::LanguagesMore)));
        }
        c.into()
    }
    /// `TranslationCatalogPicker`: a search, the language (with Change ›), the featured English Bibles until a
    /// search, a language or "Browse all English Bibles" asks for more, then the matching Bibles 40 at a time.
    fn catalog_picker(&self) -> Element<'_, Message> {
        let p = self.p();
        let catalog: &[reader_tools::Translation] = match &self.tools.catalog {
            Some(Load::Ready(all)) => all,
            _ => &[],
        };
        let ready = matches!(self.tools.catalog, Some(Load::Ready(_)));
        let language = self.tools.catalog_language.as_str();
        let query = self.tools.catalog_query.as_str();
        let language_name = if language == bible_catalog::ALL_LANGUAGES {
            "All languages".to_string()
        } else {
            bible_catalog::languages(catalog)
                .into_iter()
                .find(|l| l.id == language)
                .map(|l| l.label)
                .unwrap_or_else(|| {
                    if language == bible_catalog::DEFAULT_LANGUAGE {
                        "English".into()
                    } else {
                        language.into()
                    }
                })
        };
        let featured_only = language == bible_catalog::DEFAULT_LANGUAGE
            && query.trim().is_empty()
            && !self.tools.catalog_browsing;
        let saved = |id: &str| {
            self.preferences
                .bibles
                .iter()
                .any(|b| b.id.eq_ignore_ascii_case(id))
        };
        // (Bible to save, title, subtitle).
        let rows: Vec<(reader_tools::FavoriteBible, String, String)> = if featured_only {
            reader_tools::featured_bibles()
                .into_iter()
                .map(|f| {
                    let title = f.label.clone();
                    let sub = f.abbreviation.clone().unwrap_or_default();
                    (f, title, sub)
                })
                .collect()
        } else {
            bible_catalog::filter(catalog, language, query)
                .into_iter()
                .map(|t| {
                    let featured = reader_tools::featured_bibles()
                        .into_iter()
                        .find(|f| f.id == t.id);
                    let mut bible = t.favorite();
                    let (title, abbr) = match &featured {
                        Some(f) => (f.label.clone(), f.abbreviation.clone()),
                        None => (t.title(), t.short_name.clone()),
                    };
                    bible.label = title.clone();
                    bible.abbreviation = abbr.clone();
                    let sub = [
                        abbr,
                        bible_catalog::native_name(t, &title),
                        (language == bible_catalog::ALL_LANGUAGES).then(|| t.language_label()),
                    ]
                    .into_iter()
                    .flatten()
                    .collect::<Vec<_>>()
                    .join(" · ");
                    (bible, title, sub)
                })
                .collect()
        };
        let wide = self.bibles_dialog_wide();
        let controls = column![
            text_input("Search by name or abbreviation", query)
                .id("catalog-search")
                .on_input(|q| msg(ToolsMsg::CatalogQuery(q)))
                .padding([9, 12])
                .size(13),
            button(
                row![
                    text("Language: ").size(13).color(p.muted),
                    text(language_name.clone())
                        .size(13)
                        .font(sans(font::Weight::Medium))
                        .width(Fill),
                    text("Change ›").size(12).color(p.muted),
                ]
                .align_y(Center),
            )
            .padding([9, 12])
            .width(Fill)
            .on_press_maybe(ready.then(|| msg(ToolsMsg::ChooseLanguage(true))))
            .style(design::outlined(p, 8.0)),
        ]
        .spacing(12);
        let mut c = column![].spacing(12);
        // Beside the controls, the results say what they are (`md:block`).
        if wide && !rows.is_empty() {
            c = c.push(
                text(if featured_only {
                    "Featured English Bibles".to_string()
                } else {
                    format!(
                        "{} {}{}",
                        rows.len(),
                        if rows.len() == 1 { "Bible" } else { "Bibles" },
                        if language == bible_catalog::ALL_LANGUAGES {
                            " in all languages".to_string()
                        } else {
                            format!(" in {language_name}")
                        }
                    )
                })
                .size(12)
                .color(p.muted),
            );
        }
        if let Some(Load::Failed(_)) = &self.tools.catalog {
            c = c.push(boxed(
                p,
                row![
                    text("The full list of Bibles couldn’t load.")
                        .size(12)
                        .width(Fill),
                    button(text("Try again").size(12).font(sans(font::Weight::Medium)))
                        .padding([6, 12])
                        .on_press(msg(ToolsMsg::BiblesView(BiblesView::Add)))
                        .style(design::outlined(p, 8.0)),
                ]
                .padding(10)
                .align_y(Center),
            ));
        }
        let shown = if featured_only {
            rows.len()
        } else {
            rows.len().min(self.tools.catalog_limit)
        };
        if !rows.is_empty() {
            let mut list = column![].spacing(0);
            for (i, (bible, title, sub)) in rows.iter().take(shown).enumerate() {
                if i > 0 {
                    list = list.push(divider(p));
                }
                let added = saved(&bible.id);
                let mut info = column![
                    text(title.clone())
                        .size(13)
                        .font(sans(font::Weight::Medium))
                ]
                .spacing(2);
                if !sub.is_empty() {
                    info = info.push(text(sub.clone()).size(11.5).color(p.faint));
                }
                list = list.push(
                    row![
                        info.width(Fill),
                        if added {
                            Element::from(text("Added").size(12).color(p.faint))
                        } else {
                            button(text("Add").size(12).font(sans(font::Weight::Medium)))
                                .padding([6, 12])
                                .on_press(msg(ToolsMsg::SaveBible(bible.clone())))
                                .style(design::outlined(p, 8.0))
                                .into()
                        }
                    ]
                    .spacing(12)
                    .padding([10, 14])
                    .align_y(Center),
                );
            }
            c = c.push(boxed(p, list));
        }
        if matches!(self.tools.catalog, Some(Load::Loading)) && !featured_only {
            c = c.push(muted(p, "Loading the catalog…"));
        }
        if featured_only && ready {
            c = c.push(
                button(
                    iced::widget::rich_text::<(), _, _, _>([
                        span("Browse all English Bibles").underline(true)
                    ])
                    .size(12)
                    .font(sans(font::Weight::Medium)),
                )
                .padding([6, 0])
                .width(Fill)
                .on_press(msg(ToolsMsg::BrowseAllEnglish))
                .style(|_, _| button::Style::default()),
            );
        }
        if !featured_only && rows.len() > self.tools.catalog_limit {
            c = c.push(more_button(p, msg(ToolsMsg::CatalogMore)));
        }
        if ready && rows.is_empty() {
            let mut none = column![
                text(format!(
                    "No Bibles match “{}”{}.",
                    query.trim(),
                    if language == bible_catalog::ALL_LANGUAGES {
                        String::new()
                    } else {
                        format!(" in {language_name}")
                    }
                ))
                .size(13)
            ]
            .spacing(6);
            if bible_catalog::licensed_only(query) {
                none = none.push(
                    text("NRSVue, NIV, NLT, CSB and ESV need a publisher’s license, so they aren’t available here.")
                        .size(12)
                        .color(p.muted),
                );
            }
            if language != bible_catalog::ALL_LANGUAGES
                && !query.trim().is_empty()
                && !bible_catalog::filter(catalog, bible_catalog::ALL_LANGUAGES, query).is_empty()
            {
                none = none.push(link_button(
                    p,
                    "Search all languages",
                    msg(ToolsMsg::CatalogLanguage(
                        bible_catalog::ALL_LANGUAGES.into(),
                    )),
                ));
            }
            c = c.push(
                container(none)
                    .padding(14)
                    .width(Fill)
                    .style(move |_| container::Style {
                        border: Border {
                            color: p.rule,
                            width: 1.0,
                            radius: 12.0.into(),
                        },
                        ..Default::default()
                    }),
            );
        }
        if wide {
            // `md:grid-cols-[17rem_minmax(0,1fr)] md:gap-8`: the search and language beside the results.
            row![controls.width(272), c.width(Fill)].spacing(32).into()
        } else {
            column![controls, c].spacing(12).into()
        }
    }
    /// The website's `marker-switch`.
    pub(crate) fn switch<'a>(&self, on: bool, m: Message) -> Element<'a, Message> {
        let p = self.p();
        button(
            container(
                container(space())
                    .width(14)
                    .height(14)
                    .style(move |_| container::Style {
                        background: Some(if on { p.card } else { p.muted }.into()),
                        border: Border {
                            radius: 7.0.into(),
                            ..Default::default()
                        },
                        ..Default::default()
                    }),
            )
            .padding(Padding::ZERO.left(if on { 16.0 } else { 2.0 }).top(2))
            .width(34)
            .height(Length::Fixed(20.0))
            .style(move |_| container::Style {
                background: Some(if on { p.accent } else { p.soft }.into()),
                border: Border {
                    color: if on { p.accent } else { p.rule },
                    width: 1.0,
                    radius: 10.0.into(),
                },
                ..Default::default()
            }),
        )
        .padding(0)
        .on_press(m)
        .style(|_, _| button::Style::default())
        .into()
    }
}
fn inline_spans<'a>(
    content: &'a [HelpInline],
    p: Colors,
    out: &mut Vec<iced::widget::text::Span<'a, String>>,
    style: Option<(&'a str, Option<String>)>,
) {
    for node in content {
        match node {
            HelpInline::Text(t) => {
                let mut s = span(t.clone());
                if let Some((mark, link)) = &style {
                    s = match *mark {
                        "em" => s.font(design::serif_italic()),
                        "strong" | "key" => s.font(sans(font::Weight::Bold)),
                        "small" => s.size(12),
                        _ => s,
                    };
                    if let Some(link) = link {
                        s = s.color(p.accent).underline(true).link(link.clone());
                    }
                }
                out.push(s);
            }
            HelpInline::Mark { mark, children } => {
                let link = style.as_ref().and_then(|(_, l)| l.clone());
                inline_spans(children, p, out, Some((mark.as_str(), link)));
            }
            HelpInline::Link {
                href,
                app_href,
                topic,
                children,
            } => {
                // The passage opens in this reader; another topic of the study helps opens at its source.
                let target = app_href
                    .clone()
                    .or_else(|| topic.as_ref().map(|_| href.clone()))
                    .unwrap_or_else(|| href.clone());
                let mark = style.as_ref().map(|(m, _)| *m).unwrap_or("");
                inline_spans(children, p, out, Some((mark, Some(target))));
            }
        }
    }
}
fn divider<'a>(p: Colors) -> Element<'a, Message> {
    container(space())
        .height(1)
        .width(Fill)
        .style(move |_| container::Style {
            background: Some(p.rule.into()),
            ..Default::default()
        })
        .into()
}
fn more_button<'a>(p: Colors, m: Message) -> Element<'a, Message> {
    button(
        text("Show more")
            .size(12)
            .font(sans(font::Weight::Medium))
            .center()
            .width(Fill),
    )
    .padding(10)
    .width(Fill)
    .on_press(m)
    .style(design::outlined(p, 8.0))
    .into()
}
fn strip_tags(text: &str) -> String {
    let tag = regex::Regex::new(r"(?s)<[^>]*>").unwrap();
    let plain = tag.replace_all(text, "");
    plain
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
}

/// The website's "Full screen" icon (two arrows apart), drawn from its own SVG.
fn expand_icon<'a>(color: Color, size: f32) -> iced::widget::Svg<'a> {
    static HANDLE: std::sync::OnceLock<iced::widget::svg::Handle> = std::sync::OnceLock::new();
    let handle = HANDLE.get_or_init(|| {
        iced::widget::svg::Handle::from_memory(
            &br##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4h4v4M8 16H4v-4M16 4l-5 5M4 16l5-5"/></svg>"##[..],
        )
    });
    iced::widget::svg(handle.clone())
        .width(size)
        .height(size)
        .style(move |_, _| iced::widget::svg::Style { color: Some(color) })
}
