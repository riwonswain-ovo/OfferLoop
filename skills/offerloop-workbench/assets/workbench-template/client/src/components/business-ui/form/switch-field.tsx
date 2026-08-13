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
import { Switch } from '@client/src/components/ui/switch';

type SwitchFieldProps = CommonFieldProps &
  React.ComponentProps<typeof Switch> & {
    classNames?: Partial<FieldLayoutClassNames & Record<'switch', string>>;
    styles?: Partial<FieldLayoutStyles & Record<'switch', React.CSSProperties>>;
  };

export function SwitchField(props: SwitchFieldProps) {
  const {
    label,
    description,
    disabled,
    required,
    classNames,
    layout = 'vertical',
    styles,
    ...rest
  } = props;
  const field = useFieldContext<boolean>();
  const { isInvalid, errorMessage } = useFieldValidation();
  const name = useFieldName();
  const { switch: switchClassName, ...fieldLayoutClassNames } =
    classNames ?? {};
  const { switch: switchStyle, ...fieldLayoutStyles } = styles ?? {};

  return (
    <FieldLayout
      label={label}
      description={description}
      isInvalid={isInvalid}
      required={required ?? false}
      layout={layout}
      classNames={fieldLayoutClassNames}
      styles={fieldLayoutStyles}
      errorMessage={errorMessage}
      name={name}
    >
      <Switch
        {...rest}
        id={name}
        className={switchClassName ?? ''}
        style={switchStyle ?? {}}
        name={name}
        disabled={disabled ?? false}
        checked={field.state.value}
        onBlur={field.handleBlur}
        onCheckedChange={(checked) => {
          field.handleChange(checked);
        }}
        aria-invalid={isInvalid}
      />
    </FieldLayout>
  );
}
