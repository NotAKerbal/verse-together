import { useRef, useState } from "react";
import { View } from "react-native";
import { useTheme } from "../../theme/theme";
import LiveMarkdownEditorDOM from "./LiveMarkdownEditorDOM";

export default function LiveMarkdownEditor({ value, onChangeText, onBlur, autoFocus = false }: {
  value: string;
  onChangeText: (value: string) => void;
  onBlur: () => void;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const [acknowledgedSequence, setAcknowledgedSequence] = useState(0);
  const latestSequence = useRef(0);

  return (
    <View style={{ height: 300, borderRadius: 10, borderWidth: 1, borderColor: colors.surfaceBorder, overflow: "hidden", backgroundColor: colors.inputSurface }}>
      <LiveMarkdownEditorDOM
        value={value}
        acknowledgedSequence={acknowledgedSequence}
        colors={colors}
        autoFocus={autoFocus}
        onEdit={async (next, sequence) => {
          if (sequence <= latestSequence.current) return;
          latestSequence.current = sequence;
          onChangeText(next);
          setAcknowledgedSequence(sequence);
        }}
        onBlur={async () => onBlur()}
        dom={{
          style: { height: 300, backgroundColor: colors.inputSurface },
          scrollEnabled: false,
        }}
      />
    </View>
  );
}
