import os
from http.server import HTTPServer, BaseHTTPRequestHandler

from otel_setup import init_telemetry

logger = init_telemetry("python-docker-agent")

class SimpleHTTPRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'Hello from Python Docker Template')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    httpd = HTTPServer(('0.0.0.0', port), SimpleHTTPRequestHandler)
    logger.info(f"Listening on port {port}...")
    try:
        httpd.serve_forever()
    except Exception as e:
        logger.error(f"Server error: {e}")
        raise
