// A bottom sheet over the page (the web's phone sheets and popovers): a dimmed backdrop that closes it, a
// rounded card with a title row and a close button, safe-area and keyboard aware.

import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/theme";
import { fonts } from "../theme/tokens";
import { IconButton, liftShadow } from "./ui";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  leading?: ReactNode;
  scroll?: boolean;
  testID?: string;
};

export default function Sheet({ visible, title, onClose, children, leading, scroll = true, testID }: Props) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.32)" }} />
        <View
          testID={testID}
          accessibilityViewIsModal
          style={[
            {
              maxHeight: "88%",
              backgroundColor: colors.background,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              borderWidth: 1,
              borderColor: colors.surfaceBorder,
              paddingBottom: Math.max(insets.bottom, 12),
            },
            liftShadow(scheme),
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.rule }}>
            {leading}
            <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, paddingHorizontal: 6, fontFamily: fonts.serif, fontSize: 19, color: colors.foreground }}>
              {title}
            </Text>
            <IconButton icon="xmark" label={`Close ${title.toLowerCase()}`} onPress={onClose} />
          </View>
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>
              {children}
            </ScrollView>
          ) : (
            <View style={{ padding: 16, gap: 16 }}>{children}</View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
