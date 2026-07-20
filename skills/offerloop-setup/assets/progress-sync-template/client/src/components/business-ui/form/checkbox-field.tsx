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
import { Checkbox } from '@client/src/components/ui/checkbox';
import { Field, FieldLabel } from '@client/src/components/ui/field';

type CheckboxFieldProps = CommonFieldProps &
  React.ComponentProps<typeof Checkbox> & {
    options?: {
      label: string;
      value: boolean | 'indeterminate';
    }[];
    classNames?: Partial<FieldLayoutClassNames & Record<'checkbox', string>>;
    styles?: Partial<
      FieldLayoutStyles & Record<'checkbox', React.CSSProperties>
    >;
  };

export function CheckboxField({
  label,
  description,
  disabled,
  required,
  layout,
  classNames,
  styles,
  ...rest
}: CheckboxFieldProps) {
  const field = useFieldContext<boolean | 'indeterminate'>();
  const { layout: formLayout } = useFormGlobalProps();
  const { isInvalid, errorMessage } = useFieldValidation();
  const name = useFieldName();

  const { checkbox: checkboxClassName, ...fieldLayoutClassNames } =
    classNames ?? {};
  const { checkbox: checkboxStyle, ...fieldLayoutStyles } = styles ?? {};

  return (
    <FieldLayout
      description={description}
      isInvalid={isInvalid}
      layout={layout ?? formLayout ?? 'vertical'}
      required={required ?? false}
      classNames={fieldLayoutClassNames ?? {}}
      styles={fieldLayoutStyles ?? {}}
      errorMessage={errorMessage}
      name={name}
    >
      <Field orientation="horizontal">
        <Checkbox
          {...rest}
          id={name}
          name={name}
          className={checkboxClassName ?? ''}
          style={checkboxStyle ?? {}}
          required={required ?? false}
          aria-invalid={isInvalid}
          checked={field.state.value}
          disabled={disabled}
          onCheckedChange={(checked) => {
            field.handleChange(checked);
          }}
        />
        <FieldLabel
          style={styles?.label}
          className={classNames?.['label']}
          htmlFor={name}
        >
          {label}
        </FieldLabel>
      </Field>
    </FieldLayout>
  );
}
