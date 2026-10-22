// Общие элементы управления на нативных button/input/textarea.
// Разметка и классы совпадают с прежними обёртками, поэтому стили тем не меняются.
import React from 'react';

/** Pointer focus is not keyboard focus; keep the latter available after Tab/keyboard activation. */
export function IconButton({ className = '', type = 'button', onPointerDown, onKeyDown, onBlur,
  ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} type={type} className={`opora-icon-action ${className}`}
    onPointerDown={event => { event.currentTarget.dataset.pointerFocus = 'true'; onPointerDown?.(event); }}
    onKeyDown={event => { delete event.currentTarget.dataset.pointerFocus; onKeyDown?.(event); }}
    onBlur={event => { delete event.currentTarget.dataset.pointerFocus; onBlur?.(event); }} />;
}

// Вариант задаёт только базовый фон; конкретные классы кнопок переопределяют его в CSS.
export function ActionButton({ className = '', type = 'button', children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variant =
    className.includes('primary') || className.includes('lime-button')
      ? 'primary'
      : className.includes('secondary')
        ? 'secondary'
        : 'ghost';
  return (
    <button {...props} type={type} className={`opora-action opora-action-${variant} ${className}`}>
      <span className="opora-action-content">{children}</span>
    </button>
  );
}

export type BusinessInputProps = React.InputHTMLAttributes<HTMLInputElement> & { iconBefore?: React.ReactNode };
export function BusinessInput({ className = '', iconBefore, ...props }: BusinessInputProps) {
  return (
    <div className="opora-input">
      <label className={`opora-input-control ${props.disabled ? 'opora-input-disabled ' : ''}${className}`}>
        {iconBefore ? <div className="opora-input-icon">{iconBefore}</div> : null}
        <span className="opora-input-body">
          <input {...props} className="opora-native-input" />
        </span>
      </label>
    </div>
  );
}

export function BusinessTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="opora-textarea">
      <textarea {...props} className="opora-native-textarea" />
    </div>
  );
}
