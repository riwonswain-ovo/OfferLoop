import type {
  BaseEntitySelectProps,
  ItemValue,
} from '@client/src/components/business-ui/entity-combobox/shared-types';
import type { I18nText } from '@client/src/components/business-ui/entity-combobox/types';

export type DepartmentInfo = {
  departmentID: string;
  larkDepartmentID: string;
  name: I18nText;
};

export type Department = ItemValue<DepartmentInfo>;

export type DepartmentSelectProps = BaseEntitySelectProps<Department>;
