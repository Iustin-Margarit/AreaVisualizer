# Local test server that tells browsers not to keep copies, so a plain reload always shows the
# latest changes (phones included).   python tools/dev-server.py   → http://localhost:5173
import functools, http.server, os

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
http.server.ThreadingHTTPServer(('', 5173), functools.partial(NoCache, directory=root)).serve_forever()
