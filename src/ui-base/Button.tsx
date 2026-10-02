import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  appearance?: 'primary' | 'quiet';
};

/** Shared interaction primitive; each work can override its visual theme. */
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
      className={`ui-button ui-button--${appearance} adv-button adv-button--${appearance} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
