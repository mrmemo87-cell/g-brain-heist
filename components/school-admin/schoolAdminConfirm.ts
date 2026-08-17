export interface SchoolAdminConfirmValues {
  effectiveDate?: string;
}

export interface SchoolAdminConfirmDialog {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  requiresReason?: boolean;
  reasonRequired?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonInitialValue?: string;
  reasonMinimumLength?: number;
  requiresEffectiveDate?: boolean;
  effectiveDateLabel?: string;
  effectiveDateInitialValue?: string;
  onConfirm: (reason?: string, values?: SchoolAdminConfirmValues) => Promise<void> | void;
}
