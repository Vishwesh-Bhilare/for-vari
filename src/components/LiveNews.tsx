import React, { useEffect, useState, useMemo } from 'react';

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  link: string;
  source: string;
  published: string;
  category: 'palkhi' | 'traffic' | 'temple' | 'weather' | 'general';
  language: 'mr' | 'en';
  scraped_at: number;
}

const CATEGORIES = [
  { id: 'all', label: 'All News', icon: '📰' },
  { id: 'palkhi', label: 'Palkhi & Wari', icon: '🚩' },
  { id: 'traffic', label: 'Traffic & Route', icon: '🚗' },
  { id: 'temple', label: 'Vitthal Temple', icon: '🛕' },
  { id: 'weather', label: 'Weather', icon: '☀️' },
];

const FALLBACK_NEWS: NewsItem[] = [
  {
    id: 'f1',
    title: 'Palkhi Procession Route Traffic Curbs Update for Pune-Pandharpur Highway',
    summary: 'District administration issues route advisories for Varkaris and commuters. Alternate bypass routes established for heavy vehicles.',
    link: 'https://news.google.com/rss/search?q=Pandharpur+Wari',
    source: 'Pune News Bulletin',
    published: 'Recently',
    category: 'traffic',
    language: 'en',
    scraped_at: Date.now() / 1000 - 1800
  },
  {
    id: 'f2',
    title: 'आषाढी वारी निमित्त पंढरपूर विठ्ठल रुक्मिणी मंदिरात विशेष दर्शनाची व्यवस्था',
    summary: 'भाविकांच्या सोयीसाठी मुखदर्शन रांगेत प्रथमोपचार, पिण्याचे पाणी आणि छताची सावली उपलब्ध करून देण्यात आली आहे.',
    link: 'https://news.google.com/rss/search?q=%E0%A4%AA%E0%A4%82%E0%A4%A2%E0%A4%B0%E0%A4%AA%E0%A5%82%E0%A4%B0+%E0%A4%B5%E0%A4%BE%E0%A4%B0%E0%A5%80',
    source: 'ABP Majha',
    published: 'Recently',
    category: 'temple',
    language: 'mr',
    scraped_at: Date.now() / 1000 - 3600
  },
  {
    id: 'f3',
    title: 'Sant Dnyaneshwar Maharaj Palkhi Reaches Key Route Stop with Thousands of Varkaris',
    summary: 'The main Palkhi procession continues its holy journey towards Pandharpur with elaborate volunteer and medical support along the way.',
    link: 'https://news.google.com/rss/search?q=Pandharpur+Palkhi',
    source: 'The Indian Express',
    published: 'Recently',
    category: 'palkhi',
    language: 'en',
    scraped_at: Date.now() / 1000 - 5400
  }
];

function formatTimeAgo(pubDateStr: string, scrapedAt: number): string {
  if (pubDateStr) {
    try {
      const date = new Date(pubDateStr);
      if (!isNaN(date.getTime())) {
        const diffSecs = Math.floor((Date.now() - date.getTime()) / 1000);
        if (diffSecs < 60) return 'Just now';
        if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
        if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
        return `${Math.floor(diffSecs / 86400)}d ago`;
      }
    } catch {
      // ignore parsing error
    }
  }

  const diffSecs = Math.floor(Date.now() / 1000 - scrapedAt);
  if (diffSecs < 3600) return `${Math.max(1, Math.floor(diffSecs / 60))}m ago`;
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
  return `${Math.floor(diffSecs / 86400)}d ago`;
}

export function LiveNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScraped, setLastScraped] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedLang, setSelectedLang] = useState<'all' | 'mr' | 'en'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchNews = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // Try Vite proxy endpoint /api/news or direct Python server on localhost:5000
      let res: Response | null = null;
      try {
        res = await fetch(`/api/news${forceRefresh ? '?refresh=true' : ''}`, { signal: AbortSignal.timeout(6000) });
      } catch {
        res = await fetch(`http://127.0.0.1:5000/api/news${forceRefresh ? '?refresh=true' : ''}`, { signal: AbortSignal.timeout(6000) });
      }

      if (res && res.ok) {
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.news) && data.news.length > 0) {
          setNews(data.news);
          setLastScraped(data.last_scraped || Math.floor(Date.now() / 1000));
          setLoading(false);
          setRefreshing(false);
          return;
        }
      }
      throw new Error('News backend unreachable or returning empty results.');
    } catch (err) {
      console.warn('Realtime news fetch notice:', err);
      // Graceful fallback to pre-scraped news
      setNews((prev) => (prev.length > 0 ? prev : FALLBACK_NEWS));
      setError('Python real-time scraper is offline. Showing recent cached news.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchNews();
    const interval = setInterval(() => void fetchNews(), 300_000); // refresh every 5 mins
    return () => clearInterval(interval);
  }, []);

  const filteredNews = useMemo(() => {
    return news.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (selectedLang !== 'all' && item.language !== selectedLang) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          item.title.toLowerCase().includes(q) ||
          item.summary.toLowerCase().includes(q) ||
          item.source.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [news, selectedCategory, selectedLang, searchQuery]);

  const handleShare = async (item: NewsItem) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          text: `[Vari News] ${item.title}`,
          url: item.link,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    await navigator.clipboard.writeText(`${item.title}\n${item.link}`);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <section className="rounded-3xl border border-cream-200 bg-white p-5 shadow-sm transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-3 w-3 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-stone-900">
              Live Wari News
              <span className="rounded-md bg-saffron-100 px-2 py-0.5 text-xs font-bold text-saffron-800 uppercase tracking-wider">
                Real-Time Scraper
              </span>
            </h2>
            <p className="text-xs text-stone-500">
              Scraped live from news sources & traffic bulletins
              {lastScraped ? ` · Updated ${formatTimeAgo('', lastScraped)}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Language filter */}
          <div className="flex rounded-xl bg-saffron-50 p-1 border border-cream-200">
            <button
              onClick={() => setSelectedLang('all')}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                selectedLang === 'all' ? 'bg-saffron-600 text-white shadow-xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedLang('mr')}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                selectedLang === 'mr' ? 'bg-saffron-600 text-white shadow-xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              मराठी
            </button>
            <button
              onClick={() => setSelectedLang('en')}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                selectedLang === 'en' ? 'bg-saffron-600 text-white shadow-xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              ENG
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={() => void fetchNews(true)}
            disabled={refreshing || loading}
            title="Scrape fresh live news"
            className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-cream-200 bg-saffron-50 px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-saffron-100 active:scale-95 disabled:opacity-50 transition-all"
          >
            <span className={`text-sm ${refreshing ? 'animate-spin' : ''}`}>🔄</span>
            <span className="hidden sm:inline">{refreshing ? 'Scraping...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Category Pills & Search */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {CATEGORIES.map((cat) => {
            const count =
              cat.id === 'all'
                ? news.length
                : news.filter((n) => n.category === cat.id).length;

            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex flex-shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                  selectedCategory === cat.id
                    ? 'border-saffron-600 bg-saffron-600 text-white shadow-xs'
                    : 'border-cream-200 bg-saffron-50/60 text-stone-700 hover:border-saffron-300 hover:bg-saffron-100/50'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] ${
                    selectedCategory === cat.id
                      ? 'bg-white/20 text-white'
                      : 'bg-cream-200 text-stone-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search news headlines, traffic, Vitthal temple..."
            className="w-full min-h-[42px] rounded-xl border border-cream-200 bg-saffron-50/40 px-3.5 py-2.5 pl-9 text-xs text-stone-900 placeholder:text-stone-400 focus:border-saffron-600 focus:bg-white focus:ring-2 focus:ring-saffron-600/20 focus:outline-none transition-all"
          />
          <span className="absolute left-3 top-3 text-xs text-stone-400">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-stone-400 hover:text-stone-600"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Offline Notice banner if python server is disconnected */}
      {error && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <span className="flex items-center gap-1.5 font-medium">
            <span>ℹ️</span>
            {error}
          </span>
          <button
            onClick={() => void fetchNews(true)}
            className="shrink-0 rounded-lg bg-amber-200/80 px-2 py-1 font-bold text-amber-900 hover:bg-amber-300"
          >
            Retry Scraping
          </button>
        </div>
      )}

      {/* News List */}
      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="space-y-3 py-6 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-3 border-saffron-600 border-t-transparent" />
            <p className="text-xs font-semibold text-stone-500">
              Running Python real-time news scraper...
            </p>
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="rounded-2xl bg-cream-50 py-8 text-center text-stone-500">
            <span className="text-3xl">📭</span>
            <p className="mt-2 text-xs font-bold text-stone-700">No news matching your filter.</p>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSelectedLang('all');
                setSearchQuery('');
              }}
              className="mt-2 text-xs font-bold text-saffron-600 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          filteredNews.map((item) => (
            <article
              key={item.id}
              className="group rounded-2xl border border-cream-200 bg-white p-4 shadow-2xs hover:border-saffron-300 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded-md bg-stone-900 px-2 py-0.5 font-extrabold text-white text-[10px] tracking-wide">
                    {item.source}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 font-bold text-[10px] ${
                      item.category === 'palkhi'
                        ? 'bg-saffron-100 text-saffron-800'
                        : item.category === 'traffic'
                        ? 'bg-red-100 text-red-800'
                        : item.category === 'temple'
                        ? 'bg-amber-100 text-amber-800'
                        : item.category === 'weather'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-cream-100 text-stone-700'
                    }`}
                  >
                    {item.category.toUpperCase()}
                  </span>
                  {item.language === 'mr' && (
                    <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-800">
                      मराठी
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-semibold text-stone-400">
                  {formatTimeAgo(item.published, item.scraped_at)}
                </span>
              </div>

              <h3 className="mt-2 text-sm font-extrabold leading-snug text-stone-900 group-hover:text-saffron-600 transition-colors">
                <a href={item.link} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
              </h3>

              {item.summary && (
                <p className="mt-1 text-xs text-stone-600 line-clamp-2 leading-relaxed">
                  {item.summary}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-cream-100 pt-2.5">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-extrabold text-saffron-600 hover:text-saffron-700 hover:underline"
                >
                  Read full news ↗
                </a>

                <button
                  onClick={() => void handleShare(item)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-stone-500 hover:bg-saffron-50 hover:text-stone-900 transition-colors"
                >
                  <span>{copiedId === item.id ? '✓ Copied' : '🔗 Share'}</span>
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
