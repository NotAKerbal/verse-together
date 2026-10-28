// CSS-style transitions for the header. Values are pure functions of the clock, so a transition can be retargeted
// mid-flight (it continues from where it is) and the app only asks for frames while one is running.
use std::time::{Duration, Instant};

/// A CSS `cubic-bezier()` timing function.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CubicBezier {
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
}

/// The website's navigation curve: `cubic-bezier(0.22, 0.61, 0.36, 1)`.
pub const NAV_EASE: CubicBezier = CubicBezier::new(0.22, 0.61, 0.36, 1.0);
/// CSS `ease`.
pub const EASE: CubicBezier = CubicBezier::new(0.25, 0.1, 0.25, 1.0);
/// Width, position and rotation changes in the header (`280ms`).
pub const NAV: Duration = Duration::from_millis(280);
/// Opacity fades of navigation labels and content (`180ms ease`).
pub const FADE: Duration = Duration::from_millis(180);
/// Color changes on navigation controls (`120ms ease`).
pub const TINT: Duration = Duration::from_millis(120);

impl CubicBezier {
    pub const fn new(x1: f32, y1: f32, x2: f32, y2: f32) -> Self {
        Self { x1, y1, x2, y2 }
    }
    fn sample(a1: f32, a2: f32, t: f32) -> f32 {
        // B(t) for P0 = 0, P3 = 1.
        let u = 1.0 - t;
        3.0 * u * u * t * a1 + 3.0 * u * t * t * a2 + t * t * t
    }
    fn slope(a1: f32, a2: f32, t: f32) -> f32 {
        let u = 1.0 - t;
        3.0 * u * u * a1 + 6.0 * u * t * (a2 - a1) + 3.0 * t * t * (1.0 - a2)
    }
    /// The eased output for an input progress `x` in `0..=1`.
    pub fn y(&self, x: f32) -> f32 {
        if x <= 0.0 {
            return 0.0;
        }
        if x >= 1.0 {
            return 1.0;
        }
        // Newton's method, falling back to bisection where the curve is flat (as browsers do).
        let mut t = x;
        for _ in 0..8 {
            let error = Self::sample(self.x1, self.x2, t) - x;
            if error.abs() < 1e-6 {
                return Self::sample(self.y1, self.y2, t);
            }
            let d = Self::slope(self.x1, self.x2, t);
            if d.abs() < 1e-6 {
                break;
            }
            t -= error / d;
        }
        let (mut lo, mut hi) = (0.0f32, 1.0f32);
        t = x;
        for _ in 0..40 {
            let value = Self::sample(self.x1, self.x2, t);
            if (value - x).abs() < 1e-6 {
                break;
            }
            if value < x {
                lo = t;
            } else {
                hi = t;
            }
            t = (lo + hi) / 2.0;
        }
        Self::sample(self.y1, self.y2, t)
    }
}

/// One animated value, following the CSS Transitions model.
#[derive(Debug, Clone, Copy)]
pub struct Transition {
    from: f32,
    to: f32,
    start: Instant,
    duration: Duration,
    full: Duration,
    curve: CubicBezier,
    // CSS's "reversing-adjusted start value" and "reversing shortening factor": reversing a transition part way
    // through takes only as long as it has run, rather than the full duration.
    reversing_from: f32,
    shortening: f32,
}

impl Transition {
    pub fn new(value: f32, duration: Duration, curve: CubicBezier, now: Instant) -> Self {
        Self {
            from: value,
            to: value,
            start: now,
            duration: Duration::ZERO,
            full: duration,
            curve,
            reversing_from: value,
            shortening: 1.0,
        }
    }
    fn input_progress(&self, now: Instant) -> f32 {
        if self.duration.is_zero() {
            return 1.0;
        }
        let elapsed = now.saturating_duration_since(self.start);
        (elapsed.as_secs_f32() / self.duration.as_secs_f32()).clamp(0.0, 1.0)
    }
    /// Eased progress of the current transition, 0 at its start and 1 once settled.
    fn output_progress(&self, now: Instant) -> f32 {
        self.curve.y(self.input_progress(now))
    }
    pub fn value(&self, now: Instant) -> f32 {
        let p = self.output_progress(now);
        self.from + (self.to - self.from) * p
    }
    pub fn is_animating(&self, now: Instant) -> bool {
        self.input_progress(now) < 1.0
    }
    /// Starts a transition to `to` from the current value. With `animate` false (reduced motion) it jumps there.
    pub fn set(&mut self, to: f32, now: Instant, animate: bool) {
        if !animate || self.full.is_zero() {
            *self = Self::new(to, self.full, self.curve, now);
            return;
        }
        if to == self.to {
            return;
        }
        let current = self.value(now);
        if self.is_animating(now) && to == self.reversing_from {
            let factor = (self.output_progress(now) * self.shortening + 1.0 - self.shortening)
                .abs()
                .clamp(0.0, 1.0);
            self.reversing_from = self.to;
            self.shortening = factor;
            self.duration = self.full.mul_f32(factor);
        } else {
            self.reversing_from = current;
            self.shortening = 1.0;
            self.duration = self.full;
        }
        self.from = current;
        self.to = to;
        self.start = now;
        if current == to {
            self.duration = Duration::ZERO;
        }
    }
}

/// The platform's reduced-motion setting, where one exists (GNOME's "Animations" switch).
pub fn reduced_motion() -> bool {
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("gsettings")
            .args(["get", "org.gnome.desktop.interface", "enable-animations"])
            .stderr(std::process::Stdio::null())
            .output()
            .ok()
            .filter(|o| o.status.success())
            .is_some_and(|o| String::from_utf8_lossy(&o.stdout).trim() == "false")
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }
    #[test]
    fn bezier_matches_endpoints_and_browser_samples() {
        assert_eq!(NAV_EASE.y(0.0), 0.0);
        assert_eq!(NAV_EASE.y(1.0), 1.0);
        // The nav curve is an ease-out: well past linear early on, and monotonic.
        assert!(NAV_EASE.y(0.3) > 0.55);
        let mut last = 0.0;
        for i in 1..=100 {
            let y = NAV_EASE.y(i as f32 / 100.0);
            assert!(y >= last - 1e-5, "curve must not go backwards");
            last = y;
        }
        // CSS `ease` at 50% is 0.8024 in browsers.
        assert!((EASE.y(0.5) - 0.8024).abs() < 0.002);
    }
    #[test]
    fn collapse_follows_the_websites_measured_width_curve() {
        // The live site's nav pill collapsed from 430.25px to 173.25px. Sampled from the click it was 312.99px at
        // 84ms, 222.70px at 156ms and 174.27px at 297ms; the browser starts the transition about two frames
        // (~35ms) after the click. The same transition here, started then, lands within a few pixels.
        let click = Instant::now();
        let start = click + ms(35);
        let mut width = Transition::new(430.25, NAV, NAV_EASE, start);
        width.set(173.25, start, true);
        for (at, sampled) in [(84, 312.99), (156, 222.70), (297, 174.27)] {
            let value = width.value(click + ms(at));
            assert!(
                (value - sampled).abs() < 6.0,
                "{value} vs {sampled} at {at}ms"
            );
        }
        assert!(width.is_animating(start + ms(279)));
        assert_eq!(width.value(start + ms(280)), 173.25);
        assert!(!width.is_animating(start + ms(280)));
    }
    #[test]
    fn retargeting_continues_from_the_current_value() {
        let t0 = Instant::now();
        let mut x = Transition::new(0.0, NAV, NAV_EASE, t0);
        x.set(84.0, t0, true);
        let mid = x.value(t0 + ms(100));
        x.set(42.0, t0 + ms(100), true);
        // No jump at the moment of retargeting, a full-length transition to the new target, then settled.
        assert!((x.value(t0 + ms(100)) - mid).abs() < 1e-4);
        assert!(x.is_animating(t0 + ms(379)));
        assert_eq!(x.value(t0 + ms(380)), 42.0);
        assert!(!x.is_animating(t0 + ms(380)));
    }
    #[test]
    fn reversing_part_way_takes_only_as_long_as_it_ran() {
        let t0 = Instant::now();
        let mut open = Transition::new(1.0, NAV, NAV_EASE, t0);
        open.set(0.0, t0, true);
        let at = t0 + ms(70);
        let value = open.value(at);
        open.set(1.0, at, true);
        assert!((open.value(at) - value).abs() < 1e-4);
        // The eased progress at 70ms is about 0.45, so the reversal settles after about 0.45 × 280ms.
        let shortened = NAV.mul_f32(NAV_EASE.y(0.25));
        assert!(!open.is_animating(at + shortened + ms(1)));
        assert!(open.is_animating(at + shortened - ms(5)));
        assert_eq!(open.value(at + shortened + ms(1)), 1.0);
    }
    #[test]
    fn reduced_motion_jumps_and_never_requests_frames() {
        let t0 = Instant::now();
        let mut fade = Transition::new(0.0, FADE, EASE, t0);
        fade.set(1.0, t0, false);
        assert_eq!(fade.value(t0), 1.0);
        assert!(!fade.is_animating(t0));
        // Setting the current target again is not a new transition.
        fade.set(1.0, t0, true);
        assert!(!fade.is_animating(t0));
    }
}
