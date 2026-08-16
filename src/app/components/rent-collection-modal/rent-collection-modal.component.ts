import { Component, EventEmitter, inject, Input, OnChanges, Output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PropertyUnit, RentHistoryPoint } from '../../models';
import { LucideIconComponent } from '../lucide-icon.component';

export type RentCollectionMode = 'collect' | 'edit';

export interface RentCollectionModalResult {
  amount: number;
  paidAt: string;
  comment: string;
}

@Component({
  selector: 'app-rent-collection-modal',
  imports: [ReactiveFormsModule, LucideIconComponent],
  templateUrl: './rent-collection-modal.component.html',
  styleUrl: './rent-collection-modal.component.scss',
})
export class RentCollectionModalComponent implements OnChanges {
  private readonly fb = inject(NonNullableFormBuilder);
  private initializedKey = '';

  @Input({ required: true }) property!: PropertyUnit;
  @Input({ required: true }) point!: RentHistoryPoint;
  @Input() mode: RentCollectionMode = 'collect';
  @Input() submitting = false;

  @Output() readonly cancel = new EventEmitter<void>();
  @Output() readonly confirm = new EventEmitter<RentCollectionModalResult>();

  readonly form = this.fb.group({
    amount: [0, [Validators.required, Validators.min(0)]],
    paidAt: [localToday(), Validators.required],
    comment: [''],
  });

  ngOnChanges(): void {
    if (!this.point) {
      return;
    }

    const key = `${this.point.propertyId}:${this.point.occupancyId}:${this.point.month}:${this.mode}`;

    if (key === this.initializedKey) {
      return;
    }

    this.initializedKey = key;

    const amount = this.mode === 'collect' ? this.point.remainingAmount : this.point.paidAmount;
    this.form.reset({
      amount,
      paidAt: this.point.paidAt || localToday(),
      comment: this.point.comment || '',
    });
  }

  get maximumAmount(): number {
    return this.mode === 'collect'
      ? this.point.remainingAmount
      : Math.max(this.point.expectedAmount - this.point.deductionAmount, 0);
  }

  get amountError(): string {
    const amount = Number(this.form.controls.amount.value);

    if (!Number.isFinite(amount)) {
      return 'Saisis un montant valide.';
    }

    if (this.mode === 'collect' && amount <= 0) {
      return 'Le montant doit être supérieur à zéro.';
    }

    if (this.mode === 'edit' && amount < 0) {
      return 'Le montant ne peut pas être négatif.';
    }

    if (amount > this.maximumAmount) {
      return this.mode === 'collect'
        ? 'Le montant ne peut pas dépasser le reste à encaisser.'
        : 'Le montant ne peut pas dépasser la mensualité après déduction de caution.';
    }

    return '';
  }

  submit(): void {
    if (this.form.invalid || this.amountError || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.confirm.emit({
      amount: Number(value.amount),
      paidAt: value.paidAt,
      comment: value.comment.trim(),
    });
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

  formatMonth(month: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${month}-01T00:00:00`));
  }
}

function localToday(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
