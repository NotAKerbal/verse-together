// Come, Follow Me lesson pieces (LessonOverview.tsx, LessonCoverImage.tsx, LessonChapters.tsx): cover art with a
// painting's credit, the week's chapter chips (tinted once reading is logged), and the lesson cards.

import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { openExternal } from "../../components/Blocks";
import { publicImage } from "../../data/images";
import { chapterPath } from "../../navigation/hrefs";
import { getBookLabel, scriptureCatalog, shortCoverCredit, type ChapterRange, type Lesson, type LessonCover } from "../../shared/web";
import { useDeviceStudy } from "../../storage/study";
import { useTheme } from "../../theme/theme";
import { fonts } from "../../theme/tokens";
import { readChapterSet } from "../readingProgress";

function contentPosition(focus?: string) {
  if (!focus) return "center" as const;
  const [left, top] = focus.split(/\s+/);
  return { left: left as `${number}%`, top: top as `${number}%` };
}

export function LessonCoverImage({ cover, style }: { cover: LessonCover; style?: object }) {
  const source = publicImage(cover.src);
  return source ? (
    <Image source={source} accessibilityLabel={cover.alt} contentFit="cover" contentPosition={contentPosition(cover.focus)} style={[{ width: "100%", height: "100%" }, style]} />
  ) : null;
}

/** The cover's full credit, or a generated illustration's provenance. */
export function CoverCredit({ cover, color }: { cover: LessonCover; color?: string }) {
  const { colors } = useTheme();
  if (cover.kind === "generated") return <Text style={{ color: color ?? colors.foregroundSoft }}>Illustration generated with AI.</Text>;
  const { title, artist, date, collection, license, sourceLabel, sourceUrl } = cover.credit;
  return (
    <Text style={{ color: color ?? colors.foregroundSoft }}>
      <Text style={{ fontStyle: "italic" }}>{title}</Text>
      {`, ${artist}, ${date}.${collection ? ` ${collection}.` : ""} ${license}, via `}
      <Text accessibilityRole="link" onPress={() => void openExternal(sourceUrl)} style={{ textDecorationLine: "underline" }}>
        {sourceLabel}
      </Text>
      .
    </Text>
  );
}

export function PaintingCaption({ cover, full = false }: { cover: LessonCover; full?: boolean }) {
  const credit = shortCoverCredit(cover);
  if (!credit) return null;
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 32,
        paddingHorizontal: 14,
        paddingBottom: 10,
        backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.68))",
      }}
    >
      <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, lineHeight: 16, color: "rgba(255,255,255,0.92)", textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 2 }}>
        {full ? <CoverCredit cover={cover} color="rgba(255,255,255,0.92)" /> : credit}
      </Text>
    </View>
  );
}

function describeRange(range: ChapterRange) {
  const book = getBookLabel(range.volume, range.book);
  const whole = range.from === 1 && range.to === scriptureCatalog.getBook(range.volume, range.book)?.chapterCount;
  if (whole) return book;
  return range.from === range.to ? `${book} ${range.from}` : `${book} ${range.from}–${range.to}`;
}

export function LessonChapters({ ranges, label = "This week's chapters" }: { ranges: ChapterRange[]; label?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const study = useDeviceStudy();
  if (!ranges.length) return null;
  return (
    <View accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {ranges.map((range) => {
        const read = readChapterSet(study, range.volume, range.book);
        let allRead = read.size > 0;
        for (let chapter = range.from; allRead && chapter <= range.to; chapter++) allRead = read.has(chapter);
        const text = describeRange(range);
        return (
          <Pressable
            key={`${range.book}-${range.from}`}
            accessibilityRole="link"
            accessibilityLabel={`${text}${allRead ? ", read" : ""}`}
            onPress={() => router.push(chapterPath(range.volume, range.book, range.from) as never)}
            style={({ pressed }) => ({
              minHeight: 40,
              justifyContent: "center",
              paddingHorizontal: 14,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.surfaceBorder,
              backgroundColor: allRead ? colors.accentMint : pressed ? colors.surfaceButtonHover : colors.surfaceButton,
            })}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.foreground }}>{text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LessonCard({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const { colors } = useTheme();
  const body = (
    <>
      <View style={{ aspectRatio: 3 / 2, backgroundColor: colors.surfaceCardSoft, overflow: "hidden" }}>
        <LessonCoverImage cover={lesson.cover} />
        <PaintingCaption cover={lesson.cover} />
      </View>
      <View style={{ padding: 16, paddingBottom: 20, gap: 7 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: colors.foregroundSoft }}>{lesson.dateLabel}</Text>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.accentRubric }}>{lesson.scripture}</Text>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.serif, fontSize: 21, lineHeight: 25, color: colors.foreground }}>
          {lesson.title}
        </Text>
        {lesson.guide ? (
          <Text numberOfLines={3} style={{ fontFamily: fonts.serif, fontSize: 15, lineHeight: 23, color: colors.foregroundMuted }}>
            {lesson.guide.summary}
          </Text>
        ) : null}
      </View>
    </>
  );
  const frame = { borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: 12, overflow: "hidden" as const, backgroundColor: colors.surfaceCard };
  return lesson.href ? (
    <Pressable
      testID={`lesson-${lesson.start}`}
      accessibilityRole="link"
      accessibilityLabel={`${lesson.title}, ${lesson.dateLabel}, ${lesson.scripture}`}
      onPress={() => router.push(lesson.href as never)}
      style={({ pressed }) => [frame, pressed ? { borderColor: colors.ruleStrong } : null]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={frame}>{body}</View>
  );
}
