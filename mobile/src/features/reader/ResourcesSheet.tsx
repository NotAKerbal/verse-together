// Resources for the selected verses (the web's VerseResourcesPanel.tsx, "Lessons & more"): each published lesson
// passage that overlaps them, with its commentary and cited sources, a link into the lesson, and a web search for
// more Come, Follow Me resources. Scripture a resource names opens in the reader.

import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import Blocks, { openExternal } from "../../components/Blocks";
import Sheet from "../../components/Sheet";
import { Button } from "../../components/ui";
import type { PassageRef } from "../../cfm/guideTypes";
import { chapterPath, lessonPath } from "../../navigation/hrefs";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import { resourcesSearchUrl, verseLessonResources, type ResourceSelection } from "./lessonResources";

export default function ResourcesSheet({ visible, selection, reference, onClose }: { visible: boolean; selection: ResourceSelection; reference: string; onClose: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { volume, book, chapter } = selection;
  const verseKey = selection.verses.join(",");
  // The bundled guides are read the first time Resources opens; `selection` is read through its parts, so a new
  // object for the same verses reads nothing again.
  const resources = useMemo(
    () => (visible ? verseLessonResources({ volume, book, chapter, verses: verseKey ? verseKey.split(",").map(Number) : [] }) : []),
    [visible, volume, book, chapter, verseKey]
  );
  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };
  const onRef = (ref: PassageRef) => go(chapterPath(ref.volume, ref.book, ref.chapter, ref.first));
  return (
    <Sheet visible={visible} title={`Resources for ${reference}`} onClose={onClose} testID="verse-resources">
      {resources.length === 0 ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: colors.foregroundMuted }}>
          No resources for these verses in our published lessons yet. Search the web for more Come, Follow Me resources.
        </Text>
      ) : (
        resources.map((resource) => (
          <View key={resource.id} testID={`resource-${resource.anchor}`} style={{ gap: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 0.8, color: colors.accentRubric }}>{resource.reference.toUpperCase()}</Text>
            <Pressable accessibilityRole="link" accessibilityHint="Opens the lesson at this passage" onPress={() => go(lessonPath(resource.weekStart, resource.anchor))}>
              <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 19, lineHeight: 25, color: colors.foreground, textDecorationLine: "underline", textDecorationColor: colors.accentRubricLine }}>
                {resource.title}
              </Text>
            </Pressable>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.foregroundMuted }}>{`${resource.lessonTitle} · ${resource.dateLabel}`}</Text>
            <Blocks blocks={resource.blocks} size={15} onRef={onRef} onAnchor={(id) => go(lessonPath(resource.weekStart, id))} onPath={go} />
            <Pressable accessibilityRole="link" onPress={() => go(lessonPath(resource.weekStart, resource.anchor))} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.foreground, textDecorationLine: "underline" }}>Read in lesson →</Text>
            </Pressable>
          </View>
        ))
      )}
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.foregroundMuted }}>{`Find more resources for ${reference}`}</Text>
        <Button variant="secondary" icon="arrow-up-right-from-square" label="Search Come, Follow Me on the web" onPress={() => void openExternal(resourcesSearchUrl(reference))} />
      </View>
    </Sheet>
  );
}
