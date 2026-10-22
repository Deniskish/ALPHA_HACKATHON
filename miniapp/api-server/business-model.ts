// Профиль компании из реестрового поиска (company-data). Кредитная модель — в credit/types.
import type { FieldProvenance } from './company-data/types';

export type ProfileValues = {
  industry?: string;
  inn: string;
  name: string;
  region: string;
  companyType: 'ООО' | 'АО' | 'ИП' | 'КФХ' | 'другое' | '';
  okved: string;
  ageMonths: number | null;
  employees: number | null;
  revenue: number | null;
  isSme: 'yes' | 'no' | 'unknown';
  tax: string;
  goals: string[];
};
export type Profile = ProfileValues & {
  companyStatus?: string | null;
  applicantType?: 'legal_entity' | 'individual_entrepreneur' | 'individual' | 'team' | 'project';
  provenance?: Partial<Record<keyof ProfileValues | 'applicantType' | 'companyStatus', FieldProvenance>>;
};
export const emptyProfile: Profile = {
  industry: '',
  inn: '',
  name: '',
  region: '',
  companyType: '',
  okved: '',
  ageMonths: null,
  employees: null,
  revenue: null,
  isSme: 'unknown',
  tax: '',
  goals: [],
};
