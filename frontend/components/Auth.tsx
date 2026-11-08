import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { Toast } from './ui/Toast';

interface AuthProps {
  onLogin: (credentials: { email: string; pass: string }) => Promise<void>;
  onSignup: (details: { name: string; email: string; pass: string }) => Promise<void>;
}

const features = [
  { title: 'Smart Library', desc: 'AI-powered organisation of your academic papers' },
  { title: 'Virtual Librarian', desc: 'Chat with an AI assistant to find papers instantly' },
  { title: 'Study Groups', desc: 'Collaborate and share insights with your peers' },
];

const Auth: React.FC<AuthProps> = ({ onLogin, onSignup }) => {
  const [authOpen, setAuthOpen] = useState(false);
  const [isLoginView, setIsLoginView] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('error');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [nameError, setNameError] = useState('');

  const validateEmail = (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!value) { setEmailError('Email is required'); return false; }
    if (!emailRegex.test(value)) { setEmailError('Please enter a valid email address'); return false; }
    setEmailError('');
    return true;
  };

  const validatePassword = (value: string) => {
    if (!value) { setPasswordError('Password is required'); return false; }
    if (!isLoginView) {
      if (value.length < 8) { setPasswordError('Password must be at least 8 characters'); return false; }
      if (!/[A-Z]/.test(value)) { setPasswordError('Password must contain an uppercase letter'); return false; }
      if (!/[a-z]/.test(value)) { setPasswordError('Password must contain a lowercase letter'); return false; }
      if (!/\d/.test(value)) { setPasswordError('Password must contain a number'); return false; }
      if (!/[^A-Za-z0-9]/.test(value)) { setPasswordError('Password must contain a special character'); return false; }
    }
    setPasswordError('');
    return true;
  };

  const validateName = (value: string) => {
    if (!isLoginView && !value) { setNameError('Name is required'); return false; }
    if (!isLoginView && value.length < 2) { setNameError('Name must be at least 2 characters'); return false; }
    setNameError('');
    return true;
  };

  const clearForm = () => {
    setName(''); setEmail(''); setPassword('');
    setEmailError(''); setPasswordError(''); setNameError('');
    setError(null); setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    const isNameValid = isLoginView ? true : validateName(name);
    if (!isEmailValid || !isPasswordValid || !isNameValid) return;

    setIsLoading(true); setError(null); setSuccess(null);
    try {
      if (isLoginView) {
        await onLogin({ email, pass: password });
      } else {
        await onSignup({ name, email, pass: password });
        setSuccess('Account created successfully! Please sign in to continue.');
        setToastType('success'); setShowToast(true);
        setIsLoginView(true); clearForm();
      }
    } catch (err: any) {
      const errorMessage = err.message || 'An unexpected error occurred.';
      setError(errorMessage); setToastType('error'); setShowToast(true);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleView = () => { setIsLoginView(!isLoginView); clearForm(); };

  return (
    <>
      <Toast
        message={error || success || ''}
        type={toastType}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />
      <div className="min-h-screen flex overflow-x-hidden">
        {/* Welcome panel — full screen when auth closed, left half when auth open (hidden on mobile when open) */}
        <motion.div
          className={`flex relative overflow-hidden flex-col items-center justify-center p-8 md:p-12 ${
            authOpen ? 'hidden md:flex md:w-1/2' : 'w-full'
          }`}
          style={{ background: 'var(--gradient-hero)' }}
          layout
          transition={{ layout: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } } }
        >
          {/* Animated floating blobs */}
          {[
            { size: 220, top: '8%', left: '5%', duration: 5 },
            { size: 160, top: '55%', left: '62%', duration: 6 },
            { size: 320, top: '28%', left: '25%', duration: 7 },
            { size: 110, top: '72%', left: '15%', duration: 4.5 },
          ].map((blob, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: blob.size,
                height: blob.size,
                background: 'rgba(255, 255, 255, 0.12)',
                filter: 'blur(48px)',
                top: blob.top,
                left: blob.left,
              }}
              animate={{ y: [0, -18, 0], x: [0, 10, 0] }}
              transition={{ duration: blob.duration, repeat: Infinity, ease: 'easeInOut', delay: i * 0.6 }}
            />
          ))}

          <div className="relative z-10 text-white text-center max-w-sm">
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="flex items-center justify-center mb-6"
            >
              <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
                <BookOpenIcon className="w-12 h-12 text-white" />
              </div>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-4xl font-bold font-display mb-3"
            >
              MyLibraryPal
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-white/80 text-lg mb-10"
            >
              Your Intelligent Learning Partner
            </motion.p>

            <div className="space-y-3 text-left">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="bg-white/10 backdrop-blur-sm rounded-xl p-4"
                >
                  <p className="font-semibold text-white">{f.title}</p>
                  <p className="text-white/70 text-sm mt-1">{f.desc}</p>
                </motion.div>
              ))}
            </div>

            {/* CTA to open sign-in / sign-up — only when auth panel is closed */}
            {!authOpen && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="mt-10 w-full max-w-sm mx-auto"
              >
                <motion.button
                  type="button"
                  onClick={() => setAuthOpen(true)}
                  className="relative w-full group overflow-hidden rounded-2xl px-8 py-4 text-center font-bold text-lg text-white border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-transparent"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 100%)',
                    color: 'var(--primary)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.3), 0 20px 40px -12px rgba(0,0,0,0.25), 0 0 60px -20px rgba(124, 58, 237, 0.5)',
                  }}
                  animate={{
                    boxShadow: [
                      '0 0 0 1px rgba(255,255,255,0.3), 0 20px 40px -12px rgba(0,0,0,0.25), 0 0 60px -20px rgba(124, 58, 237, 0.5)',
                      '0 0 0 1px rgba(255,255,255,0.4), 0 20px 40px -12px rgba(0,0,0,0.25), 0 0 80px -15px rgba(124, 58, 237, 0.6)',
                      '0 0 0 1px rgba(255,255,255,0.3), 0 20px 40px -12px rgba(0,0,0,0.25), 0 0 60px -20px rgba(124, 58, 237, 0.5)',
                    ],
                  }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  whileHover={{
                    scale: 1.03,
                    boxShadow: '0 0 0 2px rgba(255,255,255,0.5), 0 24px 48px -12px rgba(0,0,0,0.3), 0 0 100px -10px rgba(124, 58, 237, 0.7)',
                    transition: { duration: 0.2 },
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  {/* Shimmer sweep on hover */}
                  <motion.span
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none"
                    style={{
                      background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.4) 45%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,0.4) 55%, transparent 100%)',
                      backgroundSize: '200% 100%',
                    }}
                    initial={{ x: '-100%' }}
                    whileHover={{ x: '100%' }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    <span>Get Started</span>
                    <motion.span
                      animate={{ x: [0, 5, 0] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <svg className="w-5 h-5 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </motion.span>
                  </span>
                </motion.button>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Auth panel — slides in from right when opened (picture 2) */}
        <AnimatePresence>
          {authOpen && (
            <motion.div
              key="auth-panel"
              className="w-full md:w-1/2 flex items-center justify-center p-6 relative flex-shrink-0"
              style={{
                background: 'var(--bg)',
              backgroundImage: 'var(--bg-mesh)',
              }}
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 35, mass: 0.8 }}
            >
          {/* Subtle background gradient shift when toggling (background-driven transition) */}
          <motion.div
            className="absolute inset-0 pointer-events-none opacity-30"
            initial={false}
            animate={{
                background: isLoginView
                ? 'radial-gradient(ellipse 80% 50% at 20% 50%, rgba(79, 70, 229, 0.12) 0%, transparent 50%)'
                : 'radial-gradient(ellipse 80% 50% at 80% 50%, rgba(124, 58, 237, 0.14) 0%, transparent 50%)',
            }}
            transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
            aria-hidden
          />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md relative z-10"
          >
            <Card glass className="shadow-2xl overflow-hidden relative" padding="lg">
              {/* Close / back to welcome */}
              <div className="absolute top-4 right-4 md:top-6 md:right-6 z-20">
                <button
                  type="button"
                  onClick={() => setAuthOpen(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text)] p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  aria-label="Back to welcome"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col items-center mb-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className="p-4 rounded-2xl mb-4 shadow-lg"
                  style={{ background: 'var(--gradient-primary)' }}
                >
                  <BookOpenIcon className="w-10 h-10 text-white" />
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-3xl font-bold font-display mb-2"
                  style={{
                    background: 'var(--gradient-primary)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  MyLibraryPal
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-[var(--text-muted)] text-sm"
                >
                  Your Intelligent Learning Partner
                </motion.p>
              </div>

              {/* Sliding panels: login and sign-up side by side */}
              <div className="overflow-hidden">
                <motion.div
                  className="flex"
                  style={{ width: '200%' }}
                  initial={false}
                  animate={{ x: isLoginView ? 0 : '-50%' }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 35,
                    mass: 0.8,
                  }}
                >
                  {/* Login panel */}
                  <div className="w-1/2 shrink-0 min-w-0 pr-0">
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <Input
                        label="Email Address"
                        id="email-login"
                        type="email"
                        placeholder="alex.doe@university.edu"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); if (emailError) validateEmail(e.target.value); }}
                        onBlur={() => validateEmail(email)}
                        error={emailError}
                        required
                      />
                      <Input
                        label="Password"
                        id="password-login"
                        type="password"
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); if (passwordError) validatePassword(e.target.value); }}
                        onBlur={() => validatePassword(password)}
                        error={passwordError}
                        required
                      />
                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        isLoading={isLoading}
                        className="w-full"
                      >
                        Sign In
                      </Button>
                    </form>
                    <p className="text-center text-[var(--text-muted)] text-sm mt-6">
                      Don&apos;t have an account?{' '}
                      <button
                        type="button"
                        onClick={toggleView}
                        className="font-semibold text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 rounded px-1"
                      >
                        Sign Up
                      </button>
                    </p>
                  </div>

                  {/* Sign-up panel */}
                  <div className="w-1/2 shrink-0 min-w-0 pl-0">
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <Input
                        label="Full Name"
                        id="name"
                        type="text"
                        placeholder="Alex Doe"
                        value={name}
                        onChange={(e) => { setName(e.target.value); if (nameError) validateName(e.target.value); }}
                        onBlur={() => validateName(name)}
                        error={nameError}
                        required
                      />
                      <Input
                        label="Email Address"
                        id="email-signup"
                        type="email"
                        placeholder="alex.doe@university.edu"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); if (emailError) validateEmail(e.target.value); }}
                        onBlur={() => validateEmail(email)}
                        error={emailError}
                        required
                      />
                      <Input
                        label="Password"
                        id="password-signup"
                        type="password"
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); if (passwordError) validatePassword(e.target.value); }}
                        onBlur={() => validatePassword(password)}
                        error={passwordError}
                        required
                      />
                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        isLoading={isLoading}
                        className="w-full"
                      >
                        Create Account
                      </Button>
                    </form>
                    <p className="text-center text-[var(--text-muted)] text-sm mt-6">
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={toggleView}
                        className="font-semibold text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 rounded px-1"
                      >
                        Sign In
                      </button>
                    </p>
                  </div>
                </motion.div>
              </div>
            </Card>
          </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export default Auth;
