//! Shared condition and `set` evaluation for the dialogue and explore VMs.
//!
//! Every operator on a `Cmp` is AND. A text `set` that parses as `i32` is a delta.
//! Other text is ignored. `eq` / `ne` accept only integers that fit in `i32`.

use std::collections::{BTreeMap, HashMap};

use crate::{Cmp, Condition, ConditionPred, SetValue};

pub fn condition_holds(vars: &HashMap<String, i32>, cond: &Condition) -> bool {
    cond.iter()
        .all(|(name, pred)| pred_holds(vars.get(name).copied().unwrap_or(0), pred))
}

pub fn pred_holds(val: i32, pred: &ConditionPred) -> bool {
    match pred {
        ConditionPred::Bool(flag) => (val != 0) == *flag,
        ConditionPred::Int(n) => val == *n,
        ConditionPred::Text(_) => false,
        ConditionPred::Cmp(cmp) => cmp_holds(val, cmp),
    }
}

pub fn cmp_holds(val: i32, cmp: &Cmp) -> bool {
    if cmp.gte.is_some_and(|n| val < n) {
        return false;
    }
    if cmp.lte.is_some_and(|n| val > n) {
        return false;
    }
    if cmp.gt.is_some_and(|n| val <= n) {
        return false;
    }
    if cmp.lt.is_some_and(|n| val >= n) {
        return false;
    }
    if let Some(eq) = &cmp.eq {
        if !json_eq_i32(val, eq) {
            return false;
        }
    }
    if let Some(ne) = &cmp.ne {
        if json_eq_i32(val, ne) {
            return false;
        }
    }
    true
}

fn json_eq_i32(val: i32, value: &serde_json::Value) -> bool {
    value
        .as_i64()
        .and_then(|n| i32::try_from(n).ok())
        .is_some_and(|n| n == val)
}

pub fn apply_set(vars: &mut HashMap<String, i32>, set: &BTreeMap<String, SetValue>) {
    for (key, value) in set {
        match value {
            SetValue::Int(n) => {
                vars.insert(key.clone(), *n);
            }
            SetValue::Bool(b) => {
                vars.insert(key.clone(), i32::from(*b));
            }
            SetValue::Text(text) => {
                if let Ok(delta) = text.parse::<i32>() {
                    *vars.entry(key.clone()).or_insert(0) += delta;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn cond(value: serde_json::Value) -> Condition {
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn compound_eq_and_gt_are_both_required() {
        let low = HashMap::from([("score".into(), 1)]);
        let pred = cond(json!({ "score": { "eq": 1, "gt": 10 } }));
        assert!(!condition_holds(&low, &pred));

        let high = HashMap::from([("score".into(), 12)]);
        let pred = cond(json!({ "score": { "eq": 12, "gt": 10 } }));
        assert!(condition_holds(&high, &pred));
    }

    #[test]
    fn range_and_eq_together() {
        let vars = HashMap::from([("score".into(), 5)]);
        let pred = cond(json!({ "score": { "gte": 1, "lte": 10, "eq": 5 } }));
        assert!(condition_holds(&vars, &pred));
        let vars = HashMap::from([("score".into(), 1)]);
        assert!(!condition_holds(&vars, &pred));
    }

    #[test]
    fn cmp_eq_bool_is_not_a_nonzero_test() {
        let vars = HashMap::from([("score".into(), 1)]);
        let pred = cond(json!({ "score": { "eq": true } }));
        assert!(!condition_holds(&vars, &pred));
        let flag = cond(json!({ "score": true }));
        assert!(condition_holds(&vars, &flag));
    }

    #[test]
    fn empty_condition_holds() {
        assert!(condition_holds(&HashMap::new(), &Condition::new()));
    }

    #[test]
    fn text_set_is_a_delta_and_other_text_is_ignored() {
        let set: BTreeMap<String, SetValue> =
            serde_json::from_value(json!({"score": "+2", "flag": true, "name": "sora"})).unwrap();
        let mut vars = HashMap::new();
        apply_set(&mut vars, &set);
        assert_eq!(vars.get("score"), Some(&2));
        assert_eq!(vars.get("flag"), Some(&1));
        assert!(vars.get("name").is_none());
        let again: BTreeMap<String, SetValue> =
            serde_json::from_value(json!({"score": "-1"})).unwrap();
        apply_set(&mut vars, &again);
        assert_eq!(vars.get("score"), Some(&1));
    }
}
