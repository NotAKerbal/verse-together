// The browser's `<input type="date">` as the website's forms show it here: the date as en-US writes it
// ("10/28/2026"), typed, or chosen from a calendar that opens below the field (its button, or Alt+Down / F4 in the
// field; then arrows, Page Up/Down for months, Enter, Escape). The plan builder's start and finish dates and the
// journal's Day and Read on fields share it.
use crate::design::{self, Colors, sans, serif};
use crate::{App, Message};
use chrono::{Datelike, NaiveDate};
use iced::widget::{button, column, container, row, space, text};
use iced::{Alignment::Center, Border, Color, Element, Length, Padding, font};

/// The month a calendar shows and the day the keyboard is on.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Calendar {
    pub month: NaiveDate,
    pub focus: NaiveDate,
}
impl Calendar {
    /// Opens on a day (the field's date, else today or the field's minimum).
    pub fn on(day: NaiveDate) -> Self {
        Self {
            month: first_of_month(day),
            focus: day,
        }
    }
    /// Page Up/Down and the arrows by the month: the keyboard's day moves with the month, kept within it.
    pub fn shift_month(&mut self, by: i32) {
        self.month = shift_months(self.month, by);
        let day = self.focus.day();
        let last = (28..=31)
            .rev()
            .find(|n| self.month.with_day(*n).is_some())
            .unwrap_or(28);
        self.focus = self.month.with_day(day.min(last)).unwrap_or(self.month);
    }
    /// The arrow keys: the keyboard's day moves by days or weeks, and the month follows it.
    pub fn step(&mut self, days: i64) {
        self.focus += chrono::Duration::days(days);
        self.month = first_of_month(self.focus);
    }
}

/// A date key as the browser's date input shows it (en-US: "10/28/2026").
pub fn date_display(key: &str) -> String {
    NaiveDate::parse_from_str(key, "%Y-%m-%d")
        .map(|d| d.format("%m/%d/%Y").to_string())
        .unwrap_or_default()
}
/// A typed date: month/day/year with a four-digit year ("10/28/2026"), or the stored "2026-10-28". Anything else,
/// such as February 30th or a two-digit year, is no date, as the browser's date input has no value then.
pub fn parse_typed_date(text: &str) -> Option<String> {
    let t = text.trim();
    let date = NaiveDate::parse_from_str(t, "%Y-%m-%d").ok().or_else(|| {
        let parts: Vec<&str> = t.split(['/', '-', '.']).collect();
        if parts.len() != 3 || parts[2].len() != 4 {
            return None;
        }
        let (m, d, y) = (
            parts[0].parse().ok()?,
            parts[1].parse().ok()?,
            parts[2].parse().ok()?,
        );
        NaiveDate::from_ymd_opt(y, m, d)
    })?;
    // The browser date input takes years 1–9999 (four digits shown).
    (1..=9999)
        .contains(&date.year())
        .then(|| date.format("%Y-%m-%d").to_string())
}
pub fn first_of_month(d: NaiveDate) -> NaiveDate {
    NaiveDate::from_ymd_opt(d.year(), d.month(), 1).unwrap_or(d)
}
fn shift_months(d: NaiveDate, by: i32) -> NaiveDate {
    let months = d.year() * 12 + d.month0() as i32 + by;
    NaiveDate::from_ymd_opt(months.div_euclid(12), months.rem_euclid(12) as u32 + 1, 1).unwrap_or(d)
}

/// The keys an open calendar takes from its field: arrows by days and weeks, Page Up/Down by months, Enter to choose.
pub fn calendar_keys(
    step: impl Fn(i64) -> Message,
    month: impl Fn(i32) -> Message,
    enter: Message,
) -> impl Fn(&iced::keyboard::Key, iced::keyboard::Modifiers) -> Option<Message> {
    use iced::keyboard::{Key, key::Named};
    move |key, _| match key {
        Key::Named(Named::ArrowLeft) => Some(step(-1)),
        Key::Named(Named::ArrowRight) => Some(step(1)),
        Key::Named(Named::ArrowUp) => Some(step(-7)),
        Key::Named(Named::ArrowDown) => Some(step(7)),
        Key::Named(Named::PageUp) => Some(month(-1)),
        Key::Named(Named::PageDown) => Some(month(1)),
        Key::Named(Named::Enter) => Some(enter.clone()),
        _ => None,
    }
}

/// The date input's calendar button, inside the field's right edge (as the browser draws it).
pub fn with_toggle<'a>(
    p: Colors,
    input: impl Into<Element<'a, Message>>,
    open: bool,
    toggle: Message,
    width: Length,
) -> Element<'a, Message> {
    let toggle = button(
        container(design::icon(&crate::icons::CALENDAR_DAYS, p.ink, 14.0))
            .center_x(30)
            .center_y(30),
    )
    .padding(0)
    .on_press(toggle)
    .style(move |_, status| button::Style {
        background: (open || matches!(status, button::Status::Hovered)).then(|| p.hover.into()),
        border: Border {
            radius: 6.0.into(),
            ..Default::default()
        },
        ..Default::default()
    });
    iced::widget::stack![
        input.into(),
        container(toggle)
            .width(width)
            .align_right(width)
            .padding(Padding::ZERO.right(4))
            .center_y(Length::Fill),
    ]
    .width(width)
    .into()
}

impl App {
    /// The date input's calendar: the month, Sunday-first weeks (en-US), today ringed, the chosen day filled, the
    /// keyboard's day outlined; Clear (unless the field is required) and Today beneath. Days before `min` can't be
    /// chosen.
    pub(crate) fn date_calendar<'a>(
        &self,
        cal: &Calendar,
        chosen: Option<NaiveDate>,
        min: Option<NaiveDate>,
        clear: bool,
        pick: impl Fn(Option<String>) -> Message,
        month: impl Fn(i32) -> Message,
    ) -> Element<'a, Message> {
        let p = self.p();
        let today = crate::plan_model::today();
        let arrow = |glyph: &'static crate::icons::Icon, by: i32, label: &str| {
            self.hint(
                button(
                    container(design::icon(glyph, p.ink, 12.0))
                        .center_x(30)
                        .center_y(30),
                )
                .padding(0)
                .on_press(month(by))
                .style(design::circle(p)),
                label.to_string(),
            )
        };
        let head = row![
            text(cal.month.format("%B %Y").to_string())
                .font(serif())
                .size(17)
                .width(Length::Fill),
            arrow(&crate::icons::CHEVRON_LEFT, -1, "Previous month"),
            arrow(&crate::icons::CHEVRON_RIGHT, 1, "Next month"),
        ]
        .spacing(4)
        .align_y(Center);
        let mut weekdays = row![].spacing(2);
        for w in ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] {
            weekdays = weekdays.push(
                text(w)
                    .size(11)
                    .font(sans(font::Weight::Semibold))
                    .color(p.faint)
                    .center()
                    .width(36),
            );
        }
        let lead = cal.month.weekday().num_days_from_sunday() as i64;
        let start = cal.month - chrono::Duration::days(lead);
        let mut weeks = column![].spacing(2);
        for w in 0..6 {
            let mut line = row![].spacing(2);
            for i in 0..7 {
                let day = start + chrono::Duration::days(w * 7 + i);
                let in_month = day.month() == cal.month.month();
                let disabled = min.is_some_and(|m| day < m);
                let is_chosen = chosen == Some(day);
                let is_today = today == day;
                let is_focus = day == cal.focus;
                let color = if is_chosen {
                    p.paper
                } else if disabled {
                    Color { a: 0.3, ..p.ink }
                } else if in_month {
                    p.ink
                } else {
                    p.faint
                };
                let cell = button(
                    text(day.day().to_string())
                        .size(13)
                        .font(sans(if is_today {
                            font::Weight::Bold
                        } else {
                            font::Weight::Normal
                        }))
                        .color(color)
                        .center()
                        .width(Length::Fill),
                )
                .padding([7, 0])
                .width(36)
                .on_press_maybe((!disabled).then(|| pick(Some(day.format("%Y-%m-%d").to_string()))))
                .style(move |_, status| button::Style {
                    background: if is_chosen {
                        Some(p.accent.into())
                    } else if matches!(status, button::Status::Hovered) && !disabled {
                        Some(p.hover.into())
                    } else {
                        None
                    },
                    text_color: color,
                    border: Border {
                        color: if is_focus {
                            p.ink
                        } else if is_today {
                            p.accent
                        } else {
                            Color::TRANSPARENT
                        },
                        width: if is_focus || is_today { 1.5 } else { 0.0 },
                        radius: 8.0.into(),
                    },
                    ..Default::default()
                });
                line = line.push(cell);
            }
            weeks = weeks.push(line);
        }
        let mut foot = row![].align_y(Center);
        if clear {
            foot = foot.push(
                button(text("Clear").size(12.5).font(sans(font::Weight::Semibold)))
                    .padding([6, 10])
                    .on_press(pick(None))
                    .style(design::quiet(p)),
            );
        }
        foot = foot.push(space::horizontal()).push(
            button(text("Today").size(12.5).font(sans(font::Weight::Semibold)))
                .padding([6, 10])
                .on_press_maybe(
                    min.is_none_or(|m| today >= m)
                        .then(|| pick(Some(today.format("%Y-%m-%d").to_string()))),
                )
                .style(design::quiet(p)),
        );
        // Seven 36px days with 2px between them.
        container(column![head, weekdays, weeks, foot].spacing(8).width(264))
            .padding(12)
            .style(design::popover(p))
            .into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn day(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }
    #[test]
    fn the_calendar_moves_by_days_weeks_and_months_like_the_browsers() {
        let mut cal = Calendar::on(day("2026-01-31"));
        assert_eq!(cal.month, day("2026-01-01"));
        // February has no 31st: the keyboard's day stays within the month.
        cal.shift_month(1);
        assert_eq!(
            (cal.month, cal.focus),
            (day("2026-02-01"), day("2026-02-28"))
        );
        cal.shift_month(-2);
        assert_eq!(
            (cal.month, cal.focus),
            (day("2025-12-01"), day("2025-12-28"))
        );
        cal.step(7);
        assert_eq!(
            (cal.month, cal.focus),
            (day("2026-01-01"), day("2026-01-04"))
        );
        cal.step(-4);
        assert_eq!(
            (cal.month, cal.focus),
            (day("2025-12-01"), day("2025-12-31"))
        );
    }
    #[test]
    fn only_whole_real_dates_are_dates() {
        assert_eq!(
            parse_typed_date("10/28/2026").as_deref(),
            Some("2026-10-28")
        );
        assert_eq!(
            parse_typed_date(" 1/2/2026 ").as_deref(),
            Some("2026-01-02")
        );
        assert_eq!(
            parse_typed_date("2026-10-28").as_deref(),
            Some("2026-10-28")
        );
        for bad in [
            "",
            "10/28",
            "10/28/26",
            "02/30/2027",
            "13/01/2026",
            "10/28/0000",
            "soon",
        ] {
            assert_eq!(parse_typed_date(bad), None, "{bad}");
        }
        assert_eq!(date_display("2026-10-28"), "10/28/2026");
        assert_eq!(date_display("nope"), "");
    }
}
