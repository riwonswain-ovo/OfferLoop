import {
  useFieldContext,
  useFormContext,
} from '@client/src/components/business-ui/form/hooks/form-context';

export const useFieldValidation = <T>() => {
  const field = useFieldContext<T>();
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
  const errorMessage = isInvalid
    ? (field.state.meta.errors[0].message ?? field.state.meta.errors[0])
    : '';
  return {
    isInvalid,
    errorMessage,
  };
};

export const useFieldName = () => {
  const form = useFormContext();
  const field = useFieldContext();
  const name = `${form.formId}-${field.name}`;
  return name;
};
