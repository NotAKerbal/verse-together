import ExpoModulesCore
import UIKit

/// Colors arrive as React Native's processColor numbers (ARGB).
func color(fromARGB value: Double?) -> UIColor {
  guard let value else { return .clear }
  let argb = UInt32(truncatingIfNeeded: Int64(value))
  return UIColor(
    red: CGFloat((argb >> 16) & 0xff) / 255,
    green: CGFloat((argb >> 8) & 0xff) / 255,
    blue: CGFloat(argb & 0xff) / 255,
    alpha: CGFloat((argb >> 24) & 0xff) / 255
  )
}

struct RunRecord: Record {
  @Field var start: Int = 0
  @Field var end: Int = 0
  @Field var font: String = "serif"
  @Field var size: Double = 16
  @Field var color: Double = 0
  @Field var letterSpacing: Double = 0
  /// "bold", "italic" or "boldItalic"; nil (or anything else): the font as named.
  @Field var style: String? = nil
}

struct ParagraphRecord: Record {
  @Field var start: Int = 0
  @Field var end: Int = 0
  @Field var lineHeight: Double = 28
  @Field var spacingAfter: Double = 0
}

struct ContentRecord: Record {
  @Field var text: String = ""
  @Field var runs: [RunRecord] = []
  @Field var paragraphs: [ParagraphRecord] = []
}

struct MarkRecord: Record {
  @Field var start: Int = 0
  @Field var end: Int = 0
  @Field var kind: String = "highlight"
  @Field var color: Double = 0
}

struct DecorationRecord: Record {
  @Field var start: Int = 0
  @Field var end: Int = 0
  @Field var kind: String = "box"
  @Field var fill: Double = 0
  @Field var stroke: Double = 0
  @Field var strokeWidth: Double = 0
  @Field var radius: Double = 0
  @Field var x: Double = 0
  @Field var width: Double = 0
  @Field var outsetX: Double = 0
  @Field var outsetTop: Double = 0
  @Field var outsetBottom: Double = 0
}

public class ScriptureTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ScriptureText")

    View(ScriptureTextView.self) {
      Events("onSelectionChange", "onContentSizeChange", "onTextPress")

      Prop("content") { (view: ScriptureTextView, content: ContentRecord?) in
        view.setContent(content ?? ContentRecord())
      }
      Prop("marks") { (view: ScriptureTextView, marks: [MarkRecord]?) in
        view.setMarks(marks ?? [])
      }
      Prop("decorations") { (view: ScriptureTextView, decorations: [DecorationRecord]?) in
        view.setDecorations(decorations ?? [])
      }
      Prop("selectionColor") { (view: ScriptureTextView, value: Double?) in
        if let value { view.textView.tintColor = color(fromARGB: value) }
      }
      Prop("textInset") { (view: ScriptureTextView, inset: [Double]?) in
        view.setTextInset(left: inset?.first ?? 0, right: inset?.dropFirst().first ?? 0)
      }

      AsyncFunction("clearSelection") { (view: ScriptureTextView) in
        view.clearSelection()
      }
      AsyncFunction("setSelection") { (view: ScriptureTextView, start: Int, end: Int) in
        view.select(start: start, end: end)
      }
      AsyncFunction("offsetTop") { (view: ScriptureTextView, offset: Int) -> Double in
        view.offsetTop(offset)
      }
    }
  }
}
