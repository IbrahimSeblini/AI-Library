import React, { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { Button } from './ui/Button';

const LANDING_BG = '#0a0a12';
const LANDING_TEXT = '#f1f5f9';
const LANDING_MUTED = '#94a3b8';
const LANDING_CARD_BG = '#111127';
const LANDING_BORDER = 'rgba(99, 102, 241, 0.2)';
const ICON_STROKE = '#6366f1';

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

const iconProps = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none' as const, stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const FeatureIconUpload = () => (
  <svg {...iconProps}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="18" x2="12" y2="12" />
    <line x1="9" y1="15" x2="15" y2="15" />
  </svg>
);
const FeatureIconSpark = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
  </svg>
);
const FeatureIconChat = () => (
  <svg {...iconProps}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <line x1="9" y1="10" x2="15" y2="10" />
    <line x1="9" y1="14" x2="12" y2="14" />
  </svg>
);
const FeatureIconBookmark = () => (
  <svg {...iconProps}>
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);
const FeatureIconLines = () => (
  <svg {...iconProps}>
    <line x1="17" y1="10" x2="3" y2="10" />
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="21" y1="14" x2="3" y2="14" />
    <line x1="17" y1="18" x2="3" y2="18" />
  </svg>
);
const FeatureIconUsers = () => (
  <svg {...iconProps}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const FeatureIcons = [FeatureIconUpload, FeatureIconSpark, FeatureIconChat, FeatureIconBookmark, FeatureIconLines, FeatureIconUsers];

const features = [
  { title: 'Upload Any Paper', desc: 'Add PDFs to your library and our AI instantly extracts the title, authors, and full content.' },
  { title: 'Instant AI Summaries', desc: 'Get concise, accurate summaries of any paper in seconds. Understand more, read smarter.' },
  { title: 'Chat With Your Library', desc: 'Ask questions across all your papers. Our AI finds answers from your own collection.' },
  { title: 'Highlight & Remember', desc: 'Save key passages, color-code highlights, and revisit your most important insights.' },
  { title: 'Summarize & Paraphrase', desc: 'Rewrite complex text, check for plagiarism, and sharpen your academic writing.' },
  { title: 'Collaborate in Groups', desc: 'Create study groups, share papers, and research together with your peers.' },
];

const steps = [
  { num: '01', title: 'Upload your papers', desc: 'Drop any PDF and we handle the rest — metadata, content, and indexing.' },
  { num: '02', title: 'Explore with AI', desc: 'Summarize, paraphrase, highlight, and chat with your documents using our AI tools.' },
  { num: '03', title: 'Learn and collaborate', desc: 'Track your reading, save insights, and share knowledge with your study group.' },
];

const fadeUp = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } };
const stagger = (i: number) => ({ ...fadeUp, transition: { ...fadeUp.transition, delay: i * 0.1 } });

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onSignIn }) => {
  const [navScrolled, setNavScrolled] = useState(false);
  const featuresRef = useRef<HTMLDivElement>(null);
  const featuresInView = useInView(featuresRef, { once: true, margin: '-80px' });

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen" style={{ background: LANDING_BG, color: LANDING_TEXT }}>
      {/* ---------- SECTION 1: NAVBAR ---------- */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          navScrolled ? 'bg-[#0a0a12]/90 backdrop-blur-md border-b border-white/5' : 'bg-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg" style={{ background: 'var(--gradient-primary)' }}>
              <BookOpenIcon className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-lg font-display">MyLibraryPal</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSignIn}
              className="text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: LANDING_MUTED }}
            >
              Sign In
            </button>
            <Button variant="primary" size="md" onClick={onGetStarted}>
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* ---------- SECTION 2: HERO ---------- */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 pt-20 pb-16 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, rgba(79, 70, 229, 0.4) 0%, transparent 70%)' }}
          />
          <div
            className="absolute top-1/3 right-0 w-[500px] h-[500px] rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, rgba(124, 58, 237, 0.5) 0%, transparent 70%)' }}
          />
        </div>

        <div className="relative z-10 max-w-[820px] mx-auto text-center">
          <motion.div {...stagger(0)} className="mb-6">
            <span
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium"
              style={{ border: `1px solid ${LANDING_BORDER}`, color: 'rgba(167, 139, 250, 0.95)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="opacity-90">
                <path d="M12 2L9.19 9.19 2 12l7.19 2.81L12 22l2.81-7.19L22 12l-7.19-2.81z" />
              </svg>
              {' '}
              AI-Powered Research Companion
            </span>
          </motion.div>

          <motion.h1
            {...stagger(1)}
            className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6"
            style={{ color: LANDING_TEXT }}
          >
            Your research library,
            <br />
            <span style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              supercharged by AI.
            </span>
          </motion.h1>

          <motion.p
            {...stagger(2)}
            className="text-lg sm:text-xl max-w-2xl mx-auto mb-10 font-light"
            style={{ color: LANDING_MUTED, lineHeight: 1.6 }}
          >
            Upload papers, generate summaries, highlight insights, and chat with your library — all in one place.
          </motion.p>

          <motion.div {...stagger(3)} className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Button variant="primary" size="lg" onClick={onGetStarted} className="w-full sm:w-auto">
              Get Started — it&apos;s free
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={scrollToFeatures}
              className="w-full sm:w-auto"
              style={{ color: LANDING_TEXT, borderColor: 'rgba(241,245,249,0.25)' }}
            >
              See how it works
            </Button>
          </motion.div>

          <motion.div
            {...stagger(4)}
            className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-sm"
            style={{ color: LANDING_MUTED }}
          >
            <span className="inline-flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              No credit card required
            </span>
            <span className="inline-flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Upload any PDF
            </span>
            <span className="inline-flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Powered by AI
            </span>
          </motion.div>
        </div>
      </section>

      {/* ---------- SECTION 3: FEATURE CARDS ---------- */}
      <section
        id="features"
        ref={featuresRef}
        className="py-24 px-6"
        style={{ background: '#0f0f1a' }}
      >
        <div className="max-w-6xl mx-auto">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={featuresInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4 }}
            className="text-center text-xs font-semibold tracking-widest uppercase mb-3"
            style={{ color: LANDING_MUTED }}
          >
            Everything you need
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={featuresInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="text-3xl sm:text-4xl font-bold text-center mb-16"
            style={{ color: LANDING_TEXT }}
          >
            One place for all your research.
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => {
              const IconComponent = FeatureIcons[i];
              return (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 24 }}
                  animate={featuresInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.05, ease: [0.25, 0.46, 0.45, 0.94] }}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="p-6 rounded-xl border transition-shadow hover:shadow-xl"
                  style={{ background: LANDING_CARD_BG }}
                >
                  <div
                    className="w-12 h-12 rounded-[10px] flex items-center justify-center mb-4"
                    style={{ background: 'rgba(99, 102, 241, 0.1)' }}
                  >
                    <span style={{ color: ICON_STROKE }}>
                      <IconComponent />
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: LANDING_TEXT }}>{f.title}</h3>
                  <p className="text-[15px] leading-relaxed" style={{ color: LANDING_MUTED }}>{f.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- SECTION 4: HOW IT WORKS ---------- */}
      <section className="py-24 px-6" style={{ background: LANDING_BG }}>
        <div className="max-w-4xl mx-auto text-center mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.4 }}
            className="text-3xl sm:text-4xl font-bold mb-3"
            style={{ color: LANDING_TEXT }}
          >
            Simple by design.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="text-lg"
            style={{ color: LANDING_MUTED }}
          >
            From upload to insight in three steps.
          </motion.p>
        </div>

        <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-start gap-8 md:gap-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.num}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="flex-1 text-center md:text-left"
            >
              <div className="text-5xl font-bold mb-3 opacity-20" style={{ color: '#6366f1' }}>{s.num}</div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: LANDING_TEXT }}>{s.title}</h3>
              <p className="text-[15px] leading-relaxed" style={{ color: LANDING_MUTED }}>{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------- SECTION 5: FINAL CTA ---------- */}
      <section className="py-24 px-6" style={{ background: LANDING_BG }}>
        <div className="max-w-2xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="text-3xl sm:text-4xl font-bold mb-4"
            style={{ color: LANDING_TEXT }}
          >
            Ready to read smarter?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="text-lg mb-8"
            style={{ color: LANDING_MUTED }}
          >
            Join students and researchers already using MyLibraryPal.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Button variant="primary" size="lg" onClick={onGetStarted} className="min-w-[200px]">
              Get Started for Free
            </Button>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="mt-6 text-sm"
            style={{ color: LANDING_MUTED }}
          >
            Already have an account?{' '}
            <button type="button" onClick={onSignIn} className="text-[var(--primary)] hover:underline font-medium">
              Sign in →
            </button>
          </motion.p>
        </div>
      </section>

      {/* ---------- FOOTER ---------- */}
      <footer className="py-6 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm" style={{ color: LANDING_MUTED }}>
          <span>© 2026 MyLibraryPal</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white/80 transition-colors">Privacy</a>
            <a href="#" className="hover:text-white/80 transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
