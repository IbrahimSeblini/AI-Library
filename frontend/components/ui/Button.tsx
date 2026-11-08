import React from 'react';
import { motion } from 'framer-motion';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  className = '',
  children,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center min-h-[44px] font-semibold tracking-[0.02em] rounded-md transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'text-[var(--primary-contrast)] shadow-sm focus:ring-2 focus:ring-offset-2 focus:ring-[var(--primary)]',
    secondary: 'border border-[var(--border)] bg-transparent text-[var(--text)] hover:bg-[var(--bg-secondary)]/65 hover:text-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]',
    danger: 'border border-[var(--danger)]/22 bg-[var(--danger-light)] text-[var(--danger)] hover:border-[var(--danger)] hover:bg-[var(--danger-light)] focus:ring-2 focus:ring-[var(--danger)] shadow-sm',
    ghost: 'text-[var(--text-muted)] hover:text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] underline-offset-4 hover:underline',
  };

  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2.5 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const classes = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;

  const primaryStyle = variant === 'primary' ? { background: 'var(--gradient-primary)' } : {};

  return (
    <motion.button
      className={classes}
      style={primaryStyle}
      disabled={disabled || isLoading}
      whileHover={{
        y: disabled || isLoading ? 0 : -1,
        boxShadow: variant === 'primary' && !disabled && !isLoading ? 'var(--glow-primary)' : undefined,
      }}
      whileTap={{ y: disabled || isLoading ? 0 : 0 }}
      transition={{ duration: 0.15 }}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center">
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading...
        </span>
      ) : children}
    </motion.button>
  );
};
