pub const SHAKE_DEFAULT_MS: u32 = 400;
pub const FLASH_DEFAULT_MS: u32 = 200;
const AMP: i32 = 6;

pub fn shake_offset(elapsed_ms: u32, duration_ms: u32) -> (i32, i32) {
    if duration_ms == 0 || elapsed_ms >= duration_ms {
        return (0, 0);
    }
    let step = (elapsed_ms / 40) % 4;
    match step {
        0 => (AMP, AMP / 2),
        1 => (-AMP, AMP / 2),
        2 => (AMP / 2, -AMP),
        _ => (-AMP / 2, -AMP / 2),
    }
}

/// 255 at start, 0 when elapsed >= duration.
pub fn flash_alpha(elapsed_ms: u32, duration_ms: u32) -> u8 {
    if duration_ms == 0 || elapsed_ms >= duration_ms {
        return 0;
    }
    let remain = u64::from(duration_ms - elapsed_ms);
    ((remain * 255) / u64::from(duration_ms)) as u8
}

pub fn flash_white(fb: &mut crate::fb::Framebuffer, alpha: u8) {
    if alpha == 0 {
        return;
    }
    use crate::fb::{Rgba, HEIGHT, WIDTH};
    fb.fill_rect(0, 0, WIDTH as i32, HEIGHT as i32, Rgba { r: 255, g: 255, b: 255, a: alpha });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offset_is_nonzero_during_and_zero_after() {
        let (x, y) = shake_offset(0, SHAKE_DEFAULT_MS);
        assert!(x != 0 || y != 0);
        assert_eq!(shake_offset(SHAKE_DEFAULT_MS, SHAKE_DEFAULT_MS), (0, 0));
        assert_eq!(shake_offset(10, 0), (0, 0));
    }

    #[test]
    fn flash_alpha_falls_to_zero() {
        assert_eq!(flash_alpha(0, FLASH_DEFAULT_MS), 255);
        assert_eq!(flash_alpha(FLASH_DEFAULT_MS, FLASH_DEFAULT_MS), 0);
        assert_eq!(flash_alpha(10, 0), 0);
        let mid = flash_alpha(100, 200);
        assert!(mid > 0 && mid < 255, "mid={mid}");
    }
}
