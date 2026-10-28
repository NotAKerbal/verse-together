// Settings → Feedback, after the website's `FeedbackForm`, `features/feedback/feedbackForm.ts` and
// `convex/feedbackRules.ts`: a message and an optional way to reply, checked with the backend's own limits, sent with
// the website's Convex mutation (`feedback:submitFeedback`, anonymous unless signed in). The form's rules are kept
// pure so they are tested without a window:
// - nothing is sent until the message passes the checks the backend makes;
// - while a send is in flight the draft can't change and a second send is refused;
// - a failed send keeps the draft so nothing typed is lost;
// - a successful send clears the draft and says so until the next edit.
use crate::account::background;
use crate::design::{self, Colors, sans};
use crate::{App, Message};
use iced::widget::{button, column, container, row, text, text_editor, text_input};
use iced::{Border, Element, Fill, Task, font};
use std::time::Duration;

/// `FEEDBACK_MESSAGE_MIN`, `FEEDBACK_MESSAGE_MAX`, `FEEDBACK_CONTACT_MAX`, `FEEDBACK_PATH_MAX`. Lengths are the
/// browser's (UTF-16 code units).
pub const MESSAGE_MIN: usize = 5;
pub const MESSAGE_MAX: usize = 2000;
pub const CONTACT_MAX: usize = 200;
pub const PATH_MAX: usize = 200;
/// The page this form is on, sent as the website sends `window.location.pathname`: this app's Settings, under the
/// `/native/` paths the website already reserves for the desktop app.
pub const PATH: &str = "/native/account";

pub fn utf16_len(value: &str) -> usize {
    value.encode_utf16().count()
}
/// `feedbackMessageError`: why a message can't be sent, worded for the form; checks the trimmed text.
pub fn message_error(message: &str) -> Option<String> {
    let length = utf16_len(message.trim());
    if length < MESSAGE_MIN {
        return Some(format!("Write at least {MESSAGE_MIN} characters."));
    }
    if length > MESSAGE_MAX {
        return Some(format!("Keep it to {MESSAGE_MAX} characters or fewer."));
    }
    None
}
/// `feedbackContactError`.
pub fn contact_error(contact: &str) -> Option<String> {
    (utf16_len(contact.trim()) > CONTACT_MAX)
        .then(|| format!("Keep it to {CONTACT_MAX} characters or fewer."))
}
/// `cleanFeedbackPath`: only a site path, without its query or hash, cut to length.
pub fn clean_path(path: &str) -> Option<String> {
    let pathname = path.split(['?', '#']).next().unwrap_or("").trim();
    if !pathname.starts_with('/') || pathname.starts_with("//") {
        return None;
    }
    let units: Vec<u16> = pathname.encode_utf16().take(PATH_MAX).collect();
    Some(String::from_utf16_lossy(&units))
}
/// Keeps at most `max` UTF-16 units of a value (the fields' `maxLength`).
pub fn clip(value: &str, max: usize) -> String {
    let mut used = 0;
    value
        .chars()
        .take_while(|c| {
            used += c.len_utf16();
            used <= max
        })
        .collect()
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Draft {
    pub message: String,
    pub contact: String,
}
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Status {
    #[default]
    Idle,
    Pending,
    Sent,
    Failed,
}
/// `FeedbackFormState`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FormState {
    pub draft: Draft,
    pub status: Status,
    /// Set by a send attempt, so field errors appear only after the first try and then follow the typing.
    pub attempted: bool,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Field {
    Message,
    Contact,
}
/// `FeedbackFormAction`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    Edit(Field, String),
    Submit,
    Succeeded,
    Failed,
}
/// `canSendFeedback`.
pub fn can_send(draft: &Draft) -> bool {
    message_error(&draft.message).is_none() && contact_error(&draft.contact).is_none()
}
/// `visibleFeedbackErrors`: none before the first send attempt.
pub fn visible_errors(state: &FormState) -> (Option<String>, Option<String>) {
    if !state.attempted {
        return (None, None);
    }
    (
        message_error(&state.draft.message),
        contact_error(&state.draft.contact),
    )
}
/// `feedbackFormReducer`.
pub fn reduce(state: &FormState, action: Action) -> FormState {
    match action {
        Action::Edit(field, value) => {
            // The draft being sent is the one shown, so it can't change under the request.
            if state.status == Status::Pending {
                return state.clone();
            }
            let mut next = state.clone();
            match field {
                Field::Message => next.draft.message = value,
                Field::Contact => next.draft.contact = value,
            }
            if next.status == Status::Sent {
                next.status = Status::Idle;
            }
            next
        }
        Action::Submit => {
            if state.status == Status::Pending {
                return state.clone();
            }
            let mut next = state.clone();
            next.attempted = true;
            if !can_send(&state.draft) {
                if next.status == Status::Sent {
                    next.status = Status::Idle;
                }
                return next;
            }
            next.status = Status::Pending;
            next
        }
        Action::Succeeded => {
            if state.status != Status::Pending {
                return state.clone();
            }
            FormState {
                status: Status::Sent,
                ..Default::default()
            }
        }
        Action::Failed => {
            if state.status != Status::Pending {
                return state.clone();
            }
            FormState {
                status: Status::Failed,
                ..state.clone()
            }
        }
    }
}
/// The mutation's arguments as `FeedbackForm` sends them: the trimmed message, the trimmed contact or nothing, the
/// page's path.
pub fn arguments(draft: &Draft, path: &str) -> serde_json::Value {
    let mut args = serde_json::json!({ "message": draft.message.trim() });
    let contact = draft.contact.trim();
    if !contact.is_empty() {
        args["contact"] = contact.into();
    }
    if let Some(path) = clean_path(path) {
        args["path"] = path.into();
    }
    args
}
/// Sends feedback to the Convex deployment's `feedback:submitFeedback` (as `submitFeedback` does), with the
/// account's Convex token when signed in, else anonymously.
pub fn submit(convex: &str, jwt: Option<&str>, args: serde_json::Value) -> Result<(), String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(30)))
        .http_status_as_error(false)
        .build()
        .into();
    let mut request = agent.post(&format!("{convex}/api/mutation"));
    if let Some(jwt) = jwt {
        request = request.header("Authorization", &format!("Bearer {jwt}"));
    }
    let mut response = request
        .send_json(serde_json::json!({ "path": "feedback:submitFeedback", "args": args, "format": "json" }))
        .map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let reply: serde_json::Value = response
        .body_mut()
        .read_json()
        .map_err(|_| format!("HTTP {status}"))?;
    if (200..300).contains(&status) && reply["status"] == "success" {
        Ok(())
    } else {
        Err(reply["errorMessage"]
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| format!("HTTP {status}")))
    }
}

/// The form on screen: its state and the message's editor.
#[derive(Default)]
pub struct FeedbackUi {
    pub form: FormState,
    pub message: text_editor::Content,
    /// Each send's number, so only the latest one's answer counts.
    pub generation: u64,
}
#[derive(Debug, Clone)]
pub enum FeedbackMsg {
    Message(text_editor::Action),
    Contact(String),
    Submit,
    Sent(u64, Result<(), String>),
}
fn msg(m: FeedbackMsg) -> Message {
    Message::Feedback(m)
}

impl App {
    pub(crate) fn update_feedback(&mut self, message: FeedbackMsg) -> Task<Message> {
        let ui = &mut self.feedback;
        match message {
            FeedbackMsg::Message(action) => {
                // Read-only while sending (`readOnly={pending}`); moving the caret or selecting is still allowed.
                if action.is_edit() && ui.form.status == Status::Pending {
                    return Task::none();
                }
                // `maxLength`: typing or pasting past the limit is cut short, as the browser does.
                let action = match action {
                    text_editor::Action::Edit(text_editor::Edit::Paste(pasted)) => {
                        let selected = ui.message.selection().map(|s| utf16_len(&s)).unwrap_or(0);
                        let room =
                            (MESSAGE_MAX + selected).saturating_sub(utf16_len(&ui.message.text()));
                        text_editor::Action::Edit(text_editor::Edit::Paste(std::sync::Arc::new(
                            clip(&pasted, room),
                        )))
                    }
                    text_editor::Action::Edit(text_editor::Edit::Insert(c))
                        if ui.message.selection().is_none()
                            && utf16_len(&ui.message.text()) + c.len_utf16() > MESSAGE_MAX =>
                    {
                        return Task::none();
                    }
                    other => other,
                };
                let edit = action.is_edit();
                ui.message.perform(action);
                if edit {
                    let value = ui.message.text();
                    ui.form = reduce(&ui.form, Action::Edit(Field::Message, value));
                }
            }
            FeedbackMsg::Contact(value) => {
                ui.form = reduce(
                    &ui.form,
                    Action::Edit(Field::Contact, clip(&value, CONTACT_MAX)),
                );
            }
            FeedbackMsg::Submit => {
                if ui.form.status == Status::Pending {
                    return Task::none();
                }
                ui.form = reduce(&ui.form, Action::Submit);
                if ui.form.status != Status::Pending {
                    // The field's error is shown beside it; the keyboard goes there.
                    let field = if message_error(&ui.form.draft.message).is_some() {
                        "feedback-message"
                    } else {
                        "feedback-contact"
                    };
                    return crate::presented(iced::widget::operation::focus(field));
                }
                ui.generation += 1;
                let generation = ui.generation;
                let args = arguments(&ui.form.draft, PATH);
                // Feedback is the website's anonymous form: it needs only the deployment, not account features.
                let endpoints = crate::cloud::Endpoints::from_env();
                let account = self
                    .account
                    .endpoints
                    .as_ref()
                    .ok()
                    .cloned()
                    .zip(self.account.session.clone());
                return Task::perform(
                    background(move || {
                        let endpoints = endpoints?;
                        // Signed in, the backend links it to the account; a token that can't be had fails the send,
                        // as `getToken` failing does on the website.
                        let jwt = match account {
                            Some((e, session)) => Some(
                                crate::cloud::convex_token(&e, &session).map_err(String::from)?,
                            ),
                            None => None,
                        };
                        submit(&endpoints.convex, jwt.as_deref(), args)
                    }),
                    move |r| msg(FeedbackMsg::Sent(generation, r)),
                );
            }
            FeedbackMsg::Sent(generation, result) => {
                if generation != ui.generation {
                    return Task::none();
                }
                ui.form = reduce(
                    &ui.form,
                    if result.is_ok() {
                        Action::Succeeded
                    } else {
                        Action::Failed
                    },
                );
                if ui.form.status == Status::Sent {
                    ui.message = text_editor::Content::new();
                }
            }
        }
        Task::none()
    }

    /// Settings → Feedback (`FeedbackForm`).
    pub(crate) fn feedback_view(&self) -> Element<'_, Message> {
        let p = self.p();
        let form = &self.feedback.form;
        let pending = form.status == Status::Pending;
        let (message_error, contact_error) = visible_errors(form);
        let meta = |s: String| text(s).size(11.5).color(p.muted);
        let field_error = |s: String| {
            text(s)
                .size(12)
                .font(sans(font::Weight::Semibold))
                .color(p.accent)
        };
        let lead = if self.account.session.is_some() {
            "Linked to your account when you send it."
        } else {
            "Sent anonymously. You don't need to sign in."
        };
        let invalid = |error: bool| if error { p.accent } else { p.rule };
        let message_border = invalid(message_error.is_some());
        let mut message = column![
            text("Your feedback").size(14).font(sans(font::Weight::Semibold)),
            text_editor(&self.feedback.message)
                .id("feedback-message")
                .placeholder("What would make Verse Together better?")
                .on_action(|a| msg(FeedbackMsg::Message(a)))
                .height(144)
                .padding([10, 12])
                .size(14)
                .style(move |theme, status| {
                    let mut style = text_editor::default(theme, status);
                    style.background = (if pending { p.soft } else { p.input }).into();
                    style.border = Border {
                        color: message_border,
                        width: 2.0,
                        radius: 12.0.into(),
                    };
                    style.placeholder = p.faint;
                    style.value = p.ink;
                    style.selection = p.gold;
                    style
                }),
            row![
                meta(format!(
                    "{MESSAGE_MIN} to {MESSAGE_MAX} characters. Please leave out passwords and private details."
                ))
                .width(Fill),
                meta(format!("{}/{MESSAGE_MAX}", utf16_len(&form.draft.message))),
            ]
            .spacing(12),
        ]
        .spacing(5);
        if let Some(error) = message_error {
            message = message.push(field_error(error));
        }
        let contact_border = invalid(contact_error.is_some());
        let mut contact = column![
            row![
                text("How to reach you")
                    .size(14)
                    .font(sans(font::Weight::Semibold)),
                text(" (optional)").size(14).color(p.muted),
            ],
            text_input("", &form.draft.contact)
                .id("feedback-contact")
                .on_input_maybe((!pending).then_some(|v| msg(FeedbackMsg::Contact(v))))
                .on_submit(msg(FeedbackMsg::Submit))
                .padding([10, 12])
                .size(14)
                .style(move |theme, status| {
                    let mut style = text_input::default(theme, status);
                    style.background = (if pending { p.soft } else { p.input }).into();
                    style.border = Border {
                        color: contact_border,
                        width: 2.0,
                        radius: 12.0.into(),
                    };
                    style.value = p.ink;
                    style.selection = p.gold;
                    style
                }),
            meta("An email or handle, if you'd like a reply. Only the developer sees it.".into()),
        ]
        .spacing(5);
        if let Some(error) = contact_error {
            contact = contact.push(field_error(error));
        }
        let mut body = column![message, contact].spacing(16);
        if form.status == Status::Failed {
            body = body.push(notice(
                p,
                true,
                "Your feedback couldn't be sent. It's still here, so you can try again.",
            ));
        }
        if form.status == Status::Sent {
            body = body.push(notice(p, false, "Thanks! Your feedback was sent."));
        }
        body = body.push(
            button(
                container(
                    text(if pending {
                        "Sending…"
                    } else {
                        "Send feedback"
                    })
                    .size(14)
                    .font(sans(font::Weight::Bold)),
                )
                .center_y(44),
            )
            .padding([0, 16])
            .height(44)
            // Like `aria-disabled`: the button stays, but a second press while sending does nothing.
            .on_press(msg(FeedbackMsg::Submit))
            .style(move |_, status| button::Style {
                background: Some(
                    if matches!(status, button::Status::Hovered | button::Status::Pressed)
                        && !pending
                    {
                        p.hover
                    } else {
                        p.card_strong
                    }
                    .into(),
                ),
                text_color: if pending {
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
            }),
        );
        let card = column![
            column![
                text("Send feedback")
                    .size(13.1)
                    .font(sans(font::Weight::Medium)),
                text(lead).size(11.2).color(p.muted),
            ]
            .spacing(2)
            .padding(iced::Padding::ZERO.top(8).bottom(16)),
            container(body).padding(iced::Padding::ZERO.bottom(8)),
        ];
        crate::settings_ui::settings_card(p, container(card).padding([8, 12]))
    }
}
/// `FormMessage` (failure) and `.feedbackSent` (confirmation).
fn notice<'a>(p: Colors, error: bool, message: &'a str) -> Element<'a, Message> {
    container(
        text(message)
            .size(14)
            .color(if error { p.accent } else { p.ink }),
    )
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    fn run(actions: Vec<Action>) -> FormState {
        actions
            .into_iter()
            .fold(FormState::default(), |s, a| reduce(&s, a))
    }
    fn typed(message: &str) -> Vec<Action> {
        vec![Action::Edit(Field::Message, message.into())]
    }
    // The cases follow the website's tests/feedback.test.ts.
    #[test]
    fn errors_appear_only_after_a_send_attempt_then_follow_the_trimmed_text() {
        assert_eq!(visible_errors(&run(typed("hey"))), (None, None));
        let too_short = run([typed("  hey   "), vec![Action::Submit]].concat());
        assert_eq!(too_short.status, Status::Idle);
        assert_eq!(
            visible_errors(&too_short).0.as_deref(),
            Some("Write at least 5 characters.")
        );
        let fixed = reduce(
            &too_short,
            Action::Edit(Field::Message, "Hello there".into()),
        );
        assert_eq!(visible_errors(&fixed).0, None);
        let long_contact = run(vec![
            Action::Edit(Field::Message, "A fine message".into()),
            Action::Edit(Field::Contact, "c".repeat(CONTACT_MAX + 1)),
            Action::Submit,
        ]);
        assert_eq!(long_contact.status, Status::Idle);
        assert!(
            visible_errors(&long_contact)
                .1
                .unwrap()
                .contains("200 characters")
        );
        // Lengths are the browser's: "é" is one unit, an emoji two.
        assert_eq!(
            message_error("éééé"),
            Some("Write at least 5 characters.".into())
        );
        assert_eq!(message_error("😀😀😀"), None);
        assert!(message_error(&"x".repeat(MESSAGE_MAX + 1)).is_some());
    }
    #[test]
    fn while_sending_the_draft_cant_change_and_a_second_send_is_refused() {
        let pending = run([typed("Please add dark mode"), vec![Action::Submit]].concat());
        assert_eq!(pending.status, Status::Pending);
        assert_eq!(
            reduce(&pending, Action::Edit(Field::Message, "changed".into())),
            pending
        );
        assert_eq!(reduce(&pending, Action::Submit), pending);
    }
    #[test]
    fn a_failed_send_keeps_the_draft_and_a_success_clears_it_until_the_next_edit() {
        let failed = run(vec![
            Action::Edit(Field::Message, "Please add dark mode".into()),
            Action::Edit(Field::Contact, "me@example.com".into()),
            Action::Submit,
            Action::Failed,
        ]);
        assert_eq!(failed.status, Status::Failed);
        assert_eq!(
            failed.draft,
            Draft {
                message: "Please add dark mode".into(),
                contact: "me@example.com".into()
            }
        );
        assert_eq!(reduce(&failed, Action::Submit).status, Status::Pending);
        let sent = run([
            typed("Please add dark mode"),
            vec![Action::Submit, Action::Succeeded],
        ]
        .concat());
        assert_eq!(
            sent,
            FormState {
                status: Status::Sent,
                ..Default::default()
            }
        );
        assert_eq!(reduce(&sent, Action::Failed), sent);
        assert_eq!(
            reduce(&sent, Action::Edit(Field::Message, "A".into())).status,
            Status::Idle
        );
        assert_eq!(reduce(&sent, Action::Submit).status, Status::Idle);
    }
    #[test]
    fn only_a_site_path_is_kept_and_inputs_are_cut_to_their_maximum() {
        assert_eq!(
            clean_path("/browse/bookofmormon?x=1").as_deref(),
            Some("/browse/bookofmormon")
        );
        assert_eq!(clean_path("/account#feedback").as_deref(), Some("/account"));
        assert_eq!(clean_path("https://evil.example/path"), None);
        assert_eq!(clean_path("//evil.example/path"), None);
        assert_eq!(clean_path("?token=abc"), None);
        assert_eq!(
            clean_path(&format!("/{}", "a".repeat(500))).unwrap().len(),
            PATH_MAX
        );
        assert_eq!(clip("ab😀cd", 3), "ab");
        assert_eq!(clip("ab😀cd", 4), "ab😀");
        assert_eq!(
            arguments(
                &Draft {
                    message: " Hello there ".into(),
                    contact: "  ".into()
                },
                "/native/account?x"
            ),
            serde_json::json!({ "message": "Hello there", "path": "/native/account" })
        );
    }

    /// A one-request HTTP server on this computer: it records what arrives and gives `reply`.
    fn serve_once(status: &str, reply: &str) -> (String, std::thread::JoinHandle<String>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{reply}",
            reply.len()
        );
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = Vec::new();
            let mut buffer = [0u8; 4096];
            loop {
                let n = stream.read(&mut buffer).unwrap();
                request.extend_from_slice(&buffer[..n]);
                let text = String::from_utf8_lossy(&request).to_string();
                if let Some(head_end) = text.find("\r\n\r\n") {
                    let length = text[..head_end]
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    if request.len() >= head_end + 4 + length {
                        break;
                    }
                }
                if n == 0 {
                    break;
                }
            }
            stream.write_all(response.as_bytes()).unwrap();
            String::from_utf8_lossy(&request).to_string()
        });
        (url, handle)
    }
    #[test]
    fn feedback_is_sent_as_the_websites_mutation_and_only_signed_in_sends_a_token() {
        // Anonymous: the website's `submitFeedback` arguments, no Authorization header.
        let (url, server) = serve_once("200 OK", r#"{"status":"success","value":{"ok":true}}"#);
        let draft = Draft {
            message: "  The calendar is lovely  ".into(),
            contact: " me@example.com ".into(),
        };
        assert_eq!(submit(&url, None, arguments(&draft, PATH)), Ok(()));
        let request = server.join().unwrap();
        assert!(
            request.starts_with("POST /api/mutation HTTP/1.1\r\n"),
            "{request}"
        );
        assert!(!request.to_ascii_lowercase().contains("authorization:"));
        let body: serde_json::Value =
            serde_json::from_str(&request[request.find("\r\n\r\n").unwrap() + 4..]).unwrap();
        assert_eq!(
            body,
            serde_json::json!({
                "path": "feedback:submitFeedback",
                "args": { "message": "The calendar is lovely", "contact": "me@example.com", "path": "/native/account" },
                "format": "json"
            })
        );
        // Signed in, the account's Convex token goes with it.
        let (url, server) = serve_once("200 OK", r#"{"status":"success","value":{"ok":true}}"#);
        assert_eq!(submit(&url, Some("jwt-1"), arguments(&draft, PATH)), Ok(()));
        assert!(
            server
                .join()
                .unwrap()
                .to_ascii_lowercase()
                .contains("authorization: bearer jwt-1\r\n")
        );
        // A refused or failed request is a failure (the form keeps the draft).
        let (url, server) = serve_once(
            "200 OK",
            r#"{"status":"error","errorMessage":"Feedback message is too short"}"#,
        );
        assert_eq!(
            submit(&url, None, arguments(&draft, PATH)),
            Err("Feedback message is too short".into())
        );
        server.join().unwrap();
        let (url, server) = serve_once(
            "502 Bad Gateway",
            r#"{"error":"Feedback could not be saved"}"#,
        );
        assert!(submit(&url, None, arguments(&draft, PATH)).is_err());
        server.join().unwrap();
    }
}
