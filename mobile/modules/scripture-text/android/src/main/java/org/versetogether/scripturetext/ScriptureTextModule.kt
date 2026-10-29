package org.versetogether.scripturetext

import android.graphics.Typeface
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** Colors arrive as React Native's processColor numbers (ARGB; signed on Android, unsigned on iOS). */
internal fun argb(value: Double?): Int = value?.toLong()?.toInt() ?: 0

/** A run's optional style as a Typeface style; absent or unknown is NORMAL (the face exactly as named). */
internal fun typefaceStyle(style: String?): Int = when (style) {
  "bold" -> Typeface.BOLD
  "italic" -> Typeface.ITALIC
  "boldItalic" -> Typeface.BOLD_ITALIC
  else -> Typeface.NORMAL
}

class RunRecord : Record {
  @Field val start: Int = 0
  @Field val end: Int = 0
  @Field val font: String = "serif"
  @Field val size: Double = 16.0
  @Field val color: Double = 0.0
  @Field val letterSpacing: Double = 0.0
  /** "bold", "italic" or "boldItalic"; absent (or anything else): the face as named. */
  @Field val style: String? = null
  /** Struck through (KJV wording the JST leaves out); absent: not. */
  @Field val strikethrough: Boolean = false

  fun toRun() = TextRun(start, end, font, size.toFloat(), argb(color), letterSpacing.toFloat(), typefaceStyle(style), strikethrough)
}

class ParagraphRecord : Record {
  @Field val start: Int = 0
  @Field val end: Int = 0
  @Field val lineHeight: Double = 28.0
  @Field val spacingAfter: Double = 0.0

  fun toParagraph() = TextParagraph(start, end, lineHeight.toFloat(), spacingAfter.toFloat())
}

class ContentRecord : Record {
  @Field val text: String = ""
  @Field val runs: List<RunRecord> = emptyList()
  @Field val paragraphs: List<ParagraphRecord> = emptyList()

  fun toContent() = TextContent(text, runs.map { it.toRun() }, paragraphs.map { it.toParagraph() })
}

class MarkRecord : Record {
  @Field val start: Int = 0
  @Field val end: Int = 0
  @Field val kind: String = "highlight"
  @Field val color: Double = 0.0

  fun toMark() = TextMark(start, end, kind == "underline", argb(color))
}

class DecorationRecord : Record {
  @Field val start: Int = 0
  @Field val end: Int = 0
  @Field val kind: String = "box"
  @Field val fill: Double = 0.0
  @Field val stroke: Double = 0.0
  @Field val strokeWidth: Double = 0.0
  @Field val radius: Double = 0.0
  @Field val x: Double = 0.0
  @Field val width: Double = 0.0
  @Field val outsetX: Double = 0.0
  @Field val outsetTop: Double = 0.0
  @Field val outsetBottom: Double = 0.0

  fun toDecoration() = TextDecoration(
    start, end, kind == "rule", argb(fill), argb(stroke), strokeWidth.toFloat(), radius.toFloat(), x.toFloat(), width.toFloat(),
    outsetX.toFloat(), outsetTop.toFloat(), outsetBottom.toFloat(),
  )
}

class ScriptureTextModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ScriptureText")

    View(ScriptureTextView::class) {
      Events("onSelectionChange", "onContentSizeChange", "onTextPress")

      Prop("content") { view: ScriptureTextView, content: ContentRecord? ->
        view.widget.setContent(content?.toContent() ?: TextContent.EMPTY)
      }
      Prop("marks") { view: ScriptureTextView, marks: List<MarkRecord>? ->
        view.widget.setMarks(marks.orEmpty().map { it.toMark() })
      }
      Prop("decorations") { view: ScriptureTextView, decorations: List<DecorationRecord>? ->
        view.widget.setDecorations(decorations.orEmpty().map { it.toDecoration() })
      }
      Prop("selectionColor") { view: ScriptureTextView, color: Double? ->
        if (color != null) view.widget.highlightColor = argb(color)
      }
      Prop("textInset") { view: ScriptureTextView, inset: List<Double>? ->
        view.widget.setTextInset(inset?.getOrNull(0)?.toFloat() ?: 0f, inset?.getOrNull(1)?.toFloat() ?: 0f)
      }

      AsyncFunction("clearSelection") { view: ScriptureTextView ->
        view.widget.clearSelection()
      }
      AsyncFunction("setSelection") { view: ScriptureTextView, start: Int, end: Int ->
        view.widget.select(start, end)
      }
      AsyncFunction("offsetTop") { view: ScriptureTextView, offset: Int ->
        view.widget.offsetTop(offset)
      }
    }
  }
}
