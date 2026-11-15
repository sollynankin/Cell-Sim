"""Static server with caching disabled, so edits to the ES modules always show up on reload.
    python serve.py [port]
"""
import functools
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5192
    handler = functools.partial(NoCache, directory=str(Path(__file__).resolve().parent))
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
