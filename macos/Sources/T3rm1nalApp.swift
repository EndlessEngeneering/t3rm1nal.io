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
            Text("*")
                .font(.system(size: 25, weight: .regular, design: .monospaced))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background {
                    Rectangle()
                        .fill(.black)
                        .overlay {
                            Rectangle().strokeBorder(.white.opacity(0.5), lineWidth: 1)
                        }
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
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(.white.opacity(0.25))
                    .frame(height: 1)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(Color.black)
    }
}

private struct GameWebView: NSViewRepresentable {
    @Binding var loadError: String?

    func makeNSView(context: Context) -> WKWebView {
        let contentController = WKUserContentController()
        let unlocked = UserDefaults.standard.bool(forKey: "hardModeUnlocked")
        let configURL = Self.gameDirectory
            .appendingPathComponent("assets", isDirectory: true)
            .appendingPathComponent("game-config.json")
        let configBase64 = (try? Data(contentsOf: configURL))?.base64EncodedString()
        let configValue = configBase64.map { "\"\($0)\"" } ?? "null"
        let bootstrapScript = """
        window.nativeGameStorage = { hardModeUnlocked: \(unlocked), terminalAppearance: true };
        window.nativeGameConfigBase64 = \(configValue);
        document.addEventListener("DOMContentLoaded", () => {
            document.documentElement.classList.add("native-terminal");
        });
        """
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
        let webView = GameKeyboardWebView(frame: .zero, configuration: configuration)
        webView.underPageBackgroundColor = .black
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
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

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler, WKUIDelegate {
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
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping () -> Void
        ) {
            NSLog("Dismissed JavaScript alert from game: %@", message)
            completionHandler()
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (Bool) -> Void
        ) {
            NSLog("Rejected JavaScript confirmation from game: %@", message)
            completionHandler(false)
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptTextInputPanelWithPrompt prompt: String,
            defaultText: String?,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (String?) -> Void
        ) {
            NSLog("Dismissed JavaScript prompt from game: %@", prompt)
            completionHandler(nil)
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

private final class GameKeyboardWebView: WKWebView {
    override var acceptsFirstResponder: Bool { true }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        DispatchQueue.main.async { [weak self] in
            guard let self, let window = self.window else { return }
            window.makeFirstResponder(self)
        }
    }

    override func mouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        super.mouseDown(with: event)
    }

    override func keyDown(with event: NSEvent) {
        guard event.modifierFlags.intersection([.command, .control, .option]).isEmpty else {
            super.keyDown(with: event)
            return
        }

        let key: String
        switch event.keyCode {
        case 36, 76: key = "enter"
        case 53: key = "escape"
        case 49: key = " "
        case 123: key = "arrowleft"
        case 124: key = "arrowright"
        case 125: key = "arrowdown"
        case 126: key = "arrowup"
        default:
            guard let characters = event.charactersIgnoringModifiers?.lowercased(),
                  ["w", "a", "s", "d", "e", "h"].contains(characters)
            else {
                super.keyDown(with: event)
                return
            }
            key = characters
        }

        guard
            let encodedData = try? JSONSerialization.data(
                withJSONObject: key,
                options: [.fragmentsAllowed]
            ),
            let encodedKey = String(data: encodedData, encoding: .utf8)
        else {
            return
        }
        evaluateJavaScript(
            "window.dispatchEvent(new KeyboardEvent('keydown', { key: \(encodedKey), bubbles: true }));"
        )
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
