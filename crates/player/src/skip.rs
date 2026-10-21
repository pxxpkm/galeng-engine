use std::time::{Duration, Instant};

use crate::vm::Phase;

pub const SKIP_INTERVAL_MS: u64 = 80;

pub struct SkipClock {
    last: Option<Instant>,
    interval: Duration,
}

impl SkipClock {
    pub fn new() -> Self {
        Self {
            last: None,
            interval: Duration::from_millis(SKIP_INTERVAL_MS),
        }
    }

    /// When `held` becomes true, fire once immediately, then on each interval.
    /// Releasing clears the clock so the next hold starts fresh.
    /// Shift `last` forward by `d` so a held Ctrl interval survives focus pause.
    pub fn shift(&mut self, d: Duration) {
        if let Some(t) = self.last.as_mut() {
            *t += d;
        }
    }

    pub fn pulse(&mut self, held: bool, now: Instant) -> bool {
        if !held {
            self.last = None;
            return false;
        }
        match self.last {
            None => {
                self.last = Some(now);
                true
            }
            Some(prev) if now.duration_since(prev) >= self.interval => {
                self.last = Some(now);
                true
            }
            Some(_) => false,
        }
    }
}

pub fn skip_advances(phase: Phase) -> bool {
    matches!(phase, Phase::Dialogue)
}

/// Ctrl may advance: already read, unread allowed, or an fx / movie hold.
pub fn ctrl_skips(phase: Phase, skip_unread: bool, is_read: bool, fx_hold: bool) -> bool {
    skip_advances(phase) && (skip_unread || is_read || fx_hold)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hold_pulses_then_releases() {
        let mut clock = SkipClock::new();
        let t0 = Instant::now();
        assert!(clock.pulse(true, t0));
        assert!(!clock.pulse(true, t0 + Duration::from_millis(40)));
        assert!(clock.pulse(true, t0 + Duration::from_millis(80)));
        assert!(!clock.pulse(false, t0 + Duration::from_millis(81)));
        assert!(clock.pulse(true, t0 + Duration::from_millis(82)));
    }

    #[test]
    fn only_dialogue_advances() {
        assert!(skip_advances(Phase::Dialogue));
        assert!(!skip_advances(Phase::Choices));
        assert!(!skip_advances(Phase::Ended));
        assert!(!skip_advances(Phase::MissingScene("x".into())));
        assert!(!skip_advances(Phase::Explore));
    }

    #[test]
    fn ctrl_blocks_unread_unless_allowed() {
        assert!(!ctrl_skips(Phase::Dialogue, false, false, false));
        assert!(ctrl_skips(Phase::Dialogue, false, true, false));
        assert!(ctrl_skips(Phase::Dialogue, true, false, false));
        assert!(ctrl_skips(Phase::Dialogue, false, false, true));
        assert!(
            ctrl_skips(Phase::Dialogue, false, false, true),
            "movie / fx hold skips unread"
        );
        assert!(!ctrl_skips(Phase::Choices, true, true, true));
    }

    #[test]
    fn shift_keeps_last_so_resume_does_not_instant_skip() {
        let mut clock = SkipClock::new();
        let t0 = Instant::now();
        assert!(clock.pulse(true, t0));
        clock.shift(Duration::from_secs(5));
        // Without keeping last, a fresh hold would fire immediately. Shift must
        // move last forward so resume mid-interval does not skip.
        let resumed = t0 + Duration::from_secs(5) + Duration::from_millis(40);
        assert!(
            !clock.pulse(true, resumed),
            "held Ctrl must not fire immediately after resume"
        );
        assert!(clock.pulse(
            true,
            t0 + Duration::from_secs(5) + Duration::from_millis(80)
        ));
    }
}
