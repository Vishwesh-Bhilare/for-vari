#!/usr/bin/env python3
"""
Python API Server for Real-Time News.
Provides HTTP API endpoints on port 5000 for Vite frontend.
"""

import sys
import os
import json
import time
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from news_scraper import LiveNewsScraper

scraper = LiveNewsScraper(cache_ttl=300)
START_TIME = time.time()

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Handle requests in a separate thread."""
    daemon_threads = True

class NewsRequestHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status_code=200, content_type='application/json'):
        self.send_response(status_code)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query_params = urllib.parse.parse_qs(parsed.query)

        if path == '/api/health':
            self._set_headers(200)
            res = {
                'status': 'ok',
                'service': 'realtime-news-scraper',
                'uptime_seconds': int(time.time() - START_TIME)
            }
            self.wfile.write(json.dumps(res).encode('utf-8'))
            return

        if path == '/api/news':
            force_refresh = query_params.get('refresh', ['false'])[0].lower() == 'true'
            category_filter = query_params.get('category', ['all'])[0].lower()
            lang_filter = query_params.get('lang', ['all'])[0].lower()
            search_query = query_params.get('q', [''])[0].lower().strip()

            try:
                all_news = scraper.scrape_all(force=force_refresh)
                filtered = all_news

                if category_filter != 'all':
                    filtered = [item for item in filtered if item['category'] == category_filter]

                if lang_filter != 'all':
                    filtered = [item for item in filtered if item['language'] == lang_filter]

                if search_query:
                    filtered = [
                        item for item in filtered
                        if search_query in item['title'].lower() or search_query in item['summary'].lower() or search_query in item['source'].lower()
                    ]

                self._set_headers(200)
                response_data = {
                    'status': 'success',
                    'count': len(filtered),
                    'total_available': len(all_news),
                    'last_scraped': int(scraper._last_scraped),
                    'news': filtered
                }
                self.wfile.write(json.dumps(response_data, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self._set_headers(500)
                err_resp = {'status': 'error', 'message': str(e)}
                self.wfile.write(json.dumps(err_resp).encode('utf-8'))
            return

        if path == '/api/news/categories':
            try:
                all_news = scraper.scrape_all(force=False)
                counts = {'all': len(all_news), 'palkhi': 0, 'traffic': 0, 'temple': 0, 'weather': 0, 'general': 0}
                for item in all_news:
                    cat = item.get('category', 'general')
                    counts[cat] = counts.get(cat, 0) + 1

                self._set_headers(200)
                self.wfile.write(json.dumps({'status': 'success', 'categories': counts}).encode('utf-8'))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode('utf-8'))
            return

        # 404
        self._set_headers(404)
        self.wfile.write(json.dumps({'status': 'error', 'message': 'Endpoint not found'}).encode('utf-8'))

    def log_message(self, format, *args):
        # Concise custom logging
        print(f"[NewsServer] {self.address_string()} - {args[0]}")

def run_server(port=5005):
    host = '0.0.0.0'
    server = ThreadedHTTPServer((host, port), NewsRequestHandler)
    print(f"🔥 Real-time News Scraper API running on http://localhost:{port}/api/news")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down news server...")
        server.server_close()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5005))
    run_server(port)
