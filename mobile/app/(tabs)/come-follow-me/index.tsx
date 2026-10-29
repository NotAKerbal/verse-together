import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import Grid from "../../../src/components/Grid";
import { LdsContentGate } from "../../../src/components/HiddenContent";
import { Button, IconButton, Page, SectionHeading, softShadow } from "../../../src/components/ui";
import { PUBLISHED_GUIDES } from "../../../src/cfm/guides";
import { LessonCard, LessonChapters, LessonCoverImage, PaintingCaption } from "../../../src/features/cfm/LessonParts";
import { getLessonOverview, localDateKey, weekReading, type Lesson, type ScheduleStatus } from "../../../src/shared/web";
import { useTheme } from "../../../src/theme/theme";
import { fonts } from "../../../src/theme/tokens";

function Kicker({ items }: { items: string[] }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, lineHeight: 18, letterSpacing: 1.7, textTransform: "uppercase", color: colors.accentRubric }}>
      {items.map((item, index) => (
        <Text key={item} style={index ? { color: colors.foregroundSoft } : undefined}>
          {index ? <Text style={{ color: colors.ruleStrong }}>{"  ·  "}</Text> : null}
          {item}
        </Text>
      ))}
    </Text>
  );
}

function FeaturedLesson({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const { guide, week, cover } = lesson;
  const ranges = week ? weekReading(week) : [];
  const guideHref = guide ? lesson.href : null;
  const open = guideHref ? () => router.push(guideHref as never) : undefined;
  return (
    <View
      testID="featured-lesson"
      style={[{ borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: 14, overflow: "hidden", backgroundColor: colors.surfaceCard }, softShadow(colors, scheme)]}
    >
      <Pressable accessibilityRole={open ? "link" : "image"} accessibilityLabel={open ? `Open the study guide: ${lesson.title}` : cover.alt} disabled={!open} onPress={open}>
        <View style={{ aspectRatio: 3 / 2, backgroundColor: colors.surfaceCardSoft }}>
          <LessonCoverImage cover={cover} />
          <PaintingCaption cover={cover} full />
        </View>
      </Pressable>
      <View style={{ padding: 20, gap: 13 }}>
        <Kicker items={["This week", lesson.dateLabel]} />
        <Text accessibilityRole="header" onPress={open} style={{ fontFamily: fonts.serif, fontSize: 28, lineHeight: 32, color: colors.foreground }}>
          {lesson.title}
        </Text>
        {guide ? (
          <>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.accentRubric }}>{lesson.scripture}</Text>
            <Text style={{ fontFamily: fonts.serif, fontSize: 17, lineHeight: 27, color: colors.foregroundMuted }}>{guide.summary}</Text>
          </>
        ) : (
          <Text style={{ fontFamily: fonts.serif, fontSize: 17, lineHeight: 27, color: colors.foregroundMuted }}>
            {week?.suggestion ? `${week.suggestion.note}. ` : ""}There is no study guide for this week yet. You can still read the assigned scripture.
          </Text>
        )}
        {week && ranges.length ? (
          <View style={{ gap: 8 }}>
            <Text importantForAccessibility="no" style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: colors.foregroundSoft }}>
              Read the chapters
            </Text>
            <LessonChapters ranges={ranges} />
          </View>
        ) : null}
        {open ? <Button label="Open the study guide" trailing="→" onPress={open} style={{ alignSelf: "flex-start" }} testID="open-guide" /> : null}
        {week && !guide ? (
          <Button variant="secondary" label="Open this week" trailing="→" onPress={() => router.push(`/come-follow-me/${week.start}` as never)} style={{ alignSelf: "flex-start" }} />
        ) : null}
      </View>
    </View>
  );
}

function NoLesson({ schedule }: { schedule: ScheduleStatus }) {
  const { colors } = useTheme();
  return (
    <Text style={{ paddingVertical: 20, paddingHorizontal: 4, fontFamily: fonts.serif, fontSize: 18, lineHeight: 29, color: colors.foregroundMuted }}>
      {schedule === "after"
        ? "This year’s Come, Follow Me schedule has ended. Earlier lessons stay open below."
        : schedule === "before"
          ? "This year’s Come, Follow Me schedule has not begun yet."
          : "No lesson is scheduled for this week."}
    </Text>
  );
}

/** Come, Follow Me is Latter-day Saint content: Other denominations sees the web's notice instead. */
export default function ComeFollowMeScreen() {
  return (
    <LdsContentGate href="/come-follow-me">
      <ComeFollowMeOverview />
    </LdsContentGate>
  );
}

function ComeFollowMeOverview() {
  const router = useRouter();
  const { colors } = useTheme();
  const today = localDateKey();
  const overview = useMemo(() => getLessonOverview(today, PUBLISHED_GUIDES), [today]);
  const hasPaintings = [overview.current, ...overview.previous, ...overview.upcoming].some((lesson) => lesson?.cover.kind === "painting");
  return (
    <Page gap={36}>
      <View style={{ gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <SectionHeading>This week</SectionHeading>
          <IconButton icon="gear" label="Settings and account" onPress={() => router.push("/settings")} />
        </View>
        {overview.current ? <FeaturedLesson key={overview.current.start} lesson={overview.current} /> : <NoLesson schedule={overview.schedule} />}
      </View>
      {overview.upcoming.length ? (
        <View style={{ gap: 16 }}>
          <SectionHeading>Coming up</SectionHeading>
          <Grid gap={18}>
            {overview.upcoming.map((lesson) => (
              <LessonCard key={lesson.start} lesson={lesson} />
            ))}
          </Grid>
        </View>
      ) : null}
      {overview.previous.length ? (
        <View style={{ gap: 16 }}>
          <SectionHeading>Previous lessons</SectionHeading>
          <Grid gap={18}>
            {overview.previous.map((lesson) => (
              <LessonCard key={lesson.start} lesson={lesson} />
            ))}
          </Grid>
        </View>
      ) : null}
      <View style={{ gap: 12 }}>
        <Text style={{ paddingHorizontal: 4, fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.foregroundSoft }}>
          Landscape and still-life covers are illustrations generated with AI and show no people.
          {hasPaintings ? " Paintings of the Savior are historical public-domain works, credited on each cover and in full on each lesson." : ""}
        </Text>
        <Text
          accessibilityRole="link"
          accessibilityHint="Opens your study plans; keeping a plan needs an account"
          onPress={() => router.push("/plans" as never)}
          style={{ paddingHorizontal: 4, fontFamily: fonts.sans, fontSize: 14, color: colors.foregroundSoft, textDecorationLine: "underline", textDecorationColor: colors.ruleStrong }}
        >
          Your study plans
        </Text>
      </View>
    </Page>
  );
}
