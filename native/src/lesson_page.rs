// A Come, Follow Me lesson read scripture-first, as the website's lesson page is (`StudyCompanion`,
// `studyCompanion.module.css`): the hero, the guide's introduction, then every chapter of the week in full with
// the guide's commentary in "Context for verses …" disclosures after the verses it discusses, the guide's closing
// sections, and the footer. Verse numbers select verses for the reader's own marks, which are the reader's marks.
use crate::design::{self, icon, sans, serif};
use crate::lessons::{self, ContextBlock};
use crate::lessons_ui::{LessonMsg, OpenGuide};
use crate::mark_layer;
use crate::marks;
use crate::select_text::{Paint, Piece, select_text};
use crate::store::Annotation;
use crate::text_selection::{Area, lesson_block};
use crate::{App, Message};
use iced::widget::{button, column, container, row, space, stack, svg, text};
use iced::{Alignment::Center, Border, Color, Element, Fill, Length, Padding, font};

/// `.page` reading width.
const ARTICLE: f32 = 736.0;
const ATTRIBUTION: &str = "Written in collaboration with agents";

fn lesson(m: LessonMsg) -> Message {
    Message::Lesson(m)
}

/// The disclosure chevron (`faChevronDown`), turned up when open.
fn chevron<'a>(color: Color, open: bool) -> svg::Svg<'a> {
    design::rotated_icon(
        &crate::icons::CHEVRON_DOWN,
        color,
        12.0,
        if open { 180.0 } else { 0.0 },
    )
}

impl App {
    /// The indent the verse number sits in at the start of a lesson verse (`.verseNumber`, then the text).
    pub(crate) fn lesson_indent(&self, number: u32) -> String {
        crate::view::verse_indent_for(&number.to_string(), 10.88, serif(), 21.76, 5.6)
    }

    pub(crate) fn lesson_page<'a>(&'a self, open: &'a OpenGuide) -> Element<'a, Message> {
        let p = self.p();
        let this = &open.lesson;
        let cover = lessons::cover(&this.start);
        let page_w = self.window_width;
        let hero_h = 576.0;
        let paper = p.paper;
        let art = stack![
            crate::lessons_ui::cover_image(cover, page_w.max(1.0), hero_h, 0.0.into())
                .opacity(0.92_f32),
            container(space())
                .width(Fill)
                .height(Fill)
                .style(move |_| container::Style {
                    background: Some(
                        iced::gradient::Linear::new(iced::Degrees(180.0))
                            .add_stop(0.0, Color { a: 0.0, ..paper })
                            .add_stop(0.55, Color { a: 0.0, ..paper })
                            .add_stop(1.0, paper)
                            .into(),
                    ),
                    ..Default::default()
                }),
        ]
        .width(Fill)
        .height(hero_h);
        let mut eyebrow = row![].spacing(10);
        let meta: Vec<String> = match &this.guide {
            Some(g) => vec![g.scripture.clone(), g.date_label.clone()],
            None => vec!["Come, Follow Me".into(), this.date_label.clone()],
        };
        for (i, item) in meta.iter().enumerate() {
            if i > 0 {
                eyebrow = eyebrow.push(text("·").size(12).color(p.faint));
            }
            eyebrow = eyebrow.push(
                text(item.to_uppercase())
                    .size(12)
                    .font(sans(font::Weight::Semibold))
                    .color(p.accent),
            );
        }
        let mut hero = column![
            button(row![text("←").size(13), text("All lessons").size(13)].spacing(4))
                .padding(0)
                .on_press(lesson(LessonMsg::Back))
                .style(design::link(p.faint)),
            space().height(12),
            eyebrow.wrap(),
            space().height(10),
            text(&this.title).font(serif()).size(49.6).line_height(1.1),
        ];
        if let Some(guide) = &this.guide {
            hero = hero.push(space().height(16)).push(
                text(&guide.summary)
                    .font(serif())
                    .size(18)
                    .line_height(1.6)
                    .color(p.muted),
            );
        }
        // `LessonNoteButton`: a journal note linked to this lesson.
        hero = hero.push(space().height(20)).push(
            button(
                container(
                    row![
                        icon(&crate::icons::PEN, p.ink, 13.),
                        text("ADD NOTE").size(12).font(sans(font::Weight::Semibold)),
                    ]
                    .spacing(7)
                    .align_y(Center),
                )
                .center_y(44),
            )
            .padding([0.0, 17.6])
            .height(44)
            .on_press(lesson(LessonMsg::WriteNote))
            .style(move |_, status| iced::widget::button::Style {
                background: Some(
                    if matches!(status, iced::widget::button::Status::Hovered) {
                        p.hover
                    } else {
                        p.card
                    }
                    .into(),
                ),
                text_color: p.ink,
                border: Border {
                    color: design::mix(p.rule, p.ink, 0.12),
                    width: 1.0,
                    radius: 999.0.into(),
                },
                ..Default::default()
            }),
        );
        let mut article = column![hero].spacing(0);
        if open.sections.is_empty() {
            article = article.push(space().height(32)).push(self.no_guide(open));
        } else {
            let intro = &open.companion.introduction;
            if !intro.is_empty() {
                let mut c = column![].spacing(0);
                for &i in intro {
                    c = c.push(self.guide_section(open, i, 19.0));
                }
                article = article.push(container(c).padding(Padding::ZERO.top(32).bottom(64)));
            }
            if !open.companion.chapters.is_empty() {
                article = article.push(
                    container(
                        text("Read the scriptures. Open the context as you go.")
                            .size(14)
                            .line_height(1.6)
                            .color(p.faint),
                    )
                    .padding(Padding::ZERO.bottom(32)),
                );
                for (index, chapter) in open.companion.chapters.iter().enumerate() {
                    article = article.push(self.companion_chapter(open, index, chapter));
                }
            }
            if !open.companion.closing.is_empty() {
                let mut c = column![].spacing(0);
                for &i in &open.companion.closing {
                    c = c.push(self.guide_section(open, i, 19.0));
                }
                article = article.push(container(c).padding(Padding::ZERO.top(64)));
            }
        }
        article = article.push(self.lesson_footer(open));
        let body = column![
            art,
            container(
                container(article)
                    .max_width(ARTICLE)
                    .padding(Padding::ZERO.bottom(96))
            )
            .padding(Padding::ZERO.top(-0.0).left(32).right(32))
            .center_x(Fill)
        ];
        let guide = self.scroll(body).id("guide").width(Fill).height(Fill);
        let mut page = stack![guide];
        if let Some(bar) = self.lesson_bar() {
            page = page.push(
                container(iced::widget::opaque(bar))
                    .align_bottom(Fill)
                    .center_x(Fill)
                    .padding(Padding::ZERO.bottom(24)),
            );
        }
        // The dock previews cited scripture from other chapters (the website's passage preview).
        let dock: Element<'_, Message> = match &self.lessons.dock {
            Some(dock) => container(self.dock_view(dock))
                .padding(Padding {
                    top: crate::header::CONTENT_TOP,
                    right: crate::header::shell_inset(self.window_width).min(32.0),
                    bottom: 16.0,
                    left: 12.0,
                })
                .into(),
            None => space().width(0).into(),
        };
        row![page, dock].height(Fill).into()
    }

    fn no_guide<'a>(&self, open: &'a OpenGuide) -> Element<'a, Message> {
        let p = self.p();
        let mut c = column![
            text("There is no study guide for this week yet. You can still read the assigned scripture.")
                .font(serif())
                .size(17)
                .color(p.muted)
        ]
        .spacing(10);
        if let Some(week) = &open.lesson.week {
            for range in week.reading() {
                let label = lessons::describe_range(&range, &self.books);
                c = c.push(
                    button(text(label).font(serif()).size(17).color(p.accent))
                        .padding(0)
                        .on_press(Message::Navigate(range.first(), None))
                        .style(design::link(p.accent)),
                );
            }
        }
        c.into()
    }

    /// A guide section shown whole (introduction and closing).
    fn guide_section<'a>(
        &'a self,
        open: &'a OpenGuide,
        index: usize,
        size: f32,
    ) -> Element<'a, Message> {
        let mut prose = column![].spacing(14);
        for (j, b) in open.prose.blocks[index].iter().enumerate() {
            prose = prose.push(self.guide_block(index, j, b, size));
        }
        let level = open.sections[index].level;
        container(prose)
            .id(format!("guide-sec-{index}"))
            .padding(Padding::ZERO.top(if level == 3 {
                14.0
            } else if index == 0 {
                0.0
            } else {
                28.0
            }))
            .into()
    }

    /// One chapter of the week: its heading, its verses in groups with their context, and its reader link.
    fn companion_chapter<'a>(
        &'a self,
        open: &'a OpenGuide,
        index: usize,
        chapter: &'a lessons::CompanionChapter,
    ) -> Element<'a, Message> {
        let p = self.p();
        let mut c = column![].spacing(0);
        // `.readingChapterHead`: the guide's chapter heading, "Jeremiah 31" with its title beneath.
        let head: Element<'_, Message> = match chapter.heading {
            Some(section) => {
                let title = &open.sections[section].title;
                let subtitle = title.split_once(": ").map(|(_, t)| t.trim());
                let mut h = column![
                    text(chapter.label.clone())
                        .font(serif())
                        .size(48)
                        .line_height(1.15)
                ];
                if let Some(subtitle) = subtitle {
                    h = h.push(
                        container(
                            text(subtitle.to_string())
                                .font(serif())
                                .size(24)
                                .line_height(1.35)
                                .color(p.muted),
                        )
                        .padding(Padding::ZERO.top(8.8)),
                    );
                }
                container(h).id(format!("guide-sec-{section}")).into()
            }
            None => text(chapter.label.clone()).font(serif()).size(48).into(),
        };
        c = c.push(
            container(head)
                .id(format!("lc-{index}"))
                .padding(Padding::ZERO.bottom(28)),
        );
        let scripture = open.scripture.get(index);
        if let Some(scripture) = scripture {
            for group in &scripture.groups {
                if group.verses.is_empty() {
                    // `.contextOnly`
                    if let Some(block) = &group.context {
                        c = c.push(
                            container(self.context_disclosure(open, block))
                                .padding(Padding::ZERO.top(12)),
                        );
                    }
                    continue;
                }
                let verses = &scripture.verses[group.verses.clone()];
                let (first, last) = (verses[0].number, verses[verses.len() - 1].number);
                let mut passage = column![
                    container(
                        text(lessons::verse_range_label(first, last).to_uppercase())
                            .size(12)
                            .font(sans(font::Weight::Semibold))
                            .color(p.accent)
                    )
                    .padding(Padding::ZERO.bottom(10.4))
                ];
                // `.readingVerses li + li`: about half a line between verses.
                let mut list = column![].spacing(10.9);
                for (offset, verse) in verses.iter().enumerate() {
                    list = list.push(self.lesson_verse(
                        index,
                        group.verses.start + offset,
                        verse,
                        &scripture.annotations,
                    ));
                }
                passage = passage.push(list);
                if let Some(block) = &group.context {
                    passage = passage.push(
                        container(self.context_disclosure(open, block))
                            .padding(Padding::ZERO.top(16)),
                    );
                }
                // `.readingPassage`: a hairline above, 28px either side of it.
                c = c.push(
                    container(column![
                        container(space())
                            .height(1)
                            .width(Fill)
                            .style(move |_| container::Style {
                                background: Some(p.rule.into()),
                                ..Default::default()
                            }),
                        container(passage).padding(Padding::ZERO.top(28)),
                    ])
                    .padding(Padding::ZERO.top(28)),
                );
            }
        }
        c = c.push(
            container(
                button(
                    text(format!("Open {} in the reader", chapter.label))
                        .size(13)
                        .color(p.faint),
                )
                .padding(0)
                .on_press(lesson(LessonMsg::OpenChapter(index)))
                .style(design::link(p.faint)),
            )
            .padding(Padding::ZERO.top(28)),
        );
        for (heading, blocks) in &chapter.following {
            // `.interChapter`: a section the guide places between chapters, with its own context.
            let mut extra = column![self.section_heading(open, *heading)].spacing(0);
            for block in blocks {
                extra = extra.push(
                    container(self.context_disclosure(open, block)).padding(Padding::ZERO.top(12)),
                );
            }
            c = c.push(container(extra).padding(Padding::ZERO.top(40)));
        }
        container(c).padding(Padding::ZERO.bottom(56)).into()
    }

    /// A section's heading block alone (the first block of its prose).
    fn section_heading<'a>(&'a self, open: &'a OpenGuide, section: usize) -> Element<'a, Message> {
        match open.prose.blocks[section].first() {
            Some(b) => container(self.guide_block(section, 0, b, 17.0))
                .id(format!("guide-sec-{section}"))
                .into(),
            None => space().into(),
        }
    }

    /// One verse, with the reader's marks drawn on its words; its words select (a selection may run on through
    /// the following verses and chapters, as on the website), and its number selects the verse.
    fn lesson_verse<'a>(
        &'a self,
        chapter: usize,
        verse_index: usize,
        verse: &'a crate::store::Verse,
        annotations: &'a [Annotation],
    ) -> Element<'a, Message> {
        let p = self.p();
        let dark = self.preferences.dark;
        let font = serif();
        let size = 21.76;
        let line = 35.9;
        let selected = self.lessons.selected.contains(&(chapter, verse.number));
        let number = verse.number.to_string();
        let indent = self.lesson_indent(verse.number);
        let offset = indent.len();
        let mut paints = vec![];
        if let Some(a) = annotations
            .iter()
            .find(|a| a.verse == verse.number && a.is_marked())
        {
            for s in marks::segments(&a.marks, &verse.text) {
                if s.highlight.is_some() || s.underline.is_some() {
                    paints.push(Paint {
                        range: offset + s.start..offset + s.end,
                        highlight: s.highlight.as_ref().map(|c| c.highlight(dark)),
                        underline: s.underline.as_ref().map(|c| c.underline(dark)),
                    });
                }
            }
        }
        let block = lesson_block(chapter, verse_index);
        let shown_len = offset + verse.text.len();
        let selection = self
            .drag
            .as_ref()
            .and_then(|d| d.in_block(Area::Lesson, block, shown_len));
        let dragging = self
            .drag
            .as_ref()
            .is_some_and(|d| d.dragging && d.area == Area::Lesson);
        let words: Element<'a, Message> = select_text(
            vec![Piece::new(indent), Piece::new(verse.text.as_str())],
            size,
            line,
            font,
            p.ink,
        )
        .paints(paints)
        .selection(selection, Color { a: 0.55, ..p.gold })
        .dragging(dragging)
        .on_pick(move |at, phase| Message::Pick(Area::Lesson, block, at, phase))
        .into();
        let mut badge = column![
            text(number.clone())
                .size(10.88)
                .font(sans(font::Weight::Semibold))
                .color(if selected { p.ink } else { p.accent })
        ];
        if selected {
            badge = badge.push(
                container(space())
                    .width(design::measure(
                        &number,
                        10.88,
                        sans(font::Weight::Semibold),
                    ))
                    .height(2)
                    .style(move |_| container::Style {
                        background: Some(p.accent.into()),
                        ..Default::default()
                    }),
            );
        }
        let number_button = button(badge)
            .padding(Padding::ZERO.top(mark_layer::baseline(size, line) - 0.9 * size + 1.0))
            .on_press(lesson(LessonMsg::SelectVerse(chapter, verse.number)))
            .style(|_, _| iced::widget::button::Style::default());
        let has_note = annotations
            .iter()
            .any(|a| a.verse == verse.number && !a.note.trim().is_empty());
        let mut line_row = row![stack![words, number_button]].align_y(iced::Alignment::Start);
        if has_note {
            line_row = line_row.push(
                container(icon(&crate::icons::NOTE_STICKY, p.muted, 12.))
                    .padding(Padding::ZERO.left(8).top(12)),
            );
        }
        container(line_row)
            .id(format!("lv-{chapter}-{}", verse.number))
            .padding([1.6, 8.0])
            .style(move |_| container::Style {
                background: selected.then(|| p.hover.into()),
                border: Border {
                    radius: 3.0.into(),
                    ..Default::default()
                },
                ..Default::default()
            })
            .into()
    }

    /// `.contextDisclosure`: "Context for verses 1–3", opening onto the guide's commentary on them.
    fn context_disclosure<'a>(
        &'a self,
        open: &'a OpenGuide,
        block: &'a ContextBlock,
    ) -> Element<'a, Message> {
        let p = self.p();
        let is_open = self.lessons.open_context.contains(&block.section);
        let summary = button(
            row![
                chevron(p.muted, is_open),
                text(lessons::context_label(block)).size(15).color(p.muted),
            ]
            .spacing(10)
            .align_y(Center),
        )
        .padding([11.2, 16.0])
        .width(Fill)
        .on_press(lesson(LessonMsg::Context(block.section)))
        .style(|_, _| iced::widget::button::Style::default());
        let mut c = column![summary];
        if is_open {
            c = c.push(
                container(column![
                    container(space())
                        .height(1)
                        .width(Fill)
                        .style(move |_| container::Style {
                            background: Some(p.rule.into()),
                            ..Default::default()
                        }),
                    container(self.context_body(open, block))
                        .padding(Padding::ZERO.top(16).bottom(20)),
                ])
                .padding([0, 20]),
            );
        }
        // A chapter's own context shares its section with the chapter heading, which keeps the section's id.
        let id = if block.after_heading {
            format!("guide-ctx-{}", block.section)
        } else {
            format!("guide-sec-{}", block.section)
        };
        container(c)
            .id(id)
            .width(Fill)
            .style(move |_| container::Style {
                background: Some(p.soft.into()),
                border: Border {
                    color: design::mix(p.rule, p.paper, 0.35),
                    width: 1.0,
                    radius: 8.0.into(),
                },
                ..Default::default()
            })
            .into()
    }

    /// The commentary in a disclosure: a passage's heading and first paragraph, the rest behind "Read full
    /// commentary"; a chapter's own context whole.
    fn context_body<'a>(
        &'a self,
        open: &'a OpenGuide,
        block: &'a ContextBlock,
    ) -> Element<'a, Message> {
        let p = self.p();
        let blocks = &open.prose.blocks[block.section];
        let start = usize::from(block.after_heading);
        let mut c = column![].spacing(17);
        let heading = !block.after_heading
            && blocks
                .first()
                .is_some_and(|b| matches!(b.kind, crate::guide_text::Kind::Heading(_)));
        let mut index = start;
        if heading {
            // `.cfm-h-verse`: the reference as a small rubric line, the title in the serif beneath.
            let title = &open.sections[block.section].title;
            let (reference, name) = match title.split_once(" — ") {
                Some((r, n)) => (Some(r.trim()), n.trim()),
                None => (None, title.as_str()),
            };
            let mut h = column![].spacing(4);
            if let Some(reference) = reference {
                h = h.push(
                    text(reference.to_uppercase())
                        .size(11.5)
                        .font(sans(font::Weight::Semibold))
                        .color(p.accent),
                );
            }
            h = h.push(
                text(name.to_string())
                    .font(serif())
                    .size(24)
                    .line_height(1.22),
            );
            c = c.push(h);
            index = 1;
        }
        // The preview: the heading and the first paragraph, when more follows.
        let preview_end = if heading && blocks.len() > index + 1 {
            Some(index + 1)
        } else {
            None
        };
        let full = self.lessons.full.contains(&block.section);
        let end = match preview_end {
            Some(e) if !full => e,
            _ => blocks.len(),
        };
        for (j, b) in blocks.iter().enumerate().take(end).skip(index) {
            c = c.push(self.guide_block(block.section, j, b, 17.0));
        }
        if preview_end.is_some() {
            c = c.push(
                button(
                    iced::widget::rich_text::<(), _, _, _>([iced::widget::span(if full {
                        "Show less commentary"
                    } else {
                        "Read full commentary"
                    })
                    .underline(true)])
                    .font(serif())
                    .size(17)
                    .color(p.accent),
                )
                .padding(0)
                .on_press(lesson(LessonMsg::Full(block.section)))
                .style(|_, _| iced::widget::button::Style::default()),
            );
        }
        c.into()
    }

    /// The verses a lesson selection covers, in reading order: the selected words' verses, else the verses
    /// selected by number.
    pub(crate) fn lesson_selected_verses(&self) -> Vec<(usize, u32)> {
        if self.lessons.words.is_empty() {
            self.lessons.selected.iter().copied().collect()
        } else {
            self.lessons
                .words
                .iter()
                .map(|(c, v, _)| (*c, *v))
                .collect()
        }
    }
    /// Each selected piece of a verse: (companion chapter, verse, the selected words).
    fn lesson_pieces(&self) -> Vec<(usize, u32, String)> {
        let Some(open) = &self.lessons.open else {
            return vec![];
        };
        let verse = |c: usize, v: u32| {
            open.scripture
                .get(c)
                .and_then(|s| s.verses.iter().find(|x| x.number == v))
        };
        if self.lessons.words.is_empty() {
            self.lessons
                .selected
                .iter()
                .filter_map(|(c, v)| Some((*c, *v, verse(*c, *v)?.text.clone())))
                .collect()
        } else {
            self.lessons
                .words
                .iter()
                .filter_map(|(c, v, r)| {
                    let text = &verse(*c, *v)?.text;
                    let a = marks::utf16_to_byte(text, r.start)?;
                    let b = marks::utf16_to_byte(text, r.end)?;
                    Some((*c, *v, text[a..b].to_string()))
                })
                .collect()
        }
    }
    /// The selected words, joined as the website joins a selection's text.
    pub(crate) fn lesson_selected_text(&self) -> String {
        self.lesson_pieces()
            .into_iter()
            .map(|(.., t)| t)
            .collect::<Vec<_>>()
            .join(" ")
    }
    /// Whole selected verses, with their reference, as the reader copies a passage.
    pub(crate) fn lesson_selected_verses_text(&self) -> String {
        let verses = self
            .lesson_pieces()
            .into_iter()
            .map(|(_, v, t)| format!("{v} {t}"))
            .collect::<Vec<_>>()
            .join("\n\n");
        format!(
            "{}\n\n{verses}",
            self.lesson_reference(&self.lesson_selected_verses())
        )
    }
    fn lesson_book_label(&self, chapter: usize) -> Option<(String, crate::store::Location)> {
        let open = self.lessons.open.as_ref()?;
        let location = open.companion.chapters.get(chapter)?.location.clone();
        let label = self
            .books
            .iter()
            .find(|b| b.volume == location.volume && b.id == location.book)
            .map(|b| b.label.clone())
            .unwrap_or_else(|| location.book.clone());
        Some((label, location))
    }
    /// `formatScriptureSelection`: "Jeremiah 31:3–4", or across a chapter break "Jeremiah 31:40; 32:1–2".
    pub(crate) fn lesson_reference(&self, verses: &[(usize, u32)]) -> String {
        let mut groups: Vec<(usize, Vec<u32>)> = vec![];
        for (c, v) in verses {
            match groups.iter_mut().find(|(g, _)| g == c) {
                Some((_, list)) => {
                    if !list.contains(v) {
                        list.push(*v)
                    }
                }
                None => groups.push((*c, vec![*v])),
            }
        }
        let mut out = vec![];
        for (i, (c, list)) in groups.iter().enumerate() {
            let Some((label, location)) = self.lesson_book_label(*c) else {
                continue;
            };
            let spec = crate::journal::verse_spec(list);
            out.push(if i == 0 {
                format!("{label} {}:{spec}", location.chapter)
            } else {
                format!("{}:{spec}", location.chapter)
            });
        }
        out.join("; ")
    }
    /// `scriptureExcerpt`: each chapter's selected words quoted under that chapter's reference and link.
    pub(crate) fn lesson_excerpt(&self) -> String {
        let mut groups: Vec<(usize, Vec<u32>, Vec<String>)> = vec![];
        for (c, v, text) in self.lesson_pieces() {
            let text = text.trim().to_string();
            if text.is_empty() {
                continue;
            }
            match groups.iter_mut().find(|(g, ..)| *g == c) {
                Some((_, verses, texts)) => {
                    if !verses.contains(&v) {
                        verses.push(v);
                    }
                    texts.push(text);
                }
                None => groups.push((c, vec![v], vec![text])),
            }
        }
        groups
            .into_iter()
            .filter_map(|(c, verses, texts)| {
                let (label, location) = self.lesson_book_label(c)?;
                Some(crate::journal::scripture_block(
                    &label,
                    &location,
                    &verses,
                    &texts.join("\n\n"),
                ))
            })
            .collect::<Vec<_>>()
            .join("\n\n")
    }
    /// Saves the open verse note from the lesson. Returns false (keeping it) when saving fails.
    pub(crate) fn save_lesson_verse_note(&mut self) -> bool {
        let Some((c, v, content)) = &self.lessons.note else {
            return true;
        };
        let (c, v, body) = (*c, *v, content.text());
        let Some(open) = &self.lessons.open else {
            return true;
        };
        let Some(location) = open.companion.chapters.get(c).map(|x| x.location.clone()) else {
            return true;
        };
        let mut a = open
            .scripture
            .get(c)
            .and_then(|s| s.annotations.iter().find(|a| a.verse == v))
            .cloned()
            .unwrap_or(Annotation {
                verse: v,
                ..Default::default()
            });
        if a.note.trim() == body.trim() {
            return true;
        }
        a.note = body;
        if let Some(store) = &mut self.store {
            let r = store.save_annotation(&location, &a);
            if self.report(r).is_none() {
                return false;
            }
        }
        if location == self.preferences.last {
            self.load_annotations();
        }
        self.reload_lesson_scripture();
        self.sync_soon();
        true
    }

    /// The menu beside a selection in the lesson's chapters (the website's `ScriptureSelectionMenu`): the
    /// selection's reference and words, Copy, Add to note, a note on the first selected verse, Done, then the quick
    /// marks and every style, for every selected verse (across a chapter break too).
    fn lesson_bar(&self) -> Option<Element<'_, Message>> {
        let words = !self.lessons.words.is_empty();
        let verses = self.lesson_selected_verses();
        if verses.is_empty() {
            return None;
        }
        let p = self.p();
        let round = |glyph: &'static crate::icons::Icon, m: Message, label: &str| {
            self.hint(
                button(container(icon(glyph, p.ink, 13.)).center_x(32).center_y(32))
                    .padding(0)
                    .on_press(m)
                    .style(design::circle(p)),
                label.to_string(),
            )
        };
        let mut head = column![
            text(self.lesson_reference(&verses))
                .size(12)
                .font(sans(font::Weight::Semibold))
        ]
        .spacing(2)
        .width(Fill);
        if words {
            let selected = self.lesson_selected_text();
            let quote = if selected.chars().count() > 48 {
                format!(
                    "“{}…”",
                    selected.chars().take(48).collect::<String>().trim_end()
                )
            } else {
                format!("“{selected}”")
            };
            head = head.push(text(quote).font(serif()).size(13).color(p.muted));
        } else {
            head = head.push(
                text(crate::journal::plural(
                    verses.len(),
                    "verse selected",
                    "verses selected",
                ))
                .size(12.5)
                .color(p.muted),
            );
        }
        let (first_c, first_v) = verses[0];
        let has_note = self
            .lessons
            .open
            .as_ref()
            .and_then(|o| o.scripture.get(first_c))
            .is_some_and(|s| {
                s.annotations
                    .iter()
                    .any(|a| a.verse == first_v && !a.note.trim().is_empty())
            });
        let note_label = if verses.len() > 1 {
            format!("Note on {}", self.lesson_reference(&verses[..1]))
        } else if has_note {
            "Edit your note".to_string()
        } else {
            "Write a note".to_string()
        };
        let top = row![
            head,
            round(
                &crate::icons::COPY,
                lesson(LessonMsg::CopySelection),
                "Copy"
            ),
            round(
                &crate::icons::PEN_TO_SQUARE,
                lesson(LessonMsg::AddToNote),
                "Add to note"
            ),
            round(
                &crate::icons::NOTE_STICKY,
                lesson(LessonMsg::VerseNote),
                &note_label
            ),
            round(&crate::icons::XMARK, lesson(LessonMsg::ClearVerses), "Done"),
        ]
        .spacing(4)
        .align_y(Center);
        let mut card = column![top, self.mark_tools(words)].spacing(10);
        if let Some((_, _, content)) = &self.lessons.note {
            card = card.push(text(note_label).size(12).color(p.faint));
            card = card.push(
                iced::widget::text_editor(content)
                    .id("lesson-verse-note")
                    .placeholder("Your note on this verse")
                    .on_action(|a| lesson(LessonMsg::EditVerseNote(a)))
                    .size(14)
                    .height(96)
                    .padding(10),
            );
            card = card.push(
                button(
                    text("Save note")
                        .size(13)
                        .font(sans(font::Weight::Semibold))
                        .center()
                        .width(Fill),
                )
                .padding([8, 12])
                .width(Fill)
                .on_press(lesson(LessonMsg::SaveVerseNote))
                .style(design::active(p)),
            );
        }
        Some(
            container(card)
                .padding(Padding::from([12, 14]))
                .width(440)
                .style(design::popover(p))
                .into(),
        )
    }

    /// `.footer`: who wrote the guide, where it was first published, the cover, and the other weeks.
    fn lesson_footer<'a>(&'a self, open: &'a OpenGuide) -> Element<'a, Message> {
        let p = self.p();
        let small = |s: String| text(s).size(13).line_height(1.65).color(p.faint);
        let link = |label: &'static str, url: &'static str| {
            button(text(label).size(13).color(p.muted))
                .padding(0)
                .on_press(lesson(LessonMsg::Credit(url.into())))
                .style(design::link(p.muted))
        };
        let mut c = column![].spacing(0);
        if let Some(guide) = &open.lesson.guide {
            c = c.push(small(format!(
                "{ATTRIBUTION}. Guide by {}. Scripture text is the King James Version from Verse Together's local library.",
                guide.author
            )));
            c = c.push(
                row![
                    small("Originally published at".into()),
                    link("isaacstuff.com/cfm", "https://www.isaacstuff.com/cfm"),
                    small(".".into())
                ]
                .spacing(4)
                .align_y(Center),
            );
        }
        let cover = lessons::cover(&open.lesson.start);
        if let Some(credit) = &cover.credit {
            c = c.push(
                row![small("Cover:".into()), self.credit_line(credit, p.faint)]
                    .spacing(4)
                    .wrap(),
            );
        }
        let weeks = &self.lessons.weeks;
        let at = weeks.iter().position(|w| w.start == open.lesson.start);
        let previous = at.and_then(|i| i.checked_sub(1)).and_then(|i| weeks.get(i));
        let next = at.and_then(|i| weeks.get(i + 1));
        let nav_link = |label: String, week: &str| {
            button(text(label).font(serif()).size(16.8).color(p.ink))
                .padding(0)
                .on_press(lesson(LessonMsg::Open(week.to_string())))
                .style(design::link(p.ink))
        };
        let mut nav = row![];
        nav = nav.push(match previous {
            Some(w) => Element::from(nav_link(format!("← {}", w.block), &w.start)),
            None => space().into(),
        });
        nav = nav.push(space().width(Fill));
        if let Some(w) = next {
            nav = nav.push(nav_link(format!("{} →", w.block), &w.start));
        }
        c = c.push(container(nav).padding(Padding::ZERO.top(16)));
        container(c)
            .padding(Padding {
                top: 72.0,
                right: 4.0,
                bottom: 0.0,
                left: 4.0,
            })
            .width(Length::Fill)
            .into()
    }
}
