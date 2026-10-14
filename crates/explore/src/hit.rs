use galeng_schema::{Hotspot, HotspotShape, Pred, Scene};

use crate::engine::WorldState;

/// Topmost (last in vec) visible+enabled rect containing (x,y). Polygon never hits.
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
        HotspotShape::Polygon { .. } => false,
    }
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
