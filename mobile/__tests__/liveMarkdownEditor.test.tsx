import { act, render, screen } from "@testing-library/react-native";
import LiveMarkdownEditor from "../src/features/journal/LiveMarkdownEditor";
import { ThemeProvider } from "../src/theme/theme";
import { darkColors } from "../src/theme/tokens";

jest.mock("../src/features/journal/LiveMarkdownEditorDOM", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: (props: object) => React.createElement("MarkdownBridge", { ...props, testID: "markdown-bridge" }),
  };
});

it("acknowledges edits and refuses stale or duplicate bridge messages", async () => {
  const onChangeText = jest.fn();
  const onBlur = jest.fn();
  await render(<LiveMarkdownEditor value="Original" onChangeText={onChangeText} onBlur={onBlur} />);
  await act(async () => {
    await screen.getByTestId("markdown-bridge").props.onEdit("**Newest**", 2);
  });
  expect(onChangeText).toHaveBeenLastCalledWith("**Newest**");
  expect(screen.getByTestId("markdown-bridge").props.acknowledgedSequence).toBe(2);
  await act(async () => {
    await screen.getByTestId("markdown-bridge").props.onEdit("Old", 1);
    await screen.getByTestId("markdown-bridge").props.onEdit("Duplicate", 2);
    await screen.getByTestId("markdown-bridge").props.onBlur();
  });
  expect(onChangeText).toHaveBeenCalledTimes(1);
  expect(onBlur).toHaveBeenCalledTimes(1);
});

it("forwards external updates and the current theme without resetting its acknowledgment", async () => {
  const props = { onChangeText: jest.fn(), onBlur: jest.fn() };
  const view = await render(<ThemeProvider scheme="light"><LiveMarkdownEditor {...props} value="Original" /></ThemeProvider>);
  await act(async () => {
    await screen.getByTestId("markdown-bridge").props.onEdit("Local", 1);
  });
  await view.rerender(
    <ThemeProvider scheme="dark"><LiveMarkdownEditor {...props} value="# Updated elsewhere" /></ThemeProvider>,
  );
  expect(screen.getByTestId("markdown-bridge").props).toMatchObject({
    value: "# Updated elsewhere",
    acknowledgedSequence: 1,
    colors: { foreground: darkColors.foreground },
  });
});
