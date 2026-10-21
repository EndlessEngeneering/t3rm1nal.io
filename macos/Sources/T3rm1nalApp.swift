import AppKit
import Combine
import SwiftUI
import WebKit

@main
struct T3rm1nalApp: App {
    var body: some Scene {
        WindowGroup {
            TerminalWindow()
                .preferredColorScheme(.dark)
                .frame(minWidth: 880, minHeight: 620)
        }
        .windowStyle(.hiddenTitleBar)
        .windowToolbarStyle(.unified)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }
    }
}

private struct TerminalWindow: View {
    @StateObject private var model = WindowModel()

    var body: some View {
        VStack(spacing: 0) {
            titleBar
            Rectangle()
                .fill(Color.white.opacity(0.12))
                .frame(height: 1)
            GameWebView(loadError: $model.loadError)
                .background(Color.black)
                .overlay {
                    if let loadError = model.loadError {
                        ContentUnavailableView(
                            "Game files unavailable",
                            systemImage: "terminal",
                            description: Text(loadError)
                        )
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.black)
                    }
                }
        }
        .background(Color.black)
        .preferredColorScheme(.dark)
    }

    private final class WindowModel: ObservableObject {
        @Published var loadError: String?
    }

    private var titleBar: some View {
        HStack(spacing: 12) {
            Image(systemName: "asterisk")
                .font(.system(size: 18, weight: .medium, design: .monospaced))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background {
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .fill(.white.opacity(0.1))
                        .overlay {
                            RoundedRectangle(cornerRadius: 11, style: .continuous)
                                .strokeBorder(.white.opacity(0.24), lineWidth: 1)
                        }
                        .applyGlassIfAvailable()
                }

            VStack(alignment: .leading, spacing: 3) {
                Text("t3rm1nal.io")
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.white)
                Text("DUNGEON SURVIVAL")
                    .font(.system(size: 9, weight: .regular, design: .monospaced))
                    .tracking(1.2)
                    .foregroundStyle(.white.opacity(0.55))
            }

            Spacer()

            HStack(spacing: 7) {
                Circle()
                    .fill(.white.opacity(0.8))
                    .frame(width: 5, height: 5)
                Text("SYSTEM READY")
                    .font(.system(size: 9, weight: .regular, design: .monospaced))
                    .tracking(0.8)
                    .foregroundStyle(.white.opacity(0.72))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background {
                Capsule()
                    .fill(.white.opacity(0.06))
                    .overlay {
                        Capsule().strokeBorder(.white.opacity(0.12), lineWidth: 1)
                    }
                    .applyGlassIfAvailable(shape: Capsule())
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
    }
}

private struct GameWebView: NSViewRepresentable {
    @Binding var loadError: String?

    func makeNSView(context: Context) -> WKWebView {
        let contentController = WKUserContentController()
        let unlocked = UserDefaults.standard.bool(forKey: "hardModeUnlocked")
        let bootstrapScript = "window.nativeGameStorage = { hardModeUnlocked: \(unlocked) };"
        contentController.addUserScript(
            WKUserScript(
                source: bootstrapScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        contentController.add(context.coordinator, name: "gameStorage")

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.underPageBackgroundColor = .black
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        webView.loadFileURL(
            Self.gameURL,
            allowingReadAccessTo: Self.gameDirectory
        )
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.parent = self
        if webView.url == nil {
            webView.loadFileURL(
                Self.gameURL,
                allowingReadAccessTo: Self.gameDirectory
            )
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    private static var gameDirectory: URL {
        Bundle.main.resourceURL!.appendingPathComponent("site", isDirectory: true)
    }

    private static var gameURL: URL {
        gameDirectory.appendingPathComponent("index.html")
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var parent: GameWebView

        init(parent: GameWebView) {
            self.parent = parent
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard
                message.name == "gameStorage",
                message.body as? String == "hardModeUnlocked"
            else {
                return
            }
            UserDefaults.standard.set(true, forKey: "hardModeUnlocked")
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            parent.loadError = error.localizedDescription
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            parent.loadError = error.localizedDescription
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            if url.isFileURL {
                decisionHandler(.allow)
            } else {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
            }
        }
    }
}

private extension View {
    @ViewBuilder
    func applyGlassIfAvailable<S: Shape>(shape: S = RoundedRectangle(cornerRadius: 11)) -> some View {
        if #available(macOS 26.0, *) {
            self.glassEffect(.regular, in: shape)
        } else {
            self.background(.ultraThinMaterial, in: shape)
        }
    }
}
