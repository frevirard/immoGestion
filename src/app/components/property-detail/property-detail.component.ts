import { Component, computed, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ImmoStore } from '../../immo-store';
import {
  PropertyCommentPhoto,
  PropertyUnit,
  RentHistoryPoint,
  RentPaymentSnapshot,
  RentPaymentStatus,
} from '../../models';

type DetailTab = 'tenant' | 'payments' | 'history' | 'comments' | 'contract';

@Component({
  selector: 'app-property-detail',
  imports: [ReactiveFormsModule],
  templateUrl: './property-detail.component.html',
  styleUrl: './property-detail.component.scss',
})
export class PropertyDetailComponent {
  readonly store = inject(ImmoStore);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly propertySignal = signal<PropertyUnit | null>(null);
  readonly month = signal(new Date().toISOString().slice(0, 7));

  readonly today = new Date().toISOString().slice(0, 10);
  readonly activeTab = signal<DetailTab>('payments');
  readonly contractDraft = signal('');
  readonly pendingCommentPhotos = signal<PropertyCommentPhoto[]>([]);
  readonly replacingTenant = signal(false);

  @Output() readonly notice = new EventEmitter<string>();

  @Input() set property(value: PropertyUnit | null) {
    this.propertySignal.set(value);
    this.syncForms(value);
  }

  @Input() set selectedMonth(value: string) {
    this.month.set(value);
    this.paymentForm.patchValue({ month: value });
    this.deductionForm.patchValue({ month: value });
  }

  readonly tenantForm = this.fb.group({
    fullName: ['', Validators.required],
    phone: ['', Validators.required],
    email: [''],
    profession: [''],
    idDocument: [''],
    emergencyContact: [''],
    startDate: [this.today, Validators.required],
    depositExpected: [0, [Validators.required, Validators.min(0)]],
    depositPaidAmount: [0, [Validators.required, Validators.min(0)]],
    depositPaidAt: [this.today],
  });

  readonly paymentForm = this.fb.group({
    month: [this.month(), Validators.required],
    paidAt: [this.today, Validators.required],
    comment: [''],
  });

  readonly deductionForm = this.fb.group({
    month: [this.month(), Validators.required],
    comment: ['Loyer impayé déduit de la caution.'],
  });

  readonly commentForm = this.fb.group({
    body: ['', Validators.required],
  });

  readonly selectedProperty = this.propertySignal.asReadonly();

  readonly selectedTenant = computed(() => {
    const property = this.selectedProperty();
    return property ? this.store.getTenantForProperty(property) : undefined;
  });

  readonly selectedPaymentSnapshot = computed(() => {
    const property = this.selectedProperty();
    return property ? this.store.rentSnapshotForProperty(property, this.month()) : undefined;
  });

  readonly selectedPaymentHistory = computed(() => {
    const property = this.selectedProperty();
    return property ? this.store.paymentHistoryForProperty(property.id) : [];
  });

  readonly selectedRentHistory = computed(() => {
    const property = this.selectedProperty();
    return property ? this.store.rentHistoryForProperty(property.id, this.month()) : [];
  });

  readonly selectedOccupancyHistory = computed(() => {
    const property = this.selectedProperty();
    return property ? this.store.occupancyHistoryForProperty(property.id) : [];
  });

  readonly selectedComments = computed(() => {
    const property = this.selectedProperty();
    return property ? this.store.commentsForProperty(property.id) : [];
  });

  readonly selectedContract = computed(() => {
    const property = this.selectedProperty();
    return property ? this.store.getContractForProperty(property.id) : undefined;
  });

  setTab(tab: DetailTab): void {
    this.activeTab.set(tab);
  }

  assignManager(propertyId: string, event: Event): void {
    if (!this.ensureAdmin()) {
      return;
    }

    this.store.assignManager(propertyId, this.eventValue(event));
    this.notice.emit('Gérant attribué au bien.');
  }

  assignOwner(propertyId: string, event: Event): void {
    if (!this.ensureAdmin()) {
      return;
    }

    this.store.assignOwner(propertyId, this.eventValue(event));
    this.notice.emit('Locateur rattaché au bien.');
  }

  saveTenant(): void {
    const property = this.selectedProperty();

    if (!property || !this.canManageTenant(property)) {
      this.notice.emit('Tu n’as pas les droits pour modifier le locataire de ce bien.');
      return;
    }

    if (this.tenantForm.invalid) {
      this.tenantForm.markAllAsTouched();
      return;
    }

    const hadTenant = Boolean(property.tenantId);
    const replacingTenant = this.replacingTenant();
    this.store.upsertTenantForProperty(property.id, this.tenantForm.getRawValue(), replacingTenant);
    this.syncForms(this.store.properties().find((candidate) => candidate.id === property.id) ?? property);
    this.notice.emit(
      replacingTenant
        ? 'Nouveau locataire enregistré. L’ancienne occupation reste dans l’historique.'
        : hadTenant
          ? 'Occupation et caution mises à jour.'
          : 'Locataire ajouté, caution enregistrée et contrat généré.',
    );
  }

  startTenantReplacement(): void {
    const property = this.selectedProperty();

    if (!property || !this.canManageTenant(property)) {
      this.notice.emit('Tu n’as pas les droits pour changer le locataire de ce bien.');
      return;
    }

    this.replacingTenant.set(true);
    this.activeTab.set('tenant');
    this.tenantForm.reset({
      fullName: '',
      phone: '',
      email: '',
      profession: '',
      idDocument: '',
      emergencyContact: '',
      startDate: this.today,
      depositExpected: property.deposit,
      depositPaidAmount: property.deposit,
      depositPaidAt: this.today,
    });
    this.notice.emit('Saisis les informations du nouveau locataire.');
  }

  cancelTenantReplacement(): void {
    this.syncForms(this.selectedProperty());
  }

  markRentPaid(): void {
    const property = this.selectedProperty();

    if (!property || !property.tenantId || !this.canManageTenant(property)) {
      this.notice.emit('Sélectionne un bien occupé que tu peux gérer.');
      return;
    }

    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      return;
    }

    const input = this.paymentForm.getRawValue();
    this.store.markRentPaid(property.id, input.month, input.paidAt, input.comment);
    this.month.set(input.month);
    this.notice.emit(`Loyer de ${this.formatMonth(input.month)} marqué comme encaissé.`);
  }

  deductRentFromDeposit(): void {
    const property = this.selectedProperty();

    if (!property || !property.tenantId || !this.canManageTenant(property)) {
      this.notice.emit('Sélectionne un bien occupé que tu peux gérer.');
      return;
    }

    if (this.deductionForm.invalid) {
      this.deductionForm.markAllAsTouched();
      return;
    }

    const input = this.deductionForm.getRawValue();

    try {
      this.store.deductRentFromDeposit(property.id, input.month, input.comment);
      this.month.set(input.month);
      this.syncForms(this.store.properties().find((candidate) => candidate.id === property.id) ?? property);
      this.activeTab.set('payments');
      this.notice.emit(
        `Loyer de ${this.formatMonth(input.month)} déduit de la caution. Nouveau solde recalculé.`,
      );
    } catch (error) {
      this.notice.emit(error instanceof Error ? error.message : 'Déduction impossible.');
    }
  }

  saveContract(): void {
    const property = this.selectedProperty();

    if (!property || !property.tenantId || !this.canManageTenant(property)) {
      this.notice.emit('Sélectionne d’abord un bien occupé que tu peux gérer.');
      return;
    }

    if (!this.contractDraft().trim()) {
      this.notice.emit('Le contrat ne peut pas être vide.');
      return;
    }

    this.store.saveContract(property.id, this.contractDraft());
    this.notice.emit('Contrat enregistré dans le cache local.');
  }

  regenerateContract(): void {
    const property = this.selectedProperty();

    if (!property || !property.tenantId || !this.canManageTenant(property)) {
      return;
    }

    const contract = this.store.regenerateContract(property.id);

    if (contract) {
      this.contractDraft.set(contract.content);
      this.notice.emit('Contrat régénéré avec les dernières données du bien.');
    }
  }

  async onCommentPhotosSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    if (!files.length) {
      return;
    }

    const imageFiles = files
      .filter((file) => file.type.startsWith('image/') && file.size <= 1_500_000)
      .slice(0, 6);

    if (imageFiles.length !== files.length) {
      this.notice.emit('Certaines photos ont été ignorées : image requise, 1,5 Mo maximum.');
    }

    const photos = await Promise.all(imageFiles.map((file) => this.fileToPhoto(file)));
    this.pendingCommentPhotos.update((current) => [...current, ...photos].slice(0, 6));
    input.value = '';
  }

  removePendingPhoto(photoId: string): void {
    this.pendingCommentPhotos.update((photos) => photos.filter((photo) => photo.id !== photoId));
  }

  saveComment(): void {
    const property = this.selectedProperty();
    const user = this.store.currentUser();

    if (!property || !user || !this.canManageTenant(property)) {
      this.notice.emit('Tu n’as pas les droits pour commenter ce bien.');
      return;
    }

    if (this.commentForm.invalid && this.pendingCommentPhotos().length === 0) {
      this.commentForm.markAllAsTouched();
      return;
    }

    const body = this.commentForm.getRawValue().body || 'Photo jointe.';
    const comment = this.store.addComment(property.id, user, body, this.pendingCommentPhotos());
    this.commentForm.reset({ body: '' });
    this.pendingCommentPhotos.set([]);
    this.notice.emit(`Commentaire ajouté par ${comment.authorName}.`);
  }

  updateContractDraft(event: Event): void {
    this.contractDraft.set((event.target as HTMLTextAreaElement).value);
  }

  printContract(): void {
    const contractContent = this.contractDraft();

    if (!contractContent.trim()) {
      this.notice.emit('Aucun contrat à imprimer.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=900,height=1100');

    if (!printWindow) {
      this.notice.emit('La fenêtre d’impression a été bloquée par le navigateur.');
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Contrat de location</title>
          <style>
            body { font-family: Arial, sans-serif; color: #172033; padding: 32px; line-height: 1.55; }
            pre { white-space: pre-wrap; font-family: inherit; font-size: 14px; }
          </style>
        </head>
        <body>
          <pre>${this.escapeHtml(contractContent)}</pre>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  isAdmin(): boolean {
    return this.store.currentUser()?.role === 'ADMIN';
  }

  isOccupied(property: PropertyUnit): boolean {
    return Boolean(property.tenantId);
  }

  canManageTenant(property: PropertyUnit): boolean {
    const user = this.store.currentUser();
    return Boolean(user && (user.role === 'ADMIN' || property.managerId === user.id));
  }

  canDeductFromDeposit(property: PropertyUnit): boolean {
    const tenant = this.store.getTenantForProperty(property);
    const snapshot = this.store.rentSnapshotForProperty(
      property,
      this.deductionForm.getRawValue().month,
    );

    return Boolean(
      tenant &&
        snapshot.status === 'PENDING' &&
        snapshot.remainingAmount > 0 &&
        tenant.depositBalance >= snapshot.remainingAmount,
    );
  }

  statusLabel(property: PropertyUnit): string {
    return this.isOccupied(property) ? 'Loué' : 'Libre';
  }

  paymentStatusLabel(snapshot?: { status?: RentPaymentStatus }): string {
    switch (snapshot?.status) {
      case 'PAID':
        return 'Encaissé';
      case 'DEDUCTED_FROM_DEPOSIT':
        return 'Déduit caution';
      default:
        return 'À encaisser';
    }
  }

  paymentStatusClass(snapshot?: { status?: RentPaymentStatus }): RentPaymentStatus {
    return snapshot?.status ?? 'PENDING';
  }

  historySegmentPercent(
    point: RentHistoryPoint,
    segment: 'paidAmount' | 'deductionAmount' | 'remainingAmount',
  ): number {
    if (!point.expectedAmount) {
      return 0;
    }

    return Math.max((point[segment] / point.expectedAmount) * 100, point[segment] ? 8 : 0);
  }

  historyRecoveredPercent(point: RentHistoryPoint): number {
    if (!point.expectedAmount) {
      return 0;
    }

    return Math.min(
      ((point.paidAmount + point.deductionAmount) / point.expectedAmount) * 100,
      100,
    );
  }

  historyStatusText(point: RentHistoryPoint): string {
    const recovered = this.historyRecoveredPercent(point);

    if (point.status === 'PAID') {
      return 'Loyer payé';
    }

    if (point.status === 'DEDUCTED_FROM_DEPOSIT') {
      return 'Payé par déduction de caution';
    }

    return recovered > 0 ? 'Paiement partiel' : 'Loyer non encaissé';
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

  formatDate(date?: string): string {
    if (!date) {
      return 'Non renseigné';
    }

    return new Intl.DateTimeFormat('fr-FR').format(new Date(`${date}T00:00:00`));
  }

  formatDateTime(date: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(date));
  }

  formatMonth(month: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${month}-01T00:00:00`));
  }

  formatMonthShort(month: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      month: 'short',
      year: '2-digit',
    }).format(new Date(`${month}-01T00:00:00`));
  }

  private syncForms(property: PropertyUnit | null): void {
    if (!property) {
      return;
    }

    const tenant = this.store.getTenantForProperty(property);
    const contract = this.store.getContractForProperty(property.id);

    this.tenantForm.reset({
      fullName: tenant?.fullName ?? '',
      phone: tenant?.phone ?? '',
      email: tenant?.email ?? '',
      profession: tenant?.profession ?? '',
      idDocument: tenant?.idDocument ?? '',
      emergencyContact: tenant?.emergencyContact ?? '',
      startDate: tenant?.startDate ?? this.today,
      depositExpected: tenant?.depositExpected ?? property.deposit,
      depositPaidAmount: tenant?.depositPaidAmount ?? property.deposit,
      depositPaidAt: tenant?.depositPaidAt ?? this.today,
    });
    this.paymentForm.patchValue({ month: this.month(), paidAt: this.today, comment: '' });
    this.deductionForm.patchValue({
      month: this.month(),
      comment: 'Loyer impayé déduit de la caution.',
    });
    this.commentForm.reset({ body: '' });
    this.pendingCommentPhotos.set([]);
    this.replacingTenant.set(false);
    this.contractDraft.set(contract?.content ?? '');
    this.activeTab.set(property.tenantId ? 'payments' : 'tenant');
  }

  private ensureAdmin(): boolean {
    if (!this.isAdmin()) {
      this.notice.emit('Action réservée à l’administrateur.');
      return false;
    }

    return true;
  }

  private eventValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  private fileToPhoto(file: File): Promise<PropertyCommentPhoto> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          id: this.localId('photo'),
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: String(reader.result),
        });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private localId(prefix: string): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `${prefix}-${crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
