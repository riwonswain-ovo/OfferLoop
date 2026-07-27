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
import { Input } from '@client/src/components/ui/input';

type InputFieldProps = CommonFieldProps &
  React.ComponentProps<typeof Input> & {
    classNames?: Partial<
      FieldLayoutClassNames & {
        input: string;
      }
    >;
    styles?: Partial<
      FieldLayoutStyles & {
        input: React.CSSProperties;
      }
    >;
  };

export function InputField({
  label,
  description,
  disabled,
  required,
  layout = 'vertical',
  classNames,
  readOnly,
  styles,
  ...rest
}: InputFieldProps) {
  const field = useFieldContext<string>();
  const { isInvalid, errorMessage } = useFieldValidation();
  const { layout: formLayout } = useFormGlobalProps();
  const name = useFieldName();
  const { input: inputClassName, ...fieldLayoutClassNames } = classNames ?? {};
  const { input: inputStyle, ...fieldLayoutStyles } = styles ?? {};

  return (
    <FieldLayout
      label={label}
      layout={layout ?? formLayout ?? 'vertical'}
      description={description}
      isInvalid={isInvalid}
      required={required ?? false}
      classNames={fieldLayoutClassNames ?? {}}
      styles={fieldLayoutStyles ?? {}}
      errorMessage={errorMessage}
      name={name}
    >
      <Input
        {...rest}
        className={inputClassName ?? ''}
        style={inputStyle ?? {}}
        disabled={disabled ?? false}
        readOnly={readOnly ?? false}
        id={name}
        name={name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        aria-invalid={isInvalid}
      />
    </FieldLayout>
  );
}
