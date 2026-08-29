import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

// Local Dev URLs for Android Emulator (10.0.2.2 points to host machine localhost)
const String localHttpUrl = 'http://10.0.2.2:5173/';
const String localHttpsUrl = 'https://10.0.2.2:5173/';
const String vercelUrl = 'https://for-vari.vercel.app/';

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
  bool _hasError = false;
  String _currentUrl = localHttpUrl;

  @override
  void initState() {
    super.initState();

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onWebResourceError: (WebResourceError error) {
            debugPrint('WebView Error: ${error.description}');
            // If localHttpUrl failed, try localHttpsUrl, then fallback to vercelUrl
            if (_currentUrl == localHttpUrl) {
              setState(() {
                _currentUrl = localHttpsUrl;
              });
              _controller.loadRequest(Uri.parse(localHttpsUrl));
            } else if (_currentUrl == localHttpsUrl) {
              setState(() {
                _currentUrl = vercelUrl;
              });
              _controller.loadRequest(Uri.parse(vercelUrl));
            }
          },
        ),
      )
      ..loadRequest(Uri.parse(localHttpUrl));
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
        body: SafeArea(
          top: false,
          bottom: false,
          child: WebViewWidget(controller: _controller),
        ),
      ),
    );
  }
}
