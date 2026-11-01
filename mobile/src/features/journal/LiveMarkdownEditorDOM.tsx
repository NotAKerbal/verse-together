"use dom";

import LiveMarkdownEditorContent, { type LiveMarkdownEditorProps } from "./LiveMarkdownEditorContent";

export default function LiveMarkdownEditorDOM(props: LiveMarkdownEditorProps) {
  return <LiveMarkdownEditorContent {...props} />;
}
