pub const WIDTH: u32 = 1920;
pub const HEIGHT: u32 = 1080;
pub const FB_BYTES: usize = (WIDTH * HEIGHT * 4) as usize;

#[derive(Clone, Copy)]
pub struct Rgba {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
}

impl Rgba {
    pub const fn rgb(r: u8, g: u8, b: u8) -> Self {
        Self { r, g, b, a: 255 }
    }

    pub fn blend_over(self, under: Rgba) -> Rgba {
        if self.a == 255 {
            return self;
        }
        if self.a == 0 {
            return under;
        }
        let a = u32::from(self.a);
        let ia = 255 - a;
        Rgba {
            r: ((u32::from(self.r) * a + u32::from(under.r) * ia) / 255) as u8,
            g: ((u32::from(self.g) * a + u32::from(under.g) * ia) / 255) as u8,
            b: ((u32::from(self.b) * a + u32::from(under.b) * ia) / 255) as u8,
            a: 255,
        }
    }
}

pub struct Framebuffer {
    pub pixels: Vec<u8>,
}

impl Framebuffer {
    pub fn new() -> Self {
        Self {
            pixels: vec![0; FB_BYTES],
        }
    }

    pub fn fill(&mut self, color: Rgba) {
        for px in self.pixels.chunks_exact_mut(4) {
            px[0] = color.r;
            px[1] = color.g;
            px[2] = color.b;
            px[3] = color.a;
        }
    }

    pub fn fill_rect(&mut self, x: i32, y: i32, w: i32, h: i32, color: Rgba) {
        let x0 = x.max(0) as u32;
        let y0 = y.max(0) as u32;
        let x1 = (x + w).clamp(0, WIDTH as i32) as u32;
        let y1 = (y + h).clamp(0, HEIGHT as i32) as u32;
        if x0 >= x1 || y0 >= y1 {
            return;
        }
        if color.a == 0 {
            return;
        }
        if color.a == 255 {
            let pixel = [color.r, color.g, color.b, color.a];
            for yy in y0..y1 {
                let start = ((yy * WIDTH + x0) * 4) as usize;
                let end = ((yy * WIDTH + x1) * 4) as usize;
                for chunk in self.pixels[start..end].chunks_exact_mut(4) {
                    chunk.copy_from_slice(&pixel);
                }
            }
            return;
        }
        // Rect already clamped: inner loop skips put()'s bounds checks.
        for yy in y0..y1 {
            for xx in x0..x1 {
                let i = ((yy * WIDTH + xx) * 4) as usize;
                let under = Rgba {
                    r: self.pixels[i],
                    g: self.pixels[i + 1],
                    b: self.pixels[i + 2],
                    a: self.pixels[i + 3],
                };
                let out = color.blend_over(under);
                self.pixels[i] = out.r;
                self.pixels[i + 1] = out.g;
                self.pixels[i + 2] = out.b;
                self.pixels[i + 3] = out.a;
            }
        }
    }

    pub fn put(&mut self, x: u32, y: u32, color: Rgba) {
        if x >= WIDTH || y >= HEIGHT {
            return;
        }
        let i = ((y * WIDTH + x) * 4) as usize;
        let under = Rgba {
            r: self.pixels[i],
            g: self.pixels[i + 1],
            b: self.pixels[i + 2],
            a: self.pixels[i + 3],
        };
        let out = color.blend_over(under);
        self.pixels[i] = out.r;
        self.pixels[i + 1] = out.g;
        self.pixels[i + 2] = out.b;
        self.pixels[i + 3] = out.a;
    }

    /// Nearest-neighbour blit. When `opaque` is true, scale is 1:1, and the dest
    /// rect sits fully inside the frame, uses row `copy_from_slice` (no alpha scan).
    pub fn blit_nearest(
        &mut self,
        src_w: u32,
        src_h: u32,
        src: &[u8],
        dx: i32,
        dy: i32,
        dw: i32,
        dh: i32,
        opaque: bool,
    ) {
        if dw <= 0 || dh <= 0 || src_w == 0 || src_h == 0 {
            return;
        }
        if opaque
            && dw == src_w as i32
            && dh == src_h as i32
            && dx >= 0
            && dy >= 0
            && (dx + dw) <= WIDTH as i32
            && (dy + dh) <= HEIGHT as i32
        {
            let need = (src_w as usize)
                .checked_mul(src_h as usize)
                .and_then(|n| n.checked_mul(4))
                .unwrap_or(usize::MAX);
            if src.len() < need {
                return;
            }
            let row_bytes = (dw as usize) * 4;
            // Contiguous dest: full-width rows starting at x=0.
            if dx == 0 && dw == WIDTH as i32 {
                let dest_start = ((dy as u32) * WIDTH * 4) as usize;
                let nbytes = (dh as usize) * row_bytes;
                self.pixels[dest_start..dest_start + nbytes].copy_from_slice(&src[..nbytes]);
                return;
            }
            for y in 0..dh as u32 {
                let src_off = (y as usize) * row_bytes;
                let dest_off = (((dy as u32 + y) * WIDTH + dx as u32) * 4) as usize;
                self.pixels[dest_off..dest_off + row_bytes]
                    .copy_from_slice(&src[src_off..src_off + row_bytes]);
            }
            return;
        }
        for y in 0..dh {
            let dest_y = dy + y;
            if dest_y < 0 || dest_y >= HEIGHT as i32 {
                continue;
            }
            let sy = (y as u64 * u64::from(src_h) / dh as u64) as u32;
            for x in 0..dw {
                let dest_x = dx + x;
                if dest_x < 0 || dest_x >= WIDTH as i32 {
                    continue;
                }
                let sx = (x as u64 * u64::from(src_w) / dw as u64) as u32;
                let si = ((sy * src_w + sx) * 4) as usize;
                if si + 3 >= src.len() {
                    continue;
                }
                let a = src[si + 3];
                if a == 0 {
                    continue;
                }
                if a == 255 {
                    let di = ((dest_y as u32 * WIDTH + dest_x as u32) * 4) as usize;
                    self.pixels[di] = src[si];
                    self.pixels[di + 1] = src[si + 1];
                    self.pixels[di + 2] = src[si + 2];
                    self.pixels[di + 3] = 255;
                    continue;
                }
                self.put(
                    dest_x as u32,
                    dest_y as u32,
                    Rgba {
                        r: src[si],
                        g: src[si + 1],
                        b: src[si + 2],
                        a,
                    },
                );
            }
        }
    }

    pub fn count_nonblack_in(&self, x: u32, y: u32, w: u32, h: u32) -> usize {
        let mut n = 0;
        for yy in y..(y + h).min(HEIGHT) {
            for xx in x..(x + w).min(WIDTH) {
                let i = ((yy * WIDTH + xx) * 4) as usize;
                if self.pixels[i] > 16 || self.pixels[i + 1] > 16 || self.pixels[i + 2] > 16 {
                    n += 1;
                }
            }
        }
        n
    }
}

/// Same integer formula as historical `mix_rgba`, writing into a caller buffer.
pub fn mix_rgba_into(from: &[u8], to: &[u8], t: f32, out: &mut [u8]) {
    let t = t.clamp(0.0, 1.0);
    let w = (t * 255.0) as u32;
    let iw = 255 - w;
    let n = from.len().min(to.len()).min(out.len());
    for i in 0..n {
        out[i] = ((u32::from(from[i]) * iw + u32::from(to[i]) * w) / 255) as u8;
    }
}

/// Allocating wrapper kept for existing tests. Hot path must use `mix_rgba_into`.
pub fn mix_rgba(from: &[u8], to: &[u8], t: f32) -> Vec<u8> {
    let n = from.len().min(to.len());
    let mut out = vec![0u8; n];
    mix_rgba_into(from, to, t, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opaque_fill_rect_writes_without_blend() {
        let mut fb = Framebuffer::new();
        fb.fill(Rgba::rgb(10, 20, 30));
        fb.fill_rect(10, 10, 4, 2, Rgba::rgb(200, 0, 0));
        let i = ((10 * WIDTH + 10) * 4) as usize;
        assert_eq!(&fb.pixels[i..i + 4], &[200, 0, 0, 255]);
    }

    #[test]
    fn opaque_blit_matches_direct_rgb() {
        let mut via_blit = Framebuffer::new();
        let mut via_put = Framebuffer::new();
        via_blit.fill(Rgba::rgb(1, 2, 3));
        via_put.fill(Rgba::rgb(1, 2, 3));
        let src = [9u8, 8, 7, 255, 6, 5, 4, 255];
        via_blit.blit_nearest(2, 1, &src, 0, 0, 2, 1, true);
        via_put.put(0, 0, Rgba { r: 9, g: 8, b: 7, a: 255 });
        via_put.put(1, 0, Rgba { r: 6, g: 5, b: 4, a: 255 });
        assert_eq!(&via_blit.pixels[0..8], &via_put.pixels[0..8]);
        assert_eq!(&via_blit.pixels[0..4], &[9, 8, 7, 255]);
    }

    #[test]
    fn opaque_1to1_matches_per_pixel_path() {
        let mut via_fast = Framebuffer::new();
        let mut via_slow = Framebuffer::new();
        via_fast.fill(Rgba::rgb(1, 2, 3));
        via_slow.fill(Rgba::rgb(1, 2, 3));
        let mut src = vec![0u8; 4 * 3 * 4];
        for (i, chunk) in src.chunks_exact_mut(4).enumerate() {
            chunk[0] = (10 + i) as u8;
            chunk[1] = 20;
            chunk[2] = 30;
            chunk[3] = 255;
        }
        via_fast.blit_nearest(4, 3, &src, 5, 7, 4, 3, true);
        via_slow.blit_nearest(4, 3, &src, 5, 7, 4, 3, false);
        assert_eq!(via_fast.pixels, via_slow.pixels);
    }

    #[test]
    fn opaque_1to1_full_width_matches_per_pixel() {
        let mut via_fast = Framebuffer::new();
        let mut via_slow = Framebuffer::new();
        via_fast.fill(Rgba::rgb(9, 9, 9));
        via_slow.fill(Rgba::rgb(9, 9, 9));
        let mut src = vec![0u8; (WIDTH * 2 * 4) as usize];
        for (i, chunk) in src.chunks_exact_mut(4).enumerate() {
            chunk[0] = (i % 200) as u8;
            chunk[1] = 40;
            chunk[2] = 50;
            chunk[3] = 255;
        }
        via_fast.blit_nearest(WIDTH, 2, &src, 0, 10, WIDTH as i32, 2, true);
        via_slow.blit_nearest(WIDTH, 2, &src, 0, 10, WIDTH as i32, 2, false);
        assert_eq!(via_fast.pixels, via_slow.pixels);
    }

    #[test]
    fn clipped_opaque_matches_per_pixel_and_skips_row_path() {
        // Dest partially outside frame: opaque flag must not take the row-copy path
        // in a way that diverges; both paths must agree with the slow loop.
        let mut via_flag = Framebuffer::new();
        let mut via_slow = Framebuffer::new();
        via_flag.fill(Rgba::rgb(1, 1, 1));
        via_slow.fill(Rgba::rgb(1, 1, 1));
        let mut src = vec![0u8; 4 * 4 * 4];
        for chunk in src.chunks_exact_mut(4) {
            chunk.copy_from_slice(&[80, 90, 100, 255]);
        }
        // Overlaps left edge.
        via_flag.blit_nearest(4, 4, &src, -2, 0, 4, 4, true);
        via_slow.blit_nearest(4, 4, &src, -2, 0, 4, 4, false);
        assert_eq!(via_flag.pixels, via_slow.pixels);
    }

    #[test]
    fn non_opaque_never_overwrites_transparent_with_row_copy() {
        let mut fb = Framebuffer::new();
        fb.fill(Rgba::rgb(11, 22, 33));
        // One transparent pixel — opaque=false must keep under colour there.
        let src = [
            9u8, 8, 7, 255, 6, 5, 4, 0, // second pixel a=0
        ];
        fb.blit_nearest(2, 1, &src, 0, 0, 2, 1, false);
        assert_eq!(&fb.pixels[0..4], &[9, 8, 7, 255]);
        assert_eq!(&fb.pixels[4..8], &[11, 22, 33, 255]);
    }

    #[test]
    fn mix_rgba_into_matches_mix_rgba() {
        let from = [0u8, 0, 0, 255, 100, 50, 25, 255];
        let to = [200u8, 0, 0, 255, 0, 0, 0, 255];
        let alloc = mix_rgba(&from, &to, 0.5);
        let mut into = [0u8; 8];
        mix_rgba_into(&from, &to, 0.5, &mut into);
        assert_eq!(alloc.as_slice(), &into);
    }

    #[test]
    fn mix_rgba_into_fade_scratch_semantics() {
        // Fade.from stays the start frame; scratch receives the mix (not from).
        let from = vec![10u8; 16];
        let to = vec![210u8; 16];
        let from_before = from.clone();
        let mut scratch = vec![0u8; 16];
        mix_rgba_into(&from, &to, 0.25, &mut scratch);
        assert_eq!(from, from_before);
        let expected = mix_rgba(&from_before, &to, 0.25);
        assert_eq!(scratch, expected);
    }

    #[test]
    fn partial_alpha_fill_rect_matches_put() {
        let mut via_fill = Framebuffer::new();
        let mut via_put = Framebuffer::new();
        via_fill.fill(Rgba::rgb(100, 0, 0));
        via_put.fill(Rgba::rgb(100, 0, 0));
        let c = Rgba {
            r: 0,
            g: 200,
            b: 0,
            a: 128,
        };
        via_fill.fill_rect(3, 4, 5, 2, c);
        for yy in 4..6u32 {
            for xx in 3..8u32 {
                via_put.put(xx, yy, c);
            }
        }
        assert_eq!(via_fill.pixels, via_put.pixels);
    }
}

pub fn hash_rgb(key: &str) -> Rgba {
    let mut h: u32 = 2166136261;
    for b in key.as_bytes() {
        h ^= u32::from(*b);
        h = h.wrapping_mul(16777619);
    }
    Rgba::rgb(
        40 + (h as u8 % 180),
        40 + ((h >> 8) as u8 % 180),
        40 + ((h >> 16) as u8 % 180),
    )
}
