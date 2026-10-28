require("react-native-gesture-handler/jestSetup");
// Study data lives in an in-memory store during tests (the app uses SQLite through expo-sqlite/kv-store).
const { setStoragePort, memoryStorage } = require("./src/storage/kv");
setStoragePort(memoryStorage());
// expo-image's native view isn't available under Jest; a plain View with the same accessibility stands in.
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  const React = require("react");
  return { Image: (props) => React.createElement(View, { accessibilityLabel: props.accessibilityLabel, testID: props.testID }) };
});
// Icon fonts load through expo-asset, which has no registry under Jest; render the glyph name instead.
jest.mock("@expo/vector-icons/FontAwesome6", () => {
  const { Text } = require("react-native");
  const React = require("react");
  const Icon = (props) => React.createElement(Text, { accessible: false }, props.name);
  Icon.font = {};
  return { __esModule: true, default: Icon };
});
// Chapter swipes use a gesture-handler Pan gesture backed by Reanimated, which has no native runtime under Jest.
jest.mock("react-native-gesture-handler", () => {
  const actual = jest.requireActual("react-native-gesture-handler");
  const chain = () => new Proxy({}, { get: (_target, _key, proxy) => () => proxy });
  return { ...actual, GestureDetector: ({ children }) => children, Gesture: { Pan: chain } };
});
// The native scripture text (modules/scripture-text) has no native runtime under Jest. A host element stands in for
// it with the same props and events, so route tests drive selections through the view's real onSelectionChange
// payload (UTF-16 offsets into its text). This is a mocked bridge: it verifies the app's mapping, state and actions,
// not Android's or iOS's long-press and handle gestures. Calls to the view's functions are recorded on
// `nativeCalls`.
jest.mock("./modules/scripture-text", () => {
  const React = require("react");
  const nativeCalls = [];
  const NativeScriptureText = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      clearSelection: async () => void nativeCalls.push({ testID: props.testID, call: "clearSelection" }),
      setSelection: async (start, end) => void nativeCalls.push({ testID: props.testID, call: "setSelection", start, end }),
      offsetTop: async (offset) => {
        nativeCalls.push({ testID: props.testID, call: "offsetTop", offset });
        return offset;
      },
    }));
    return React.createElement("ScriptureTextView", props);
  });
  return { NativeScriptureText, nativeCalls };
});
