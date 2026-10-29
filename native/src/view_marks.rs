// The website's mark controls (MarkSample, MarkStylePicker, QuickMarkSettings): quick marks for a selection, the
// full style picker, the floating bar for selected words, and the quick-mark list in settings.
use crate::design::{self, fade, icon, sans, serif};
use crate::icons;
use crate::marks::{self, MarkColor, MarkKind, MarkPreset, PALETTE};
use crate::{App, Message};
use iced::widget::{button, column, container, row, space, text, text_input, tooltip};
use iced::{Alignment::Center, Border, Color, Element, Fill, Length, Padding, font};

/// `.mark-sample`: a serif letter as the mark would look: tinted behind for a highlight, ruled under for an
/// underline, so a yellow highlight and a yellow underline never look alike.
pub fn sample<'a>(
    kind: MarkKind,
    color: &MarkColor,
    dark: bool,
    ink: Color,
) -> Element<'a, Message> {
    let letter = text("A")
        .font(iced::Font {
            weight: font::Weight::Semibold,
            ..serif()
        })
        .size(15)
        .color(ink);
    match kind {
        MarkKind::Highlight => {
            let fill = color.highlight(dark);
            container(letter)
                .center_x(25.6)
                .center_y(25.6)
                .style(move |_| container::Style {
                    background: Some(fill.into()),
                    border: Border {
                        radius: 4.8.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                })
                .into()
        }
        MarkKind::Underline => {
            let rule = color.underline(dark);
            container(
                column![
                    letter,
                    container(space()).width(14).height(2).style(move |_| {
                        container::Style {
                            background: Some(rule.into()),
                            ..Default::default()
                        }
                    })
                ]
                .align_x(Center)
                .spacing(1),
            )
            .center_x(25.6)
            .center_y(25.6)
            .into()
        }
    }
}

/// `.selection-popover`: min(100vw − 1.5rem, 27.5rem).
pub const SELECTION_MENU_WIDTH: f32 = 440.0;

/// What a style picker shows and does: the style it has, which styles other quick marks already have, the
/// reader's own custom colors, what picking sends, and its Custom color entry (open with what's typed).
pub(crate) struct PickerSpec<'s> {
    pub kind: MarkKind,
    pub color: MarkColor,
    pub taken: &'s dyn Fn(MarkKind, &MarkColor) -> Option<usize>,
    pub own: Vec<MarkColor>,
    pub pick: &'s dyn Fn(MarkKind, MarkColor) -> Message,
    pub custom: Option<&'s str>,
    pub toggle_custom: Message,
    pub custom_input: fn(String) -> Message,
    pub custom_apply: Message,
    pub custom_id: String,
}

impl App {
    pub(crate) fn hint<'a>(
        &self,
        content: impl Into<Element<'a, Message>>,
        label: String,
    ) -> Element<'a, Message> {
        let p = self.p();
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
            tooltip::Position::Top,
        )
        .gap(6)
        .into()
    }

    /// One quick-mark button: its sample, ringed when the whole selection already has it.
    fn preset_button(
        &self,
        index: usize,
        preset: &MarkPreset,
        words: bool,
    ) -> Element<'_, Message> {
        let p = self.p();
        let on = self.mark_applied(preset.kind, &preset.color, words);
        let label = if on {
            format!("Remove {}", preset.phrase())
        } else {
            preset.label()
        };
        let b = button(sample(
            preset.kind,
            &preset.color,
            self.preferences.dark,
            p.ink,
        ))
        .padding(2)
        .on_press(Message::QuickMark(index, words))
        .style(move |_, status| button::Style {
            background: matches!(status, button::Status::Hovered | button::Status::Pressed)
                .then(|| p.hover.into()),
            text_color: p.ink,
            border: Border {
                color: if on { p.ink } else { Color::TRANSPARENT },
                width: if on { 2.0 } else { 0.0 },
                radius: 8.0.into(),
            },
            ..Default::default()
        });
        self.hint(b, label)
    }

    /// Quick marks and, when opened, every style: highlight or underline in the palette or a custom color.
    pub(crate) fn mark_tools(&self, words: bool) -> Element<'_, Message> {
        let p = self.p();
        let presets = self.preferences.presets();
        // Wraps onto more lines when there are more quick marks than fit.
        let mut quick = row![].spacing(1).align_y(Center);
        for (i, preset) in presets.iter().enumerate() {
            quick = quick.push(self.preset_button(i, preset, words));
        }
        let styles = button(
            container(icon(
                &icons::PALETTE,
                if self.styles_open { p.paper } else { p.ink },
                14.,
            ))
            .center_x(32)
            .center_y(32),
        )
        .padding(0)
        .on_press(Message::ToggleStyles)
        .style(design::segment(p, self.styles_open));
        quick = quick.push(self.hint(styles, "More styles".into()));
        let mut tools = column![quick.wrap()].spacing(10);
        if self.styles_open {
            tools = tools.push(self.style_picker(words));
        }
        tools.into()
    }

    fn style_picker(&self, words: bool) -> Element<'_, Message> {
        let p = self.p();
        let kind = self.style_kind;
        let dark = self.preferences.dark;
        let kinds = self.segmented(
            &[
                (MarkKind::Highlight, "Highlight"),
                (MarkKind::Underline, "Underline"),
            ],
            kind,
            Message::StyleKind,
        );
        let mut swatches = row![].spacing(6).align_y(Center);
        for name in PALETTE {
            let color = MarkColor::Named(name);
            let on = self.mark_applied(kind, &color, words);
            let fill = color.swatch();
            let dot = button(space().width(22).height(22))
                .padding(0)
                .on_press(Message::Mark(kind, Some(color.clone()), words))
                .style(move |_, status| button::Style {
                    background: Some(fill.into()),
                    border: Border {
                        color: if on {
                            p.ink
                        } else if matches!(status, button::Status::Hovered) {
                            p.faint
                        } else {
                            p.rule
                        },
                        width: if on { 2.5 } else { 1.0 },
                        radius: 999.0.into(),
                    },
                    ..Default::default()
                });
            swatches = swatches.push(self.hint(dot, format!("{} {}", color.label(), kind.label())));
        }
        let custom = MarkColor::parse_input(&self.custom_color);
        let preview = custom
            .clone()
            .map(|c| c.swatch())
            .unwrap_or(Color::TRANSPARENT);
        let mut custom_row = row![
            container(space().width(18).height(18)).style(move |_| container::Style {
                background: Some(preview.into()),
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 999.0.into(),
                },
                ..Default::default()
            }),
            text_input("#rrggbb", &self.custom_color)
                .on_input(Message::CustomColor)
                .size(13)
                .padding([6, 8])
                .width(96),
        ]
        .spacing(8)
        .align_y(Center);
        let apply =
            button(text("Apply").size(12).font(sans(font::Weight::Semibold))).padding([6, 10]);
        custom_row = custom_row.push(match &custom {
            Some(c) => apply
                .on_press(Message::Mark(kind, Some(c.clone()), words))
                .style(design::active(p)),
            None => apply.style(design::quiet(p)),
        });
        let mut picker = column![
            kinds,
            swatches,
            column![text("Custom color").size(11).color(p.faint), custom_row].spacing(4)
        ]
        .spacing(10);
        let mut actions = row![].spacing(6);
        if self.kind_applied(kind, words) {
            actions = actions.push(
                button(text(format!("Remove {}", kind.label())).size(12))
                    .padding([6, 10])
                    .on_press(Message::Mark(kind, None, words))
                    .style(design::quiet(p)),
            );
        }
        // The style the selection has, offered as a quick mark when it isn't one already.
        let current = PALETTE
            .iter()
            .map(|n| MarkColor::Named(n))
            .chain(custom)
            .find(|c| self.mark_applied(kind, c, words));
        if let Some(color) = current {
            let preset = MarkPreset::new(kind, color);
            if !self
                .preferences
                .presets()
                .iter()
                .any(|q| q.same_mark(&preset))
            {
                actions = actions.push(
                    button(
                        row![
                            icon(&icons::PLUS, p.accent, 11.),
                            text("Add to quick marks").size(12)
                        ]
                        .spacing(6)
                        .align_y(Center),
                    )
                    .padding([6, 10])
                    .on_press(Message::AddPreset(preset))
                    .style(design::quiet(p)),
                );
            }
        }
        picker = picker.push(actions);
        let _ = dark;
        container(picker)
            .padding(12)
            .width(Fill)
            .style(move |_| container::Style {
                background: Some(p.card_strong.into()),
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 10.0.into(),
                },
                ..Default::default()
            })
            .into()
    }

    /// The selection menu beside the reader's selected words (`VerseActionBar`): the quick marks and Clear, the
    /// actions (Explore for one word, else New Note; Annotate; Resources; Focus scripture), and Copy text with
    /// the reference. Annotate opens its panel in place of the actions; Back returns.
    pub(crate) fn selection_menu(&self) -> Option<Element<'_, Message>> {
        let (first, _) = self.word_selection.first()?;
        let (last, _) = self.word_selection.last()?;
        let p = self.p();
        let (first, last) = (
            self.verses.get(*first)?.number,
            self.verses.get(*last)?.number,
        );
        let reference = if first == last {
            format!("{}:{first}", self.reference())
        } else {
            format!("{}:{first}–{last}", self.reference())
        };
        let round = |paths: &'static [&'static str], message: Message, label: &str| {
            self.hint(
                button(
                    container(design::line_icon(paths, p.faint, 17.))
                        .center_x(44)
                        .center_y(44),
                )
                .padding(0)
                .on_press(message)
                .style(move |_, status| button::Style {
                    background: matches!(status, button::Status::Hovered).then(|| p.soft.into()),
                    border: Border {
                        radius: 999.0.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                }),
                label.to_string(),
            )
        };
        let mut card = column![];
        if self.annotating {
            card = card.push(
                row![
                    round(design::line::BACK, Message::Annotate(false), "Back (Esc)"),
                    text("Annotate")
                        .size(14)
                        .font(sans(font::Weight::Semibold))
                        .width(Fill),
                    round(
                        design::line::CLOSE,
                        Message::ClearWords,
                        "Clear selection (Esc)"
                    ),
                ]
                .spacing(4)
                .align_y(Center)
                .padding(Padding {
                    top: 6.0,
                    right: 6.0,
                    bottom: 2.0,
                    left: 6.0,
                }),
            );
            card = card.push(self.annotate_panel(first));
        } else {
            let mut quick = row![].spacing(4).align_y(Center);
            for (i, preset) in self.preferences.presets().iter().enumerate() {
                quick = quick.push(self.preset_button(i, preset, true));
            }
            card = card.push(
                row![
                    container(quick.wrap()).width(Fill),
                    round(
                        design::line::CLOSE,
                        Message::ClearWords,
                        "Clear selection (Esc)"
                    ),
                ]
                .spacing(8)
                .align_y(Center)
                .padding(Padding {
                    top: 6.0,
                    right: 6.0,
                    bottom: 2.0,
                    left: 10.0,
                }),
            );
            let mut actions: Vec<Element<'_, Message>> = vec![];
            match self.selected_single_word() {
                Some(word) => actions.push(self.selection_action(
                    design::line::SPARK,
                    format!("Explore “{word}”"),
                    "Meaning & context",
                    Message::Tools(crate::reader_tools::ToolsMsg::Explore(word.clone())),
                    true,
                )),
                None => actions.push(self.selection_action(
                    design::line::ADD,
                    "New Note".into(),
                    "Keep your thoughts",
                    Message::QuoteInJournal,
                    false,
                )),
            }
            actions.push(self.selection_action(
                design::line::NOTE,
                "Annotate".into(),
                "Highlight, underline, or note",
                Message::Annotate(true),
                false,
            ));
            // Lesson resources are Latter-day Saint study content (`onResources` only for that tradition).
            if self.show_lds() {
                actions.push(self.selection_action(
                    design::line::BOOK,
                    "Resources".into(),
                    "Lessons & more",
                    Message::Tools(crate::reader_tools::ToolsMsg::Resources),
                    false,
                ));
            }
            actions.push(self.selection_action(
                design::line::FOCUS,
                "Focus scripture".into(),
                "Read & share passage",
                Message::FocusSelection,
                true,
            ));
            let mut grid = column![].spacing(6);
            let mut items = actions.into_iter();
            while let Some(a) = items.next() {
                let b: Element<'_, Message> = match items.next() {
                    Some(b) => b,
                    None => space().width(Fill).into(),
                };
                grid = grid.push(row![a, b].spacing(6));
            }
            card = card.push(container(grid).padding(Padding {
                top: 6.0,
                right: 10.0,
                bottom: 12.0,
                left: 10.0,
            }));
        }
        let copied = self.copied_words;
        let copy_color = if copied { p.accent } else { p.ink };
        let footer = container(
            row![
                button(
                    container(
                        row![
                            design::line_icon(
                                if copied {
                                    design::line::CHECK
                                } else {
                                    design::line::COPY
                                },
                                copy_color,
                                15.
                            ),
                            text(if copied { "Copied" } else { "Copy text" })
                                .size(12)
                                .font(sans(font::Weight::Medium))
                                .color(copy_color),
                        ]
                        .spacing(7)
                        .align_y(Center)
                    )
                    .center_y(44)
                )
                .padding([0, 8])
                .height(44)
                .on_press(Message::CopySelectedWords)
                .style(move |_, status| button::Style {
                    background: matches!(status, button::Status::Hovered).then(|| p.soft.into()),
                    border: Border {
                        radius: 8.0.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                }),
                text(reference)
                    .font(serif())
                    .size(15)
                    .align_x(iced::alignment::Horizontal::Right)
                    .width(Fill),
            ]
            .spacing(8)
            .align_y(Center),
        )
        .padding(Padding {
            top: 0.0,
            right: 16.0,
            bottom: 0.0,
            left: 10.0,
        })
        .height(45)
        .center_y(45)
        .style(move |_| container::Style {
            background: Some(p.card.into()),
            border: Border {
                radius: iced::border::Radius {
                    top_left: 0.0,
                    top_right: 0.0,
                    bottom_right: 20.0,
                    bottom_left: 20.0,
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let rule = container(space().width(Fill).height(1)).style(move |_| container::Style {
            background: Some(p.rule.into()),
            ..Default::default()
        });
        let width = SELECTION_MENU_WIDTH.min(self.window_width - 24.0);
        let card = container(column![card, rule, footer])
            .width(width)
            .style(move |_| container::Style {
                background: Some(p.card_strong.into()),
                text_color: Some(p.ink),
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 20.0.into(),
                },
                shadow: iced::Shadow {
                    color: fade(p.ink, 0.18),
                    offset: iced::Vector::new(0.0, 12.0),
                    blur_radius: 40.0,
                },
                ..Default::default()
            });
        let (left, top) = self.selection_menu_position(width, self.selection_menu_height());
        Some(
            container(iced::widget::opaque(card))
                .padding(Padding {
                    top,
                    right: 0.0,
                    bottom: 0.0,
                    left,
                })
                .width(Fill)
                .height(Fill)
                .into(),
        )
    }
    /// About how tall the menu is, for placing it above or below the words (`positionSelectionPopover`).
    pub(crate) fn selection_menu_height(&self) -> f32 {
        if self.annotating {
            let presets = self.preferences.presets().len() as f32;
            return (52.0 + 24.0 + (presets / 2.0).ceil() * 46.0 + 150.0 + 70.0 + 46.0)
                .min(self.selection_menu_available_height());
        }
        let actions: f32 = 3.0 + if self.show_lds() { 1.0 } else { 0.0 };
        52.0 + 18.0 + (actions / 2.0).ceil() * 76.0 + 46.0
    }
    fn selection_menu_available_height(&self) -> f32 {
        self.window_height - 88.0 - if self.phone() { 100.0 } else { 20.0 }
    }
    /// Where the menu goes: centered on the words, above them when it fits under the header, else below, kept
    /// inside the window (`positionSelectionPopover`); docked at the bottom center when no pointer was seen.
    pub(crate) fn selection_menu_position(&self, width: f32, height: f32) -> (f32, f32) {
        let (w, h) = (self.window_width, self.window_height);
        let margin = 12.0;
        let gap = 12.0;
        let phone = self.phone();
        let safe_top: f32 = if phone { 88.0 } else { 80.0 };
        let safe_bottom: f32 = if phone { 100.0 } else { 20.0 };
        let max_top = safe_top.max(h - safe_bottom - height);
        let Some((press, release, scroll)) = self.word_anchor else {
            return (((w - width) / 2.0).max(margin), max_top);
        };
        let shift = scroll - self.reader_scroll;
        let half_line = 14.0;
        let anchor_top = press.y.min(release.y) + shift - half_line;
        let anchor_bottom = press.y.max(release.y) + shift + half_line;
        let center = (press.x + release.x) / 2.0;
        let left = (center - width / 2.0).min(w - width - margin).max(margin);
        let above = anchor_top - height - gap;
        let below = anchor_bottom + gap;
        let space_above = anchor_top - safe_top;
        let space_below = h - safe_bottom - anchor_bottom;
        let top = if above >= safe_top {
            above
        } else if below <= max_top || space_below >= space_above {
            below
        } else {
            above
        };
        (left, top.min(max_top).max(safe_top))
    }
    /// One labeled action of the menu (`.selection-action`): its icon in a tile, its title and description.
    fn selection_action<'a>(
        &self,
        paths: &'static [&'static str],
        title: String,
        description: &'static str,
        message: Message,
        featured: bool,
    ) -> Element<'a, Message> {
        let p = self.p();
        let narrow = self.phone();
        let tile = if narrow { 30.0 } else { 34.0 };
        let tint = move |a: f32| design::mix(p.card_strong, p.accent, a);
        button(
            row![
                container(design::line_icon(
                    paths,
                    if featured { p.accent } else { p.ink },
                    19.
                ))
                .center_x(tile)
                .center_y(tile)
                .style(move |_| container::Style {
                    background: Some(if featured { tint(0.10) } else { p.card }.into()),
                    border: Border {
                        color: if featured { Color::TRANSPARENT } else { p.rule },
                        width: 1.0,
                        radius: if narrow { 9.0 } else { 10.0 }.into(),
                    },
                    ..Default::default()
                }),
                column![
                    text(title)
                        .size(if narrow { 12.0 } else { 13.0 })
                        .font(sans(font::Weight::Semibold))
                        .line_height(1.3),
                    text(description)
                        .size(if narrow { 10.0 } else { 11.0 })
                        .line_height(1.35)
                        .color(p.faint),
                ]
                .spacing(3)
                .width(Fill),
            ]
            .spacing(if narrow { 8 } else { 10 })
            .align_y(Center),
        )
        .padding(Padding::from([11.0, if narrow { 8.0 } else { 10.0 }]))
        .width(Fill)
        .height(Length::Fixed(70.0))
        .on_press(message)
        .style(move |_, status| {
            let hovered = matches!(status, button::Status::Hovered | button::Status::Pressed);
            button::Style {
                background: if featured {
                    Some(tint(if hovered { 0.09 } else { 0.05 }).into())
                } else {
                    hovered.then(|| p.soft.into())
                },
                text_color: p.ink,
                border: Border {
                    color: if featured {
                        if hovered {
                            p.rubric_line
                        } else {
                            design::mix(p.rule, p.accent, 0.18)
                        }
                    } else if hovered {
                        p.rule
                    } else {
                        Color::TRANSPARENT
                    },
                    width: 1.0,
                    radius: 12.0.into(),
                },
                ..Default::default()
            }
        })
        .into()
    }
    /// The Annotate panel (`AnnotatePanel`): the quick marks named in full, any style and color with Apply, and
    /// the note on the first selected verse.
    fn annotate_panel(&self, first: u32) -> Element<'_, Message> {
        let p = self.p();
        let dark = self.preferences.dark;
        let label = |s: &'static str| {
            text(s.to_uppercase())
                .size(11)
                .font(sans(font::Weight::Semibold))
                .color(p.faint)
        };
        let presets = self.preferences.presets();
        let mut quick = row![].spacing(6);
        for (i, preset) in presets.iter().enumerate() {
            let on = self.mark_applied(preset.kind, &preset.color, true);
            quick = quick.push(
                button(
                    row![
                        sample(preset.kind, &preset.color, dark, p.ink),
                        text(preset.label()).size(12)
                    ]
                    .spacing(7)
                    .align_y(Center),
                )
                .padding(Padding {
                    top: 4.0,
                    right: 12.0,
                    bottom: 4.0,
                    left: 5.0,
                })
                .height(40)
                .on_press(Message::QuickMark(i, true))
                .style(move |_, status| button::Style {
                    background: (on || matches!(status, button::Status::Hovered))
                        .then(|| p.soft.into()),
                    text_color: p.ink,
                    border: Border {
                        color: if on { p.ink } else { p.rule },
                        width: if on { 2.0 } else { 1.0 },
                        radius: 10.0.into(),
                    },
                    ..Default::default()
                }),
            );
        }
        let quick: Element<'_, Message> = if presets.is_empty() {
            text("No quick marks saved. Choose them in Settings.")
                .size(12)
                .color(p.faint)
                .into()
        } else {
            quick.wrap().vertical_spacing(6).into()
        };
        let (kind, color) = self.annotate_choice();
        let never_taken = |_: MarkKind, _: &MarkColor| None;
        let pick = |kind: MarkKind, color: MarkColor| Message::AnnotateStyle(kind, color);
        let own = marks::custom_colors(
            presets
                .iter()
                .map(|p| &p.color)
                .chain(self.word_selection_colors().iter()),
        );
        let picker = self.mark_style_picker(PickerSpec {
            kind,
            color: color.clone(),
            taken: &never_taken,
            own,
            pick: &pick,
            custom: self.annotate_custom.as_deref(),
            toggle_custom: Message::AnnotateCustom,
            custom_input: Message::AnnotateCustomInput,
            custom_apply: Message::AnnotateCustomApply,
            custom_id: "annotate-custom".into(),
        });
        let on = self.mark_applied(kind, &color, true);
        let phrase = format!("{} {}", color.label(), kind.label()).to_lowercase();
        let apply = button(
            row![
                sample(kind, &color, dark, p.ink),
                text(if on {
                    format!("Remove {phrase}")
                } else {
                    format!("Apply {phrase}")
                })
                .size(12)
                .font(sans(font::Weight::Semibold))
            ]
            .spacing(7)
            .align_y(Center),
        )
        .padding(Padding {
            top: 4.0,
            right: 12.0,
            bottom: 4.0,
            left: 5.0,
        })
        .height(40)
        .on_press(Message::AnnotateApply)
        .style(move |_, status| button::Style {
            background: matches!(status, button::Status::Hovered).then(|| p.soft.into()),
            text_color: p.ink,
            border: Border {
                color: p.faint,
                width: 1.0,
                radius: 10.0.into(),
            },
            ..Default::default()
        });
        let state = if on {
            "On the selected text"
        } else if self.kind_applied(kind, true) {
            "Another color is on the selected text"
        } else {
            "Not on the selected text"
        };
        let verses = self.word_verses();
        let has_note = self
            .annotations
            .iter()
            .any(|a| a.verse == first && !a.note.trim().is_empty());
        let note_label = if verses.len() > 1 {
            format!("Note on verse {first}")
        } else if has_note {
            "Edit your note".into()
        } else {
            "Write a note".into()
        };
        let note = self.selection_action(
            design::line::NOTE,
            note_label,
            "Note and marks together",
            Message::NoteOnSelection,
            false,
        );
        let body = column![
            column![label("Your quick marks"), quick].spacing(7),
            column![
                label("Any style and color"),
                picker,
                row![apply, text(state).size(11).color(p.faint)]
                    .spacing(10)
                    .align_y(Center)
                    .wrap()
                    .vertical_spacing(6),
            ]
            .spacing(7),
            container(note).style(move |_| container::Style {
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 12.0.into(),
                },
                ..Default::default()
            }),
        ]
        .spacing(14);
        // Keep the header and Copy footer reachable too, above the dock even with twelve long quick marks.
        let max = (self.selection_menu_available_height() - 100.0).max(100.0);
        container(
            self.scroll(container(body).padding(Padding {
                top: 2.0,
                right: if self.window_width < 640.0 {
                    10.0
                } else {
                    14.0
                },
                bottom: 12.0,
                left: if self.window_width < 640.0 {
                    10.0
                } else {
                    14.0
                },
            }))
            .height(Length::Shrink),
        )
        .max_height(max)
        .into()
    }

    /// A mark's style (`MarkStylePicker`): Highlight or Underline, each drawn as it marks a letter, then the
    /// palette and the reader's own custom colors (chips for a highlight, rules for an underline), then Custom.
    /// A style another quick mark already has stays visible but can't be picked.
    pub(crate) fn mark_style_picker(&self, spec: PickerSpec<'_>) -> Element<'_, Message> {
        let p = self.p();
        let dark = self.preferences.dark;
        let PickerSpec {
            kind: value_kind,
            color: value_color,
            taken,
            own,
            pick,
            custom: editing,
            toggle_custom,
            custom_input,
            custom_apply,
            custom_id,
        } = spec;
        let first_free =
            |kind: MarkKind| marks::pick_kind(|k, c| taken(k, c).is_some(), &value_color, kind);
        let mut kinds = row![].spacing(4).align_y(Center);
        for (kind, label) in [
            (MarkKind::Highlight, "Highlight"),
            (MarkKind::Underline, "Underline"),
        ] {
            let checked = kind == value_kind;
            let color = first_free(kind);
            let blocked = !checked && color.is_none();
            let chip = button(
                row![
                    sample(kind, &value_color, dark, p.ink),
                    text(label)
                        .size(12)
                        .font(sans(font::Weight::Medium))
                        .color(if checked { p.ink } else { p.faint })
                ]
                .spacing(6)
                .align_y(Center),
            )
            .padding(Padding {
                top: 2.0,
                right: 10.0,
                bottom: 2.0,
                left: 3.0,
            })
            .height(36)
            .on_press_maybe((!checked).then_some(color).flatten().map(|c| pick(kind, c)))
            .style(move |_, status| button::Style {
                background: (checked || matches!(status, button::Status::Hovered))
                    .then(|| p.soft.into()),
                text_color: p.ink,
                border: Border {
                    color: if checked { p.ink } else { p.rule },
                    width: if checked { 2.0 } else { 1.0 },
                    radius: 10.0.into(),
                },
                ..Default::default()
            });
            kinds = kinds.push(if blocked {
                self.hint(
                    chip,
                    format!("Every {} color is already a quick mark", kind.label()),
                )
            } else {
                chip.into()
            });
        }
        let mut colors: Vec<MarkColor> = PALETTE.iter().map(|n| MarkColor::Named(n)).collect();
        colors.extend(own);
        if matches!(value_color, MarkColor::Custom(_)) && !colors.contains(&value_color) {
            colors.push(value_color.clone());
        }
        let underline = value_kind == MarkKind::Underline;
        let swatch = move |fill: Color, alpha: f32| {
            container(
                space()
                    .width(if underline { 22 } else { 20 })
                    .height(if underline { 5 } else { 20 }),
            )
            .style(move |_| container::Style {
                background: Some(fade(fill, alpha).into()),
                border: Border {
                    color: if underline {
                        Color::TRANSPARENT
                    } else {
                        fade(p.ink, 0.16 * alpha)
                    },
                    width: if underline { 0.0 } else { 1.0 },
                    radius: if underline { 2.5 } else { 999.0 }.into(),
                },
                ..Default::default()
            })
        };
        let mut swatches = row![].spacing(4).align_y(Center);
        for color in colors {
            let checked = color == value_color;
            let other = (!checked).then(|| taken(value_kind, &color)).flatten();
            let b = button(
                container(swatch(
                    color.swatch(),
                    if other.is_some() { 0.35 } else { 1.0 },
                ))
                .center_x(36)
                .center_y(36),
            )
            .padding(0)
            .on_press_maybe((!checked && other.is_none()).then(|| pick(value_kind, color.clone())))
            .style(move |_, status| button::Style {
                background: (checked
                    || (other.is_none() && matches!(status, button::Status::Hovered)))
                .then(|| p.soft.into()),
                text_color: p.ink,
                border: Border {
                    color: if checked { p.ink } else { Color::TRANSPARENT },
                    width: if checked { 2.0 } else { 0.0 },
                    radius: 999.0.into(),
                },
                ..Default::default()
            });
            let name = color.label();
            swatches = swatches.push(self.hint(
                b,
                match other {
                    Some(n) => format!("{name}: already quick mark {}", n + 1),
                    None => name,
                },
            ));
        }
        let shown = editing
            .and_then(MarkColor::parse_input)
            .unwrap_or(value_color.clone());
        let custom_on = matches!(value_color, MarkColor::Custom(_)) || editing.is_some();
        let open = editing.is_some();
        let custom = button(
            row![
                swatch(shown.swatch(), 1.0),
                text("Custom")
                    .size(12)
                    .font(sans(font::Weight::Medium))
                    .color(if custom_on { p.ink } else { p.faint }),
            ]
            .spacing(6)
            .align_y(Center),
        )
        .padding([0, 10])
        .height(36)
        .on_press(toggle_custom)
        .style(move |_, status| button::Style {
            background: (open || matches!(status, button::Status::Hovered)).then(|| p.soft.into()),
            text_color: p.ink,
            border: Border {
                color: p.rule,
                width: 1.0,
                radius: 10.0.into(),
            },
            ..Default::default()
        });
        let mut picker = row![kinds, swatches, self.hint(custom, "Pick any color".into())]
            .spacing(12)
            .align_y(Center);
        if let Some(typed) = editing {
            let ok = MarkColor::parse_input(typed).is_some();
            let apply = button(
                text("Use color")
                    .size(12)
                    .font(sans(font::Weight::Semibold)),
            )
            .padding([7, 12]);
            picker = picker.push(
                row![
                    text_input("#rrggbb", typed)
                        .id(custom_id)
                        .on_input(custom_input)
                        .on_submit(custom_apply.clone())
                        .size(12.5)
                        .padding([8, 10])
                        .width(104),
                    if ok {
                        apply.on_press(custom_apply).style(design::active(p))
                    } else {
                        apply.style(design::quiet(p))
                    },
                ]
                .spacing(6)
                .align_y(Center),
            );
        }
        picker.wrap().vertical_spacing(6).into()
    }
    /// One quick mark's style picker in Settings, or the add row's (`slot` `None`).
    fn preset_picker(
        &self,
        slot: Option<usize>,
        value: &MarkPreset,
        presets: &[MarkPreset],
    ) -> Element<'_, Message> {
        let taken = |kind: MarkKind, color: &MarkColor| marks::taken_by(presets, slot, kind, color);
        let pick = move |kind: MarkKind, color: MarkColor| match slot {
            Some(i) => Message::PresetStyle(i, kind, color),
            None => Message::NewPresetStyle(kind, color),
        };
        self.mark_style_picker(PickerSpec {
            kind: value.kind,
            color: value.color.clone(),
            taken: &taken,
            own: marks::custom_colors(presets.iter().map(|p| &p.color)),
            pick: &pick,
            custom: self
                .preset_custom
                .as_ref()
                .filter(|(open, _)| *open == slot)
                .map(|(_, typed)| typed.as_str()),
            toggle_custom: Message::PresetCustom(slot),
            custom_input: Message::PresetCustomInput,
            custom_apply: Message::PresetCustomApply,
            custom_id: format!("preset-custom-{}", slot.unwrap_or(99)),
        })
    }

    /// Settings → Study tools (`QuickMarkSettings`): each quick mark in order, with its name, its style (highlight
    /// or underline) and color, moves and removal; a row adding one more; and Restore defaults.
    pub(crate) fn preset_settings(&self) -> Element<'_, Message> {
        let p = self.p();
        let dark = self.preferences.dark;
        let presets = self.preferences.presets();
        let small = |glyph: &'static icons::Icon, turn: f32, message: Option<Message>| {
            let enabled = message.is_some();
            let b = button(
                container(design::rotated_icon(
                    glyph,
                    fade(p.muted, if enabled { 1.0 } else { 0.45 }),
                    12.,
                    turn,
                ))
                .center_x(36)
                .center_y(36),
            )
            .padding(0)
            .style(move |_, status| button::Style {
                background: (enabled && matches!(status, button::Status::Hovered))
                    .then(|| p.soft.into()),
                text_color: p.ink,
                border: Border {
                    radius: 7.2.into(),
                    ..Default::default()
                },
                ..Default::default()
            });
            match message {
                Some(m) => b.on_press(m),
                None => b,
            }
        };
        let name_field =
            |placeholder: &str, value: &str, on_input: Box<dyn Fn(String) -> Message>| {
                container(
                    text_input(placeholder, value)
                        .on_input(on_input)
                        .size(12.2)
                        .padding([10, 8])
                        .style(move |theme, status| {
                            let mut style = text_input::default(theme, status);
                            style.background = Color::TRANSPARENT.into();
                            style.border = Border {
                                color: if matches!(status, text_input::Status::Focused { .. }) {
                                    p.accent
                                } else {
                                    p.rule
                                },
                                width: 1.0,
                                radius: 7.2.into(),
                            };
                            style.placeholder = p.muted;
                            style.value = p.ink;
                            style
                        }),
                )
                .width(Length::Fixed(208.0))
            };
        // The name beside the style where the card is wide enough, else above it (never a wrapping row inside a
        // wrapping row, which the layout can't size).
        let wide = self.settings_width() >= 900.0;
        let mut list = column![].spacing(4);
        let last = presets.len().saturating_sub(1);
        for (i, preset) in presets.iter().enumerate() {
            let style = format!("{} {}", preset.color.label(), preset.kind.label());
            let name: Element<'_, Message> = match &preset.name {
                Some(name) => row![
                    text(name.clone())
                        .size(12.5)
                        .font(sans(font::Weight::Semibold)),
                    text(style.clone()).size(11.2).color(p.muted),
                ]
                .spacing(6)
                .align_y(Center)
                .wrap()
                .into(),
                None => text(style.clone()).size(12.5).into(),
            };
            let head = row![
                sample(preset.kind, &preset.color, dark, p.ink),
                container(name).width(Fill),
                self.hint(
                    small(
                        &icons::ARROW_UP,
                        0.0,
                        (i > 0).then_some(Message::PresetUp(i))
                    ),
                    "Move up".into()
                ),
                self.hint(
                    small(
                        &icons::ARROW_UP,
                        180.0,
                        (i < last).then_some(Message::PresetDown(i))
                    ),
                    "Move down".into()
                ),
                self.hint(
                    small(&icons::XMARK, 0.0, Some(Message::PresetRemove(i))),
                    format!("Remove {}", preset.phrase())
                ),
            ]
            .spacing(4)
            .align_y(Center);
            let edit = edit_row(
                wide,
                name_field(
                    "Name (optional)",
                    preset.name.as_deref().unwrap_or(""),
                    Box::new(move |name| Message::PresetName(i, name)),
                )
                .into(),
                self.preset_picker(Some(i), preset, &presets),
            );
            list = list.push(
                container(column![head, edit].spacing(6))
                    .padding(Padding {
                        top: 5.0,
                        right: 5.0,
                        bottom: 7.0,
                        left: 8.0,
                    })
                    .width(Fill)
                    .style(move |_| container::Style {
                        border: Border {
                            color: p.rule,
                            width: 1.0,
                            radius: 9.6.into(),
                        },
                        ..Default::default()
                    }),
            );
        }
        if presets.is_empty() {
            list = list.push(
                text("No quick marks: the menu shows just its actions.")
                    .size(11.2)
                    .color(p.muted),
            );
        }
        let mut body = column![].spacing(8);
        let is_default = presets == crate::marks::default_presets();
        let restore = button(
            container(text("Restore defaults").size(11.8).color(if is_default {
                fade(p.muted, 0.45)
            } else {
                p.muted
            }))
            .center_y(Fill),
        )
        .padding([0, 10])
        .height(36)
        .on_press_maybe((!is_default).then_some(Message::ResetPresets))
        .style(move |_, status| button::Style {
            background: (!is_default && matches!(status, button::Status::Hovered))
                .then(|| p.soft.into()),
            text_color: p.muted,
            border: Border {
                color: p.rule,
                width: 1.0,
                radius: 7.2.into(),
            },
            ..Default::default()
        });
        let summary = if presets.is_empty() {
            "None · Annotate still has every option · This device".to_string()
        } else {
            format!(
                "{} of {} · This device",
                presets.len(),
                crate::marks::PRESETS_MAX
            )
        };
        body = body.push(
            row![
                column![
                    self.setting_label("Quick marks"),
                    text(summary).size(11.2).color(p.muted),
                ]
                .spacing(2)
                .width(Fill),
                container(restore).center_y(36),
            ]
            .spacing(12)
            .align_y(iced::alignment::Vertical::Top),
        );
        body = body.push(
            text("Buttons at the top of the menu when you select verses, in this order. Each highlights or underlines every selected verse in its color.")
                .size(11.2)
                .color(p.muted),
        );
        body = body.push(
            text(format!(
                "A name (Blessings, Commandments…) is optional, up to {} characters, and shows on its button.",
                crate::marks::PRESET_NAME_MAX
            ))
            .size(11.2)
            .color(p.muted),
        );
        body = body.push(list);
        match self.new_preset() {
            Some(candidate) => {
                let phrase = format!("{} {}", candidate.color.label(), candidate.kind.label())
                    .to_lowercase();
                let add = button(
                    container(
                        row![
                            icon(&icons::PLUS, p.muted, 11.),
                            text(format!("Add {phrase}")).size(11.8).color(p.muted)
                        ]
                        .spacing(6)
                        .align_y(Center),
                    )
                    .center_y(Fill),
                )
                .padding([0, 10])
                .height(36)
                .on_press(Message::AddNewPreset)
                .style(move |_, status| button::Style {
                    background: matches!(status, button::Status::Hovered).then(|| p.soft.into()),
                    text_color: p.muted,
                    border: Border {
                        color: p.rule,
                        width: 1.0,
                        radius: 7.2.into(),
                    },
                    ..Default::default()
                });
                let head = row![
                    sample(candidate.kind, &candidate.color, dark, p.ink),
                    text("New quick mark").size(12.5).width(Fill),
                    add,
                ]
                .spacing(8)
                .align_y(Center);
                let edit = edit_row(
                    wide,
                    name_field(
                        "Name (optional)",
                        candidate.name.as_deref().unwrap_or(""),
                        Box::new(Message::NewPresetName),
                    )
                    .into(),
                    self.preset_picker(None, &candidate, &presets),
                );
                // The content sizes the stack; the dashed outline (`.quickMarkAdd`) fills it.
                body = body.push(iced::widget::stack![
                    container(column![head, edit].spacing(6))
                        .padding(Padding {
                            top: 5.0,
                            right: 5.0,
                            bottom: 7.0,
                            left: 8.0,
                        })
                        .width(Fill),
                    design::dashed_outline(p.rule, 9.6),
                ]);
            }
            None => {
                body = body.push(
                    text("Every highlight and underline color is a quick mark.")
                        .size(11.2)
                        .color(p.muted),
                );
            }
        }
        if let Some(error) = &self.preset_error {
            body = body.push(text(error.clone()).size(11.2).color(p.accent));
        }
        body.into()
    }
}

/// A quick mark's name field and style picker: side by side where the card is wide, else stacked.
fn edit_row<'a>(
    wide: bool,
    name: Element<'a, Message>,
    picker: Element<'a, Message>,
) -> Element<'a, Message> {
    if wide {
        row![name, picker].spacing(12).align_y(Center).into()
    } else {
        column![name, picker].spacing(6).into()
    }
}
