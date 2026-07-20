import { Asterisk } from 'lucide-react';

import type { FieldLayoutProps } from '@client/src/components/business-ui/form/types';
import { cn } from '@/lib/utils';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@client/src/components/ui/field';

export function FieldLayout({
  label,
  children,
  description,
  layout = 'vertical',
  isInvalid,
  errorMessage,
  name,
  required,
  classNames,
  styles,
}: React.PropsWithChildren<FieldLayoutProps>) {
  const descriptionComponent = description && (
    <FieldDescription
      className={classNames?.['description']}
      style={styles?.['description']}
    >
      {description}
    </FieldDescription>
  );

  const labelComponent = label && (
    <FieldLabel
      className={cn('gap-0.5', classNames?.['label'])}
      htmlFor={name}
      style={styles?.['label']}
    >
      {label}
      {required && (
        <span className="text-red-500">
          <Asterisk size={12} />
        </span>
      )}
    </FieldLabel>
  );

  const errorComponent = isInvalid && (
    <FieldError className={classNames?.['error']} style={styles?.['error']}>
      {errorMessage}
    </FieldError>
  );

  if (layout !== 'vertical') {
    return (
      <Field
        orientation={layout}
        className={cn(classNames?.['root'])}
        style={styles?.['root']}
      >
        {descriptionComponent ? (
          <FieldContent>
            {labelComponent}
            {descriptionComponent}
          </FieldContent>
        ) : (
          labelComponent
        )}
        <FieldContent className={'has-[>[role=switch]]:flex-initial'}>
          {children}
          {errorComponent}
        </FieldContent>
      </Field>
    );
  }
  return (
    <Field
      orientation={layout}
      className={classNames?.['root']}
      style={styles?.['root']}
    >
      {labelComponent}
      <FieldContent className={'has-[>[role=switch]]:flex-initial'}>
        {children}
        {errorComponent}
      </FieldContent>
      {descriptionComponent}
    </Field>
  );
}
