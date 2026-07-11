# 開発用の静的サーバー。ブラウザにキャッシュさせない（編集が即反映される）。
# 使い方: python dev_server.py [ポート番号]
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    # 単一スレッドのHTTPServerだとブラウザが張るkeep-alive接続で
    # 後続リクエストが詰まることがあるため、複数接続を並行処理できる
    # ThreadingHTTPServerを使う。
    protocol_version = 'HTTP/1.1'

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler).serve_forever()
