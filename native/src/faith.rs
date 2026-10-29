// Two of the website's device preferences, as its own rules: the faith tradition (`src/lib/faithTradition.ts`,
// `useFaithTradition`), which hides Latter-day Saint content for other denominations without touching any study
// data, and the default Bible (`src/lib/defaultBible.ts`), the main text of Bible chapters.
use crate::store::volume_from_url_slug;

/// `FAITH_TRADITIONS`: stable ids and their labels, in the website's order.
pub const FAITH_TRADITIONS: [(&str, &str); 2] = [
    (
        LATTER_DAY_SAINT,
        "Church of Jesus Christ of Latter-day Saints",
    ),
    (OTHER, "Other denominations"),
];
pub const LATTER_DAY_SAINT: &str = "latter-day-saint";
pub const OTHER: &str = "other";

/// `normalizeFaithTradition`: a known id, else the Latter-day Saint default (existing content stays).
pub fn normalize_faith_tradition(value: &str) -> &'static str {
    FAITH_TRADITIONS
        .iter()
        .find(|(id, _)| *id == value)
        .map(|(id, _)| *id)
        .unwrap_or(LATTER_DAY_SAINT)
}

/// `isLdsVolume`, canonical URL aliases included ("dnc").
pub fn is_lds_volume(volume: &str) -> bool {
    matches!(
        volume_from_url_slug(volume),
        "bookofmormon" | "doctrineandcovenants" | "pearl"
    )
}

/// `isLdsContentPath`: the pages other denominations don't see, so a direct link can't bypass the choice.
pub fn is_lds_content_path(href: &str) -> bool {
    let path = href.split(['?', '#']).next().unwrap_or("");
    let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
    let first = parts.first().copied().unwrap_or("");
    matches!(first, "come-follow-me" | "feed" | "talk" | "resources")
        || (matches!(first, "browse" | "share")
            && is_lds_volume(parts.get(1).copied().unwrap_or("")))
}

/// The bundled Bible (`LDS_BIBLE_ID`).
pub const LDS_BIBLE_ID: &str = "lds";

/// `normalizeDefaultBible`: provider ids keep their case, the built-in ids are canonical, and anything malformed is
/// the bundled Bible.
pub fn normalize_default_bible(value: &str) -> String {
    let id = value.trim();
    let valid = (1..=120).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    if !valid {
        return LDS_BIBLE_ID.into();
    }
    let lower = id.to_ascii_lowercase();
    if lower == "lds" || lower == "kjv" {
        lower
    } else {
        id.to_string()
    }
}

/// The bundled Bible's name (`baseBibleLabel`): the LDS edition is named only where Latter-day Saint content shows.
pub fn base_bible_label(show_lds: bool) -> &'static str {
    if show_lds {
        "King James Bible (LDS edition)"
    } else {
        "King James Bible"
    }
}

/// `defaultBibleNotice` (with the reader's wording for other denominations): `None` when the chapter shows the Bible
/// asked for, else what was shown instead. `actual` is the translation the text came from (`None`: the bundled one).
pub fn default_bible_notice(
    requested: &str,
    actual: Option<&str>,
    show_lds: bool,
) -> Option<String> {
    let actual = actual.unwrap_or(LDS_BIBLE_ID);
    if requested.eq_ignore_ascii_case(actual) {
        return None;
    }
    let shown = if actual == LDS_BIBLE_ID {
        base_bible_label(show_lds).to_string()
    } else {
        actual.to_uppercase()
    };
    Some(format!(
        "Your default Bible couldn’t load this chapter. Showing {shown} instead."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    // The cases are the website's own (tests/faithTradition.test.ts, tests/defaultBible.test.ts).
    #[test]
    fn faith_tradition_keeps_existing_content_by_default() {
        assert_eq!(normalize_faith_tradition(""), LATTER_DAY_SAINT);
        assert_eq!(normalize_faith_tradition("unknown"), LATTER_DAY_SAINT);
        for (id, _) in FAITH_TRADITIONS {
            assert_eq!(normalize_faith_tradition(id), id);
        }
        assert_eq!(normalize_faith_tradition("other"), OTHER);
    }
    #[test]
    fn latter_day_saint_volumes_and_paths_are_recognized_like_the_website() {
        for v in ["bookofmormon", "doctrineandcovenants", "dnc", "pearl"] {
            assert!(is_lds_volume(v), "{v}");
        }
        for v in [
            "oldtestament",
            "old-testament",
            "newtestament",
            "new-testament",
        ] {
            assert!(!is_lds_volume(v), "{v}");
        }
        for path in [
            "/browse/bookofmormon",
            "/browse/dnc/doctrineandcovenants/4#v-3",
            "/browse/pearl/moses/1?compare=kjv",
            "/come-follow-me",
            "/come-follow-me/2026-10-26",
            "/feed",
            "/talk/123",
            "/share/bookofmormon/alma/32/1",
        ] {
            assert!(is_lds_content_path(path), "{path}");
        }
        for path in [
            "/browse",
            "/browse/newtestament/john/3",
            "/browse/old-testament/genesis/1",
            "/search?q=faith",
            "/account#reading",
            "/notes",
            "/plans/new",
            "/share/newtestament/john/3/16",
        ] {
            assert!(!is_lds_content_path(path), "{path}");
        }
    }
    #[test]
    fn default_bible_is_normalized_and_its_notice_names_the_text_shown() {
        for value in [
            "",
            " ",
            "../../secret",
            "eng_webu; path=/",
            &"a".repeat(121),
        ] {
            assert_eq!(normalize_default_bible(value), "lds", "{value:?}");
        }
        assert_eq!(normalize_default_bible(" KJV "), "kjv");
        assert_eq!(normalize_default_bible("LDS"), "lds");
        assert_eq!(normalize_default_bible(" BSB "), "BSB");
        assert_eq!(normalize_default_bible("eng_webu"), "eng_webu");
        assert_eq!(default_bible_notice("BSB", Some("bsb"), true), None);
        assert_eq!(default_bible_notice("lds", Some("lds"), true), None);
        assert_eq!(default_bible_notice("lds", None, true), None);
        assert!(
            default_bible_notice("eng_webu", None, true)
                .unwrap()
                .contains("King James Bible (LDS edition)")
        );
        assert!(
            default_bible_notice("BSB", Some("kjv"), true)
                .unwrap()
                .contains("KJV instead")
        );
        // Other denominations never see the LDS edition named (`ChapterReader`'s notice replacement).
        assert_eq!(
            default_bible_notice("BSB", None, false).unwrap(),
            "Your default Bible couldn’t load this chapter. Showing King James Bible instead."
        );
    }
}
