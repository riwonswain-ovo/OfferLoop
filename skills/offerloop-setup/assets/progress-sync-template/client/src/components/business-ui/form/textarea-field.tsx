import { useFormGlobalProps } from '@client/src/components/business-ui/form/context';
import { FieldLayout } from '@client/src/components/business-ui/form/field-layout';
import { useFieldContext } from '@client/src/components/business-ui/form/hooks/form-context';
import {
  useFieldName,
  useFieldValidation,
} from '@client/src/components/business-ui/form/hooks/form-utils';
import type {
  CommonFieldProps,
  FieldLayoutClassNames,
  FieldLayoutStyles,
} from '@client/src/components/business-ui/form/types';
import { Textarea } from '@client/src/components/ui/textarea';

type TextareaFieldProps = CommonFieldProps &
  React.ComponentProps<typeof Textarea> & {
    classNames?: Partial<FieldLayoutClassNames & Record<'textarea', string>>;
    styles?: Partial<
      FieldLayoutStyles & Record<'textarea', React.CSSProperties>
    >;
  };

export function TextareaField({
  label,
  description,
  disabled,
  required,
  classNames,
  layout = 'vertical',
  readOnly,
  styles,
  ...rest
}: TextareaFieldProps) {
  const field = useFieldContext<string>();
  const { isInvalid, errorMessage } = useFieldValidation();
  const { layout: formLayout } = useFormGlobalProps();
  const name = useFieldName();

  const { textarea: textareaClassName, ...fieldLayoutClassNames } =
    classNames ?? {};
  const { textarea: textareaStyle, ...fieldLayoutStyles } = styles ?? {};

  return (
    <FieldLayout
      label={label}
      description={description}
      isInvalid={isInvalid}
      required={required ?? false}
      layout={layout ?? formLayout ?? 'vertical'}
      classNames={fieldLayoutClassNames}
      styles={fieldLayoutStyles}
      errorMessage={errorMessage}
      name={name}
    >
      <Textarea
        {...rest}
        disabled={disabled ?? false}
        readOnly={readOnly ?? false}
        id={name}
        name={name}
        className={textareaClassName ?? ''}
        style={textareaStyle ?? {}}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => {
          field.handleChange(e.target.value);
        }}
        aria-invalid={isInvalid}
      />
    </FieldLayout>
  );
}
