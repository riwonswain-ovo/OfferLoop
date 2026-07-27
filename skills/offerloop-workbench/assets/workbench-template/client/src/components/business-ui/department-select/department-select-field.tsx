import {
  DepartmentSelect,
  type DepartmentSelectProps,
} from '@client/src/components/business-ui/department-select';
import type { Department } from '@client/src/components/business-ui/department-select/types';
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

type DepartmentSelectFieldProps = CommonFieldProps &
  Omit<
    DepartmentSelectProps,
    'value' | 'onChange' | 'defaultValue' | 'name' | 'required'
  > & {
    classNames?: Partial<
      FieldLayoutClassNames & {
        DepartmentSelect: string;
      }
    >;
    styles?: Partial<
      FieldLayoutStyles & {
        DepartmentSelect: React.CSSProperties;
      }
    >;
  };

export function DepartmentSelectField(props: DepartmentSelectFieldProps) {
  const {
    label,
    description,
    required,
    disabled,
    classNames,
    layout = 'vertical',
    styles,
    multiple,
    ...departmentSelectProps
  } = props;

  const field = useFieldContext<Department | Department[] | null>();
  const { isInvalid, errorMessage } = useFieldValidation();
  const { layout: formLayout } = useFormGlobalProps();
  const name = useFieldName();

  const {
    DepartmentSelect: departmentSelectClassName,
    ...fieldLayoutClassNames
  } = classNames ?? {};
  const fieldLayoutStyles = styles ?? {};

  return (
    <FieldLayout
      label={label}
      description={description}
      isInvalid={isInvalid}
      required={required ?? false}
      layout={layout ?? formLayout ?? 'vertical'}
      classNames={fieldLayoutClassNames ?? {}}
      styles={fieldLayoutStyles ?? {}}
      errorMessage={errorMessage}
      name={name}
    >
      <DepartmentSelect
        {...departmentSelectProps}
        multiple={multiple}
        value={field.state.value ?? (multiple ? [] : null)}
        onChange={(value: Department | Department[] | null) => {
          field.handleChange(value);
        }}
        disabled={disabled ?? false}
        name={name}
        required={required}
        className={departmentSelectClassName}
      />
    </FieldLayout>
  );
}
