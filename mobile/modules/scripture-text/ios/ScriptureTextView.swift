import ExpoModulesCore
import UIKit

/// Scripture as one selectable, read-only UITextView (TextKit 1): the reader selects words and phrases with iOS's own
/// selection, across verses. Selection changes the reader makes are reported; changes made here are not. Underlines
/// are the text's own colored underline attributes and highlights are layers behind the glyphs, so neither rewrites
/// the text or its selection.
///
/// Written for parity with the Android view; it has not been compiled or run on iOS from this project's Linux setup.
public class ScriptureTextView: ExpoView, UITextViewDelegate, UIGestureRecognizerDelegate {
  let onSelectionChange = EventDispatcher()
  let onContentSizeChange = EventDispatcher()
  let onTextPress = EventDispatcher()

  let textView = UITextView(usingTextLayoutManager: false)
  private let backgrounds = CALayer()
  private var programmatic = 0
  private var reported = NSRange(location: 0, length: 0)
  private var reportedHeight: CGFloat = -1
  private var contentKey = ""
  private var currentText = ""
  private var marks: [MarkRecord] = []
  private var decorations: [DecorationRecord] = []
  private let pressRecognizer = UITapGestureRecognizer()
  private var pressBegan: TimeInterval = 0
  private var pressCandidate = false

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    textView.isEditable = false
    textView.isSelectable = true
    textView.isScrollEnabled = false
    textView.backgroundColor = .clear
    textView.textContainerInset = .zero
    textView.textContainer.lineFragmentPadding = 0
    textView.dataDetectorTypes = []
    textView.delegate = self
    textView.layer.insertSublayer(backgrounds, at: 0)
    // A plain tap is reported (onTextPress) alongside UITextView's own gestures, never instead of them: it recognizes
    // simultaneously, cancels and delays no touches, so selecting, the handles and the scroll view are unchanged.
    pressRecognizer.addTarget(self, action: #selector(handlePress(_:)))
    pressRecognizer.delegate = self
    pressRecognizer.cancelsTouchesInView = false
    pressRecognizer.delaysTouchesBegan = false
    pressRecognizer.delaysTouchesEnded = false
    textView.addGestureRecognizer(pressRecognizer)
    clipsToBounds = false
    addSubview(textView)
  }

  private func quietly(_ body: () -> Void) {
    programmatic += 1
    body()
    programmatic -= 1
    reported = textView.selectedRange
  }

  private func clamp(_ start: Int, _ end: Int, _ length: Int) -> NSRange? {
    let from = max(0, min(start, length))
    let to = max(0, min(end, length))
    return from < to ? NSRange(location: from, length: to - from) : nil
  }

  static func font(named name: String, size: CGFloat) -> UIFont {
    let scaled = UIFontMetrics.default.scaledValue(for: size)
    if name == "serif", let serif = UIFont.systemFont(ofSize: scaled).fontDescriptor.withDesign(.serif) {
      return UIFont(descriptor: serif, size: scaled)
    }
    if let font = UIFont(name: name, size: scaled) {
      return font
    }
    let family = UIFont(descriptor: UIFontDescriptor(fontAttributes: [.family: name]), size: scaled)
    return family.familyName == name ? family : UIFont.systemFont(ofSize: scaled)
  }

  /// The font with a run's optional style merged into its own traits, keeping its family and size; unchanged when the
  /// style is absent or the family has no such face.
  static func styled(_ font: UIFont, _ style: String?) -> UIFont {
    let traits: UIFontDescriptor.SymbolicTraits
    switch style {
    case "bold": traits = .traitBold
    case "italic": traits = .traitItalic
    case "boldItalic": traits = [.traitBold, .traitItalic]
    default: return font
    }
    guard let descriptor = font.fontDescriptor.withSymbolicTraits(font.fontDescriptor.symbolicTraits.union(traits)) else { return font }
    return UIFont(descriptor: descriptor, size: font.pointSize)
  }

  func setContent(_ record: ContentRecord) {
    let key = ([record.text] + record.runs.map { "\($0.start),\($0.end),\($0.font),\($0.size),\($0.color),\($0.letterSpacing),\($0.style ?? "")" }
      + record.paragraphs.map { "\($0.start),\($0.end),\($0.lineHeight),\($0.spacingAfter)" }).joined(separator: "|")
    if key == contentKey { return }
    contentKey = key
    let text = record.text
    let length = (text as NSString).length
    let attributed = NSMutableAttributedString(string: text)
    for run in record.runs {
      guard let range = clamp(run.start, run.end, length) else { continue }
      let font = Self.styled(Self.font(named: run.font, size: run.size), run.style)
      attributed.addAttributes([
        .font: font,
        .foregroundColor: color(fromARGB: run.color),
        .kern: run.letterSpacing * font.pointSize,
      ], range: range)
    }
    for paragraph in record.paragraphs {
      guard let range = clamp(paragraph.start, paragraph.end, length) else { continue }
      let style = NSMutableParagraphStyle()
      let lineHeight = UIFontMetrics.default.scaledValue(for: paragraph.lineHeight)
      style.minimumLineHeight = lineHeight
      style.maximumLineHeight = lineHeight
      style.paragraphSpacing = paragraph.spacingAfter
      attributed.addAttribute(.paragraphStyle, value: style, range: range)
    }
    let keep = text == currentText ? textView.selectedRange : nil
    currentText = text
    quietly {
      textView.attributedText = attributed
      applyUnderlines()
      if let keep, keep.length > 0, NSMaxRange(keep) <= length { textView.selectedRange = keep }
    }
    setNeedsLayout()
  }

  func setMarks(_ next: [MarkRecord]) {
    marks = next
    quietly { applyUnderlines() }
    setNeedsLayout()
  }

  func setDecorations(_ next: [DecorationRecord]) {
    decorations = next
    setNeedsLayout()
  }

  func setTextInset(left: Double, right: Double) {
    textView.textContainerInset = UIEdgeInsets(top: 0, left: left, bottom: 0, right: right)
    setNeedsLayout()
  }

  private func applyUnderlines() {
    let storage = textView.textStorage
    let full = NSRange(location: 0, length: storage.length)
    storage.beginEditing()
    storage.removeAttribute(.underlineStyle, range: full)
    storage.removeAttribute(.underlineColor, range: full)
    for mark in marks where mark.kind == "underline" {
      guard let range = clamp(mark.start, mark.end, storage.length) else { continue }
      storage.addAttributes([.underlineStyle: NSUnderlineStyle.single.rawValue, .underlineColor: color(fromARGB: mark.color)], range: range)
    }
    storage.endEditing()
  }

  func select(start: Int, end: Int) {
    guard let range = clamp(start, end, textView.textStorage.length) else { return }
    quietly { textView.selectedRange = range }
  }

  func clearSelection() {
    quietly {
      textView.selectedRange = NSRange(location: 0, length: 0)
      textView.resignFirstResponder()
    }
  }

  func offsetTop(_ offset: Int) -> Double {
    let manager = textView.layoutManager
    let length = textView.textStorage.length
    guard length > 0 else { return 0 }
    let glyph = manager.glyphIndexForCharacter(at: max(0, min(offset, length - 1)))
    let line = manager.lineFragmentRect(forGlyphAt: glyph, effectiveRange: nil)
    return Double(line.minY + textView.textContainerInset.top)
  }

  /// The UTF-16 offset of the character under a point in the text view, or -1 where there is none (the inset, past a
  /// line's end, below the text, empty text). A composed character (a surrogate pair) is its first offset.
  func offsetAt(_ point: CGPoint) -> Int {
    let manager = textView.layoutManager
    let container = textView.textContainer
    let length = textView.textStorage.length
    guard length > 0 else { return -1 }
    let inset = textView.textContainerInset
    let local = CGPoint(x: point.x - inset.left, y: point.y - inset.top)
    var fraction: CGFloat = 0
    let glyph = manager.glyphIndex(for: local, in: container, fractionOfDistanceThroughGlyph: &fraction)
    guard glyph < manager.numberOfGlyphs else { return -1 }
    let rect = manager.boundingRect(forGlyphRange: NSRange(location: glyph, length: 1), in: container)
    guard rect.contains(local) else { return -1 }
    let character = manager.characterIndexForGlyph(at: glyph)
    guard character < length else { return -1 }
    if (textView.textStorage.string as NSString).character(at: character) == 0x0A { return -1 }
    return (textView.textStorage.string as NSString).rangeOfComposedCharacterSequence(at: character).location
  }

  public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
    gestureRecognizer === pressRecognizer
  }

  /// A tap that starts while words are selected ends the selection; it isn't a press.
  public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    guard gestureRecognizer === pressRecognizer else { return true }
    pressCandidate = textView.selectedRange.length == 0
    pressBegan = touch.timestamp
    return true
  }

  @objc private func handlePress(_ recognizer: UITapGestureRecognizer) {
    guard recognizer.state == .ended, pressCandidate else { return }
    pressCandidate = false
    // Held long enough to be a long press, or a selection made meanwhile: the platform's selection, not a press.
    guard ProcessInfo.processInfo.systemUptime - pressBegan < 0.5, textView.selectedRange.length == 0 else { return }
    let offset = offsetAt(recognizer.location(in: textView))
    if offset >= 0 { onTextPress(["offset": offset]) }
  }

  public func textViewDidChangeSelection(_ textView: UITextView) {
    guard programmatic == 0 else { return }
    let range = textView.selectedRange
    if range == reported { return }
    reported = range
    onSelectionChange(["start": range.location, "end": range.location + range.length])
  }

  /// The app's own selection menu replaces iOS's edit menu; the selection itself stays.
  @available(iOS 16.0, *)
  public func textView(_ textView: UITextView, editMenuForTextIn range: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
    UIMenu(children: [])
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    let width = bounds.width
    let size = textView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
    textView.frame = CGRect(x: 0, y: 0, width: width, height: ceil(size.height))
    if width > 0 && abs(size.height - reportedHeight) > 0.5 {
      reportedHeight = size.height
      onContentSizeChange(["height": size.height])
    }
    drawBackgrounds()
  }

  private func drawBackgrounds() {
    backgrounds.sublayers?.forEach { $0.removeFromSuperlayer() }
    let manager = textView.layoutManager
    let container = textView.textContainer
    let inset = textView.textContainerInset
    let length = textView.textStorage.length
    let width = textView.bounds.width - inset.left - inset.right
    func add(_ rect: CGRect, fill: UIColor, stroke: UIColor = .clear, strokeWidth: CGFloat = 0, radius: CGFloat) {
      let layer = CAShapeLayer()
      let frame = rect.offsetBy(dx: inset.left, dy: inset.top)
      layer.path = UIBezierPath(roundedRect: frame.insetBy(dx: strokeWidth / 2, dy: strokeWidth / 2), cornerRadius: radius).cgPath
      layer.fillColor = fill.cgColor
      layer.strokeColor = stroke.cgColor
      layer.lineWidth = strokeWidth
      backgrounds.addSublayer(layer)
    }
    for decoration in decorations {
      guard let range = clamp(decoration.start, decoration.end, length) else { continue }
      let glyphs = manager.glyphRange(forCharacterRange: range, actualCharacterRange: nil)
      var bounds = manager.boundingRect(forGlyphRange: glyphs, in: container)
      bounds.origin.y -= decoration.outsetTop
      bounds.size.height += decoration.outsetTop + decoration.outsetBottom
      let rect = decoration.kind == "rule"
        ? CGRect(x: decoration.x, y: bounds.minY, width: decoration.width, height: bounds.height)
        : CGRect(x: -decoration.outsetX, y: bounds.minY, width: width + decoration.outsetX * 2, height: bounds.height)
      add(rect, fill: color(fromARGB: decoration.fill), stroke: color(fromARGB: decoration.stroke), strokeWidth: decoration.strokeWidth, radius: decoration.radius)
    }
    for mark in marks where mark.kind == "highlight" {
      guard let range = clamp(mark.start, mark.end, length) else { continue }
      let font = textView.textStorage.attribute(.font, at: range.location, effectiveRange: nil) as? UIFont ?? UIFont.systemFont(ofSize: 16)
      let glyphs = manager.glyphRange(forCharacterRange: range, actualCharacterRange: nil)
      manager.enumerateLineFragments(forGlyphRange: glyphs) { line, _, _, lineGlyphs, _ in
        let piece = NSIntersectionRange(lineGlyphs, glyphs)
        guard piece.length > 0 else { return }
        let extent = manager.boundingRect(forGlyphRange: piece, in: container)
        let baseline = line.minY + manager.location(forGlyphAt: piece.location).y
        let rect = CGRect(x: extent.minX, y: baseline - font.ascender, width: extent.width, height: font.ascender - font.descender)
        add(rect, fill: color(fromARGB: mark.color), radius: font.pointSize * 0.15)
      }
    }
  }
}
