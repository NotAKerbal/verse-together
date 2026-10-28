// The website's mark controls (MarkSample, MarkStylePicker, QuickMarkSettings): quick marks for a selection, the
// full style picker, the floating bar for selected words, and the quick-mark list in settings.
use crate::design::{self, icon, sans, serif};
use crate::icons;
use crate::marks::{MarkColor, MarkKind, MarkPreset, PALETTE};
use crate::{App, Message};
use iced::widget::{button, column, container, row, space, text, text_input, tooltip};
use iced::{Alignment::Center, Border, Color, Element, Fill, Padding, font};

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
            format!("Remove {}", preset.label().to_lowercase())
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

    /// The floating bar shown while words of a verse are selected: mark exactly those words, copy them, or start
    /// a journal note quoting them.
    pub(crate) fn word_bar(&self) -> Option<Element<'_, Message>> {
        let (index, _) = self.word_selection.as_ref()?;
        let p = self.p();
        let verse = self.verses.get(*index)?;
        let words = self.selected_words(*index).unwrap_or_default();
        let quote = if words.chars().count() > 48 {
            format!(
                "“{}…”",
                words.chars().take(48).collect::<String>().trim_end()
            )
        } else {
            format!("“{words}”")
        };
        let round = |glyph: &'static icons::Icon, message: Message, label: &str| {
            self.hint(
                button(container(icon(glyph, p.ink, 13.)).center_x(32).center_y(32))
                    .padding(0)
                    .on_press(message)
                    .style(design::circle(p)),
                label.to_string(),
            )
        };
        let head = row![
            column![
                text(format!("{}:{}", self.reference(), verse.number))
                    .size(12)
                    .font(sans(font::Weight::Semibold)),
                text(quote).font(serif()).size(13).color(p.muted),
            ]
            .spacing(2)
            .width(Fill),
            round(&icons::COPY, Message::CopySelectedWords, "Copy words"),
            round(
                &icons::PEN_TO_SQUARE,
                Message::QuoteInJournal,
                "Add to a journal note"
            ),
            round(&icons::XMARK, Message::ClearWords, "Done"),
        ]
        .spacing(4)
        .align_y(Center);
        let mut card = column![head].spacing(10);
        if let Some(word) = self.selected_single_word() {
            // The website's featured action for one word: Explore “word”, meaning & context.
            card = card.push(
                button(
                    row![
                        icon(&icons::WAND_MAGIC_SPARKLES, p.accent, 13.),
                        column![
                            text(format!("Explore “{word}”"))
                                .size(13)
                                .font(sans(font::Weight::Semibold)),
                            text("Meaning & context").size(11.5).color(p.muted),
                        ]
                        .spacing(1),
                    ]
                    .spacing(10)
                    .align_y(Center),
                )
                .padding([6, 10])
                .width(Fill)
                .on_press(Message::Tools(crate::reader_tools::ToolsMsg::Explore(
                    word.clone(),
                )))
                .style(design::quiet(p)),
            );
        }
        Some(
            container(card.push(self.mark_tools(true)))
                .padding(Padding::from([12, 14]))
                .width(440)
                .style(design::popover(p))
                .into(),
        )
    }

    /// Quick marks in settings: their order, names, and removal (`QuickMarkSettings`).
    pub(crate) fn preset_settings(&self) -> Element<'_, Message> {
        let p = self.p();
        let presets = self.preferences.presets();
        let mut list = column![].spacing(4);
        for (i, preset) in presets.iter().enumerate() {
            let small = |glyph: &'static icons::Icon, message: Option<Message>| {
                let b = button(
                    container(icon(glyph, p.muted, 11.))
                        .center_x(26)
                        .center_y(26),
                )
                .padding(0)
                .style(design::circle(p));
                match message {
                    Some(m) => b.on_press(m),
                    None => b,
                }
            };
            list = list.push(
                row![
                    sample(preset.kind, &preset.color, self.preferences.dark, p.ink),
                    text_input(
                        &format!("{} {}", preset.color.label(), preset.kind.label()),
                        preset.name.as_deref().unwrap_or("")
                    )
                    .on_input(move |name| Message::PresetName(i, name))
                    .size(12)
                    .padding([5, 8])
                    .width(Fill),
                    small(&icons::ARROW_UP, (i > 0).then_some(Message::PresetUp(i))),
                    small(&icons::XMARK, Some(Message::PresetRemove(i))),
                ]
                .spacing(6)
                .align_y(Center),
            );
        }
        if presets.is_empty() {
            list = list.push(
                text("No quick marks. Add one from More styles when a verse is selected.")
                    .size(12)
                    .color(p.faint),
            );
        }
        column![
            row![
                self.setting_label("Quick marks"),
                space::horizontal(),
                button(text("Reset").size(11))
                    .padding([3, 8])
                    .on_press(Message::ResetPresets)
                    .style(design::quiet(p)),
            ]
            .align_y(Center),
            list,
        ]
        .spacing(8)
        .into()
    }
}
