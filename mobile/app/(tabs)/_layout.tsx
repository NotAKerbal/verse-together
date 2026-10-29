import { Tabs } from "expo-router";
import FloatingNav from "../../src/components/FloatingNav";
import { HiddenContentNotice } from "../../src/components/HiddenContent";
import { useFaithTradition } from "../../src/storage/faithTradition";
import { useTheme } from "../../src/theme/theme";

export default function TabsLayout() {
  const { colors } = useTheme();
  const { showLdsContent } = useFaithTradition();
  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <FloatingNav {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
      // Other denominations: Come, Follow Me (its weeks too, however they're reached) shows the web's notice instead.
      screenLayout={({ route, children }) => (!showLdsContent && route.name === "come-follow-me" ? <HiddenContentNotice /> : children)}
    >
      <Tabs.Screen name="browse" options={{ title: "Browse" }} />
      <Tabs.Screen name="notes" options={{ title: "Journal" }} />
      <Tabs.Screen name="come-follow-me" options={{ title: "Come Follow Me" }} />
    </Tabs>
  );
}
