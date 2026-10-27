use galeng_schema::{Hotspot, HotspotShape, Pred, Scene};

use crate::engine::WorldState;

/// Topmost (last in vec) visible+enabled hotspot containing (x, y).
/// Rects are half-open. Polygons use the editor's even-odd ray cast.
pub fn hit_test<'a>(scene: &'a Scene, world: &WorldState, x: i32, y: i32) -> Option<&'a str> {
    for hs in scene.hotspots.iter().rev() {
        if !is_visible(scene, hs, world) {
            continue;
        }
        if !is_enabled(scene, hs, world) {
            continue;
        }
        if point_in_hotspot(hs, x, y) {
            return Some(hs.id.as_str());
        }
    }
    None
}

pub fn point_in_hotspot(hs: &Hotspot, x: i32, y: i32) -> bool {
    match &hs.shape {
        HotspotShape::Rect { x: hx, y: hy, w, h } => {
            let w = *w;
            let h = *h;
            if w <= 0 || h <= 0 {
                return false;
            }
            x >= *hx && y >= *hy && x < *hx + w && y < *hy + h
        }
        HotspotShape::Polygon { points } => point_in_polygon(x, y, points),
    }
}

/// Even-odd ray cast, matching `pointInPolygon` in the editor.
/// Horizontal edges miss the strict `yi > y` test, same as that function.
fn point_in_polygon(x: i32, y: i32, points: &[[i32; 2]]) -> bool {
    if points.len() < 3 {
        return false;
    }
    let mut inside = false;
    let mut j = points.len() - 1;
    let py = i64::from(y);
    let px = i64::from(x);
    for i in 0..points.len() {
        let xi = i64::from(points[i][0]);
        let yi = i64::from(points[i][1]);
        let xj = i64::from(points[j][0]);
        let yj = i64::from(points[j][1]);
        if (yi > py) != (yj > py) {
            let dy = yj - yi;
            let left = (px - xi) * dy;
            let right = (xj - xi) * (py - yi);
            let cross = if dy > 0 { left < right } else { left > right };
            if cross {
                inside = !inside;
            }
        }
        j = i;
    }
    inside
}

pub fn is_visible(scene: &Scene, hs: &Hotspot, world: &WorldState) -> bool {
    if let Some(v) = world.hotspot_visible.get(&(scene.id.clone(), hs.id.clone())) {
        return *v;
    }
    match &hs.visible_if {
        None | Some(None) => true,
        Some(Some(preds)) => preds_hold(preds, world),
    }
}

pub fn is_enabled(scene: &Scene, hs: &Hotspot, world: &WorldState) -> bool {
    if let Some(v) = world.hotspot_enabled.get(&(scene.id.clone(), hs.id.clone())) {
        return *v;
    }
    match &hs.enabled_if {
        None | Some(None) => true,
        Some(Some(preds)) => preds_hold(preds, world),
    }
}

pub fn preds_hold(preds: &[Pred], world: &WorldState) -> bool {
    preds.iter().all(|p| pred_holds(p, world))
}

pub fn pred_holds(pred: &Pred, world: &WorldState) -> bool {
    match pred {
        Pred::Switch(s) => world.switches.get(&s.switch).copied().unwrap_or(false) == s.is,
        Pred::Var(v) => world.vars.get(&v.var).copied().unwrap_or(0) == v.eq,
        Pred::HasItem(h) => world.inventory.contains(&h.has_item),
    }
}

#[cfg(test)]
mod tests {
    use super::point_in_polygon;

    #[test]
    fn raycast_matches_editor_rules() {
        let quad = [[100, 80], [400, 80], [400, 300], [100, 260]];
        assert!(point_in_polygon(200, 150, &quad));
        assert!(!point_in_polygon(0, 0, &quad));
        assert!(!point_in_polygon(150, 280, &quad));
        assert!(!point_in_polygon(10, 10, &[[0, 0], [10, 0]]));

        let right = [[0, 0], [100, 0], [100, 100]];
        assert!(point_in_polygon(90, 10, &right));
        assert!(!point_in_polygon(10, 90, &right));
    }
}
