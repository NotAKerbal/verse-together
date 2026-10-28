package org.versetogether.scripturetext

import android.content.Context
import android.graphics.Typeface
import com.facebook.react.common.assets.ReactFontManager
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * The React Native view around [ScriptureTextWidget]. Its height is the text's: the widget is measured at the width
 * React Native gives this view and the height is reported back (onContentSizeChange), as an Android TextView sizes
 * itself to its text.
 */
class ScriptureTextView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onSelectionChange by EventDispatcher()
  private val onContentSizeChange by EventDispatcher()
  private val onTextPress by EventDispatcher()
  private var reportedHeight = -1

  val widget = ScriptureTextWidget(context) { name -> resolveTypeface(context, name) }

  override val shouldUseAndroidLayout = true

  init {
    addView(widget, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    widget.selectionListener = ScriptureTextWidget.SelectionListener { start, end ->
      onSelectionChange(mapOf("start" to start, "end" to end))
    }
    widget.pressListener = ScriptureTextWidget.PressListener { offset -> onTextPress(mapOf("offset" to offset)) }
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = MeasureSpec.getSize(widthMeasureSpec)
    widget.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
    setMeasuredDimension(width, MeasureSpec.getSize(heightMeasureSpec))
    if (width > 0 && widget.measuredHeight != reportedHeight) {
      reportedHeight = widget.measuredHeight
      onContentSizeChange(mapOf("height" to reportedHeight / resources.displayMetrics.density.toDouble()))
    }
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    widget.layout(0, 0, widget.measuredWidth, widget.measuredHeight)
  }

  companion object {
    /** The app's fonts as React Native resolves them (expo-font registers DM Sans with ReactFontManager). */
    fun resolveTypeface(context: Context, name: String): Typeface = when (name) {
      "serif", "monospace", "sans-serif", "" -> ScriptureTextWidget.systemTypeface(name)
      else -> try {
        ReactFontManager.getInstance().getTypeface(name, Typeface.NORMAL, context.assets)
      } catch (_: RuntimeException) {
        Typeface.DEFAULT
      }
    }
  }
}
