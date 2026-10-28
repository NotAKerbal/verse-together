import { Image } from "expo-image";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import Grid from "../../../../src/components/Grid";
import SelectionHeader from "../../../../src/components/SelectionHeader";
import { ChevronCircle, Notice, Page, PressCard } from "../../../../src/components/ui";
import { publicImage } from "../../../../src/data/images";
import {
  buildVolumeBooks,
  getScriptureBookArt,
  getScriptureVolumeLabel,
  parseBrowseSelection,
  scriptureCatalog,
  toScriptureVolumeUrlSlug,
} from "../../../../src/shared/web";
import { useTheme } from "../../../../src/theme/theme";
import { fonts } from "../../../../src/theme/tokens";

export default function VolumeScreen() {
  const { volume: volumeParam } = useLocalSearchParams<{ volume: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const selection = parseBrowseSelection(`/browse/${volumeParam}`);
  // A one-book volume (D&C) opens its book's section list, as /browse/dnc does on the web.
  if (selection?.kind === "book") return <Redirect href={`/browse/${selection.volumeSlug}/${selection.book}` as never} />;
  const volume = selection?.kind === "volume" ? selection.volume : String(volumeParam);
  const slug = toScriptureVolumeUrlSlug(volume);
  const books = buildVolumeBooks(scriptureCatalog, volume);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/browse"));

  return (
    <Page gap={16}>
      <SelectionHeader title={getScriptureVolumeLabel(volume)} onBack={back} />
      {books.length === 0 ? (
        <Notice>No book list available for this volume yet.</Notice>
      ) : (
        <Grid>
          {books.map((book) => (
            <PressCard
              key={book.id}
              testID={`book-${book.id}`}
              accessibilityLabel={`${book.label}, ${book.chapters} ${book.chapters === 1 ? "chapter" : "chapters"}`}
              onPress={() => router.push(book.href as never)}
              style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 16 }}
            >
              <View style={{ width: 64, height: 64, borderRadius: 9.6, overflow: "hidden", backgroundColor: colors.surfaceCardSoft }}>
                <Image source={publicImage(getScriptureBookArt(slug, book.id))} style={{ width: 64, height: 64 }} contentFit="cover" accessible={false} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {book.category ? (
                  <Text style={{ marginBottom: 4, fontFamily: fonts.sansBold, fontSize: 10.24, letterSpacing: 1, textTransform: "uppercase", color: colors.foregroundSoft }}>
                    {book.category}
                  </Text>
                ) : null}
                <Text style={{ fontFamily: fonts.serif, fontWeight: "500", fontSize: 19.2, lineHeight: 23, color: colors.foreground }}>{book.label}</Text>
                <Text style={{ marginTop: 2, fontFamily: fonts.sansSemiBold, fontSize: 12.8, color: colors.foregroundMuted }}>
                  {book.chapters} {book.chapters === 1 ? "chapter" : "chapters"}
                </Text>
              </View>
              <ChevronCircle />
            </PressCard>
          ))}
        </Grid>
      )}
    </Page>
  );
}
