// Finding a Bible to add, as the website's catalog picker finds one (src/lib/translationCatalog.ts): the library's
// languages with how many Bibles each has, a language search ranked by name, and the Bibles of a language (or of
// all languages) filtered by every word of a search and ranked by abbreviation, name start, then name; the
// featured English Bibles first. Accents and case never matter.
use crate::reader_tools::Translation;
use std::cmp::Ordering;
use unicode_normalization::UnicodeNormalization;

pub const DEFAULT_LANGUAGE: &str = "eng";
pub const ALL_LANGUAGES: &str = "all";
pub const PAGE_SIZE: usize = 40;
/// Editions people often look for that need a licensed source the provider doesn't offer.
const LICENSED_ONLY: [&str; 6] = ["nrsvue", "nrsv", "niv", "nlt", "csb", "esv"];
const FEATURED: [&str; 5] = ["BSB", "eng_net", "eng_webu", "eng_fbv", "eng_lsv"];

#[derive(Debug, Clone, PartialEq)]
pub struct Language {
    pub id: String,
    pub label: String,
    pub native_name: Option<String>,
    pub count: usize,
}

/// Lowercase, without accents (`searchable`).
pub fn searchable(value: &str) -> String {
    value
        .nfd()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .collect::<String>()
        .to_lowercase()
}
fn words(query: &str) -> Vec<String> {
    searchable(query.trim())
        .split_whitespace()
        .map(str::to_string)
        .collect()
}
fn same_text(a: &str, b: &str) -> bool {
    let strip = |s: &str| {
        searchable(s)
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '_')
            .collect::<String>()
    };
    strip(a) == strip(b)
}
/// `translationNativeName`: the edition's own name when it adds something to the title.
pub fn native_name(t: &Translation, title: &str) -> Option<String> {
    let native = t.name.trim();
    (!native.is_empty() && !same_text(native, title)).then(|| native.to_string())
}
fn abbreviation(t: &Translation) -> String {
    t.short_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&t.id)
        .to_string()
}
/// "Spanish · español" when the language's own name differs from its English name.
pub fn language_display(l: &Language) -> String {
    match &l.native_name {
        Some(n) if !same_text(n, &l.label) => format!("{} · {n}", l.label),
        _ => l.label.clone(),
    }
}
/// `catalogLanguages`: every language in the library, by name.
pub fn languages(catalog: &[Translation]) -> Vec<Language> {
    let mut out: Vec<Language> = vec![];
    for t in catalog {
        let id = t.language.clone().unwrap_or_else(|| "unknown".into());
        match out.iter_mut().find(|l| l.id == id) {
            Some(l) => {
                l.count += 1;
                if l.native_name.is_none() {
                    l.native_name = t.language_name.clone();
                }
            }
            None => out.push(Language {
                id,
                label: t.language_label(),
                native_name: t.language_name.clone(),
                count: 1,
            }),
        }
    }
    out.sort_by(|a, b| a.label.cmp(&b.label));
    out
}
fn by_count(a: &Language, b: &Language) -> Ordering {
    b.count.cmp(&a.count).then_with(|| a.label.cmp(&b.label))
}
/// `searchCatalogLanguages`: without a query, most Bibles first; with one, exact name or code, then names starting
/// with it, then words starting with it, then anywhere.
pub fn search_languages(languages: &[Language], query: &str) -> Vec<Language> {
    let words = words(query);
    if words.is_empty() {
        let mut all = languages.to_vec();
        all.sort_by(by_count);
        return all;
    }
    let phrase = words.join(" ");
    let mut ranked: Vec<(usize, &Language)> = vec![];
    for l in languages {
        let names: Vec<String> = [l.label.as_str(), l.native_name.as_deref().unwrap_or("")]
            .iter()
            .map(|s| searchable(s))
            .collect();
        let haystack = format!("{} {}", names.join(" "), l.id.to_lowercase());
        if !words.iter().all(|w| haystack.contains(w.as_str())) {
            continue;
        }
        let rank = if names.contains(&phrase) || l.id.to_lowercase() == phrase {
            0
        } else if names.iter().any(|n| n.starts_with(&phrase)) {
            1
        } else if names.iter().any(|n| {
            n.split([' ', '(', ')', ',', '-'])
                .any(|part| part.starts_with(words[0].as_str()))
        }) {
            2
        } else {
            3
        };
        ranked.push((rank, l));
    }
    ranked.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| by_count(a.1, b.1)));
    ranked.into_iter().map(|(_, l)| l.clone()).collect()
}
fn featured_rank(id: &str) -> usize {
    FEATURED
        .iter()
        .position(|f| *f == id)
        .unwrap_or(FEATURED.len())
}
fn match_rank(t: &Translation, phrase: &str) -> usize {
    let abbr = searchable(&abbreviation(t));
    let names = [searchable(&t.title()), searchable(&t.name)];
    let id = t.id.to_lowercase();
    let short_id = id.split_once('_').map(|(_, rest)| rest).unwrap_or(&id);
    if abbr == phrase || id == phrase || short_id == phrase {
        0
    } else if names.iter().any(|n| n.starts_with(phrase)) {
        1
    } else if names.iter().any(|n| n.contains(phrase)) {
        2
    } else {
        3
    }
}
/// `filterTranslationCatalog`: a language's Bibles (or all of them) matching every word of the search, ranked.
pub fn filter<'a>(catalog: &'a [Translation], language: &str, query: &str) -> Vec<&'a Translation> {
    let words = words(query);
    let phrase = words.join(" ");
    let mut out: Vec<&Translation> = catalog
        .iter()
        .filter(|t| {
            if language != ALL_LANGUAGES && t.language.as_deref().unwrap_or("unknown") != language {
                return false;
            }
            let haystack = searchable(
                &[
                    Some(t.id.as_str()),
                    Some(t.name.as_str()),
                    t.english_name.as_deref(),
                    t.short_name.as_deref(),
                    t.language.as_deref(),
                    t.language_name.as_deref(),
                    t.language_english_name.as_deref(),
                ]
                .into_iter()
                .flatten()
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join(" "),
            );
            words.iter().all(|w| haystack.contains(w.as_str()))
        })
        .collect();
    out.sort_by(|a, b| {
        let rank = if phrase.is_empty() {
            Ordering::Equal
        } else {
            match_rank(a, &phrase).cmp(&match_rank(b, &phrase))
        };
        rank.then_with(|| featured_rank(&a.id).cmp(&featured_rank(&b.id)))
            .then_with(|| {
                if language == ALL_LANGUAGES {
                    a.language_label().cmp(&b.language_label())
                } else {
                    Ordering::Equal
                }
            })
            .then_with(|| a.title().cmp(&b.title()))
    });
    out
}
/// `isLicensedOnlyQuery`: a search for an edition that needs a licensed source.
pub fn licensed_only(query: &str) -> bool {
    words(query).iter().any(|w| {
        let letters: String = w.chars().filter(|c| c.is_ascii_lowercase()).collect();
        LICENSED_ONLY.contains(&letters.as_str())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn t(
        id: &str,
        name: &str,
        english: Option<&str>,
        short: &str,
        lang: &str,
        lang_en: &str,
        lang_name: &str,
    ) -> Translation {
        Translation {
            id: id.into(),
            name: name.into(),
            english_name: english.map(Into::into),
            short_name: Some(short.into()),
            language: Some(lang.into()),
            language_english_name: Some(lang_en.into()),
            language_name: Some(lang_name.into()),
        }
    }
    fn catalog() -> Vec<Translation> {
        vec![
            t(
                "eng_kjv",
                "King James Version",
                None,
                "KJV",
                "eng",
                "English",
                "English",
            ),
            t(
                "BSB",
                "Berean Standard Bible",
                None,
                "BSB",
                "eng",
                "English",
                "English",
            ),
            t(
                "eng_net",
                "NET Bible",
                None,
                "NET",
                "eng",
                "English",
                "English",
            ),
            t(
                "spa_rvr",
                "Reina-Valera 1909",
                Some("Reina Valera 1909"),
                "RVR09",
                "spa",
                "Spanish",
                "español",
            ),
            t(
                "spa_pdt",
                "Palabra de Dios para Todos",
                Some("Word of God for Everyone"),
                "PDT",
                "spa",
                "Spanish",
                "español",
            ),
            t(
                "deu_lut",
                "Lutherbibel",
                Some("Luther Bible"),
                "LUT",
                "deu",
                "German",
                "Deutsch",
            ),
            t(
                "swe_1917",
                "Svenska 1917",
                None,
                "SV1917",
                "swe",
                "Swedish",
                "svenska",
            ),
        ]
    }
    #[test]
    fn languages_are_listed_and_searched_like_the_website() {
        let langs = languages(&catalog());
        assert_eq!(
            langs.iter().map(|l| l.label.as_str()).collect::<Vec<_>>(),
            ["English", "German", "Spanish", "Swedish"]
        );
        // Without a query, most Bibles first.
        let all = search_languages(&langs, "");
        assert_eq!(all[0].label, "English");
        assert_eq!(all[1].label, "Spanish");
        // By the language's own name, accents ignored; display shows both names.
        let es = search_languages(&langs, "ESPANOL");
        assert_eq!(es[0].id, "spa");
        assert_eq!(language_display(&es[0]), "Spanish · español");
        assert_eq!(language_display(&langs[0]), "English");
        // Exact name first, then names starting with it.
        let sw = search_languages(&langs, "sw");
        assert_eq!(sw[0].label, "Swedish");
        assert!(search_languages(&langs, "klingon").is_empty());
    }
    #[test]
    fn bibles_are_filtered_and_ranked_like_the_website() {
        let c = catalog();
        // English: the featured ones first, in their order, then by title.
        let en: Vec<&str> = filter(&c, "eng", "")
            .iter()
            .map(|t| t.id.as_str())
            .collect();
        assert_eq!(en, ["BSB", "eng_net", "eng_kjv"]);
        // An abbreviation or id ranks first; every word must match; other languages stay out.
        let kjv = filter(&c, "eng", "kjv");
        assert_eq!(kjv[0].id, "eng_kjv");
        assert!(filter(&c, "eng", "reina").is_empty());
        let all: Vec<&str> = filter(&c, ALL_LANGUAGES, "reina valera")
            .iter()
            .map(|t| t.id.as_str())
            .collect();
        assert_eq!(all, ["spa_rvr"]);
        // The native name is shown only when it adds something.
        let pdt = &c[4];
        assert_eq!(
            native_name(pdt, &pdt.title()).as_deref(),
            Some("Palabra de Dios para Todos")
        );
        assert_eq!(native_name(&c[1], &c[1].title()), None);
        assert!(licensed_only("NIV 2011"));
        assert!(!licensed_only("net"));
    }
}
