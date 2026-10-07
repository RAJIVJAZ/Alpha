import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'table_cart.dart';

/// Scans the QR code on a restaurant table, or takes the code typed in.
class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final _controller = MobileScannerController(formats: const [BarcodeFormat.qrCode]);
  final _code = TextEditingController();
  bool _done = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    _code.dispose();
    super.dispose();
  }

  void _open(String? raw) {
    if (_done) return;
    final token = parseTableToken(raw);
    if (token == null) {
      setState(() => _error = "That isn't a FoodGrid table code");
      return;
    }
    _done = true;
    _controller.stop();
    context.pushReplacement('/t/$token');
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Order at your table')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('Point your camera at the QR code on the table.', style: text.bodyLarge),
        const SizedBox(height: 12),
        ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: AspectRatio(
            aspectRatio: 1,
            child: Semantics(
              label: 'Camera viewfinder for the table QR code',
              child: MobileScanner(
                controller: _controller,
                onDetect: (capture) {
                  for (final b in capture.barcodes) {
                    if (b.rawValue != null) return _open(b.rawValue);
                  }
                },
                errorBuilder: (context, error) => ColoredBox(
                  color: Colors.black,
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        error.errorCode == MobileScannerErrorCode.permissionDenied ? 'Allow camera access to scan, or type the code below.' : 'The camera is unavailable — type the code below.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 20),
        Text('No camera? Type the code printed under the QR.', style: text.bodyMedium),
        const SizedBox(height: 8),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: TextField(
              controller: _code,
              textInputAction: TextInputAction.go,
              onSubmitted: _open,
              decoration: InputDecoration(labelText: 'Table code or link', errorText: _error),
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(onPressed: () => _open(_code.text), child: const Text('Open')),
        ]),
      ]),
    );
  }
}
