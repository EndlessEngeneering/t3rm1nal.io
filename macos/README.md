# macOS app

The native SwiftUI app wraps the offline browser game in a macOS window. Its
title bar uses Liquid Glass on macOS 26 and a translucent material on earlier
supported releases. It supports macOS 14 and newer. The game itself keeps its
monochrome terminal presentation.

## Build

Open `T3rm1nal.xcodeproj` in Xcode, select the `T3rm1nal` scheme, and build for
My Mac. The Xcode project bundles the `../site` folder so gameplay and
configuration load locally without an internet connection.

Alternatively, run `./build-app.sh` from this directory. It builds a Release
application into `build/T3rm1nal.app`, using Xcode when available and the
installed Swift toolchain otherwise.

The app icon assets are in `Resources/AppIcon.iconset`. To regenerate the icon
after editing `scripts/make_icon.py`, run `./scripts/make_icon.py` and then
`iconutil -c icns Resources/AppIcon.iconset -o Resources/AppIcon.icns`.
