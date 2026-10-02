import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  appearance?: 'primary' | 'quiet';
};

/** Optional shared UI primitive. A work can supply its own components. */
export function Button({
  children,
  appearance = 'quiet',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`adv-button adv-button--${appearance} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
