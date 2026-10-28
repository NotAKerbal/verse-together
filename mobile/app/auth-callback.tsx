import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useAccount } from "../src/account/AccountProvider";
import { useTheme } from "../src/theme/theme";
import { fonts } from "../src/theme/tokens";

/**
 * versetogether://auth-callback, where Google sign-in returns with a one-time code (src/account/googleSignIn.ts).
 * Usually the browser call already has the return; this route finishes it when Android delivered it here instead, or
 * the app was restarted while the browser was open. A link that isn't this device's own sign-in does nothing, and a
 * `cookie` parameter (the old return format) is never read.
 */
export default function AuthCallback() {
  const router = useRouter();
  const { colors } = useTheme();
  const { completeReturn } = useAccount();
  const params = useLocalSearchParams<{ attempt?: string; code?: string; error?: string }>();
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
    const completion = completeReturn({ attempt: first(params.attempt), code: first(params.code), error: first(params.error) });
    // Back to the Settings screen that started the sign-in, or (after a cold start) a new one.
    const leave = () => router.dismissTo("/settings");
    void (completion ?? Promise.resolve(null)).finally(leave);
  }, [completeReturn, params.attempt, params.code, params.error, router]);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.accentRubric} />
      <Text style={{ fontFamily: fonts.sans, fontSize: 15, color: colors.foregroundMuted }}>Finishing sign-in…</Text>
    </View>
  );
}
