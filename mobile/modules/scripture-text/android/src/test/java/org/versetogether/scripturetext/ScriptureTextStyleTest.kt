package org.versetogether.scripturetext

import android.graphics.Color
import android.graphics.Typeface
import android.text.Selection
import android.text.Spannable
import android.text.Spanned
import android.view.View
import android.view.ViewGroup
import androidx.test.core.app.ApplicationProvider
import android.text.TextPaint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * A run's optional style (bold, italic, both): merged into the run's face with Typeface.create, and without it the
 * face exactly as it resolves (the same Typeface object), for the system serif and for a named face like DM Sans.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ScriptureTextStyleTest {
  // Stands in for a font expo-font registered under its name (ReactFontManager in the app).
  private val dmSans: Typeface = Typeface.create("sans-serif", Typeface.NORMAL)
  private lateinit var widget: ScriptureTextWidget
  private val events = mutableListOf<Pair<Int, Int>>()
  private val text = "Plain bold italic both sans"

  private fun runs(serifStyles: List<Int>, sansStyle: Int = Typeface.NORMAL) = listOf(
    TextRun(0, 6, "serif", 16f, Color.BLACK, style = serifStyles[0]),
    TextRun(6, 11, "serif", 16f, Color.BLACK, style = serifStyles[1]),
    TextRun(11, 18, "serif", 16f, Color.BLACK, style = serifStyles[2]),
    TextRun(18, 23, "serif", 16f, Color.BLACK, style = serifStyles[3]),
    TextRun(23, text.length, "DMSans_400Regular", 16f, Color.BLACK, style = sansStyle),
  )

  private fun spans(): List<RunSpan> {
    val spanned = widget.text as Spanned
    return spanned.getSpans(0, text.length, RunSpan::class.java).sortedBy { spanned.getSpanStart(it) }
  }

  @Before
  fun setUp() {
    widget = ScriptureTextWidget(ApplicationProvider.getApplicationContext()) { name ->
      if (name == "DMSans_400Regular") dmSans else ScriptureTextWidget.systemTypeface(name)
    }
    widget.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    widget.selectionListener = ScriptureTextWidget.SelectionListener { start, end -> events.add(start to end) }
    widget.setContent(TextContent(text, runs(listOf(Typeface.NORMAL, Typeface.BOLD, Typeface.ITALIC, Typeface.BOLD_ITALIC)), emptyList()))
    widget.measure(View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
    widget.layout(0, 0, 1080, widget.measuredHeight)
  }

  @Test
  fun theRecordsStyleNamesMapToTypefaceStyles() {
    assertEquals(Typeface.BOLD, typefaceStyle("bold"))
    assertEquals(Typeface.ITALIC, typefaceStyle("italic"))
    assertEquals(Typeface.BOLD_ITALIC, typefaceStyle("boldItalic"))
    assertEquals(Typeface.NORMAL, typefaceStyle(null))
    assertEquals(Typeface.NORMAL, typefaceStyle("heavy"))
    // A record without the field (every existing caller) is NORMAL.
    assertEquals(Typeface.NORMAL, RunRecord().toRun().style)
  }

  @Test
  fun withoutAStyleTheFaceIsExactlyAsResolved() {
    val all = spans()
    assertSame(Typeface.SERIF, all[0].typeface)
    assertSame(dmSans, all[4].typeface)
  }

  @Test
  fun serifRunsTakeEachStyle() {
    val all = spans()
    assertEquals(Typeface.BOLD, all[1].typeface.style)
    assertEquals(Typeface.ITALIC, all[2].typeface.style)
    assertEquals(Typeface.BOLD_ITALIC, all[3].typeface.style)
  }

  @Test
  fun aNamedFaceTakesEachStyle() {
    for (style in listOf(Typeface.BOLD, Typeface.ITALIC, Typeface.BOLD_ITALIC)) {
      widget.setContent(TextContent(text, runs(listOf(Typeface.NORMAL, Typeface.NORMAL, Typeface.NORMAL, Typeface.NORMAL), sansStyle = style), emptyList()))
      assertEquals("style $style", style, spans()[4].typeface.style)
    }
  }

  @Test
  fun restylingKeepsTheTextAndTheSelection() {
    Selection.setSelection(widget.text as Spannable, 6, 17)
    widget.setContent(TextContent(text, runs(listOf(Typeface.BOLD, Typeface.NORMAL, Typeface.NORMAL, Typeface.ITALIC)), emptyList()))
    assertEquals(text, widget.text.toString())
    assertEquals(6, widget.selectionStart)
    assertEquals(17, widget.selectionEnd)
    assertEquals(listOf(6 to 17), events)
    assertTrue(widget.offsetTop(20) >= 0.0)
  }

  @Test
  fun aStruckRunDrawsStruckThroughAndOthersDont() {
    assertFalse(RunRecord().toRun().strikethrough)
    val struck = TextRun(6, 11, "serif", 16f, Color.GRAY, strikethrough = true)
    widget.setContent(TextContent(text, listOf(TextRun(0, 6, "serif", 16f, Color.BLACK), struck), emptyList()))
    val all = spans()
    val plainPaint = TextPaint().apply { isStrikeThruText = true }
    all[0].updateDrawState(plainPaint)
    assertFalse(plainPaint.isStrikeThruText)
    val struckPaint = TextPaint()
    all[1].updateDrawState(struckPaint)
    assertTrue(struckPaint.isStrikeThruText)
    assertEquals(Color.GRAY, struckPaint.color)
  }
}
