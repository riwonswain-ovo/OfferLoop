import React from 'react';
import type { AppFieldExtendedReactFormApi } from '@tanstack/react-form';

import { FormProvider } from '@client/src/components/business-ui/form/context';
import { FieldGroup } from '@client/src/components/ui/field';

interface FormProps {
  children: React.ReactNode;
  form: AppFieldExtendedReactFormApi<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any
  >;
  className?: string;
  style?: React.CSSProperties;
  layout?: 'vertical' | 'responsive' | 'horizontal';
}

const ForceForm: React.FC<FormProps> = (props) => {
  const { children, form, className, style, layout = 'vertical' } = props;
  return (
    <FormProvider layout={layout}>
      <form
        data-testid="tanstack-form"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <form.AppForm>
          <FieldGroup className={className} style={style}>
            {children}
          </FieldGroup>
        </form.AppForm>
      </form>
    </FormProvider>
  );
};

const Form = ForceForm;

export { Form };
