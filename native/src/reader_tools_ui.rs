// The reader tools' views: the side panel (study paths, Explore a word, lesson resources), study path markers,
// other Bibles under each verse with their changed words, JST passages, and Your Bibles in Reader settings.
use crate::design::{self, Colors, icon, sans, serif};
use crate::icons;
use crate::reader_tools::{
    self, BiblesView, Diff, Guide, HelpBlock, HelpInline, Load, Panel, StudyPath, ToolsMsg,
};
use crate::{App, Message};
use iced::widget::{
    button, column, container, markdown, rich_text, row, space, span, text, text_input,
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

    /// Other Bibles' wording of a verse, and any JST passage placed at it.
    pub(crate) fn verse_extras(&self, number: u32, kjv: &str) -> Option<Element<'_, Message>> {
        let p = self.p();
        let mut extras = column![].spacing(6);
        let mut any = false;
        let palette = [
            Color::from_rgb8(0x03, 0x69, 0xa1),
            Color::from_rgb8(0x04, 0x78, 0x57),
            Color::from_rgb8(0x4d, 0x7c, 0x0f),
            Color::from_rgb8(0xbe, 0x12, 0x3c),
            Color::from_rgb8(0x0e, 0x74, 0x90),
            Color::from_rgb8(0xa2, 0x1c, 0xaf),
        ];
        let size = (self.preferences.font_size * 0.9).round();
        for (i, (id, state)) in self.tools.compare.iter().enumerate() {
            let color = palette[i % palette.len()];
            let label = self
                .preferences
                .bibles
                .iter()
                .find(|b| b.id.eq_ignore_ascii_case(id))
                .and_then(|b| b.abbreviation.clone())
                .unwrap_or_else(|| id.clone());
            let body: Element<'_, Message> = match state {
                Load::Ready(verses) => match verses.iter().find(|v| v.number == number) {
                    Some(v) => {
                        let mut spans: Vec<iced::widget::text::Span<'_, ()>> = Vec::new();
                        for piece in reader_tools::diff_words(kjv, &v.text) {
                            match piece {
                                Diff::Same(s) => spans.push(span(format!("{s} ")).color(p.muted)),
                                Diff::Changed(_, other) if !other.is_empty() => spans.push(
                                    span(format!("{other} "))
                                        .color(color)
                                        .font(sans(font::Weight::Semibold)),
                                ),
                                Diff::Changed(..) => {}
                            }
                        }
                        rich_text(spans).size(size).line_height(1.55).into()
                    }
                    None => continue,
                },
                Load::Loading if number == 1 => muted(p, format!("Loading {label}…")),
                Load::Failed(e) if number == 1 => text(format!("{label} couldn't be loaded: {e}"))
                    .size(12)
                    .color(p.accent)
                    .into(),
                _ => continue,
            };
            any = true;
            extras = extras.push(
                row![
                    text(label)
                        .size(11)
                        .font(sans(font::Weight::Bold))
                        .color(color)
                        .width(44),
                    container(body).width(Fill),
                ]
                .spacing(8),
            );
        }
        if let Some(Load::Ready(excerpts)) = &self.tools.jst {
            for excerpt in excerpts.iter().filter(|e| {
                e.anchor_verse == Some(number) || (number == 1 && e.anchor_verse.is_none())
            }) {
                any = true;
                extras = extras.push(self.jst_card(excerpt));
            }
        }
        any.then(|| {
            container(extras)
                .padding(Padding::ZERO.left(28).top(4))
                .into()
        })
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
                    text("Show the JST passages that revise this chapter's verses beside them.")
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
