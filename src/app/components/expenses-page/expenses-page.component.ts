import { Component, computed, EventEmitter, inject, Output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ImmoStore } from '../../immo-store';
import {
  ExpenseAttachmentInput,
  ExpenseCategory,
  PropertyExpense,
  PropertyExpenseInput,
} from '../../models';
import { LucideIconComponent } from '../lucide-icon.component';

interface ExpenseCategoryOption {
  value: ExpenseCategory;
  label: string;
}

const MAX_ATTACHMENT_SIZE = 5_000_000;
const PAGE_SIZE = 10;

@Component({
  selector: 'app-expenses-page',
  imports: [ReactiveFormsModule, LucideIconComponent],
  templateUrl: './expenses-page.component.html',
  styleUrl: './expenses-page.component.scss',
})
export class ExpensesPageComponent {
  private readonly formBuilder = inject(FormBuilder);
  readonly store = inject(ImmoStore);

  @Output() readonly notice = new EventEmitter<string>();

  readonly categories: ExpenseCategoryOption[] = [
    { value: 'RENOVATION', label: 'Rénovation' },
    { value: 'MAINTENANCE', label: 'Entretien / maintenance' },
    { value: 'REPAIR', label: 'Réparation' },
    { value: 'UTILITIES', label: 'Eau, électricité et charges' },
    { value: 'TAX', label: 'Taxes et frais administratifs' },
    { value: 'INSURANCE', label: 'Assurance' },
    { value: 'CLEANING', label: 'Nettoyage' },
    { value: 'SECURITY', label: 'Sécurité' },
    { value: 'EQUIPMENT', label: 'Équipement et mobilier' },
    { value: 'OTHER', label: 'Autre dépense' },
  ];

  readonly search = signal('');
  readonly categoryFilter = signal<ExpenseCategory | 'ALL'>('ALL');
  readonly propertyFilter = signal('ALL');
  readonly startDate = signal('');
  readonly endDate = signal('');
  readonly page = signal(1);
  readonly isModalOpen = signal(false);
  readonly editingExpense = signal<PropertyExpense | null>(null);
  readonly deletingExpense = signal<PropertyExpense | null>(null);
  readonly attachment = signal<ExpenseAttachmentInput | null>(null);
  readonly removeExistingAttachment = signal(false);
  readonly attachmentError = signal('');
  readonly submitting = signal(false);
  readonly loadingAttachmentId = signal<string | null>(null);

  readonly expenseForm = this.formBuilder.nonNullable.group({
    propertyId: ['', Validators.required],
    category: ['MAINTENANCE' as ExpenseCategory, Validators.required],
    amount: [0, [Validators.required, Validators.min(1)]],
    expenseDate: [todayDate(), Validators.required],
    comment: [''],
  });

  readonly filteredExpenses = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('fr');
    const category = this.categoryFilter();
    const propertyId = this.propertyFilter();
    const startDate = this.startDate();
    const endDate = this.endDate();

    return this.store.visibleExpenses().filter((expense) => {
      const matchesQuery =
        !query ||
        [
          expense.propertyReference,
          expense.managerName,
          expense.createdByName,
          expense.comment,
          this.categoryLabel(expense.category),
        ]
          .join(' ')
          .toLocaleLowerCase('fr')
          .includes(query);

      return (
        matchesQuery &&
        (category === 'ALL' || expense.category === category) &&
        (propertyId === 'ALL' || expense.propertyId === propertyId) &&
        (!startDate || expense.expenseDate >= startDate) &&
        (!endDate || expense.expenseDate <= endDate)
      );
    });
  });

  readonly totals = computed(() => {
    const expenses = this.filteredExpenses();
    const currentMonth = todayDate().slice(0, 7);
    return {
      count: expenses.length,
      amount: expenses.reduce((total, expense) => total + expense.amount, 0),
      currentMonthAmount: expenses
        .filter((expense) => expense.expenseDate.startsWith(currentMonth))
        .reduce((total, expense) => total + expense.amount, 0),
      withAttachment: expenses.filter((expense) => expense.attachmentSize > 0).length,
    };
  });

  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredExpenses().length / PAGE_SIZE)),
  );

  readonly pageExpenses = computed(() => {
    const safePage = Math.min(this.page(), this.pageCount());
    const start = (safePage - 1) * PAGE_SIZE;
    return this.filteredExpenses().slice(start, start + PAGE_SIZE);
  });

  managerNameForSelectedProperty(): string {
    const propertyId = this.expenseForm.controls.propertyId.value;
    const property = this.store.visibleProperties().find((candidate) => candidate.id === propertyId);
    return property ? this.store.getManagerName(property.managerId) : 'Sélectionne un bien';
  }

  updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }

  updateCategoryFilter(event: Event): void {
    this.categoryFilter.set((event.target as HTMLSelectElement).value as ExpenseCategory | 'ALL');
    this.page.set(1);
  }

  updatePropertyFilter(event: Event): void {
    this.propertyFilter.set((event.target as HTMLSelectElement).value);
    this.page.set(1);
  }

  updateStartDate(event: Event): void {
    this.startDate.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }

  updateEndDate(event: Event): void {
    this.endDate.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }

  resetFilters(): void {
    this.search.set('');
    this.categoryFilter.set('ALL');
    this.propertyFilter.set('ALL');
    this.startDate.set('');
    this.endDate.set('');
    this.page.set(1);
  }

  openCreate(): void {
    const firstProperty = this.store.visibleProperties()[0];
    this.editingExpense.set(null);
    this.attachment.set(null);
    this.removeExistingAttachment.set(false);
    this.attachmentError.set('');
    this.expenseForm.reset({
      propertyId: firstProperty?.id ?? '',
      category: 'MAINTENANCE',
      amount: 0,
      expenseDate: todayDate(),
      comment: '',
    });
    this.isModalOpen.set(true);
  }

  openEdit(expense: PropertyExpense): void {
    this.editingExpense.set(expense);
    this.attachment.set(null);
    this.removeExistingAttachment.set(false);
    this.attachmentError.set('');
    this.expenseForm.reset({
      propertyId: expense.propertyId,
      category: expense.category,
      amount: expense.amount,
      expenseDate: expense.expenseDate,
      comment: expense.comment ?? '',
    });
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    if (!this.submitting()) {
      this.isModalOpen.set(false);
      this.editingExpense.set(null);
      this.attachment.set(null);
    }
  }

  async selectAttachment(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.attachmentError.set('');

    if (!file) {
      return;
    }

    if (!(file.type.startsWith('image/') || file.type === 'application/pdf')) {
      this.attachmentError.set('Le justificatif doit être une image ou un PDF.');
      input.value = '';
      return;
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
      this.attachmentError.set('Le justificatif ne doit pas dépasser 5 Mo.');
      input.value = '';
      return;
    }

    this.attachment.set({
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl: await readFileAsDataUrl(file),
    });
    this.removeExistingAttachment.set(false);
  }

  removeAttachment(): void {
    this.attachment.set(null);
    this.removeExistingAttachment.set(true);
    this.attachmentError.set('');
  }

  async saveExpense(): Promise<void> {
    if (this.expenseForm.invalid || this.attachmentError()) {
      this.expenseForm.markAllAsTouched();
      return;
    }

    const value = this.expenseForm.getRawValue();
    const input: PropertyExpenseInput = {
      ...value,
      amount: Number(value.amount),
      attachment: this.attachment() ?? undefined,
      removeAttachment: this.removeExistingAttachment(),
    };
    const current = this.editingExpense();

    this.submitting.set(true);
    try {
      if (current) {
        await this.store.updateExpense(current.id, input);
        this.notice.emit(`La dépense de ${current.propertyReference} a été modifiée.`);
      } else {
        const created = await this.store.addExpense(input);
        this.notice.emit(`La dépense de ${created.propertyReference} a été enregistrée.`);
      }

      this.isModalOpen.set(false);
      this.editingExpense.set(null);
      this.attachment.set(null);
      this.removeExistingAttachment.set(false);
    } catch (error) {
      this.notice.emit(this.apiErrorMessage(error, 'Impossible d’enregistrer cette dépense.'));
    } finally {
      this.submitting.set(false);
    }
  }

  requestDelete(expense: PropertyExpense): void {
    this.deletingExpense.set(expense);
  }

  cancelDelete(): void {
    if (!this.submitting()) {
      this.deletingExpense.set(null);
    }
  }

  async confirmDelete(): Promise<void> {
    const expense = this.deletingExpense();
    if (!expense) return;

    this.submitting.set(true);
    try {
      await this.store.deleteExpense(expense.id);
      this.deletingExpense.set(null);
      this.notice.emit(`La dépense de ${expense.propertyReference} a été supprimée.`);
    } catch (error) {
      this.notice.emit(this.apiErrorMessage(error, 'Impossible de supprimer cette dépense.'));
    } finally {
      this.submitting.set(false);
    }
  }

  async downloadAttachment(expense: PropertyExpense): Promise<void> {
    this.loadingAttachmentId.set(expense.id);
    try {
      const attachment = await this.store.expenseAttachment(expense.id);
      const link = document.createElement('a');
      link.href = attachment.dataUrl;
      link.download = attachment.name || `justificatif-${expense.id}`;
      link.click();
    } catch (error) {
      this.notice.emit(this.apiErrorMessage(error, 'Impossible de télécharger le justificatif.'));
    } finally {
      this.loadingAttachmentId.set(null);
    }
  }

  setPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pageCount()));
  }

  categoryLabel(category: ExpenseCategory): string {
    return this.categories.find((option) => option.value === category)?.label ?? category;
  }

  formatMoney(amount: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      maximumFractionDigits: 0,
    })
      .format(amount)
      .replace(/[\u00A0\u202F]/g, ' ');
  }

  formatDate(date: string): string {
    return new Intl.DateTimeFormat('fr-FR').format(new Date(`${date}T00:00:00`));
  }

  formatFileSize(size: number): string {
    if (!size) return '0 Ko';
    return size >= 1_000_000
      ? `${(size / 1_000_000).toFixed(1)} Mo`
      : `${Math.ceil(size / 1_000)} Ko`;
  }

  private apiErrorMessage(error: unknown, fallback: string): string {
    if (typeof error !== 'object' || error === null || !('error' in error)) {
      return error instanceof Error ? error.message : fallback;
    }
    const response = (error as { error?: string | { detail?: string; message?: string } }).error;
    return typeof response === 'string'
      ? response.trim() || fallback
      : response?.detail || response?.message || fallback;
  }
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Impossible de lire le justificatif.'));
    reader.readAsDataURL(file);
  });
}
