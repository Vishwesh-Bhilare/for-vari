import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

// Local Dev URLs for Android Emulator (10.0.2.2 points to host machine localhost)
const String localHttpsUrl = 'https://10.0.2.2:5173/';
const String localHttpUrl = 'http://10.0.2.2:5173/';
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
  String _currentUrl = localHttpsUrl;

  @override
  void initState() {
    super.initState();

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (NavigationRequest request) async {
            final String url = request.url;
            if (url.startsWith('tel:') || url.startsWith('mailto:') || url.startsWith('sms:')) {
              final Uri uri = Uri.parse(url);
              try {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              } catch (e) {
                debugPrint('Launch URL error: $e');
              }
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
          onWebResourceError: (WebResourceError error) {
            debugPrint('WebView Notice (${error.errorCode}): ${error.description}');
            if (_currentUrl == localHttpsUrl) {
              setState(() {
                _currentUrl = localHttpUrl;
              });
              _controller.loadRequest(Uri.parse(localHttpUrl));
            } else if (_currentUrl == localHttpUrl) {
              setState(() {
                _currentUrl = vercelUrl;
              });
              _controller.loadRequest(Uri.parse(vercelUrl));
            }
          },
        ),
      );

    if (_controller.platform is AndroidWebViewController) {
      final androidController = _controller.platform as AndroidWebViewController;
      androidController.setGeolocationPermissionsPromptCallbacks(
        onShowPrompt: (request) async => const GeolocationPermissionsResponse(allow: true, retain: false),
      );
    }

    _controller.loadRequest(Uri.parse(localHttpsUrl));
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
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
