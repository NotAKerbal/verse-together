import { Tabs } from "expo-router";
import FloatingNav from "../../src/components/FloatingNav";
import { useTheme } from "../../src/theme/theme";

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <FloatingNav {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="browse" options={{ title: "Browse" }} />
      <Tabs.Screen name="notes" options={{ title: "Journal" }} />
      <Tabs.Screen name="come-follow-me" options={{ title: "Come Follow Me" }} />
    </Tabs>
  );
}
