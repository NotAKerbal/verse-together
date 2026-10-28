package org.versetogether.scripturetext

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Build
import android.text.Layout
import android.text.Selection
import android.text.Spannable
import android.text.SpannableString
import android.text.Spanned
import android.text.TextPaint
import android.text.style.LineHeightSpan
import android.text.style.MetricAffectingSpan
import android.util.TypedValue
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.widget.ScrollView
import android.widget.TextView
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * A styled stretch of the text: its face, size (sp), color (ARGB), tracking (em) and Typeface style (bold, italic;
 * NORMAL keeps the named face exactly as it resolves).
 */
data class TextRun(
  val start: Int,
  val end: Int,
  val font: String,
  val size: Float,
  val color: Int,
  val letterSpacing: Float = 0f,
  val style: Int = Typeface.NORMAL,
)

/** A paragraph (its range includes its closing line break): line height (sp) and the space after its last line (dp). */
data class TextParagraph(val start: Int, val end: Int, val lineHeight: Float, val spacingAfter: Float)

/** A highlight (behind the words) or an underline (beneath them) on an exact range, in its own color. */
data class TextMark(val start: Int, val end: Int, val underline: Boolean, val color: Int)

/**
 * Something drawn around whole lines: a box behind them (a note card, a verse flash) reaching `outsetX` past the
 * text on each side, or a vertical rule at `x` (dp from the text's left edge, negative into the padding).
 */
data class TextDecoration(
  val start: Int,
  val end: Int,
  val rule: Boolean,
  val fill: Int,
  val stroke: Int = Color.TRANSPARENT,
  val strokeWidth: Float = 0f,
  val radius: Float = 0f,
  val x: Float = 0f,
  val width: Float = 0f,
  val outsetX: Float = 0f,
  val outsetTop: Float = 0f,
  val outsetBottom: Float = 0f,
)

data class TextContent(val text: String, val runs: List<TextRun>, val paragraphs: List<TextParagraph>) {
  companion object {
    val EMPTY = TextContent("", emptyList(), emptyList())
  }
}

internal class RunSpan(val typeface: Typeface, val sizePx: Float, val color: Int, val letterSpacing: Float) : MetricAffectingSpan() {
  override fun updateDrawState(paint: TextPaint) {
    apply(paint)
    paint.color = color
  }

  override fun updateMeasureState(paint: TextPaint) = apply(paint)

  private fun apply(paint: TextPaint) {
    paint.typeface = typeface
    paint.textSize = sizePx
    paint.letterSpacing = letterSpacing
  }
}

/** A fixed line height (centred as React Native's lineHeight is), and extra space below the paragraph's last line. */
internal class ParagraphSpan(val lineHeightPx: Int, val spacingAfterPx: Int) : LineHeightSpan {
  override fun chooseHeight(text: CharSequence, start: Int, end: Int, spanstartv: Int, lineHeight: Int, fm: Paint.FontMetricsInt) {
    val extra = lineHeightPx - (fm.descent - fm.ascent)
    if (extra != 0) {
      fm.ascent -= ceil(extra / 2.0).toInt()
      fm.descent += floor(extra / 2.0).toInt()
    }
    fm.top = fm.ascent
    fm.bottom = fm.descent
    if (spacingAfterPx > 0 && text is Spanned && end >= text.getSpanEnd(this)) {
      fm.descent += spacingAfterPx
      fm.bottom += spacingAfterPx
    }
  }
}

/**
 * Scripture as one selectable, read-only text: the reader can long-press a word and drag Android's own selection
 * handles across verses. Selection changes the reader makes are reported (normalized, start <= end); changes made
 * here (new text, a restored or cleared selection) are not, so a re-render never reads as the reader's selection.
 *
 * Marks and decorations are drawn over the laid-out text instead of being spans, so putting a mark on or taking it
 * off never touches the text or its selection.
 */
class ScriptureTextWidget(
  context: Context,
  private val resolveFont: (String) -> Typeface = ::systemTypeface,
) : TextView(context) {
  fun interface SelectionListener {
    fun onSelectionChange(start: Int, end: Int)
  }

  var selectionListener: SelectionListener? = null

  /** A plain tap on the text (not a long press, a drag, or a tap that ends a selection): the character under it. */
  fun interface PressListener {
    fun onPress(offset: Int)
  }

  var pressListener: PressListener? = null

  var content: TextContent = TextContent.EMPTY
    private set
  var marks: List<TextMark> = emptyList()
    private set
  var decorations: List<TextDecoration> = emptyList()
    private set

  private var programmatic = 0
  private var reportedStart = -1
  private var reportedEnd = -1
  private var runStarts = IntArray(0)
  private var runMetrics: List<Paint.FontMetrics> = emptyList()
  private var runSizes = FloatArray(0)
  private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val rect = RectF()
  private val clip = Rect()
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var pressCandidate = false
  private var pressX = 0f
  private var pressY = 0f

  /** The menu the selection opens is the app's own; Android's toolbar is emptied but the selection and its handles stay. */
  val selectionCallback = object : ActionMode.Callback {
    override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
      menu.clear()
      return true
    }

    override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean {
      menu.clear()
      return true
    }

    override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean = false

    override fun onDestroyActionMode(mode: ActionMode) {}
  }

  init {
    setTextIsSelectable(true)
    showSoftInputOnFocus = false
    includeFontPadding = false
    isCursorVisible = false
    isVerticalScrollBarEnabled = false
    isHorizontalScrollBarEnabled = false
    setBackgroundColor(Color.TRANSPARENT)
    setPadding(0, 0, 0, 0)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      breakStrategy = Layout.BREAK_STRATEGY_HIGH_QUALITY
      hyphenationFrequency = Layout.HYPHENATION_FREQUENCY_NONE
    }
    customSelectionActionModeCallback = selectionCallback
    setText(SpannableString(""), BufferType.SPANNABLE)
  }

  private val density get() = resources.displayMetrics.density

  private fun dp(value: Float) = value * density

  private fun sp(value: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, value, resources.displayMetrics)

  private inline fun quietly(block: () -> Unit) {
    programmatic++
    try {
      block()
    } finally {
      programmatic--
      reportedStart = min(selectionStart, selectionEnd)
      reportedEnd = max(selectionStart, selectionEnd)
    }
  }

  /** The text and its styles. The same text keeps the reader's selection; new text starts without one. */
  fun setContent(next: TextContent) {
    if (next == content) return
    val keep = next.text == content.text && hasSelection()
    val start = selectionStart
    val end = selectionEnd
    content = next
    val spannable = SpannableString(next.text)
    val length = next.text.length
    val starts = ArrayList<Int>()
    val metrics = ArrayList<Paint.FontMetrics>()
    val sizes = ArrayList<Float>()
    val measure = TextPaint(Paint.ANTI_ALIAS_FLAG)
    for (run in next.runs.sortedBy { it.start }) {
      val from = run.start.coerceIn(0, length)
      val to = run.end.coerceIn(0, length)
      if (from >= to) continue
      val face = resolveFont(run.font)
      val span = RunSpan(if (run.style == Typeface.NORMAL) face else Typeface.create(face, run.style), sp(run.size), run.color, run.letterSpacing)
      spannable.setSpan(span, from, to, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
      measure.typeface = span.typeface
      measure.textSize = span.sizePx
      starts.add(from)
      metrics.add(measure.fontMetrics)
      sizes.add(span.sizePx)
    }
    runStarts = starts.toIntArray()
    runMetrics = metrics
    runSizes = sizes.toFloatArray()
    for (paragraph in next.paragraphs) {
      val from = paragraph.start.coerceIn(0, length)
      val to = paragraph.end.coerceIn(0, length)
      if (from >= to) continue
      spannable.setSpan(ParagraphSpan(sp(paragraph.lineHeight).toInt(), dp(paragraph.spacingAfter).toInt()), from, to, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
    quietly {
      setText(spannable, BufferType.SPANNABLE)
      if (keep && end <= length) Selection.setSelection(text as Spannable, start, end)
    }
    requestLayout()
    invalidate()
  }

  fun setMarks(next: List<TextMark>) {
    if (next == marks) return
    marks = next
    invalidate()
  }

  fun setDecorations(next: List<TextDecoration>) {
    if (next == decorations) return
    decorations = next
    invalidate()
  }

  /** Horizontal room around the text (dp), which note cards and the reading rule draw into. */
  fun setTextInset(left: Float, right: Float) {
    setPadding(dp(left).toInt(), 0, dp(right).toInt(), 0)
  }

  /** Selects a range without reporting it (the app already knows it): restoring a selection after new text. */
  fun select(start: Int, end: Int) {
    val buffer = text as? Spannable ?: return
    val from = start.coerceIn(0, buffer.length)
    val to = end.coerceIn(0, buffer.length)
    if (from >= to) return
    quietly { Selection.setSelection(buffer, from, to) }
  }

  /** Clears the selection and its handles without reporting it (the app cleared its own first). */
  fun clearSelection() {
    val buffer = text as? Spannable ?: return
    quietly {
      Selection.removeSelection(buffer)
      if (hasFocus()) clearFocus()
    }
  }

  /** The top of the line holding a text offset, in dp from this view's top, or -1 before layout. */
  fun offsetTop(offset: Int): Double {
    val layout = layout ?: return -1.0
    val line = layout.getLineForOffset(offset.coerceIn(0, text.length))
    return ((layout.getLineTop(line) + totalPaddingTop) / density).toDouble()
  }

  override fun onSelectionChanged(selStart: Int, selEnd: Int) {
    super.onSelectionChanged(selStart, selEnd)
    if (programmatic > 0) return
    val start = min(selStart, selEnd)
    val end = max(selStart, selEnd)
    if (start == reportedStart && end == reportedEnd) return
    reportedStart = start
    reportedEnd = end
    selectionListener?.onSelectionChange(start, end)
  }

  /**
   * Taking focus (a long press does, to select) must not scroll the page: a scroll view brings a newly focused child
   * wholly into view, which would jump a passage under the reader's finger. Its scroll position is kept; scrolling to
   * follow a dragged handle (requestRectangleOnScreen) is unaffected.
   */
  override fun requestFocus(direction: Int, previouslyFocusedRect: Rect?): Boolean {
    if (isFocused) return super.requestFocus(direction, previouslyFocusedRect)
    val scrollers = ArrayList<Pair<View, Int>>()
    var ancestor = parent
    while (ancestor is View) {
      if (ancestor is ScrollView) scrollers.add(ancestor to ancestor.scrollY)
      ancestor = ancestor.parent
    }
    val focused = super.requestFocus(direction, previouslyFocusedRect)
    for ((scroller, y) in scrollers) if (scroller.scrollY != y) scroller.scrollTo(scroller.scrollX, y)
    return focused
  }

  /**
   * A long press starts a word selection: from then until the finger lifts, the drag is the selection's, never the
   * scroll view's or the chapter swipe's (gesture handler cancels its handlers when a native view claims the touch).
   */
  override fun performLongClick(): Boolean {
    pressCandidate = false
    val handled = super.performLongClick()
    if (hasSelection()) parent?.requestDisallowInterceptTouchEvent(true)
    return handled
  }

  /**
   * A plain tap is reported (pressListener) after Android has handled the touch as before, so selecting, the handles,
   * the scroll view and the chapter swipe behave exactly as they did. It isn't a press when the text had a selection
   * as the finger went down (that tap ends the selection), when it became a long press, when the finger moved past
   * the touch slop, when the touch was cancelled (a scroll view took it), or when it was held past the long-press
   * timeout.
   */
  override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        pressCandidate = pressListener != null && !hasSelection()
        pressX = event.x
        pressY = event.y
      }
      MotionEvent.ACTION_MOVE -> if (abs(event.x - pressX) > touchSlop || abs(event.y - pressY) > touchSlop) pressCandidate = false
      MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_POINTER_DOWN -> pressCandidate = false
    }
    val handled = super.onTouchEvent(event)
    if (event.actionMasked == MotionEvent.ACTION_UP) {
      val press = pressCandidate && !hasSelection() && event.eventTime - event.downTime < ViewConfiguration.getLongPressTimeout()
      pressCandidate = false
      if (press) {
        val offset = offsetAt(event.x, event.y)
        if (offset >= 0) pressListener?.onPress(offset)
      }
    }
    return handled
  }

  /**
   * The UTF-16 offset of the character under a point in this view (px, from its top left), or -1 where there is none:
   * before layout, empty text, the padding, past either end of a line, or below the last line. A point on a surrogate
   * pair's second half is its first half's offset.
   */
  fun offsetAt(x: Float, y: Float): Int {
    val layout = layout ?: return -1
    val length = text.length
    if (length == 0) return -1
    val localX = x - totalPaddingLeft + scrollX
    val localY = y - totalPaddingTop + scrollY
    if (localY < 0 || localY >= layout.height) return -1
    val line = layout.getLineForVertical(localY.toInt())
    val lineStart = layout.getLineStart(line)
    var lineEnd = layout.getLineEnd(line)
    while (lineEnd > lineStart && text[lineEnd - 1] == '\n') lineEnd--
    if (lineEnd <= lineStart) return -1
    if (localX < layout.getLineLeft(line) || localX > layout.getLineRight(line)) return -1
    var offset = layout.getOffsetForHorizontal(line, localX).coerceIn(lineStart, lineEnd)
    // The nearest caret position may be after the character the point is on.
    if (offset > lineStart && (offset == lineEnd || layout.getPrimaryHorizontal(offset) > localX)) offset--
    if (offset > 0 && Character.isLowSurrogate(text[offset]) && Character.isHighSurrogate(text[offset - 1])) offset--
    return offset
  }

  override fun onDraw(canvas: Canvas) {
    val layout = layout
    if (layout == null || (marks.isEmpty() && decorations.isEmpty())) {
      super.onDraw(canvas)
      return
    }
    canvas.getClipBounds(clip)
    canvas.save()
    canvas.translate(totalPaddingLeft.toFloat(), totalPaddingTop.toFloat())
    val top = clip.top - totalPaddingTop
    val bottom = clip.bottom - totalPaddingTop
    for (decoration in decorations) drawDecoration(canvas, layout, decoration, top, bottom)
    for (mark in marks) if (!mark.underline) drawMark(canvas, layout, mark, top, bottom)
    canvas.restore()
    super.onDraw(canvas)
    canvas.save()
    canvas.translate(totalPaddingLeft.toFloat(), totalPaddingTop.toFloat())
    for (mark in marks) if (mark.underline) drawMark(canvas, layout, mark, top, bottom)
    canvas.restore()
  }

  private fun runIndexAt(offset: Int): Int {
    var low = 0
    var high = runStarts.size - 1
    var found = -1
    while (low <= high) {
      val mid = (low + high) ushr 1
      if (runStarts[mid] <= offset) {
        found = mid
        low = mid + 1
      } else high = mid - 1
    }
    return found
  }

  private fun drawMark(canvas: Canvas, layout: Layout, mark: TextMark, clipTop: Int, clipBottom: Int) {
    val text = text
    val start = mark.start.coerceIn(0, text.length)
    val end = mark.end.coerceIn(0, text.length)
    if (start >= end) return
    fillPaint.color = mark.color
    for (line in layout.getLineForOffset(start)..layout.getLineForOffset(end)) {
      if (layout.getLineBottom(line) < clipTop || layout.getLineTop(line) > clipBottom) continue
      val lineStart = layout.getLineStart(line)
      val lineEnd = layout.getLineEnd(line)
      val from = max(start, lineStart)
      var to = min(end, lineEnd)
      while (to > from && text[to - 1] == '\n') to--
      if (to <= from) continue
      val left = layout.getPrimaryHorizontal(from)
      val right = if (to == lineEnd && line < layout.lineCount - 1) layout.getLineRight(line) else layout.getPrimaryHorizontal(to)
      val run = runIndexAt(from)
      val size = if (run >= 0) runSizes[run] else textSize
      val baseline = layout.getLineBaseline(line).toFloat()
      if (mark.underline) {
        // .verse-mark's underline: max(1.5px, 0.08em) thick, 0.22em below the baseline.
        val y = baseline + size * 0.22f
        rect.set(min(left, right), y, max(left, right), y + max(dp(1.5f), size * 0.08f))
        canvas.drawRect(rect, fillPaint)
      } else {
        val metrics = if (run >= 0) runMetrics[run] else paint.fontMetrics
        rect.set(min(left, right), baseline + metrics.ascent, max(left, right), baseline + metrics.descent)
        canvas.drawRoundRect(rect, size * 0.15f, size * 0.15f, fillPaint)
      }
    }
  }

  private fun spacingBelow(layout: Layout, line: Int): Int {
    val buffer = text as? Spanned ?: return 0
    val lineEnd = layout.getLineEnd(line)
    return buffer.getSpans(layout.getLineStart(line), lineEnd, ParagraphSpan::class.java)
      .filter { lineEnd >= buffer.getSpanEnd(it) }
      .maxOfOrNull { it.spacingAfterPx } ?: 0
  }

  private fun drawDecoration(canvas: Canvas, layout: Layout, decoration: TextDecoration, clipTop: Int, clipBottom: Int) {
    val length = text.length
    val start = decoration.start.coerceIn(0, length)
    val end = decoration.end.coerceIn(0, length)
    if (start >= end) return
    val first = layout.getLineForOffset(start)
    val last = layout.getLineForOffset(max(start, end - 1))
    val top = layout.getLineTop(first) - dp(decoration.outsetTop)
    val bottom = layout.getLineBottom(last) - spacingBelow(layout, last) + dp(decoration.outsetBottom)
    if (bottom < clipTop || top > clipBottom) return
    if (decoration.rule) {
      val x = dp(decoration.x)
      rect.set(x, top, x + dp(decoration.width), bottom)
    } else {
      rect.set(-dp(decoration.outsetX), top, layout.width + dp(decoration.outsetX), bottom)
    }
    val radius = dp(decoration.radius)
    if (Color.alpha(decoration.fill) > 0) {
      fillPaint.color = decoration.fill
      canvas.drawRoundRect(rect, radius, radius, fillPaint)
    }
    if (decoration.strokeWidth > 0 && Color.alpha(decoration.stroke) > 0) {
      val half = dp(decoration.strokeWidth) / 2
      strokePaint.color = decoration.stroke
      strokePaint.strokeWidth = dp(decoration.strokeWidth)
      rect.inset(half, half)
      canvas.drawRoundRect(rect, radius, radius, strokePaint)
    }
  }

  companion object {
    fun systemTypeface(name: String): Typeface = when (name) {
      "serif" -> Typeface.SERIF
      "monospace" -> Typeface.MONOSPACE
      else -> Typeface.DEFAULT
    }
  }
}
