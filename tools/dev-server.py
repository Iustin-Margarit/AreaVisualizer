# Local test server that tells browsers not to keep copies, so a plain reload always shows the
# latest changes (phones included).   python tools/dev-server.py   → http://localhost:5173
import functools, http.server, os

class NoCache(http.server.SimpleHTTPRequestHandler):
    # Like vercel.json: /1-acre, /ro… are pages/1-acre.html, pages/ro.html (tools/pages.mjs).
    def translate_path(self, path):
        found = super().translate_path(path)
        name = path.split('?')[0].split('#')[0].strip('/')
        page = os.path.join(root, 'pages', name + '.html')
        if name and '/' not in name and not os.path.exists(found) and os.path.isfile(page):
            return page
        return found

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
http.server.ThreadingHTTPServer(('', 5173), functools.partial(NoCache, directory=root)).serve_forever()
