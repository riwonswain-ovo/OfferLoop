'use client';

import React from 'react';

export interface FormGlobalProps {
  layout: 'vertical' | 'responsive' | 'horizontal';
}

export type FormContextType = FormGlobalProps | null;

export const FormContext = React.createContext<FormContextType>(null);

export const useFormContext = () => {
  const context = React.useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext must be used within a FormProvider');
  }
  return context as FormGlobalProps;
};

export const FormProvider: React.FC<{
  layout: 'vertical' | 'responsive' | 'horizontal';
  children: React.ReactNode;
}> = ({ layout, children }) => {
  const value = React.useMemo(
    () => ({
      layout: layout,
    }),
    [layout],
  );

  return <FormContext.Provider value={value}>{children}</FormContext.Provider>;
};

export const useFormGlobalProps = () => {
  const context = useFormContext();
  return context;
};
