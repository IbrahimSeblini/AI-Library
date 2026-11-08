import React from 'react';
import { motion } from 'framer-motion';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  glass?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  hover = false,
  onClick,
  padding = 'md',
  glass = false,
}) => {
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-6',
  };

  const baseClasses = `
    rounded-[22px]
    ${glass
      ? 'bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)]'
      : 'bg-[var(--surface)] border border-[var(--border)] shadow-sm'
    }
    ${paddingClasses[padding]}
    ${onClick || hover ? 'cursor-pointer' : ''}
    ${className}
  `.trim().replace(/\s+/g, ' ');

  const Component = onClick || hover ? motion.div : 'div';
  const motionProps = onClick || hover ? {
    whileHover: {
      boxShadow: 'var(--shadow-md)',
      borderColor: 'var(--primary-light)',
      transition: { duration: 0.2 },
    },
    whileTap: onClick ? { y: 0 } : undefined,
    transition: { duration: 0.2 },
  } : {};

  if (onClick || hover) {
    return (
      <Component
        className={baseClasses}
        onClick={onClick}
        {...motionProps}
      >
        {children}
      </Component>
    );
  }

  return (
    <div className={baseClasses}>
      {children}
    </div>
  );
};
