"""발표 노트북용 로컬 서버 (파이썬 3.8+, 추가 설치 없음)

    python serve.py            → http://localhost:8787/2026-11_demoday/

하는 일
1. 이 폴더의 슬라이드를 http://localhost:8787 로 보여 준다 (인터넷이 없어도 슬라이드는 열린다).
2. /proxy/... 로 들어온 AI 호출을 코디세이 API로 그대로 전달한다.
   코디세이 서버가 브라우저 직접 호출(CORS)을 막기 때문에, 같은 주소의 이 서버가 대신 보낸다.

키는 이 프로그램에 저장하지 않는다. 브라우저 설정 창(k)에 넣은 키가 요청 헤더로 들어오면 그대로 전달할 뿐이다.
"""
import http.server
import os
import socketserver
import sys
import urllib.error
import urllib.request
import webbrowser

PORT = int(os.environ.get("PORT", "8787"))
UPSTREAM = os.environ.get("UPSTREAM", "https://copa.codyssey.kr").rstrip("/")
ROOT = os.path.dirname(os.path.abspath(__file__))
PASS_HEADERS = ("content-type", "x-api-key", "anthropic-version", "authorization", "x-codyssey-session-id")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if not self.path.startswith("/proxy/"):
            self.send_error(404)
            return
        url = UPSTREAM + self.path[len("/proxy"):]
        body = self.rfile.read(int(self.headers.get("content-length", 0)))
        headers = {k: v for k, v in self.headers.items() if k.lower() in PASS_HEADERS}
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data, status, ctype = r.read(), r.status, r.headers.get("content-type", "application/json")
        except urllib.error.HTTPError as e:
            data, status, ctype = e.read(), e.code, e.headers.get("content-type", "text/plain")
        except Exception as e:  # 네트워크 끊김 등
            data, status, ctype = f"relay error: {e}".encode(), 502, "text/plain; charset=utf-8"
        self.send_response(status)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        if self.command == "POST":  # AI 호출만 화면에 남긴다 (키는 찍지 않음)
            sys.stderr.write("[AI] %s %s\n" % (self.path, args[1] if len(args) > 1 else ""))


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"슬라이드: http://localhost:{PORT}/2026-11_demoday/")
        print(f"재현 시험: http://localhost:{PORT}/2026-11_demoday/demo/test.html")
        print(f"AI 중계: /proxy → {UPSTREAM}   (끄려면 Ctrl+C)")
        if "--no-open" not in sys.argv:
            webbrowser.open(f"http://localhost:{PORT}/2026-11_demoday/")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
