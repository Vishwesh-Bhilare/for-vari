import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

// Production URL is the default so installed builds do not wait on an emulator-only
// localhost address. Override for local testing with:
// flutter run --dart-define=WEBVIEW_URL=http://10.0.2.2:5173/
const String defaultWebViewUrl = 'https://for-vari.vercel.app/';
const String activeUrl = String.fromEnvironment(
  'WEBVIEW_URL',
  defaultValue: defaultWebViewUrl,
);

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  SystemChrome.setPreferredOrientations(DeviceOrientation.values);

  runApp(const WebViewWrapperApp());
}

class WebViewWrapperApp extends StatelessWidget {
  const WebViewWrapperApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: const FullscreenWebView(),
      theme: ThemeData(useMaterial3: true),
    );
  }
}

class FullscreenWebView extends StatefulWidget {
  const FullscreenWebView({super.key});

  @override
  State<FullscreenWebView> createState() => _FullscreenWebViewState();
}

class _FullscreenWebViewState extends State<FullscreenWebView> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();

    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..setNavigationDelegate(NavigationDelegate())
      ..loadRequest(Uri.parse(activeUrl));

    final platformController = controller.platform;
    if (platformController is AndroidWebViewController) {
      AndroidWebViewController.enableDebugging(false);
      platformController.setMediaPlaybackRequiresUserGesture(false);
    }

    _controller = controller;
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) {
          return;
        }

        if (await _controller.canGoBack()) {
          await _controller.goBack();
          return;
        }

        SystemNavigator.pop();
      },
      child: Scaffold(
        resizeToAvoidBottomInset: false,
        body: SizedBox.expand(
          child: WebViewWidget(controller: _controller),
        ),
      ),
    );
  }
}
