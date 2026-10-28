// The native scripture text view (android/…/ScriptureTextView.kt, ios/ScriptureTextView.swift): one selectable,
// read-only text with the platform's own word selection and handles, exact-range marks drawn over it, and the
// reader's selection reported as UTF-16 offsets into `content.text`. It is custom native code, so it needs a
// development or release build of this app (Expo Go can't load it).

import { requireNativeView } from "expo";
import type { ComponentType, Ref } from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";

/**
 * A styled stretch: face, size and color (processColor), tracking in em, and an optional style merged into the face
 * (Android Typeface.create, iOS symbolic traits); without it the face is used exactly as named.
 */
export type NativeRun = { start: number; end: number; font: string; size: number; color: number; letterSpacing?: number; style?: "bold" | "italic" | "boldItalic" };
/** A paragraph, its closing line break included: line height and the space after its last line. */
export type NativeParagraph = { start: number; end: number; lineHeight: number; spacingAfter: number };
export type NativeContent = { text: string; runs: NativeRun[]; paragraphs: NativeParagraph[] };
export type NativeMark = { start: number; end: number; kind: "highlight" | "underline"; color: number };
/** A box behind whole lines (outset past the text), or a vertical rule at `x` (from the text's left edge). */
export type NativeDecoration = {
  start: number;
  end: number;
  kind: "box" | "rule";
  fill: number;
  stroke?: number;
  strokeWidth?: number;
  radius?: number;
  x?: number;
  width?: number;
  outsetX?: number;
  outsetTop?: number;
  outsetBottom?: number;
};

export type NativeSelectionEvent = NativeSyntheticEvent<{ start: number; end: number }>;
export type NativeContentSizeEvent = NativeSyntheticEvent<{ height: number }>;
/** A plain tap on the text: the UTF-16 offset of the character under it (a surrogate pair's first half). */
export type NativeTextPressEvent = NativeSyntheticEvent<{ offset: number }>;

export type NativeScriptureTextProps = ViewProps & {
  content: NativeContent;
  marks: NativeMark[];
  decorations: NativeDecoration[];
  selectionColor?: number;
  /** Room left and right of the text, which note cards and the reading rule draw into. */
  textInset?: [number, number];
  onSelectionChange?: (event: NativeSelectionEvent) => void;
  onContentSizeChange?: (event: NativeContentSizeEvent) => void;
  /** Not sent for a long press, a drag, a cancelled touch, or a tap that ends a selection. */
  onTextPress?: (event: NativeTextPressEvent) => void;
};

/** The view's functions, on its ref. */
export type NativeScriptureTextHandle = {
  clearSelection(): Promise<void>;
  setSelection(start: number, end: number): Promise<void>;
  /** The top of the line holding an offset, from the view's top (-1 before layout). */
  offsetTop(offset: number): Promise<number>;
};

export const NativeScriptureText = requireNativeView<NativeScriptureTextProps>("ScriptureText") as ComponentType<
  NativeScriptureTextProps & { ref?: Ref<NativeScriptureTextHandle> }
>;
