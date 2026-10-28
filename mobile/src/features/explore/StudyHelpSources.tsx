// Explore's study helps (the web's ScriptureHelpsSection, StudyHelpGuideRow and StudyHelpArticle): a row for each of
// the Bible Dictionary, Guide to the Scriptures and Topical Guide with topics for the selection, titled with the
// topic it shows. Open, it offers the guide's other matching topics in place, the entry's opening with "Read more",
// links to the source, and a topic named in the entry's text opens in place of the entry.

import { useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View, type TextStyle } from "react-native";
import { previewStudyHelpBlocks, type StudyHelpBlock, type StudyHelpEntry, type StudyHelpInline } from "@/lib/studyHelpContent";
import { studyHelpBrowseUrl, studyHelpEntryUrl, type StudyHelpGuide, type StudyHelpGuideId, type StudyHelpMatches } from "@/lib/studyHelps";
import type { SourceStatus } from "@/lib/exploreSources";
import { openExternal } from "../../components/Blocks";
import { Icon } from "../../components/ui";
import { toAppHref } from "../../navigation/hrefs";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import { plural, studyHelpEntries, studyHelpKey, type StudyHelpGuideResult } from "./explore";
import { Eyebrow, ExploreLinksContext, ExploreNotice, ExploreRow, ExploreSection, ExternalLink, LoadError, LoadingLines, QuietButton, useTone, type ExploreDisclosure } from "./ExploreParts";
import { useSharedResource } from "./useSharedResource";

type InlineContext = { guide: StudyHelpGuideId; onSelectTopic?: (slug: string) => void; onPath: (path: string) => void };

function InlineNodes({ nodes, context }: { nodes: StudyHelpInline[]; context: InlineContext }): ReactNode {
  return nodes.map((node, index) => <InlineNode key={index} node={node} context={context} />);
}

function InlineNode({ node, context }: { node: StudyHelpInline; context: InlineContext }): ReactNode {
  const { colors } = useTheme();
  if (typeof node === "string") return node;
  const children = <InlineNodes nodes={node.children} context={context} />;
  if ("mark" in node) {
    if (node.mark === "em") return <Text style={{ fontStyle: "italic" }}>{children}</Text>;
    if (node.mark === "small") return <Text style={{ fontSize: 12 }}>{children}</Text>;
    // strong, and the Topical Guide's keyword in each quoted phrase.
    return <Text style={{ fontFamily: fonts.sansSemiBold }}>{children}</Text>;
  }
  const link: TextStyle = { color: colors.accentRubric, textDecorationLine: "underline", textDecorationColor: colors.surfaceBorder };
  // Another entry of this guide opens here, in place of this one.
  if (node.topic && node.topic.guide === context.guide && context.onSelectTopic) {
    const { slug } = node.topic;
    const onSelectTopic = context.onSelectTopic;
    return (
      <Text accessibilityRole="button" accessibilityHint="Shows that topic here" onPress={() => onSelectTopic(slug)} style={link}>
        {children}
      </Text>
    );
  }
  if (node.appHref) {
    const path = toAppHref(node.appHref);
    return (
      <Text accessibilityRole="link" accessibilityHint="Opens the passage" onPress={() => context.onPath(path)} style={link}>
        {children}
      </Text>
    );
  }
  const href = node.href;
  return (
    <Text accessibilityRole="link" accessibilityHint="Opens in the browser" onPress={() => void openExternal(href)} style={link}>
      {children}
    </Text>
  );
}

function ArticleBlocks({ blocks, context }: { blocks: StudyHelpBlock[]; context: InlineContext }) {
  const { colors } = useTheme();
  const body: TextStyle = { fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, color: colors.foreground };
  return blocks.map((block, index) => {
    if (block.type === "heading") {
      return (
        <Text key={index} style={[body, { paddingTop: 4, fontFamily: fonts.sansSemiBold }]}>
          <InlineNodes nodes={block.content} context={context} />
        </Text>
      );
    }
    if (block.type === "list") {
      return (
        <View key={index} style={{ gap: 4, borderLeftWidth: 2, borderLeftColor: colors.surfaceBorder, paddingLeft: 12 }}>
          {block.items.map((item, itemIndex) => (
            <Text key={itemIndex} style={body}>
              <InlineNodes nodes={item} context={context} />
            </Text>
          ))}
        </View>
      );
    }
    return (
      <Text key={index} style={block.style === "title" ? [body, { fontSize: 12, lineHeight: 19, color: colors.foregroundMuted }] : body}>
        <InlineNodes nodes={block.content} context={context} />
      </Text>
    );
  });
}

/** An entry's text, under the row that names it: a short preview, then all of it on "Read more"; a link to the source. */
export function StudyHelpArticle({ entry, guideLabel, onSelectTopic }: { entry: StudyHelpEntry; guideLabel: string; onSelectTopic?: (slug: string) => void }) {
  const { colors } = useTheme();
  const { onPath } = useContext(ExploreLinksContext);
  const [expanded, setExpanded] = useState(false);
  const preview = useMemo(() => previewStudyHelpBlocks(entry.blocks), [entry.blocks]);
  const context: InlineContext = { guide: entry.guide, onSelectTopic, onPath };
  return (
    <View style={{ gap: 8 }}>
      <View style={{ gap: 8 }}>
        <ArticleBlocks blocks={expanded ? entry.blocks : preview.blocks} context={context} />
        {expanded && entry.truncated ? <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundMuted }}>This entry continues at its source.</Text> : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12, rowGap: 4 }}>
        {preview.hasMore ? (
          <QuietButton
            label={expanded ? "Show less" : "Read more"}
            accessibilityLabel={`${expanded ? "Show less" : "Read more"} of ${entry.title}`}
            expanded={expanded}
            onPress={() => setExpanded((value) => !value)}
          />
        ) : (
          <View />
        )}
        <ExternalLink url={entry.url} label="Read at source" a11y={`Read at source: ${entry.title}, ${guideLabel}`} />
      </View>
    </View>
  );
}

function StudyHelpEntryPanel({ guide, slug, title, onSelectTopic }: { guide: StudyHelpGuide; slug: string; title: string | null; onSelectTopic: (slug: string) => void }) {
  const [state, retry] = useSharedResource(studyHelpEntries, studyHelpKey(guide.id, slug));
  if (state.status === "ready") return <StudyHelpArticle key={slug} entry={state.data} guideLabel={guide.label} onSelectTopic={onSelectTopic} />;
  if (state.status === "error") {
    return (
      <LoadError message={`${title ?? "This entry"} didn’t load from the ${guide.label}. ${state.message}`} onRetry={retry}>
        <ExternalLink url={studyHelpEntryUrl(guide.id, slug)} label="Read at source" />
      </LoadError>
    );
  }
  return <LoadingLines label={`Loading ${title ?? "entry"}…`} />;
}

/** A guide's row, titled with the topic it shows; open, it offers the guide's other matching topics in place. */
function StudyHelpGuideRow({ guide, matches }: { guide: StudyHelpGuide; matches: StudyHelpMatches }) {
  const { colors } = useTheme();
  const palette = useTone();
  const [chosen, setChosen] = useState<string | null>(null);
  const topics = useMemo(() => [...matches.entries, ...matches.related], [matches]);
  const slug = chosen ?? topics[0]?.slug ?? null;
  const listed = topics.find((topic) => topic.slug === slug)?.title ?? null;
  // A topic opened from an entry's text may not be among the matches; its title then comes with its entry.
  const [unlisted] = useSharedResource(studyHelpEntries, slug != null && listed == null ? studyHelpKey(guide.id, slug) : null);
  const title = listed ?? (unlisted.status === "ready" ? unlisted.data.title : null);
  const openTopicFromText = useCallback((next: string) => setChosen(next), []);
  if (slug == null) return null;

  return (
    <ExploreRow id={guide.id} label={guide.label} title={title ?? "Related topic"} testID={`study-help-row-${guide.id}`}>
      {topics.length > 1 ? (
        <View style={{ gap: 6 }}>
          <Eyebrow>{matches.entries.length ? "Matching and related topics" : "Related topics"}</Eyebrow>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {topics.map((topic) => {
              const on = topic.slug === slug;
              return (
                <Pressable
                  key={topic.slug}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setChosen(topic.slug)}
                  style={({ pressed }) => ({
                    minHeight: 40,
                    maxWidth: "100%",
                    justifyContent: "center",
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: on ? palette.accent : palette.edge,
                    backgroundColor: on ? palette.accent : pressed ? palette.rowPressed : "transparent",
                  })}
                >
                  <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: on ? palette.onAccent : colors.foreground }}>{topic.title}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      <StudyHelpEntryPanel guide={guide} slug={slug} title={title} onSelectTopic={openTopicFromText} />
      <ExternalLink url={studyHelpBrowseUrl(guide.id)} label={`Browse the ${guide.label}`} />
    </ExploreRow>
  );
}

export function BookIcon() {
  const palette = useTone();
  return <Icon name="book" size={15} color={palette.accent} />;
}

export function ScriptureHelpsSection({ helps, status, disclosure }: { helps: StudyHelpGuideResult[]; status: SourceStatus; disclosure: ExploreDisclosure }) {
  if (status === "empty") return null;
  const found = helps.filter((result) => result.status === "found");
  return (
    <ExploreSection
      tone="sage"
      icon={<BookIcon />}
      title="Study helps"
      summary={(found.length ? found : helps).map(({ guide }) => guide.label).join(" · ")}
      status={status}
      count={found.length ? plural(found.length, "source", "sources") : null}
      disclosure={disclosure}
      testID="explore-section-helps"
    >
      {found.length ? (
        found.map(({ guide, matches }) => <StudyHelpGuideRow key={guide.id} guide={guide} matches={matches} />)
      ) : (
        <ExploreNotice>
          <LoadingLines label="Finding study-help topics…" />
        </ExploreNotice>
      )}
    </ExploreSection>
  );
}
