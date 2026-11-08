import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', ...props }, ref) => {
    const inputClasses = `
      w-full min-h-[44px] px-4 py-2.5 rounded-md
      bg-transparent border
      text-[var(--text)]
      placeholder-[var(--text-subtle)]
      transition-all duration-200
      focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]
      disabled:opacity-50 disabled:cursor-not-allowed
      ${error ? 'border-[var(--danger)] focus:ring-[var(--danger)]' : 'border-[var(--border)]'}
      ${className}
    `.trim().replace(/\s+/g, ' ');
    
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--text-muted)] mb-2">
            {label}
            {props.required && <span className="text-[var(--danger)] ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          className={inputClasses}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-[var(--danger)] flex items-center">
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';



