#!/usr/bin/env python3
"""
Real-time News Scraper for Pandharpur Vari & Maharashtra Pilgrimage Updates.
Scrapes news concurrently from multiple RSS feeds and web sources.
"""

import re
import html
import time
import hashlib
import urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from bs4 import BeautifulSoup

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,mr;q=0.8'
}

NEWS_SOURCES = [
    {
        'name': 'Google News (Pandharpur Wari)',
        'type': 'rss',
        'url': 'https://news.google.com/rss/search?q=Pandharpur+Wari+OR+Palkhi+OR+Varkari&hl=en-IN&gl=IN&ceid=IN:en',
        'language': 'en'
    },
    {
        'name': 'Google News Marathi (पंढरपूर वारी)',
        'type': 'rss',
        'url': 'https://news.google.com/rss/search?q=%E0%A4%AA%E0%A4%82%E0%A4%A2%E0%A4%B0%E0%A4%AA%E0%A5%82%E0%A4%B0+%E0%A4%B5%E0%A4%BE%E0%A4%B0%E0%A5%80+OR+%E0%A4%AA%E0%A4%AA%E0%A4%BE%E0%A4%B2%E0%A4%96%E0%A5%80&hl=mr&gl=IN&ceid=IN:mr',
        'language': 'mr'
    },
    {
        'name': 'Google News Traffic & Route (Pandharpur Route)',
        'type': 'rss',
        'url': 'https://news.google.com/rss/search?q=Pandharpur+palkhi+traffic+route&hl=en-IN&gl=IN&ceid=IN:en',
        'language': 'en'
    },
    {
        'name': 'Google News Temple (विठ्ठल मंदिर पंढरपूर)',
        'type': 'rss',
        'url': 'https://news.google.com/rss/search?q=%E0%A4%B5%E0%A4%BF%E0%A4%A0%E0%A4%AF%E0%A5%8D%E0%A4%A0%E0%A4%B2+%E0%A4%AE%E0%A4%82%E0%A4%A6%E0%A4%BF%E0%A4%B0+%E0%A4%AA%E0%A4%82%E0%A4%A2%E0%A4%B0%E0%A4%AA%E0%A5%82%E0%A4%B0&hl=mr&gl=IN&ceid=IN:mr',
        'language': 'mr'
    }
]

def clean_text(text):
    if not text:
        return ''
    text = html.unescape(text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def categorize(title, summary=''):
    text = f"{title} {summary}".lower()
    
    # Traffic / Route
    if any(k in text for k in ['traffic', 'route', 'road', 'curb', 'closure', 'वाहतूक', 'मार्ग', 'रस्ता', 'डायव्हर्जन', 'जाम', 'मार्ग बदल']):
        return 'traffic'
    # Temple / Darshan
    elif any(k in text for k in ['vitthal', 'temple', 'darshan', 'rukmini', 'विठ्ठल', 'मंदिर', 'दर्शन', 'रुक्मिणी', 'पूजा', 'अलंकार']):
        return 'temple'
    # Palkhi / Varkari
    elif any(k in text for k in ['palkhi', 'wari', 'varkari', 'dehu', 'alandi', 'sant', 'पालखी', 'वारी', 'वारकरी', 'देहू', 'आळंदी', 'संत', 'प्रस्थान']):
        return 'palkhi'
    # Weather & Environment
    elif any(k in text for k in ['rain', 'weather', 'flood', 'monsoon', 'पाऊस', 'हवामान', 'उकाडा', 'पूर']):
        return 'weather'
    
    return 'general'

def generate_id(title, link):
    raw = f"{title}-{link}"
    return hashlib.md5(raw.encode('utf-8')).hexdigest()[:12]

def parse_rss_feed(source_info):
    articles = []
    try:
        resp = requests.get(source_info['url'], headers=HEADERS, timeout=8)
        if resp.status_code != 200:
            return []
        
        root = ET.fromstring(resp.content)
        items = root.findall('.//item')
        
        for item in items[:15]:
            title_elem = item.find('title')
            link_elem = item.find('link')
            pub_date_elem = item.find('pubDate')
            desc_elem = item.find('description')
            source_elem = item.find('source')
            
            title = clean_text(title_elem.text if title_elem is not None else '')
            link = link_elem.text if link_elem is not None else ''
            pub_date = pub_date_elem.text if pub_date_elem is not None else ''
            desc = clean_text(desc_elem.text if desc_elem is not None else '')
            
            source_name = source_elem.text if source_elem is not None else source_info['name']
            
            # Clean up titles that have source appended like "Title - Source"
            if ' - ' in title:
                parts = title.rsplit(' - ', 1)
                title = parts[0]
                if source_elem is None:
                    source_name = parts[1]
            
            if not title:
                continue
                
            article = {
                'id': generate_id(title, link),
                'title': title,
                'summary': desc[:220] + ('...' if len(desc) > 220 else ''),
                'link': link,
                'source': source_name,
                'published': pub_date,
                'category': categorize(title, desc),
                'language': source_info.get('language', 'mr' if re.search(r'[\u0900-\u097F]', title) else 'en'),
                'scraped_at': int(time.time())
            }
            articles.append(article)
    except Exception as err:
        print(f"[Scraper Error] {source_info['name']}: {err}")
        
    return articles

class LiveNewsScraper:
    def __init__(self, cache_ttl=300):
        self.cache_ttl = cache_ttl
        self._cache = []
        self._last_scraped = 0

    def scrape_all(self, force=False):
        now = time.time()
        if not force and self._cache and (now - self._last_scraped < self.cache_ttl):
            return self._cache

        all_articles = []
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_source = {executor.submit(parse_rss_feed, src): src for src in NEWS_SOURCES}
            for future in as_completed(future_to_source):
                try:
                    res = future.result()
                    all_articles.extend(res)
                except Exception as e:
                    print(f"[Executor Error]: {e}")

        # Deduplicate by title similarity / clean title
        seen_titles = set()
        unique_articles = []
        
        for art in all_articles:
            normalized_title = re.sub(r'[^\w\s]', '', art['title'].lower()).strip()
            if normalized_title and normalized_title not in seen_titles:
                seen_titles.add(normalized_title)
                unique_articles.append(art)

        self._cache = unique_articles
        self._last_scraped = now
        return self._cache

if __name__ == '__main__':
    scraper = LiveNewsScraper()
    print("Testing real-time news scraper...")
    news = scraper.scrape_all(force=True)
    print(f"\nScraped {len(news)} unique live articles!\n")
    for i, a in enumerate(news[:5], 1):
        print(f"{i}. [{a['category'].upper()}] [{a['language'].upper()}] {a['title']}")
        print(f"   Source: {a['source']} | Date: {a['published']}")
        print(f"   Link: {a['link']}\n")
