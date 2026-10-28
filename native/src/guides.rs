pub struct Guide {
    pub title: &'static str,
    pub date: &'static str,
    pub content: &'static str,
}
pub const GUIDES: &[Guide] = &[
    Guide {
        title: "Isaiah 40–49",
        date: "September 28 – October 4, 2026",
        content: include_str!("../../content/cfm/2026-09-28-isaiah-40-49.md"),
    },
    Guide {
        title: "Isaiah 50–57",
        date: "October 5–11, 2026",
        content: include_str!("../../content/cfm/2026-10-05-isaiah-50-57.md"),
    },
    Guide {
        title: "Isaiah 58–66",
        date: "October 12–18, 2026",
        content: include_str!("../../content/cfm/2026-10-12-isaiah-58-66.md"),
    },
    Guide {
        title: "Jeremiah 1–3; 7; 16–18; 20",
        date: "October 19–25, 2026",
        content: include_str!("../../content/cfm/2026-10-19-jeremiah-1-3-7-16-18-20.md"),
    },
];
pub fn sections(index: usize) -> Vec<(String, String)> {
    GUIDES[index]
        .content
        .split("\n## ")
        .enumerate()
        .map(|(i, s)| {
            if i == 0 {
                ("Introduction".into(), s.into())
            } else {
                (
                    s.lines().next().unwrap_or("Study").into(),
                    format!("## {s}"),
                )
            }
        })
        .collect()
}
