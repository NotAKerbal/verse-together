package org.versetogether.scripturetext

import android.graphics.Color
import android.os.SystemClock
import android.text.Selection
import android.text.Spannable
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Plain taps on the text (onTextPress): the character under a point, in UTF-16 offsets, and which touches count as a
 * press. The touches are synthetic MotionEvents through the view's own onTouchEvent; a real finger on a device isn't
 * tested here.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
// Real text measurement (glyph widths, line wrapping): the legacy shadows measure no text.
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ScriptureTextPressTest {
  private lateinit var widget: ScriptureTextWidget
  private val presses = mutableListOf<Int>()
  private val selections = mutableListOf<Pair<Int, Int>>()

  // Long enough to wrap at the width below; an emoji (a surrogate pair) at 11..12.
  private val text = "Read this 😀 and remember the covenant that the Lord made with his people in the wilderness.\nNext line."

  private fun layOut(width: Int, inset: Float = 0f, content: String = text) {
    widget.setContent(TextContent(content, listOf(TextRun(0, content.length, "serif", 16f, Color.BLACK)), listOf(TextParagraph(0, content.length, 26f, 0f))))
    widget.setTextInset(inset, inset)
    widget.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
    widget.layout(0, 0, width, widget.measuredHeight)
  }

  @Before
  fun setUp() {
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    widget = ScriptureTextWidget(context)
    // In a parent, as in the app (a long press shows its menu through the parent).
    FrameLayout(context).addView(widget, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    widget.pressListener = ScriptureTextWidget.PressListener { presses.add(it) }
    widget.selectionListener = ScriptureTextWidget.SelectionListener { start, end -> selections.add(start to end) }
    layOut(400)
  }

  /** A point over the middle of the character at `offset`, in the view's coordinates. */
  private fun pointOn(offset: Int): Pair<Float, Float> {
    val layout = widget.layout
    val line = layout.getLineForOffset(offset)
    val left = layout.getPrimaryHorizontal(offset)
    val next = if (offset + 1 < layout.getLineEnd(line)) layout.getPrimaryHorizontal(offset + 1) else layout.getLineRight(line)
    val x = (left + next) / 2 + widget.totalPaddingLeft
    val y = (layout.getLineTop(line) + layout.getLineBottom(line)) / 2f + widget.totalPaddingTop
    return x to y
  }

  private fun touch(action: Int, x: Float, y: Float, down: Long, at: Long = down): Boolean {
    val event = MotionEvent.obtain(down, at, action, x, y, 0)
    val handled = widget.dispatchTouchEvent(event)
    event.recycle()
    return handled
  }

  private fun tap(x: Float, y: Float, heldFor: Long = 50) {
    val down = SystemClock.uptimeMillis()
    touch(MotionEvent.ACTION_DOWN, x, y, down)
    touch(MotionEvent.ACTION_UP, x, y, down, down + heldFor)
  }

  @Test
  fun findsTheCharacterUnderAPoint() {
    for (offset in listOf(0, 5, 8, 20, 40)) {
      val (x, y) = pointOn(offset)
      assertEquals("offset $offset", offset, widget.offsetAt(x, y))
    }
  }

  @Test
  fun findsCharactersOnWrappedLines() {
    val layout = widget.layout
    assertTrue("the text wraps (${layout.lineCount} lines)", layout.lineCount >= 3)
    val secondLine = layout.getLineStart(1)
    val (x, y) = pointOn(secondLine + 1)
    assertEquals(secondLine + 1, widget.offsetAt(x, y))
    val nextParagraph = text.indexOf("Next")
    val (nx, ny) = pointOn(nextParagraph + 2)
    assertEquals(nextParagraph + 2, widget.offsetAt(nx, ny))
  }

  @Test
  fun aSurrogatePairIsOneCharacterAtItsFirstHalf() {
    val emoji = text.indexOf('\uD83D')
    val (x, y) = pointOn(emoji)
    assertEquals(emoji, widget.offsetAt(x, y))
    // The right half of the glyph is still the pair's first offset, never its low surrogate.
    val layout = widget.layout
    val right = layout.getPrimaryHorizontal(emoji + 2) - 1 + widget.totalPaddingLeft
    assertEquals(emoji, widget.offsetAt(right, y))
  }

  @Test
  fun noCharacterOutsideTheText() {
    layOut(400, inset = 24f)
    val (_, y) = pointOn(3)
    // In the left padding, past the end of the last line, and below the text.
    assertEquals(-1, widget.offsetAt(2f, y))
    val last = widget.layout.lineCount - 1
    val lastY = (widget.layout.getLineTop(last) + widget.layout.getLineBottom(last)) / 2f
    assertEquals(-1, widget.offsetAt(widget.layout.getLineRight(last) + widget.totalPaddingLeft + 20f, lastY))
    assertEquals(-1, widget.offsetAt(10f + widget.totalPaddingLeft, widget.layout.height + 40f))
    assertEquals(-1, widget.offsetAt(10f + widget.totalPaddingLeft, -5f))
    layOut(400, content = "")
    assertEquals(-1, widget.offsetAt(5f, 5f))
  }

  @Test
  fun aPlainTapReportsItsCharacter() {
    val (x, y) = pointOn(20)
    tap(x, y)
    assertEquals(listOf(20), presses)
  }

  @Test
  fun aTapThatEndsASelectionIsNotAPress() {
    Selection.setSelection(widget.text as Spannable, 5, 15)
    val (x, y) = pointOn(30)
    tap(x, y)
    assertTrue("no press while text was selected: $presses", presses.isEmpty())
  }

  @Test
  fun aDragIsNotAPress() {
    val (x, y) = pointOn(20)
    val down = SystemClock.uptimeMillis()
    val slop = ViewConfiguration.get(widget.context).scaledTouchSlop
    touch(MotionEvent.ACTION_DOWN, x, y, down)
    touch(MotionEvent.ACTION_MOVE, x, y + slop * 3, down, down + 20)
    touch(MotionEvent.ACTION_UP, x, y + slop * 3, down, down + 40)
    assertTrue(presses.isEmpty())
  }

  @Test
  fun aCancelledTouchIsNotAPress() {
    val (x, y) = pointOn(20)
    val down = SystemClock.uptimeMillis()
    touch(MotionEvent.ACTION_DOWN, x, y, down)
    touch(MotionEvent.ACTION_CANCEL, x, y, down, down + 20)
    touch(MotionEvent.ACTION_UP, x, y, down, down + 40)
    assertTrue(presses.isEmpty())
  }

  @Test
  fun aLongPressIsNotAPress() {
    val (x, y) = pointOn(20)
    val down = SystemClock.uptimeMillis()
    touch(MotionEvent.ACTION_DOWN, x, y, down)
    widget.performLongClick()
    touch(MotionEvent.ACTION_UP, x, y, down, down + 50)
    assertTrue(presses.isEmpty())
    // Held past the long-press timeout without the long press firing (a slow tap) also isn't one.
    tap(x, y, heldFor = ViewConfiguration.getLongPressTimeout().toLong() + 50)
    assertTrue(presses.isEmpty())
  }

  @Test
  fun aPressNeverReportsASelection() {
    val (x, y) = pointOn(20)
    tap(x, y)
    assertEquals(listOf(20), presses)
    assertTrue("a tap selects nothing: $selections", selections.all { (start, end) -> start == end })
  }
}
