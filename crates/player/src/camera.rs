use galeng_schema::Camera;

use crate::fb::{HEIGHT, WIDTH};

pub const MIN_ZOOM: u32 = 50;
pub const MAX_ZOOM: u32 = 400;
pub const DEFAULT_ZOOM: u32 = 100;

pub fn effective_zoom(zoom: u32) -> u32 {
    zoom.clamp(MIN_ZOOM, MAX_ZOOM)
}

/// Map a dest rect through `cam` (scale about screen center, then pan).
pub fn map_rect(cam: &Camera, x: i32, y: i32, w: i32, h: i32) -> (i32, i32, i32, i32) {
    if cam.is_identity() {
        return (x, y, w, h);
    }
    let z = effective_zoom(cam.zoom) as f32 / 100.0;
    let cx = WIDTH as f32 / 2.0;
    let cy = HEIGHT as f32 / 2.0;
    let nx = cx + (x as f32 - cx) * z + cam.x as f32;
    let ny = cy + (y as f32 - cy) * z + cam.y as f32;
    let nw = w as f32 * z;
    let nh = h as f32 * z;
    (
        nx.round() as i32,
        ny.round() as i32,
        nw.round() as i32,
        nh.round() as i32,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_keeps_rect() {
        let cam = Camera::default();
        assert_eq!(map_rect(&cam, 0, 0, 1920, 1080), (0, 0, 1920, 1080));
        assert_eq!(map_rect(&cam, 700, 160, 520, 920), (700, 160, 520, 920));
    }

    #[test]
    fn zoom_two_grows_from_center() {
        let cam = Camera {
            x: 0,
            y: 0,
            zoom: 200,
        };
        assert_eq!(map_rect(&cam, 0, 0, 1920, 1080), (-960, -540, 3840, 2160));
    }

    #[test]
    fn pan_shifts_after_zoom() {
        let cam = Camera {
            x: 80,
            y: -40,
            zoom: 100,
        };
        assert_eq!(map_rect(&cam, 0, 0, 1920, 1080), (80, -40, 1920, 1080));
    }
}
