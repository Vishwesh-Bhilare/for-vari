import React, { useState, useEffect } from 'react';
import {
  Menu,
  X,
  Map,
  LayoutDashboard,
  Handshake,
  Shield,
  User,
  LogOut,
  Home,
  Bell,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LayoutProps {
  children: React.ReactNode;
  currentView?: 'pilgrim' | 'admin';
  onViewChange?: (view: 'pilgrim' | 'admin') => void;
}

const Layout: React.FC<LayoutProps> = ({ children, currentView = 'pilgrim', onViewChange }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check scroll position for header effects
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on view change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [currentView]);

  const navItems = [
    { id: 'pilgrim', label: 'Home', icon: Home },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'map', label: 'Live Map', icon: Map },
    { id: 'lending', label: 'Lending', icon: Handshake },
    { id: 'admin', label: 'Admin', icon: Shield },
  ];

  const handleNavClick = (id: string) => {
    if (id === 'admin') {
      onViewChange?.('admin');
    } else {
      onViewChange?.('pilgrim');
    }
  };

  const isActive = (id: string) => {
    if (id === 'pilgrim') return currentView === 'pilgrim';
    if (id === 'admin') return currentView === 'admin';
    return false;
  };

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      {/* ============================================
          HEADER - Glass-morphism with warm tones
          ============================================ */}
      <header
        className={`
          fixed top-0 left-0 right-0 z-50 transition-all duration-500
          ${isScrolled 
            ? 'glass-warm shadow-warm-md py-3' 
            : 'bg-transparent py-5'
          }
        `}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            {/* Logo - Handcrafted feel */}
            <div className="flex items-center gap-3 group cursor-pointer">
              <div className="relative">
                <div className="w-10 h-10 rounded-organic-sm bg-gradient-to-br from-saffron to-saffron-dark flex items-center justify-center shadow-warm">
                  <span className="text-white font-serif text-lg font-bold leading-none">
                    व
                  </span>
                </div>
                {/* Subtle glow */}
                <div className="absolute inset-0 rounded-organic-sm bg-saffron opacity-20 blur-md group-hover:opacity-40 transition-opacity" />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-serif text-lg font-semibold text-text leading-tight tracking-tight">
                  Pandharpur
                  <span className="text-saffron"> Vari</span>
                </h1>
                <p className="text-[10px] font-sans text-text-light/70 tracking-widest uppercase">
                  Wari 2026
                </p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`
                      relative px-4 py-2 rounded-organic-sm text-sm font-medium transition-all duration-300
                      flex items-center gap-2 cursor-pointer
                      ${active 
                        ? 'text-saffron bg-cream/80 shadow-warm' 
                        : 'text-text-light hover:text-text hover:bg-cream/50'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {active && (
                      <motion.span
                        layoutId="active-nav"
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-saffron rounded-full"
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Right Side - User Actions */}
            <div className="flex items-center gap-3">
              {/* Notification Bell */}
              <button
                className="relative p-2 rounded-organic-sm text-text-light hover:text-text hover:bg-cream/60 transition-all duration-200"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-saffron rounded-full animate-pulse-soft" />
              </button>

              {/* User Menu / Auth */}
              {isLoggedIn ? (
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-organic-sm bg-cream/60 border border-gold-light/30">
                    <div className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-text-light" />
                    </div>
                    <span className="text-sm font-medium text-text-light">Devotee</span>
                    <ChevronDown className="w-4 h-4 text-text-light/50" />
                  </div>
                  <button
                    className="p-2 rounded-organic-sm text-text-light hover:text-maroon hover:bg-cream/60 transition-all duration-200"
                    aria-label="Logout"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    className="hidden sm:inline-flex px-4 py-2 rounded-organic-sm text-sm font-medium text-text-light hover:text-text hover:bg-cream/60 transition-all duration-200"
                  >
                    Sign In
                  </button>
                  <button
                    className="px-4 py-2 rounded-organic-sm text-sm font-medium bg-saffron text-white hover:bg-saffron-dark transition-all duration-200 shadow-warm hover:shadow-warm-md"
                  >
                    Join Wari
                  </button>
                </div>
              )}

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-organic-sm text-text-light hover:text-text hover:bg-cream/60 transition-all duration-200"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu - Animated */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="md:hidden absolute top-full left-0 right-0 glass-warm border-t border-gold-light/20 shadow-warm-lg"
            >
              <nav className="max-w-7xl mx-auto px-4 py-4 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`
                        w-full flex items-center gap-3 px-4 py-3 rounded-organic-sm text-sm font-medium transition-all duration-200 text-left
                        ${active 
                          ? 'text-saffron bg-cream/80' 
                          : 'text-text-light hover:text-text hover:bg-cream/50'
                        }
                      `}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                      {active && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-saffron" />
                      )}
                    </button>
                  );
                })}
                <div className="border-t border-gold-light/20 my-3 pt-3">
                  {!isLoggedIn && (
                    <div className="flex flex-col gap-2">
                      <button
                        className="flex items-center justify-center px-4 py-3 rounded-organic-sm text-sm font-medium text-text-light hover:text-text hover:bg-cream/50 transition-all duration-200 w-full"
                      >
                        Sign In
                      </button>
                      <button
                        className="flex items-center justify-center px-4 py-3 rounded-organic-sm text-sm font-medium bg-saffron text-white hover:bg-saffron-dark transition-all duration-200 w-full"
                      >
                        Join Wari ✦
                      </button>
                    </div>
                  )}
                </div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ============================================
          MAIN CONTENT
          ============================================ */}
      <main className="flex-1 pt-[--header-height]">
        {/* Subtle saffron glow at top of content */}
        <div className="relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-64 bg-saffron-glow pointer-events-none" />
          <div className="relative">
            {children}
          </div>
        </div>
      </main>

      {/* ============================================
          FOOTER - Warm, simple, handcrafted
          ============================================ */}
      <footer className="relative mt-auto border-t border-gold-light/20 bg-warm-gray/50">
        {/* Grain texture overlay */}
        <div className="absolute inset-0 grain-overlay opacity-30 pointer-events-none" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-organic-sm bg-gradient-to-br from-saffron to-saffron-dark flex items-center justify-center">
                  <span className="text-white font-serif text-base font-bold leading-none">
                    व
                  </span>
                </div>
                <div>
                  <h3 className="font-serif text-lg font-semibold text-text leading-tight">
                    Pandharpur Vari
                  </h3>
                  <p className="text-xs text-text-light/60 tracking-widest uppercase">
                    Wari 2026
                  </p>
                </div>
              </div>
              <p className="text-sm text-text-light/70 leading-relaxed max-w-xs">
                Connecting devotees on the sacred journey to Pandharpur. 
                <span className="block mt-1 text-gold">⟡ ज्ञानेश्वर माऊली ⟡</span>
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-serif text-sm font-semibold text-text mb-4">
                Explore
              </h4>
              <ul className="space-y-2.5">
                {['Dashboard', 'Live Map', 'Lending', 'About Wari'].map((item) => (
                  <li key={item}>
                    <button
                      onClick={() => handleNavClick(item.toLowerCase() as any)}
                      className="text-sm text-text-light/70 hover:text-saffron transition-colors duration-200"
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Community */}
            <div>
              <h4 className="font-serif text-sm font-semibold text-text mb-4">
                Community
              </h4>
              <ul className="space-y-2.5">
                {['Volunteer', 'Support', 'Contact', 'Privacy Policy'].map((item) => (
                  <li key={item}>
                    <button
                      className="text-sm text-text-light/70 hover:text-saffron transition-colors duration-200"
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Connect */}
            <div>
              <h4 className="font-serif text-sm font-semibold text-text mb-4">
                Connect
              </h4>
              <p className="text-sm text-text-light/70 mb-4">
                Join the sacred journey
              </p>
              <button
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-organic-sm text-sm font-medium bg-saffron text-white hover:bg-saffron-dark transition-all duration-200 shadow-warm hover:shadow-warm-md group"
              >
                <span>Join Now</span>
                <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
              </button>
            </div>
          </div>

          {/* Divider - Organic */}
          <div className="divider-organic my-8">
            <span>⟡</span>
          </div>

          {/* Bottom Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-text-light/60">
            <p>
              © {new Date().getFullYear()} Pandharpur Vari. Made with{' '}
              <span className="text-maroon-light">♥</span> for the divine journey.
            </p>
            <div className="flex items-center gap-6">
              <span className="text-xs tracking-widest uppercase">
                वारी २०२६
              </span>
              <span className="w-px h-4 bg-gold-light/30" />
              <span className="text-xs">
                संतांचा संग
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
