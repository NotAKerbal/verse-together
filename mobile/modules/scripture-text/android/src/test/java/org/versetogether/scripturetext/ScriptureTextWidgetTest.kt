package org.versetogether.scripturetext

import android.graphics.Color
import android.text.Selection
import android.text.Spannable
import android.text.Spanned
import android.view.View
import android.view.ViewGroup
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.fakes.RoboMenu

/**
 * The Android view itself under Robolectric: its read-only configuration, which selection changes it reports, and
 * that marks and restyling never drop the reader's selection. Long-press and handle drags are the platform's own
 * gestures; these tests drive the selection through the text's Selection spans (what Android's handles change),
 * not by simulating touches.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ScriptureTextWidgetTest {
  private lateinit var widget: ScriptureTextWidget
  private val events = mutableListOf<Pair<Int, Int>>()

  private val text = "1  In the beginning God created the heaven.\n2  And the earth was without form."
  private val content = TextContent(
    text,
    listOf(
      TextRun(0, 3, "sans-serif", 11.5f, Color.RED),
      TextRun(3, 44, "serif", 16f, Color.BLACK),
      TextRun(44, 47, "sans-serif", 11.5f, Color.RED),
      TextRun(47, text.length, "serif", 16f, Color.BLACK),
    ),
    listOf(TextParagraph(0, 44, 28f, 24f), TextParagraph(44, text.length, 28f, 0f)),
  )

  @Before
  fun setUp() {
    widget = ScriptureTextWidget(ApplicationProvider.getApplicationContext())
    // As ScriptureTextView adds it: full width, as tall as its text.
    widget.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    widget.selectionListener = ScriptureTextWidget.SelectionListener { start, end -> events.add(start to end) }
    widget.setContent(content)
    widget.measure(View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
    widget.layout(0, 0, 1080, widget.measuredHeight)
  }

  private fun userSelects(start: Int, end: Int) = Selection.setSelection(widget.text as Spannable, start, end)

  @Test
  fun isSelectableReadOnlyTextWithoutAKeyboard() {
    assertTrue(widget.isTextSelectable)
    assertFalse(widget.onCheckIsTextEditor())
    assertNull(widget.keyListener)
    assertFalse(widget.showSoftInputOnFocus)
    assertTrue(widget.isLongClickable)
    assertTrue(widget.isFocusableInTouchMode)
    assertTrue(widget.text is Spannable)
    assertEquals(text, widget.text.toString())
  }

  @Test
  fun styledWithRunAndParagraphSpans() {
    val spanned = widget.text as Spanned
    assertEquals(4, spanned.getSpans(0, text.length, RunSpan::class.java).size)
    val paragraphs = spanned.getSpans(0, text.length, ParagraphSpan::class.java)
    assertEquals(2, paragraphs.size)
    assertTrue(widget.measuredHeight > 0)
  }

  @Test
  fun keepsTheSelectionMenuButHidesAndroidsToolbarItems() {
    val menu = RoboMenu(ApplicationProvider.getApplicationContext())
    menu.add("Copy")
    menu.add("Share")
    // Returning true keeps the selection and its handles; returning false would collapse the selection.
    assertTrue(widget.selectionCallback.onCreateActionMode(FakeActionMode, menu))
    assertEquals(0, menu.size())
    menu.add("Translate")
    assertTrue(widget.selectionCallback.onPrepareActionMode(FakeActionMode, menu))
    assertEquals(0, menu.size())
    assertEquals(widget.selectionCallback, widget.customSelectionActionModeCallback)
  }

  @Test
  fun reportsTheReadersSelectionNormalized() {
    userSelects(6, 9)
    // A backward drag (the start handle past the end) is reported start <= end.
    userSelects(30, 12)
    assertEquals(listOf(6 to 9, 12 to 30), events)
  }

  @Test
  fun doesNotRepeatAnUnchangedSelection() {
    userSelects(6, 9)
    userSelects(6, 9)
    assertEquals(listOf(6 to 9), events)
  }

  @Test
  fun reportsACollapsedSelectionWhenTheReaderTapsAway() {
    userSelects(6, 9)
    userSelects(20, 20)
    assertEquals(listOf(6 to 9, 20 to 20), events)
  }

  @Test
  fun programmaticChangesAreNotReported() {
    widget.select(6, 30)
    assertEquals(6, widget.selectionStart)
    assertEquals(30, widget.selectionEnd)
    widget.clearSelection()
    assertFalse(widget.hasSelection())
    widget.setContent(content.copy(text = "$text More."))
    assertTrue(events.isEmpty())
  }

  @Test
  fun marksAndDecorationsKeepTheSelection() {
    userSelects(6, 30)
    widget.setMarks(listOf(TextMark(6, 30, false, Color.YELLOW), TextMark(10, 15, true, Color.BLUE)))
    widget.setDecorations(listOf(TextDecoration(0, 44, rule = true, fill = Color.GREEN, x = -12f, width = 2f)))
    assertEquals(6, widget.selectionStart)
    assertEquals(30, widget.selectionEnd)
    assertEquals(2, widget.marks.size)
    assertEquals(listOf(6 to 30), events)
  }

  @Test
  fun restylingTheSameTextKeepsTheSelectionQuietly() {
    userSelects(6, 30)
    widget.setContent(content.copy(runs = content.runs.map { it.copy(size = it.size * 1.2f) }))
    assertEquals(6, widget.selectionStart)
    assertEquals(30, widget.selectionEnd)
    assertEquals(listOf(6 to 30), events)
  }

  @Test
  fun newTextDropsTheSelectionQuietly() {
    userSelects(6, 30)
    widget.setContent(TextContent("1  Other words.", listOf(TextRun(0, 15, "serif", 16f, Color.BLACK)), emptyList()))
    assertFalse(widget.hasSelection())
    assertEquals(listOf(6 to 30), events)
    // The next selection the reader makes is reported again.
    userSelects(3, 8)
    assertEquals(listOf(6 to 30, 3 to 8), events)
  }

  @Test
  fun measuresOffsetsDownTheText() {
    val first = widget.offsetTop(3)
    val second = widget.offsetTop(47)
    assertEquals(0.0, first, 0.01)
    assertTrue("verse 2 starts below verse 1 ($second)", second > first)
  }

  private object FakeActionMode : android.view.ActionMode() {
    override fun setTitle(title: CharSequence?) {}
    override fun setTitle(resId: Int) {}
    override fun setSubtitle(subtitle: CharSequence?) {}
    override fun setSubtitle(resId: Int) {}
    override fun setCustomView(view: View?) {}
    override fun invalidate() {}
    override fun finish() {}
    override fun getMenu(): android.view.Menu = RoboMenu()
    override fun getTitle(): CharSequence? = null
    override fun getSubtitle(): CharSequence? = null
    override fun getCustomView(): View? = null
    override fun getMenuInflater(): android.view.MenuInflater = android.view.MenuInflater(ApplicationProvider.getApplicationContext())
  }
}
