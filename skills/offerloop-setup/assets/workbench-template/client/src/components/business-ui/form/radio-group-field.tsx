import type { ReactNode } from 'react';

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
import { cn } from '@/lib/utils';
import { Label } from '@client/src/components/ui/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@client/src/components/ui/radio-group';

type RadioOption = {
  label: string;
  value: string;
  disabled?: boolean;
  description?: string;
};

type RadioGroupFieldProps = CommonFieldProps & {
  children?: ReactNode;
  options?: RadioOption[];
  orientation?: 'horizontal' | 'vertical';
  classNames?: Partial<
    FieldLayoutClassNames & {
      radioGroup: string;
    }
  >;
  styles?: Partial<
    FieldLayoutStyles & {
      radioGroup: React.CSSProperties;
    }
  >;
};

function renderRadioOptions(
  options: RadioOption[],
  fieldName: string,
  disabled: boolean,
): ReactNode {
  return options.map((option, index) => {
    const optionId = `${fieldName}-${index}`;

    return (
      <div key={option.value} className="flex items-center space-x-2">
        <RadioGroupItem
          id={optionId}
          value={option.value}
          disabled={disabled || option.disabled}
        />
        <Label
          htmlFor={optionId}
          className={cn(
            `${option.disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`,
            'font-normal',
          )}
        >
          {option.label}
        </Label>
        {option.description && (
          <span className="text-sm text-muted-foreground">
            {option.description}
          </span>
        )}
      </div>
    );
  });
}

export function RadioGroupField(props: RadioGroupFieldProps) {
  const {
    children,
    description,
    label,
    options,
    orientation = 'vertical',
    required,
    layout,
    disabled,
    classNames,
    styles,
  } = props;
  const field = useFieldContext<string>();
  const { isInvalid, errorMessage } = useFieldValidation();
  const { layout: formLayout } = useFormGlobalProps();
  const name = useFieldName();
  const { radioGroup: radioGroupClassName, ...fieldLayoutClassNames } =
    classNames ?? {};
  const { radioGroup: radioGroupStyle, ...fieldLayoutStyles } = styles ?? {};

  const hasContent = children || options;

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
      <RadioGroup
        id={name}
        name={name}
        orientation={orientation}
        aria-invalid={isInvalid}
        value={field.state.value}
        disabled={disabled}
        onValueChange={(value) => field.handleChange(value)}
        className={cn(
          'flex gap-3',
          orientation === 'horizontal' ? 'flex-row' : 'flex-col',
          radioGroupClassName,
        )}
        style={radioGroupStyle ?? {}}
      >
        {hasContent ? (
          children ||
          (options && renderRadioOptions(options, name, disabled ?? false))
        ) : (
          <div className="text-sm text-muted-foreground">暂无选项</div>
        )}
      </RadioGroup>
    </FieldLayout>
  );
}
