// The reader tools' views: the side panel (study paths, Explore a word, lesson resources), study path markers,
// other Bibles under each verse with their changed words, JST passages, and Your Bibles in Reader settings.
use crate::design::{self, Colors, icon, sans, serif};
use crate::icons;
use crate::reader_tools::{
    self, BiblesView, Diff, Guide, HelpBlock, HelpInline, Load, Panel, StudyPath, ToolsMsg,
};
use crate::{App, Message};
use iced::widget::{
    button, column, container, markdown, rich_text, row, space, span, stack, text, text_input,
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
    /// Bibles that couldn't be loaded for this chapter (`translationNotices`).
    pub(crate) fn comparison_notices(&self) -> Option<Element<'_, Message>> {
        let failed: Vec<String> = self
            .tools
            .compare
            .iter()
            .filter(|(_, state)| matches!(state, Load::Failed(_)))
            .map(|(id, _)| {
                format!(
                    "Could not load overlay translation \"{}\".",
                    id.to_uppercase()
                )
            })
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
    /// The base text's label (`primaryTranslationLabel`) and its amber.
    fn primary_label(&self) -> (&'static str, Color) {
        (
            "LDS",
            if self.preferences.dark {
                Color::from_rgb8(0xfc, 0xd3, 0x4d)
            } else {
                Color::from_rgb8(0xb4, 0x53, 0x09)
            },
        )
    }
    /// Spans of `kjv[range]` with the reader's highlights drawn on its words.
    fn marked_spans<'a>(
        &self,
        kjv: &str,
        range: std::ops::Range<usize>,
        marks: &[(std::ops::Range<usize>, Option<Color>, Option<Color>)],
        color: Option<Color>,
    ) -> Vec<iced::widget::text::Span<'a, ()>> {
        let mut cuts = vec![range.start, range.end];
        for (r, ..) in marks {
            for c in [r.start, r.end] {
                if c > range.start && c < range.end {
                    cuts.push(c);
                }
            }
        }
        cuts.sort_unstable();
        cuts.dedup();
        cuts.windows(2)
            .map(|w| {
                let mut sp = span(kjv[w[0]..w[1]].to_string());
                if let Some(c) = color {
                    sp = sp.color(c);
                }
                if let Some((_, highlight, underline)) = marks
                    .iter()
                    .find(|(r, ..)| r.start <= w[0] && r.end >= w[1])
                {
                    if let Some(h) = highlight {
                        sp = sp.background(*h);
                    }
                    if let Some(u) = underline {
                        sp = sp.underline(true).color(*u);
                    }
                }
                sp
            })
            .collect()
    }
    /// A verse read against other Bibles, in the reader's Comparison view: inline (the KJV with each change shown
    /// as "KJV / other") or side by side (`ChapterReader`'s comparison rows).
    pub(crate) fn comparison_text<'a>(
        &'a self,
        prefix: &str,
        kjv: &'a str,
        comparisons: Vec<(String, Color, &'a str)>,
        marks: Vec<(std::ops::Range<usize>, Option<Color>, Option<Color>)>,
        font: iced::Font,
    ) -> Element<'a, Message> {
        let p = self.p();
        let (primary, amber) = self.primary_label();
        let faint = Color { a: 0.35, ..p.ink };
        let line = iced::widget::text::LineHeight::Absolute(24.0.into());
        if !self.preferences.side_by_side {
            let mut spans: Vec<iced::widget::text::Span<'_, ()>> = vec![span(prefix.to_string())];
            for (i, (_, color, other)) in comparisons.iter().enumerate() {
                if i > 0 {
                    spans.push(span("  |  ").color(faint));
                }
                for piece in reader_tools::diff_words(kjv, other) {
                    match piece {
                        Diff::Same(r) => spans.extend(self.marked_spans(kjv, r, &marks, None)),
                        Diff::Changed(r, changed) => {
                            let lead = kjv[r.clone()].len() - kjv[r.clone()].trim_start().len();
                            let start = r.start + lead;
                            spans.push(span(" "));
                            if start < r.end {
                                spans.extend(self.marked_spans(
                                    kjv,
                                    start..r.end,
                                    &marks,
                                    Some(amber),
                                ));
                            } else {
                                spans.push(span("-").color(faint));
                            }
                            spans.push(span(" / ").color(Color { a: 0.4, ..p.ink }));
                            spans.push(if changed.is_empty() {
                                span("-").color(faint)
                            } else {
                                span(changed).color(*color)
                            });
                            spans.push(span(" "));
                        }
                    }
                }
            }
            return rich_text(spans)
                .size(14)
                .font(font)
                .line_height(line)
                .width(Fill)
                .into();
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
                primary.to_string(),
                amber,
                rich_text(self.marked_spans(kjv, 0..kjv.len(), &marks, None))
                    .size(14)
                    .font(font)
                    .line_height(line)
                    .into(),
            );
            let them = cell(
                label,
                color,
                text(other).size(14).font(font).line_height(line).into(),
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
        column![text(prefix.to_string()).size(14).line_height(line), boxes]
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
            Some(Load::Ready(_)) if self.preferences.jst => self.tools.jst_reading.rows.get(&verse),
            _ => None,
        }
    }
    /// The excerpts shown whole before the text (`jstReading.leading`).
    pub(crate) fn jst_leading_cards(&self) -> Vec<Element<'_, Message>> {
        match &self.tools.jst {
            Some(Load::Ready(excerpts)) if self.preferences.jst => self
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
        if !self.preferences.jst || !reader_tools::is_bible(&self.preferences.last.volume) {
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

    /// Your Bibles and the JST switch, in Reader settings for a Bible chapter (`BibleTranslationToolbar`).
    pub(crate) fn bibles_settings(&self) -> Option<Element<'_, Message>> {
        if !reader_tools::is_bible(&self.preferences.last.volume) {
            return None;
        }
        let p = self.p();
        let mut c = column![].spacing(8);
        match self.tools.bibles_view {
            BiblesView::List => {
                c = c.push(self.setting_label("Your Bibles"));
                let mut list = column![
                    column![
                        text("King James Bible (LDS edition)")
                            .size(13)
                            .font(sans(font::Weight::Medium)),
                        text("English · Base text, always shown")
                            .size(11)
                            .color(p.faint),
                    ]
                    .spacing(1)
                ]
                .spacing(8);
                let mut rows: Vec<(reader_tools::FavoriteBible, bool)> = self
                    .preferences
                    .bibles
                    .iter()
                    .map(|b| (b.clone(), true))
                    .collect();
                for id in &self.preferences.compare_bibles {
                    if !rows.iter().any(|(b, _)| b.id.eq_ignore_ascii_case(id)) {
                        let known = reader_tools::featured_bibles()
                            .into_iter()
                            .find(|b| b.id.eq_ignore_ascii_case(id))
                            .unwrap_or(reader_tools::FavoriteBible {
                                id: id.clone(),
                                label: id.clone(),
                                language: None,
                                abbreviation: None,
                            });
                        rows.push((known, false));
                    }
                }
                for (bible, saved) in rows {
                    let shown = self
                        .preferences
                        .compare_bibles
                        .iter()
                        .any(|t| t.eq_ignore_ascii_case(&bible.id));
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
                    list = list.push(
                        row![
                            column![
                                text(bible.label.clone())
                                    .size(13)
                                    .font(sans(font::Weight::Medium)),
                                text(detail).size(11).color(p.faint),
                            ]
                            .spacing(1)
                            .width(Fill),
                            self.switch(shown, msg(ToolsMsg::ShowBible(id.clone(), !shown))),
                            if saved {
                                Element::from(
                                    button(icon(&icons::TRASH, p.faint, 12.))
                                        .padding(6)
                                        .on_press(msg(ToolsMsg::RemoveBible(id)))
                                        .style(design::quiet(p)),
                                )
                            } else {
                                link_button(p, "Save", msg(ToolsMsg::SaveBible(bible.clone())))
                            },
                        ]
                        .spacing(8)
                        .align_y(Center),
                    );
                }
                c = c.push(list);
                if self.preferences.bibles.is_empty() {
                    c = c.push(muted(
                        p,
                        "Add a Bible to read it verse by verse beside the base text.",
                    ));
                }
                c = c.push(
                    button(
                        text("+ Add Bible")
                            .size(13)
                            .font(sans(font::Weight::Medium))
                            .center()
                            .width(Fill),
                    )
                    .padding([8, 12])
                    .width(Fill)
                    .on_press(msg(ToolsMsg::BiblesView(BiblesView::Add)))
                    .style(design::outlined(p, 8.0)),
                );
            }
            BiblesView::Add => {
                c = c.push(
                    row![
                        link_button(p, "‹ Back", msg(ToolsMsg::BiblesView(BiblesView::List))),
                        space::horizontal(),
                        self.setting_label("Add a Bible"),
                    ]
                    .align_y(Center),
                );
                c = c.push(
                    text_input("Search Bibles or languages", &self.tools.catalog_query)
                        .on_input(|q| msg(ToolsMsg::CatalogQuery(q)))
                        .padding([7, 10])
                        .size(13),
                );
                let saved = |id: &str| {
                    self.preferences
                        .bibles
                        .iter()
                        .any(|b| b.id.eq_ignore_ascii_case(id))
                };
                let query = self.tools.catalog_query.trim().to_lowercase();
                let mut list = column![].spacing(2);
                let mut shown = 0;
                let featured = reader_tools::featured_bibles();
                let catalog: Vec<reader_tools::FavoriteBible> = match &self.tools.catalog {
                    Some(Load::Ready(all)) => all.iter().map(|t| t.favorite()).collect(),
                    _ => vec![],
                };
                for bible in featured.iter().chain(
                    catalog
                        .iter()
                        .filter(|b| !featured.iter().any(|f| f.id.eq_ignore_ascii_case(&b.id))),
                ) {
                    let haystack = format!(
                        "{} {} {} {}",
                        bible.label,
                        bible.id,
                        bible.language.clone().unwrap_or_default(),
                        bible.abbreviation.clone().unwrap_or_default()
                    )
                    .to_lowercase();
                    let english = bible.language.as_deref() == Some("English");
                    if (query.is_empty() && !english)
                        || (!query.is_empty() && !haystack.contains(&query))
                        || saved(&bible.id)
                    {
                        continue;
                    }
                    shown += 1;
                    if shown > 60 {
                        break;
                    }
                    list = list.push(
                        button(
                            column![
                                text(bible.label.clone())
                                    .size(13)
                                    .font(sans(font::Weight::Medium)),
                                text(
                                    [bible.language.clone(), bible.abbreviation.clone()]
                                        .into_iter()
                                        .flatten()
                                        .collect::<Vec<_>>()
                                        .join(" · ")
                                )
                                .size(11)
                                .color(p.faint),
                            ]
                            .spacing(1),
                        )
                        .padding([6, 8])
                        .width(Fill)
                        .on_press(msg(ToolsMsg::SaveBible(bible.clone())))
                        .style(design::quiet(p)),
                    );
                }
                c = c.push(self.scroll(list).height(Length::Fixed(220.0)));
                match &self.tools.catalog {
                    Some(Load::Loading) => c = c.push(muted(p, "Loading the catalog…")),
                    Some(Load::Failed(e)) => {
                        c = c.push(
                            column![
                                text(format!("The catalog couldn't be loaded: {e}"))
                                    .size(12)
                                    .color(p.accent),
                                link_button(
                                    p,
                                    "Try again",
                                    msg(ToolsMsg::BiblesView(BiblesView::Add))
                                ),
                            ]
                            .spacing(4),
                        )
                    }
                    _ => {}
                }
            }
        }
        c = c.push(
            row![
                column![
                    text("Joseph Smith Translation")
                        .size(13)
                        .font(sans(font::Weight::Medium)),
                    text("Show selected JST passages in place of the KJV verses they revise, with the JST's own wording underlined.")
                        .size(11)
                        .color(p.faint),
                ]
                .spacing(1)
                .width(Fill),
                self.switch(self.preferences.jst, msg(ToolsMsg::ToggleJst)),
            ]
            .spacing(8)
            .align_y(Center),
        );
        if let Some(Load::Failed(e)) = &self.tools.jst {
            c = c.push(
                text(format!("JST passages couldn't be loaded: {e}"))
                    .size(12)
                    .color(p.accent),
            );
        }
        Some(c.into())
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
