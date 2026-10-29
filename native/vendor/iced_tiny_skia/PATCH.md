# Local renderer correction

Source: iced_tiny_skia 0.14.1 from crates.io, https://github.com/iced-rs/iced, MIT (LICENSE included).
The rest of this crate is unchanged apart from formatting in the modified files.

Real Wayland testing of the native header found stale dark shadow bands after typing into and dismissing a
popover. Two incremental-rendering defects caused this: shadow pixmaps ignored the layer/damage mask, and
quad damage bounds excluded the shadow. Shadow-only damage was also skipped by the early bounds check.

Local changes:

- `src/engine.rs`: include shadow extent in the visibility check; always apply the actual damage/layer mask
  when drawing the shadow pixmap. The quad fill retains its existing fast path.
- `src/layer.rs`: include shadow blur/offset in invalidated bounds when a quad changes or disappears.
- `src/engine.rs`: raster images honor their own clip bounds (the image widget's bounds). Upstream ignored them,
  so a cropped or `ContentFit::Cover` image (lesson covers, journal art) painted outside its widget. The pass's
  damage mask is restored after a clipped image.
- `src/engine.rs`: raster images honor their `border_radius` (upstream tiny-skia ignored it): the clip mask is
  intersected with the rounded widget bounds, so lesson covers and journal art have the website's rounded corners.
- `src/window/compositor.rs`: the background color is remembered per recent frame. Upstream kept one value for
  the surface, so with buffer age 2+ a buffer drawn before a theme change kept the old background wherever
  nothing else changed (dark patches after switching to light).
- Regression tests verify no writes outside damage, pixel-identical tiled/full-frame drawing (including
  shadow-only tiles), and invalidation after removing a shadowed quad.

Run: `cargo test --manifest-path native/Cargo.toml -p iced_tiny_skia` (the app enables its `image` feature).
The application uses this checked-in patch through `[patch.crates-io]`; no machine-local registry edits are needed.
