import { act, fireEvent, render, screen } from "@testing-library/react-native";
import LiveMarkdownEditorContent from "../src/features/journal/LiveMarkdownEditorContent";
import { lightColors } from "../src/theme/tokens";

jest.mock("../src/features/journal/LiveMarkdownEditor.css", () => ({}));
jest.mock("../../src/features/notes/MarkdownEditor", () => {
  const React = require("react");
  const { TextInput } = require("react-native");
  return {
    __esModule: true,
    default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
      React.createElement(TextInput, { value, onChangeText: onChange, testID: "web-editor" }),
  };
});

it("keeps newer local typing through older native echoes, then accepts an external update", async () => {
  const onEdit = jest.fn(async () => {});
  const props = { colors: lightColors, onEdit, onBlur: jest.fn(async () => {}), autoFocus: false };
  const initial = "**[Jeremiah 36:5](</browse/oldtestament/jeremiah/36#v-5>)**\n> Quoted text\n\n";
  const view = await render(<LiveMarkdownEditorContent {...props} value={initial} acknowledgedSequence={0} />);
  await act(async () => {
    fireEvent.changeText(screen.getByTestId("web-editor"), `${initial}One`);
    fireEvent.changeText(screen.getByTestId("web-editor"), `${initial}One more`);
  });
  expect(onEdit.mock.calls).toEqual([[`${initial}One`, 1], [`${initial}One more`, 2]]);
  await view.rerender(<LiveMarkdownEditorContent {...props} value={`${initial}One`} acknowledgedSequence={1} />);
  expect(screen.getByTestId("web-editor").props.value).toBe(`${initial}One more`);
  await view.rerender(<LiveMarkdownEditorContent {...props} value={`${initial}One more`} acknowledgedSequence={2} />);
  expect(screen.getByTestId("web-editor").props.value).toBe(`${initial}One more`);
  await view.rerender(<LiveMarkdownEditorContent {...props} value="# Updated elsewhere" acknowledgedSequence={2} />);
  expect(screen.getByTestId("web-editor").props.value).toBe("# Updated elsewhere");
  expect(onEdit).toHaveBeenCalledTimes(2);
});

it("waits for pending edits to reach native before flushing on blur", async () => {
  let acknowledge!: () => void;
  const onEdit = jest.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; }));
  const onBlur = jest.fn(async () => {});
  await render(<LiveMarkdownEditorContent value="Before" acknowledgedSequence={0} colors={lightColors} autoFocus={false} onEdit={onEdit} onBlur={onBlur} />);
  await act(async () => {
    fireEvent.changeText(screen.getByTestId("web-editor"), "After");
    screen.root!.props.onBlurCapture({
      currentTarget: { contains: () => false }, relatedTarget: null,
    });
  });
  expect(onBlur).not.toHaveBeenCalled();
  await act(async () => { acknowledge(); });
  expect(onBlur).toHaveBeenCalledTimes(1);
});
