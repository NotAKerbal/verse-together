// The phone navigation (MobileBottomNav.tsx with .mobile-nav-control in globals.css): a floating segmented pill
// at the bottom, Browse / Journal / Come Follow Me. Every item is a 48pt icon; the active one grows to show its
// label on the filled active surface. Hidden in simple mode, and while the keyboard is up. Other denominations
// leaves out Come Follow Me, as the web's nav leaves out Latter-day Saint content.

import type { BottomTabBarProps } from "expo-router/tabs";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Keyboard, LayoutAnimation, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isLdsContentPath, useFaithTradition } from "../storage/faithTradition";
import { useSimpleMode } from "../storage/preferences";
import { useTheme } from "../theme/theme";
import { fonts, radii } from "../theme/tokens";
import { Icon, softShadow, type IconName } from "./ui";

export const PRIMARY_NAV: ReadonlyArray<{ route: string; label: string; icon: IconName }> = [
  { route: "browse", label: "Browse", icon: "book-open" },
  { route: "notes", label: "Journal", icon: "pencil" },
  { route: "come-follow-me", label: "Come Follow Me", icon: "shoe-prints" },
];

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/** The primary sections this device shows. */
export function visibleNav(showLdsContent: boolean) {
  return PRIMARY_NAV.filter((item) => showLdsContent || !isLdsContentPath(`/${item.route}`));
}

export function FloatingNavBar({ activeRoute, onSelect }: { activeRoute: string; onSelect: (route: string) => void }) {
  const { colors, scheme } = useTheme();
  const { showLdsContent } = useFaithTradition();
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  return (
    <View
      accessibilityRole="tabbar"
      accessibilityLabel="Primary navigation"
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: Math.max(14, insets.bottom), alignItems: "center", paddingHorizontal: 16 }}
    >
      <View
        style={[
          {
            flexDirection: "row",
            width: "100%",
            maxWidth: 384,
            gap: 4,
            padding: 5,
            borderWidth: 1,
            borderColor: colors.mobileNavRing,
            borderRadius: radii.pill,
            backgroundColor: colors.mobileNavShell,
          },
          softShadow(colors, scheme),
        ]}
      >
        {visibleNav(showLdsContent).map((item) => {
          const active = item.route === activeRoute;
          return (
            <Pressable
              key={item.route}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              testID={`nav-${item.route}`}
              onPress={() => {
                if (!reduceMotion && !active) LayoutAnimation.configureNext(LayoutAnimation.create(280, "easeInEaseOut", "scaleX"));
                onSelect(item.route);
              }}
              style={({ pressed }) => ({
                flexGrow: active ? 3 : 1,
                flexBasis: 0,
                minWidth: 48,
                minHeight: 48,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 8,
                borderRadius: radii.pill,
                backgroundColor: active ? colors.mobileNavActive : pressed ? colors.surfaceButtonHover : "transparent",
              })}
            >
              <Icon name={item.icon} size={22} color={active ? colors.mobileNavActiveText : colors.mobileNavIcon} />
              {active ? (
                <Text
                  numberOfLines={1}
                  importantForAccessibility="no"
                  style={{ marginLeft: 6, fontFamily: fonts.sansMedium, fontSize: 13, color: colors.mobileNavActiveText, flexShrink: 1 }}
                >
                  {item.label}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** expo-router Tabs' tabBar: the floating pill, driving the tab navigator. */
export default function FloatingNav({ state, navigateToTab }: BottomTabBarProps) {
  const keyboard = useKeyboardVisible();
  const [simple] = useSimpleMode();
  const router = useRouter();
  if (keyboard || simple) return null;
  const activeRoute = state.routes[state.index]?.name ?? "browse";
  return (
    <FloatingNavBar
      activeRoute={activeRoute}
      onSelect={(routeName) => {
        const route = state.routes.find((candidate) => candidate.name === routeName);
        if (!route) return;
        // A second tap returns to the section's start, as the web nav links do.
        if (routeName === activeRoute) router.navigate(`/${routeName}` as never);
        else navigateToTab(route.key);
      }}
    />
  );
}
