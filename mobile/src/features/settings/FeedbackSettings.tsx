// Settings → Feedback (src/components/FeedbackForm.tsx): a message and an optional way to reply, with the web's own
// form rules (src/features/feedback/feedbackForm.ts): nothing is sent until the message passes the backend's checks,
// the draft can't change while it sends, a failed send keeps it, and a sent one clears it and says so until the next
// edit. Anyone can send it; signed in and connected, the backend links it to the account (feedback.ts).

import { useReducer, useRef, type ComponentRef } from "react";
import { Text, TextInput, View } from "react-native";
import { FEEDBACK_CONTACT_MAX, FEEDBACK_MESSAGE_MAX, FEEDBACK_MESSAGE_MIN } from "../../../../convex/feedbackRules";
import {
  canSendFeedback,
  feedbackFieldErrors,
  feedbackFormReducer,
  INITIAL_FEEDBACK_FORM,
  visibleFeedbackErrors,
} from "@/features/feedback/feedbackForm";
import { openExternal } from "../../components/Blocks";
import { Button } from "../../components/ui";
import { useStudySession } from "../../storage/studySession";
import { useTheme } from "../../theme/theme";
import { fonts, radii, REM } from "../../theme/tokens";
import { SUPPORT_EMAIL, appVersion } from "./AboutSettings";
import { feedbackRoute, sendFeedback, type FeedbackRoute } from "./feedback";
import { CardHeader, SettingsCard } from "./SettingsParts";

function routeLine(route: FeedbackRoute): string {
  if (route.kind === "account") return "Linked to your account when you send it.";
  if (route.kind === "unavailable") return "Sending feedback isn't set up in this build. You can email it instead.";
  return route.signedIn
    ? "Your account isn't connected right now, so this is sent anonymously."
    : "Sent anonymously. You don't need to sign in.";
}

export default function FeedbackSettings({ route: injectedRoute }: { route?: FeedbackRoute }) {
  const { colors } = useTheme();
  // Re-read whenever whose study shows (signing in or out, connecting) changes.
  useStudySession();
  const route = injectedRoute ?? feedbackRoute();
  const [state, dispatch] = useReducer(feedbackFormReducer, INITIAL_FEEDBACK_FORM);
  // A second press before React re-renders still finds the first send in flight.
  const sending = useRef(false);
  const messageRef = useRef<ComponentRef<typeof TextInput>>(null);
  const contactRef = useRef<ComponentRef<typeof TextInput>>(null);
  const pending = state.status === "pending";
  const errors = visibleFeedbackErrors(state);
  const version = appVersion();

  const submit = async () => {
    if (sending.current || pending || route.kind === "unavailable") return;
    dispatch({ type: "submit" });
    if (!canSendFeedback(state.draft)) {
      (feedbackFieldErrors(state.draft).message ? messageRef : contactRef).current?.focus();
      return;
    }
    sending.current = true;
    try {
      await sendFeedback({ message: state.draft.message.trim(), contact: state.draft.contact.trim() || null }, route);
      dispatch({ type: "succeeded" });
    } catch {
      dispatch({ type: "failed" });
    } finally {
      sending.current = false;
    }
  };

  const label = { fontFamily: fonts.sansSemiBold, fontSize: 0.875 * REM, color: colors.foreground } as const;
  const meta = { fontFamily: fonts.sans, fontSize: 0.72 * REM, lineHeight: 0.72 * REM * 1.5, color: colors.foregroundMuted } as const;
  const errorText = { fontFamily: fonts.sans, fontSize: 0.75 * REM, color: colors.accentRubric } as const;
  const input = (invalid: boolean) =>
    ({
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: invalid ? colors.accentRubric : colors.surfaceBorder,
      backgroundColor: colors.inputSurface,
      color: colors.foreground,
      fontFamily: fonts.sans,
      fontSize: 16,
      opacity: pending ? 0.7 : 1,
    }) as const;

  return (
    <View style={{ gap: 0.75 * REM }}>
      <SettingsCard label="Send feedback" testID="feedback-card">
        <CardHeader title="Send feedback" meta={routeLine(route)} metaLive />
        <View style={{ gap: 1 * REM, paddingBottom: 6 }}>
          <View style={{ gap: 6 }}>
            <Text nativeID="feedback-message-label" style={label}>
              Your feedback
            </Text>
            <TextInput
              ref={messageRef}
              testID="feedback-message"
              accessibilityLabel="Your feedback"
              accessibilityHint={`${FEEDBACK_MESSAGE_MIN} to ${FEEDBACK_MESSAGE_MAX} characters. Please leave out passwords and private details.`}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              maxLength={FEEDBACK_MESSAGE_MAX}
              editable={!pending && route.kind !== "unavailable"}
              value={state.draft.message}
              onChangeText={(value) => dispatch({ type: "edit", field: "message", value })}
              placeholder="What would make Verse Together better?"
              placeholderTextColor={colors.foregroundSoft}
              style={[input(!!errors.message), { minHeight: 140 }]}
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text style={[meta, { flex: 1 }]}>{`${FEEDBACK_MESSAGE_MIN} to ${FEEDBACK_MESSAGE_MAX} characters. Please leave out passwords and private details.`}</Text>
              <Text importantForAccessibility="no" style={meta}>{`${state.draft.message.length}/${FEEDBACK_MESSAGE_MAX}`}</Text>
            </View>
            {errors.message ? <Text style={errorText}>{errors.message}</Text> : null}
          </View>

          <View style={{ gap: 6 }}>
            <Text style={label}>
              How to reach you <Text style={{ fontFamily: fonts.sans, color: colors.foregroundMuted }}>(optional)</Text>
            </Text>
            <TextInput
              ref={contactRef}
              testID="feedback-contact"
              accessibilityLabel="How to reach you (optional)"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={FEEDBACK_CONTACT_MAX}
              editable={!pending && route.kind !== "unavailable"}
              value={state.draft.contact}
              onChangeText={(value) => dispatch({ type: "edit", field: "contact", value })}
              style={input(!!errors.contact)}
            />
            <Text style={meta}>An email or handle, if you’d like a reply. Only the developer sees it.</Text>
            {errors.contact ? <Text style={errorText}>{errors.contact}</Text> : null}
          </View>

          {state.status === "failed" ? (
            <Text accessibilityRole="alert" style={errorText}>
              Your feedback couldn’t be sent. It’s still here, so you can try again.
            </Text>
          ) : null}
          <Text accessibilityLiveRegion="polite" style={state.status === "sent" ? { fontFamily: fonts.sansMedium, fontSize: 0.8 * REM, color: colors.foreground } : { height: 0 }}>
            {state.status === "sent" ? "Thanks! Your feedback was sent." : pending ? "Sending feedback…" : ""}
          </Text>

          <Button
            variant="secondary"
            testID="feedback-send"
            label={pending ? "Sending…" : "Send feedback"}
            busy={pending}
            disabled={route.kind === "unavailable"}
            style={{ alignSelf: "flex-start" }}
            onPress={() => void submit()}
          />
        </View>
      </SettingsCard>
      {route.kind === "unavailable" ? (
        <SettingsCard label="Email">
          <CardHeader title="Send it by email" meta={SUPPORT_EMAIL} />
          <View style={{ paddingBottom: 6 }}>
            <Button
              variant="secondary"
              icon="envelope"
              label="Email feedback"
              accessibilityHint={`Writes to ${SUPPORT_EMAIL}`}
              style={{ alignSelf: "flex-start" }}
              onPress={() => void openExternal(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Verse Together app${version ? ` ${version}` : ""}`)}`)}
            />
          </View>
        </SettingsCard>
      ) : null}
    </View>
  );
}
