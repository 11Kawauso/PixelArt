# 開発用の静的サーバー。ブラウザにキャッシュさせない（編集が即反映される）。
# 使い方: python dev_server.py [ポート番号]
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    HTTPServer(('127.0.0.1', port), NoCacheHandler).serve_forever()
