// The account's screens, after the website's: Settings (`/account`: AccountManager beside the general settings)
// and Sign in (`/sign-in`: the AuthShell card with Continue with Google). Google sign-in happens in the browser,
// which approves this app (convex/nativeAuth.ts); nothing here asks for a password the deployment doesn't offer.
use crate::account::{AccountMsg, Status};
use crate::design::{self, Colors, icon, sans, serif};
use crate::header::CONTENT_TOP;
use crate::icons;
use crate::{App, Message, Screen};
use iced::widget::{button, column, container, row, scrollable, space, svg, text, text_input};
use iced::{Alignment::Center, Border, Element, Fill, Length, Padding, font};
use std::sync::OnceLock;

/// The website's Google "G" (`GoogleButton`).
fn google_logo() -> svg::Handle {
    static LOGO: OnceLock<svg::Handle> = OnceLock::new();
    LOGO.get_or_init(|| {
        svg::Handle::from_memory(&br##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>"##[..])
    })
    .clone()
}
/// `initials(name, email)`: up to two letters for the avatar.
pub fn initials(name: &str, email: &str) -> String {
    let source = if name.trim().is_empty() { email } else { name };
    let letters: String = source
        .split_whitespace()
        .take(2)
        .filter_map(|w| w.chars().next())
        .flat_map(char::to_uppercase)
        .collect();
    if letters.is_empty() {
        "?".into()
    } else {
        letters
    }
}
fn msg(m: AccountMsg) -> Message {
    Message::Account(m)
}
/// `SECONDARY_BUTTON_CLASS`: a bordered pill, 44px tall, bold 14px.
fn pill_button<'a>(
    p: Colors,
    content: impl Into<Element<'a, Message>>,
    on_press: Option<Message>,
) -> button::Button<'a, Message> {
    button(container(content).center_x(Fill).center_y(44))
        .padding([0, 16])
        .height(44)
        .on_press_maybe(on_press)
        .style(move |_, status| button::Style {
            background: Some(
                if matches!(status, button::Status::Hovered | button::Status::Pressed) {
                    p.hover
                } else {
                    p.card_strong
                }
                .into(),
            ),
            text_color: if matches!(status, button::Status::Disabled) {
                design::fade(p.ink, 0.6)
            } else {
                p.ink
            },
            border: Border {
                color: p.rule,
                width: 2.0,
                radius: 999.0.into(),
            },
            ..Default::default()
        })
}
/// `PRIMARY_BUTTON_CLASS`: the ink pill.
fn primary_button<'a>(
    p: Colors,
    label: String,
    on_press: Option<Message>,
) -> button::Button<'a, Message> {
    button(
        container(
            text(label)
                .size(14)
                .font(sans(font::Weight::Bold))
                .color(p.paper),
        )
        .center_y(44),
    )
    .padding([0, 16])
    .height(44)
    .on_press_maybe(on_press)
    .style(move |_, status| button::Style {
        background: Some(
            design::fade(
                p.ink,
                if matches!(status, button::Status::Hovered) {
                    0.9
                } else if matches!(status, button::Status::Disabled) {
                    0.6
                } else {
                    1.0
                },
            )
            .into(),
        ),
        text_color: p.paper,
        border: Border {
            color: p.rule,
            width: 2.0,
            radius: 999.0.into(),
        },
        shadow: design::soft_shadow(p),
        ..Default::default()
    })
}
/// `FormMessage`: errors in the rubric color, everything else in ink, in a bordered box.
fn form_message<'a>(p: Colors, error: bool, message: &str) -> Element<'a, Message> {
    let color = if error { p.accent } else { p.ink };
    container(text(message.to_string()).size(14).color(color))
        .padding([8, 12])
        .width(Fill)
        .style(move |_| container::Style {
            border: Border {
                color: if error { p.accent } else { p.rule },
                width: 2.0,
                radius: 12.0.into(),
            },
            ..Default::default()
        })
        .into()
}
/// `.settingsCard` / `.profileCard`: rounded card on the soft shadow, 8px inside.
fn settings_card<'a>(p: Colors, content: impl Into<Element<'a, Message>>) -> Element<'a, Message> {
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

impl App {
    pub(crate) fn account_name(&self) -> Option<String> {
        let session = self.account.session.as_ref()?;
        Some(if session.user.name.trim().is_empty() {
            session.user.email.clone()
        } else {
            session.user.name.clone()
        })
    }
    /// One line on the sync's state.
    pub(crate) fn sync_state(&self) -> String {
        let a = &self.account;
        match a.status {
            Status::Syncing => "Syncing…".to_string(),
            _ if a.failures > 0 => "Waiting to retry".to_string(),
            _ if a.pending => "Changes waiting to sync".to_string(),
            _ => a
                .last_sync
                .as_ref()
                .map(|t| format!("Synced at {t}"))
                .unwrap_or_else(|| "Not synced yet".into()),
        }
    }
    fn page<'a>(
        &self,
        content: impl Into<Element<'a, Message>>,
        width: f32,
    ) -> Element<'a, Message> {
        scrollable(
            container(container(content).max_width(width))
                .center_x(Fill)
                .padding(Padding {
                    top: CONTENT_TOP,
                    right: 24.0,
                    bottom: 48.0,
                    left: 24.0,
                }),
        )
        .id("account")
        .height(Fill)
        .into()
    }

    /// `/sign-in` (`SignInForm` in Google-only mode, in `AuthShell`).
    pub(crate) fn sign_in_view(&self) -> Element<'_, Message> {
        let p = self.p();
        let a = &self.account;
        let mut body = column![].spacing(16);
        if let Some(notice) = &a.notice {
            body = body.push(form_message(p, true, notice));
        }
        match (&a.endpoints, &a.status) {
            (Err(reason), _) => {
                body = body.push(form_message(p, false, reason));
            }
            (Ok(_), Status::Waiting) => {
                body = body
                    .push(
                        pill_button(
                            p,
                            row![
                                svg(google_logo()).width(18).height(18),
                                text("Opening Google…").size(14).font(sans(font::Weight::Bold)),
                            ]
                            .spacing(8)
                            .align_y(Center),
                            None,
                        )
                        .width(Fill),
                    )
                    .push(
                        text("Finish in the browser window that opened: sign in with Google there, then approve Verse Together on this computer. This window updates by itself.")
                            .size(14)
                            .color(p.muted)
                            .line_height(1.43),
                    )
                    .push(
                        pill_button(
                            p,
                            text("Cancel").size(14).font(sans(font::Weight::Bold)),
                            Some(msg(AccountMsg::CancelSignIn)),
                        )
                        .width(Fill),
                    );
            }
            (Ok(_), _) => {
                body = body
                    .push(
                        pill_button(
                            p,
                            row![
                                svg(google_logo()).width(18).height(18),
                                text(if a.purging {
                                    "Finishing sign-out…"
                                } else {
                                    "Continue with Google"
                                })
                                .size(14)
                                .font(sans(font::Weight::Bold)),
                            ]
                            .spacing(8)
                            .align_y(Center),
                            (!a.purging).then(|| msg(AccountMsg::SignIn)),
                        )
                        .width(Fill),
                    )
                    .push(
                        text("New to Verse Together? Continuing with Google creates your account.")
                            .size(14)
                            .color(p.muted)
                            .line_height(1.43),
                    );
            }
        }
        let card = container(
            column![
                text("Sign in").size(36).font(serif()).line_height(1.2),
                text("Welcome back. Sign in to keep your notes, highlights, and plans in sync.")
                    .size(17)
                    .font(serif())
                    .color(p.muted)
                    .line_height(1.62),
                space().height(12),
                body,
            ]
            .spacing(8),
        )
        .padding(24)
        .width(448)
        .id("sign-in-card")
        .style(move |_| container::Style {
            background: Some(p.card.into()),
            text_color: Some(p.ink),
            border: Border {
                color: p.rule,
                width: 1.0,
                radius: 21.6.into(),
            },
            ..Default::default()
        });
        scrollable(
            container(card)
                .center_x(Fill)
                .padding(Padding::ZERO.top(CONTENT_TOP + 40.0).bottom(48.0)),
        )
        .id("account")
        .height(Fill)
        .into()
    }

    /// `/account`: account settings beside the general settings (two columns from 768px, as on the website).
    pub(crate) fn settings_view(&self) -> Element<'_, Message> {
        let p = self.p();
        let account = column![
            text("Account settings")
                .size(13.1)
                .font(sans(font::Weight::Medium)),
            self.account_manager(),
        ]
        .spacing(12)
        .width(Fill);
        let general = column![
            settings_card(
                p,
                container(
                    column![
                        self.toggle_setting(
                            "Simple mode",
                            if self.focus {
                                "Study tools hidden · This device"
                            } else {
                                "Study tools visible · This device"
                            },
                            self.focus,
                            Message::ToggleFocus,
                        ),
                        self.toggle_setting(
                            "Dark appearance",
                            "This device",
                            self.preferences.dark,
                            Message::SetDark(!self.preferences.dark),
                        ),
                    ]
                    .spacing(4),
                )
                .padding([8, 12]),
            ),
            settings_card(p, container(self.preset_settings()).padding([8, 12])),
        ]
        .spacing(12)
        .width(Fill);
        let wide = self.window_width >= 768.0;
        let layout: Element<'_, Message> = if wide {
            row![account, general].spacing(24).into()
        } else {
            column![account, general].spacing(24).into()
        };
        self.page(container(layout).padding(Padding::ZERO.top(16)), 960.0)
    }
    fn toggle_setting<'a>(
        &self,
        title: &'static str,
        detail: &'static str,
        on: bool,
        message: Message,
    ) -> Element<'a, Message> {
        let p = self.p();
        let knob = container(
            container(if on {
                Element::from(icon(&icons::CHECK, p.accent, 10.))
            } else {
                space().into()
            })
            .center_x(20)
            .center_y(20)
            .style(move |_| container::Style {
                background: Some(if on { p.card } else { p.muted }.into()),
                border: Border {
                    radius: 10.0.into(),
                    ..Default::default()
                },
                ..Default::default()
            }),
        )
        .padding(Padding::ZERO.left(if on { 25.0 } else { 3.0 }))
        .center_y(26)
        .width(48)
        .style(move |_| container::Style {
            background: Some(if on { p.accent } else { p.soft }.into()),
            border: Border {
                color: if on { p.accent } else { p.rule },
                width: 1.0,
                radius: 13.0.into(),
            },
            ..Default::default()
        });
        row![
            column![
                text(title).size(13.1).font(sans(font::Weight::Medium)),
                text(detail).size(11.2).color(p.muted),
            ]
            .spacing(2)
            .width(Fill),
            button(knob)
                .padding(Padding::from([9, 0]))
                .on_press(message)
                .style(|_, _| button::Style::default()),
        ]
        .align_y(Center)
        .height(Length::Shrink)
        .into()
    }

    /// `AccountManager`.
    fn account_manager(&self) -> Element<'_, Message> {
        let p = self.p();
        let a = &self.account;
        if let Err(reason) = &a.endpoints {
            return form_message(p, false, reason);
        }
        let Some(session) = &a.session else {
            let mut card = column![
                text("Sign in to manage your account and sync your study. General settings are saved on this device.")
                    .size(14)
                    .line_height(1.43),
                primary_button(
                    p,
                    if a.status == Status::Waiting {
                        "Signing in…".into()
                    } else {
                        "Sign in".into()
                    },
                    Some(Message::SetScreen(Screen::SignIn)),
                ),
            ]
            .spacing(12);
            if a.held.is_some() {
                card = card.push(
                    pill_button(
                        p,
                        text("Show this computer's study")
                            .size(14)
                            .font(sans(font::Weight::Bold)),
                        Some(msg(AccountMsg::ReleaseHeld)),
                    )
                    .width(Fill),
                );
            }
            if let Some(notice) = &a.notice {
                card = card.push(form_message(p, true, notice));
            }
            return settings_card(p, container(card).padding(12));
        };
        let v = &a.view;
        let details = v.details.as_ref();
        let name = details
            .map(|d| d.name.clone())
            .unwrap_or_else(|| session.user.name.clone());
        let email = details
            .map(|d| d.email.clone())
            .unwrap_or_else(|| session.user.email.clone());
        let avatar = container(
            text(initials(&name, &email))
                .size(14)
                .font(sans(font::Weight::Semibold))
                .color(p.muted),
        )
        .center_x(48)
        .center_y(48)
        .style(move |_| container::Style {
            background: Some(p.soft.into()),
            border: Border {
                radius: 24.0.into(),
                ..Default::default()
            },
            ..Default::default()
        });
        let profile = button(
            row![
                avatar,
                column![
                    text(if name.trim().is_empty() {
                        "Your account".to_string()
                    } else {
                        name.clone()
                    })
                    .size(15.2)
                    .font(sans(font::Weight::Semibold)),
                    text(email).size(12.5).color(p.muted),
                ]
                .spacing(3)
                .width(Fill),
                text("Edit profile")
                    .size(12)
                    .font(sans(font::Weight::Medium))
                    .color(if v.profile_open { p.accent } else { p.muted }),
            ]
            .spacing(14)
            .align_y(Center),
        )
        .padding(12)
        .width(Fill)
        .on_press(msg(AccountMsg::ToggleProfile))
        .style(design::ghost(p, 8.0));
        let mut profile_card = column![profile];
        if v.profile_open {
            let mut form = column![
                text("Display name")
                    .size(14)
                    .font(sans(font::Weight::Semibold)),
                text_input("", &v.name)
                    .id("account-name")
                    .on_input(|n| msg(AccountMsg::NameInput(n)))
                    .on_submit(msg(AccountMsg::SaveName))
                    .padding([10, 12])
                    .size(14),
            ]
            .spacing(4);
            if let Some((ok, message)) = &v.name_message {
                form = form.push(form_message(p, !ok, message));
            }
            form = form.push(pill_button(
                p,
                text(if v.saving_name {
                    "Saving…"
                } else {
                    "Save name"
                })
                .size(14)
                .font(sans(font::Weight::Bold)),
                (!v.saving_name && !v.name.trim().is_empty()).then(|| msg(AccountMsg::SaveName)),
            ));
            profile_card = profile_card.push(container(form.spacing(12)).padding(12));
        }
        let sign_out = match a.confirm_sign_out {
            Some(n) => Element::from(
                column![
                    form_message(
                        p,
                        true,
                        &format!(
                            "{} haven't synced yet. Signing out removes them from this computer.",
                            crate::journal::plural(n, "change", "changes")
                        ),
                    ),
                    row![
                        pill_button(
                            p,
                            text("Keep syncing").size(14).font(sans(font::Weight::Bold)),
                            Some(msg(AccountMsg::Sync)),
                        ),
                        pill_button(
                            p,
                            text("Sign out anyway")
                                .size(14)
                                .font(sans(font::Weight::Bold)),
                            Some(msg(AccountMsg::SignOut(true))),
                        ),
                    ]
                    .spacing(8),
                ]
                .spacing(8),
            ),
            None => button(text("Sign out").size(14).font(sans(font::Weight::Medium)))
                .padding([12, 12])
                .on_press(msg(AccountMsg::SignOut(false)))
                .style(design::ghost(p, 8.0))
                .into(),
        };
        let left = column![
            settings_card(p, profile_card),
            container(sign_out).padding(Padding::ZERO.left(12).right(12)),
        ]
        .spacing(12);

        // Sync (this app's own), then the website's sign-in methods and sessions.
        let sync_summary = self.sync_state();
        let mut sync_body = column![
            row![
                icon(&icons::CLOUD, p.faint, 12.),
                text(sync_summary.clone()).size(14).width(Fill),
                pill_button(
                    p,
                    text("Sync now").size(13).font(sans(font::Weight::Bold)),
                    (a.status == Status::Idle).then(|| msg(AccountMsg::Sync)),
                ),
            ]
            .spacing(8)
            .align_y(Center),
            text("Your notes, highlights, readings, and goals sync with versetogether.org while this app is open. This computer's own study stays separate.")
                .size(12)
                .color(p.muted),
        ]
        .spacing(8);
        if let Some(notice) = &a.notice {
            sync_body = sync_body.push(
                column![
                    form_message(p, true, notice),
                    button(text("Dismiss").size(12).color(p.muted))
                        .padding(0)
                        .on_press(msg(AccountMsg::DismissNotice))
                        .style(design::link(p.muted)),
                ]
                .spacing(4),
            );
        }
        // Copying this computer's own study is a choice, never automatic.
        let (device_notes, device_verses) = v.device;
        if device_notes + device_verses > 0 {
            let summary = format!(
                "{} and {} are saved only on this computer.",
                crate::journal::plural(device_notes, "note", "notes"),
                crate::journal::plural(device_verses, "marked verse", "marked verses")
            );
            let mut copy = column![text(summary).size(13).color(p.muted)].spacing(8);
            if v.import_confirm {
                copy = copy
                    .push(
                        text(format!(
                            "Copy them into {}? They stay on this computer too. An account's own notes and marks are never replaced, and copying again only adds what wasn't copied.",
                            session.user.email
                        ))
                        .size(13),
                    )
                    .push(
                        row![
                            pill_button(p, text("Copy into my account").size(13).font(sans(font::Weight::Bold)), Some(msg(AccountMsg::Import))),
                            pill_button(p, text("Cancel").size(13).font(sans(font::Weight::Bold)), Some(msg(AccountMsg::ImportCancel))),
                        ]
                        .spacing(8),
                    );
            } else {
                copy = copy.push(pill_button(
                    p,
                    row![
                        icon(&icons::FILE_IMPORT, p.ink, 12.),
                        text(if v.importing {
                            "Copying…"
                        } else {
                            "Copy this computer's study…"
                        })
                        .size(13)
                        .font(sans(font::Weight::Bold)),
                    ]
                    .spacing(8)
                    .align_y(Center),
                    (!v.importing).then(|| msg(AccountMsg::ImportAsk)),
                ));
            }
            sync_body = sync_body.push(copy);
        }
        if let Some((ok, message)) = &v.import_message {
            sync_body = sync_body.push(form_message(p, !ok, message));
        }
        let methods = details.map(|d| {
            let google = d.providers.iter().any(|x| x == "google");
            if google {
                "Google".to_string()
            } else {
                "None connected".to_string()
            }
        });
        let methods_body: Element<'_, Message> = match details {
            Some(d) => text(format!(
                "Google: {}",
                if d.providers.iter().any(|x| x == "google") {
                    "connected"
                } else {
                    "not connected"
                }
            ))
            .size(14)
            .into(),
            None => self.list_placeholder(),
        };
        let sessions_summary =
            details.map(|d| crate::journal::plural(d.sessions.len(), "device", "devices"));
        let sessions_body: Element<'_, Message> = match details {
            Some(d) => {
                let mut list = column![].spacing(4);
                for s in &d.sessions {
                    let this = d.current.as_deref() == Some(s.id.as_str());
                    list = list.push(row![
                        text(s.device.clone()).size(14),
                        text(if this { " · This device" } else { "" })
                            .size(14)
                            .font(sans(font::Weight::Semibold)),
                    ]);
                }
                let others = d
                    .sessions
                    .iter()
                    .any(|s| d.current.as_deref() != Some(s.id.as_str()));
                let mut body = column![list].spacing(12);
                if let Some((ok, message)) = &v.sessions_message {
                    body = body.push(form_message(p, !ok, message));
                }
                body.push(pill_button(
                    p,
                    text("Sign out other devices")
                        .size(14)
                        .font(sans(font::Weight::Bold)),
                    (others && !v.revoking).then(|| msg(AccountMsg::RevokeOthers)),
                ))
                .into()
            }
            None => self.list_placeholder(),
        };
        let unavailable = |s: Option<String>| {
            s.unwrap_or_else(|| {
                if v.error.is_some() {
                    "Unavailable".into()
                } else {
                    "Loading…".into()
                }
            })
        };
        let mut sections = column![].spacing(4);
        if let Some(error) = &v.error {
            sections = sections.push(
                container(
                    column![
                        form_message(p, true, error),
                        pill_button(
                            p,
                            text("Reload sign-in methods and sessions")
                                .size(14)
                                .font(sans(font::Weight::Bold)),
                            Some(msg(AccountMsg::LoadDetails)),
                        ),
                    ]
                    .spacing(8),
                )
                .padding(8),
            );
        }
        sections = sections
            .push(self.section(0, "Sync", sync_summary, sync_body.into()))
            .push(self.section(1, "Sign-in methods", unavailable(methods), methods_body))
            .push(self.section(2, "Sessions", unavailable(sessions_summary), sessions_body));
        let right = settings_card(p, sections);
        column![left, right].spacing(12).into()
    }
    fn list_placeholder(&self) -> Element<'_, Message> {
        text(if self.account.view.error.is_some() {
            "Couldn't load this right now."
        } else {
            "Loading…"
        })
        .size(14)
        .color(self.p().muted)
        .into()
    }
    /// A `<details>` section: its title and summary, opening to its content.
    fn section<'a>(
        &self,
        index: usize,
        title: &'static str,
        summary: String,
        body: Element<'a, Message>,
    ) -> Element<'a, Message> {
        let p = self.p();
        let open = self.account.view.open[index];
        let head = button(
            row![
                text(title).size(13.1).font(sans(font::Weight::Medium)),
                space().width(Fill),
                text(summary).size(11.5).color(p.muted),
                design::rotated_icon(
                    &icons::CHEVRON_DOWN,
                    p.faint,
                    10.,
                    if open { 180.0 } else { 0.0 },
                ),
            ]
            .spacing(8)
            .align_y(Center),
        )
        .padding([0, 12])
        .height(52)
        .width(Fill)
        .on_press(msg(AccountMsg::ToggleSection(index)))
        .style(design::ghost(p, 8.0));
        let mut section = column![head];
        if open {
            section = section.push(container(body).padding(Padding {
                top: 4.0,
                right: 12.0,
                bottom: 12.0,
                left: 12.0,
            }));
        }
        section.into()
    }

    /// The account menu under the avatar in the navigation (`AccountMenu`): who, Settings, Sign out.
    pub(crate) fn account_menu(&self) -> Element<'_, Message> {
        let p = self.p();
        let item = |label: &'static str, m: Message| {
            button(text(label).size(14).font(sans(font::Weight::Medium)))
                .padding([10, 12])
                .width(Fill)
                .on_press(m)
                .style(design::ghost(p, 12.0))
        };
        let mut menu = column![].spacing(2);
        if let Some(session) = &self.account.session {
            menu = menu.push(
                container(
                    column![
                        text(self.account_name().unwrap_or_default())
                            .size(14)
                            .font(sans(font::Weight::Semibold)),
                        text(session.user.email.clone()).size(12).color(p.muted),
                        text(self.sync_state()).size(12).color(p.faint),
                    ]
                    .spacing(2),
                )
                .padding([8, 12]),
            );
        }
        menu = menu
            .push(item("Settings", Message::SetScreen(Screen::Settings)))
            .push(item("Sign out", msg(AccountMsg::SignOut(false))));
        container(menu)
            .padding(8)
            .style(move |_| container::Style {
                background: Some(p.card_strong.into()),
                text_color: Some(p.ink),
                border: Border {
                    color: p.rule,
                    width: 2.0,
                    radius: 16.0.into(),
                },
                shadow: design::soft_shadow(p),
                ..Default::default()
            })
            .into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn avatars_show_initials_like_the_website() {
        assert_eq!(initials("Isaac Cochran", "x@example.com"), "IC");
        assert_eq!(initials("", "reader@example.com"), "R");
        assert_eq!(initials("  ", ""), "?");
        assert_eq!(initials("élise marie anne", ""), "ÉM");
    }
}
