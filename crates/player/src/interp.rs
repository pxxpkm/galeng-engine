use std::collections::HashMap;

/// Replace `{ident}` in `text` with the current integer, or `0` if missing.
///
/// `ident` is `[A-Za-z_][A-Za-z0-9_]*`. Anything else, including `{expr}`,
/// stays as written. No escape, no string vars.
pub fn interpolate_text(text: &str, vars: &HashMap<String, i32>) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while !rest.is_empty() {
        let Some(open) = rest.find('{') else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..open]);
        rest = &rest[open..];
        match brace_ident(rest) {
            Some((name, eaten)) => {
                let value = vars.get(name).copied().unwrap_or(0);
                out.push_str(&value.to_string());
                rest = &rest[eaten..];
            }
            None => {
                out.push('{');
                rest = &rest[1..];
            }
        }
    }
    out
}

/// If `s` starts with `{ident}`, return `(ident, bytes_consumed)`.
fn brace_ident(s: &str) -> Option<(&str, usize)> {
    let inner = s.strip_prefix('{')?;
    let mut chars = inner.char_indices();
    let (_, first) = chars.next()?;
    if !is_ident_start(first) {
        return None;
    }
    let mut last = first.len_utf8();
    for (i, c) in chars {
        if c == '}' {
            if last == 0 {
                return None;
            }
            return Some((&inner[..last], 1 + last + 1));
        }
        if !is_ident_continue(c) {
            return None;
        }
        last = i + c.len_utf8();
    }
    None
}

fn is_ident_start(c: char) -> bool {
    c.is_ascii_alphabetic() || c == '_'
}

fn is_ident_continue(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars(pairs: &[(&str, i32)]) -> HashMap<String, i32> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_string(), *v))
            .collect()
    }

    #[test]
    fn replaces_known_and_missing() {
        let v = vars(&[("sora_affection", 3)]);
        assert_eq!(
            interpolate_text("好感 {sora_affection}", &v),
            "好感 3"
        );
        assert_eq!(interpolate_text("無 {gone}", &v), "無 0");
        assert_eq!(interpolate_text("{_x}{a1}", &vars(&[("_x", -2), ("a1", 0)])), "-20");
    }

    #[test]
    fn leaves_invalid_braces() {
        let v = vars(&[("sora_affection", 1)]);
        assert_eq!(
            interpolate_text("{sora_affection+1}", &v),
            "{sora_affection+1}"
        );
        assert_eq!(interpolate_text("{好感}", &v), "{好感}");
        assert_eq!(interpolate_text("{ sora }", &v), "{ sora }");
        assert_eq!(interpolate_text("{}", &v), "{}");
        assert_eq!(interpolate_text("{123}", &v), "{123}");
        assert_eq!(interpolate_text("殘{sora", &v), "殘{sora");
        assert_eq!(interpolate_text("plain", &v), "plain");
    }
}
