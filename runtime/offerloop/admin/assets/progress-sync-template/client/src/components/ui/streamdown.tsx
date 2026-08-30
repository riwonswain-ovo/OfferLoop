'use client';

import * as React from 'react';
import { Streamdown as StreamdownPrimitive } from 'streamdown';

import { cn } from '@/lib/utils';
import { omit } from 'es-toolkit';

const defaultComponents: NonNullable<
  React.ComponentProps<typeof StreamdownPrimitive>['components']
> = {
  ol: ({ className, ...props }) => (
    <ol
      className={cn(className)}
      data-streamdown="ordered-list"
      {...omit(props, ['node'])}
    />
  ),
  li: ({ className, ...props }) => (
    <li
      className={cn(className)}
      data-streamdown="list-item"
      {...omit(props, ['node'])}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(className)}
      data-streamdown="unordered-list"
      {...omit(props, ['node'])}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr
      className={cn(className)}
      data-streamdown="horizontal-rule"
      {...omit(props, ['node'])}
    />
  ),
  strong: ({ className, ...props }) => (
    <strong
      className={cn(className)}
      data-streamdown="strong"
      {...omit(props, ['node'])}
    />
  ),
  a: ({ className, href, ...props }) => {
    const isIncomplete = href === 'streamdown:incomplete-link';

    return (
      <a
        className={cn(className)}
        data-incomplete={isIncomplete}
        data-streamdown="link"
        href={href}
        rel={props.rel ?? 'noreferrer'}
        target={props.target ?? '_blank'}
        {...omit(props, ['node'])}
      />
    );
  },
  h1: ({ className, ...props }) => (
    <h1
      className={cn(className)}
      data-streamdown="heading-1"
      {...omit(props, ['node'])}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(className)}
      data-streamdown="heading-2"
      {...omit(props, ['node'])}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(className)}
      data-streamdown="heading-3"
      {...omit(props, ['node'])}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn(className)}
      data-streamdown="heading-4"
      {...omit(props, ['node'])}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn(className)}
      data-streamdown="heading-5"
      {...omit(props, ['node'])}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn(className)}
      data-streamdown="heading-6"
      {...omit(props, ['node'])}
    />
  ),
  table: ({ className, ...props }) => (
    <table
      className={cn(className)}
      data-streamdown="table-wrapper"
      {...omit(props, ['node'])}
    />
  ),
  thead: ({ className, ...props }) => (
    <thead
      className={cn(className)}
      data-streamdown="table-header"
      {...omit(props, ['node'])}
    />
  ),
  tbody: ({ className, ...props }) => (
    <tbody
      className={cn(className)}
      data-streamdown="table-body"
      {...omit(props, ['node'])}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr
      className={cn(className)}
      data-streamdown="table-row"
      {...omit(props, ['node'])}
    />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(className)}
      data-streamdown="table-header-cell"
      {...omit(props, ['node'])}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(className)}
      data-streamdown="table-cell"
      {...omit(props, ['node'])}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(className)}
      data-streamdown="blockquote"
      {...omit(props, ['node'])}
    />
  ),
  sup: ({ className, ...props }) => (
    <sup className={cn(className)} {...omit(props, ['node'])} />
  ),
  sub: ({ className, ...props }) => (
    <sub className={cn(className)} {...omit(props, ['node'])} />
  ),
  p: ({ className, ...props }) => (
    <p className={cn(className)} {...omit(props, ['node'])} />
  ),
  section: ({ className, ...props }) => (
    <section className={cn(className)} {...omit(props, ['node'])} />
  ),
  img: ({ className, alt, ...props }) => (
    <img className={cn(className)} alt={alt ?? ''} {...omit(props, ['node'])} />
  ),
  pre: ({ children }) => <div className="not-prose">{children}</div>,
};

export function Streamdown({
  className,
  components,
  ...props
}: React.ComponentProps<typeof StreamdownPrimitive>) {
  return (
    <StreamdownPrimitive
      className={cn(
        'prose max-w-none dark:prose-invert',
        className,
      )}
      components={{ ...defaultComponents, ...components }}
      {...props}
    />
  );
}
