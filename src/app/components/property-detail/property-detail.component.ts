import { Component, computed, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ImmoStore } from '../../immo-store';
import {
  PropertyCommentPhoto,
  PropertyUnit,
  RentHistoryPoint,
  RentPaymentStatus,
} from '../../models';
import { LucideIconComponent } from '../lucide-icon.component';
import {
  RentCollectionModalComponent,
  RentCollectionModalResult,
  RentCollectionMode,
} from '../rent-collection-modal/rent-collection-modal.component';

type DetailTab = 'tenant' | 'payments' | 'history' | 'comments' | 'contract';

@Component({
  selector: 'app-property-detail',
  imports: [ReactiveFormsModule, LucideIconComponent, RentCollectionModalComponent],
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
  readonly selectedExistingTenantId = signal('');
  readonly collectionDialogPoint = signal<RentHistoryPoint | null>(null);
  readonly collectionDialogMode = signal<RentCollectionMode>('collect');
  readonly collectionSubmitting = signal(false);
  readonly deductionDialogPoint = signal<RentHistoryPoint | null>(null);
  readonly deductionAmount = signal(0);
  readonly deductionComment = signal('Loyer impayé déduit de la caution.');
  readonly deductionSubmitting = signal(false);

  @Output() readonly notice = new EventEmitter<string>();

  @Input() set property(value: PropertyUnit | null) {
    this.propertySignal.set(value);
    this.syncForms(value);

    if (value) {
      void this.refreshTenantOptions();
    }
  }

  @Input() set selectedMonth(value: string) {
    this.month.set(value);
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

  readonly commentForm = this.fb.group({
    body: ['', Validators.required],
  });

  readonly selectedProperty = this.propertySignal.asReadonly();

  readonly selectedTenant = computed(() => {
    const property = this.selectedProperty();
    return property ? this.store.getTenantForProperty(property) : undefined;
  });

  readonly deductionMaximum = computed(() => {
    const property = this.selectedProperty();
    const tenant = this.selectedTenant();
    const point = this.deductionDialogPoint();

    if (!property || !tenant || !point) {
      return 0;
    }

    return Math.max(0, Math.min(property.rent, point.remainingAmount, tenant.depositBalance));
  });

  readonly deductionAmountError = computed(() => {
    const property = this.selectedProperty();
    const tenant = this.selectedTenant();
    const point = this.deductionDialogPoint();
    const amount = this.deductionAmount();

    if (!property || !tenant || !point) {
      return '';
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return 'Saisis un montant supérieur à zéro.';
    }

    if (amount > property.rent) {
      return 'Le montant ne peut pas dépasser la mensualité.';
    }

    if (amount > point.remainingAmount) {
      return 'Le montant ne peut pas dépasser le reste à encaisser.';
    }

    if (amount > tenant.depositBalance) {
      return 'La caution disponible est insuffisante.';
    }

    return '';
  });

  readonly selectedRentHistory = computed(() => {
    const property = this.selectedProperty();
    return property ? this.store.rentHistoryForProperty(property.id, this.month()) : [];
  });

  readonly selectedRentSchedule = computed(() => {
    const property = this.selectedProperty();
    return property ? this.store.rentHistoryForProperty(property.id) : [];
  });

  readonly rentScheduleTotals = computed(() => {
    return this.selectedRentSchedule().reduce(
      (totals, point) => ({
        expectedAmount: totals.expectedAmount + point.expectedAmount,
        paidAmount: totals.paidAmount + point.paidAmount,
        deductionAmount: totals.deductionAmount + point.deductionAmount,
        remainingAmount: totals.remainingAmount + point.remainingAmount,
      }),
      {
        expectedAmount: 0,
        paidAmount: 0,
        deductionAmount: 0,
        remainingAmount: 0,
      },
    );
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

  async assignManager(propertyId: string, event: Event): Promise<void> {
    if (!this.ensureAdmin()) {
      return;
    }

    await this.store.assignManager(propertyId, this.eventValue(event));
    this.notice.emit('Gérant attribué au bien.');
  }

  async assignOwner(propertyId: string, event: Event): Promise<void> {
    if (!this.ensureAdmin()) {
      return;
    }

    await this.store.assignOwner(propertyId, this.eventValue(event));
    this.notice.emit('Locataire rattaché au bien.');
  }

  async saveTenant(): Promise<void> {
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
    await this.store.upsertTenantForProperty(
      property.id,
      this.tenantForm.getRawValue(),
      replacingTenant,
    );
    const updatedProperty =
      this.store.properties().find((candidate) => candidate.id === property.id) ?? property;
    this.propertySignal.set(updatedProperty);
    this.syncForms(updatedProperty);
    this.notice.emit(
      replacingTenant
        ? 'Nouveau locataire enregistré. L’ancienne occupation reste dans l’historique.'
        : hadTenant
          ? 'Occupation et caution mises à jour.'
          : 'Locataire ajouté, caution enregistrée et contrat généré.',
    );
  }

  async startTenantReplacement(): Promise<void> {
    const property = this.selectedProperty();

    if (!property || !this.canManageTenant(property)) {
      this.notice.emit('Tu n’as pas les droits pour changer le locataire de ce bien.');
      return;
    }

    await this.refreshTenantOptions(true);
    this.replacingTenant.set(true);
    this.selectedExistingTenantId.set('');
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

  async attachExistingTenant(propertyId: string, event: Event): Promise<void> {
    const property = this.selectedProperty();
    const tenantId = this.eventValue(event);
    this.selectedExistingTenantId.set(tenantId);

    if (!property || !tenantId || !this.canManageTenant(property)) {
      return;
    }

    if (this.isTenantAttachedElsewhere(tenantId, property.id)) {
      this.notice.emit('Ce locataire est déjà rattaché à un autre bien.');
      this.selectedExistingTenantId.set(property.tenantId ?? '');
      return;
    }

    if (property.tenantId && !this.replacingTenant() && property.tenantId !== tenantId) {
      this.notice.emit(
        'Clique d’abord sur "Changer de locataire" avant de rattacher un autre locataire.',
      );
      this.selectedExistingTenantId.set(property.tenantId);
      return;
    }

    const replaceCurrent = Boolean(property.tenantId && property.tenantId !== tenantId);

    try {
      const tenant = await this.store.assignTenantToProperty(propertyId, tenantId, replaceCurrent);
      const updatedProperty =
        this.store.properties().find((candidate) => candidate.id === property.id) ?? property;
      this.propertySignal.set(updatedProperty);
      this.syncForms(updatedProperty);
      this.activeTab.set('payments');
      this.notice.emit(`Locataire ${tenant.fullName} rattaché au bien.`);
    } catch {
      this.notice.emit('Impossible de rattacher ce locataire au bien.');
      this.selectedExistingTenantId.set(property.tenantId ?? '');
    }
  }

  openCollectionDialog(point: RentHistoryPoint, mode: RentCollectionMode): void {
    const property = this.selectedProperty();

    if (
      !property ||
      (mode === 'collect' && !this.canCollectSchedulePoint(property, point)) ||
      (mode === 'edit' && !this.canEditScheduleCollection(property, point))
    ) {
      this.notice.emit('Cet encaissement ne peut pas être modifié depuis cette ligne.');
      return;
    }

    this.month.set(point.month);
    this.collectionDialogMode.set(mode);
    this.collectionDialogPoint.set(point);
  }

  closeCollectionDialog(): void {
    if (!this.collectionSubmitting()) {
      this.collectionDialogPoint.set(null);
    }
  }

  async confirmCollection(result: RentCollectionModalResult): Promise<void> {
    const property = this.selectedProperty();
    const point = this.collectionDialogPoint();
    const mode = this.collectionDialogMode();

    if (!property || !point) {
      return;
    }

    this.collectionSubmitting.set(true);
    try {
      if (mode === 'collect') {
        await this.store.markRentPaid(
          property.id,
          point.month,
          result.amount,
          result.paidAt,
          result.comment || 'Encaissement depuis l’échéancier.',
        );
      } else {
        await this.store.updateRentPaid(
          property.id,
          point.month,
          result.amount,
          result.paidAt,
          result.comment,
        );
      }

      this.month.set(point.month);
      this.collectionDialogPoint.set(null);
      this.notice.emit(
        mode === 'collect'
          ? `${this.formatMoney(result.amount)} encaissés pour ${this.formatMonth(point.month)}.`
          : `Encaissement de ${this.formatMonth(point.month)} corrigé.`,
      );
    } catch (error) {
      this.notice.emit(this.apiErrorMessage(error, 'Impossible d’enregistrer cet encaissement.'));
    } finally {
      this.collectionSubmitting.set(false);
    }
  }

  openDeductionDialog(point: RentHistoryPoint): void {
    const property = this.selectedProperty();
    const tenant = this.selectedTenant();

    if (!property || !tenant || !this.canDeductSchedulePoint(property, point)) {
      this.notice.emit('Aucune déduction de caution n’est possible pour cette échéance.');
      return;
    }

    this.month.set(point.month);
    this.deductionDialogPoint.set(point);
    this.deductionAmount.set(this.deductionMaximum());
    this.deductionComment.set('Loyer impayé déduit de la caution.');
  }

  closeDeductionDialog(): void {
    if (this.deductionSubmitting()) {
      return;
    }

    this.deductionDialogPoint.set(null);
  }

  updateDeductionAmount(event: Event): void {
    this.deductionAmount.set(Number((event.target as HTMLInputElement).value));
  }

  updateDeductionComment(event: Event): void {
    this.deductionComment.set((event.target as HTMLTextAreaElement).value);
  }

  async confirmDepositDeduction(): Promise<void> {
    const property = this.selectedProperty();
    const point = this.deductionDialogPoint();
    const amount = this.deductionAmount();

    if (!property || !point || !this.canDeductSchedulePoint(property, point)) {
      this.notice.emit('Cette échéance ne peut plus être déduite de la caution.');
      return;
    }

    if (this.deductionAmountError()) {
      return;
    }

    this.deductionSubmitting.set(true);
    try {
      await this.store.deductRentFromDeposit(
        property.id,
        point.month,
        amount,
        this.deductionComment().trim(),
      );
      this.month.set(point.month);
      this.activeTab.set('payments');
      this.notice.emit(
        `${this.formatMoney(amount)} déduits de la caution pour ${this.formatMonth(point.month)}.`,
      );
      this.deductionDialogPoint.set(null);
    } catch (error) {
      this.notice.emit(this.apiErrorMessage(error, 'Déduction impossible.'));
    } finally {
      this.deductionSubmitting.set(false);
    }
  }

  async saveContract(): Promise<void> {
    const property = this.selectedProperty();

    if (!property || !property.tenantId || !this.canManageTenant(property)) {
      this.notice.emit('Sélectionne d’abord un bien occupé que tu peux gérer.');
      return;
    }

    if (!this.contractDraft().trim()) {
      this.notice.emit('Le contrat ne peut pas être vide.');
      return;
    }

    await this.store.saveContract(property.id, this.contractDraft());
    this.notice.emit('Contrat enregistré dans le cache local.');
  }

  async regenerateContract(): Promise<void> {
    const property = this.selectedProperty();

    if (!property || !property.tenantId || !this.canManageTenant(property)) {
      return;
    }

    const contract = await this.store.regenerateContract(property.id);

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

  async saveComment(): Promise<void> {
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
    const comment = await this.store.addComment(
      property.id,
      user,
      body,
      this.pendingCommentPhotos(),
    );
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

  canChooseExistingTenant(property: PropertyUnit): boolean {
    return this.canManageTenant(property) && (!property.tenantId || this.replacingTenant());
  }

  isTenantAttachedElsewhere(tenantId: string, propertyId: string): boolean {
    return this.store.isTenantAttachedToAnotherProperty(tenantId, propertyId);
  }

  canDeductSchedulePoint(property: PropertyUnit, point: RentHistoryPoint): boolean {
    const tenant = this.store.getTenantForProperty(property);

    return Boolean(
      this.canManageTenant(property) &&
      tenant &&
      property.tenantId === point.tenantId &&
      point.remainingAmount > 0 &&
      tenant.depositBalance > 0,
    );
  }

  canCollectSchedulePoint(property: PropertyUnit, point: RentHistoryPoint): boolean {
    return Boolean(
      this.canManageTenant(property) &&
      property.tenantId === point.tenantId &&
      point.remainingAmount > 0,
    );
  }

  canEditScheduleCollection(property: PropertyUnit, point: RentHistoryPoint): boolean {
    if (!this.canManageTenant(property) || point.paidAmount <= 0) {
      return false;
    }

    return this.isAdmin() || this.isWithinCollectionWindow(point);
  }

  statusLabel(property: PropertyUnit): string {
    return this.isOccupied(property) ? 'Loué' : 'Libre';
  }

  paymentStatusLabel(snapshot?: {
    status?: RentPaymentStatus;
    remainingAmount?: number;
    paidAmount?: number;
    deductionAmount?: number;
  }): string {
    switch (snapshot?.status) {
      case 'PAID':
        if (snapshot.remainingAmount && snapshot.remainingAmount > 0) {
          return 'Encaissement partiel';
        }

        return snapshot.deductionAmount ? 'Soldé (mixte)' : 'Encaissé';
      case 'DEDUCTED_FROM_DEPOSIT':
        return snapshot.remainingAmount && snapshot.remainingAmount > 0
          ? 'Déduction partielle'
          : 'Déduit caution';
      default:
        return 'À encaisser';
    }
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

    return Math.min(((point.paidAmount + point.deductionAmount) / point.expectedAmount) * 100, 100);
  }

  historyStatusText(point: RentHistoryPoint): string {
    const recovered = this.historyRecoveredPercent(point);

    if (point.status === 'PAID') {
      if (point.remainingAmount > 0) {
        return 'Encaissement partiel';
      }

      return point.deductionAmount > 0 ? 'Loyer soldé (mixte)' : 'Loyer payé';
    }

    if (point.status === 'DEDUCTED_FROM_DEPOSIT') {
      return point.remainingAmount > 0
        ? 'Déduction partielle de caution'
        : 'Payé par déduction de caution';
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
    this.selectedExistingTenantId.set(tenant?.id ?? '');

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
    this.commentForm.reset({ body: '' });
    this.pendingCommentPhotos.set([]);
    this.replacingTenant.set(false);
    this.collectionDialogPoint.set(null);
    this.collectionSubmitting.set(false);
    this.deductionDialogPoint.set(null);
    this.deductionSubmitting.set(false);
    this.contractDraft.set(contract?.content ?? '');
    this.activeTab.set(property.tenantId ? 'payments' : 'tenant');
  }

  private apiErrorMessage(error: unknown, fallback: string): string {
    if (typeof error !== 'object' || error === null || !('error' in error)) {
      return error instanceof Error ? error.message : fallback;
    }

    const response = (error as { error?: string | { detail?: string; message?: string } }).error;

    if (typeof response === 'string') {
      return response.trim() || fallback;
    }

    return response?.detail || response?.message || fallback;
  }

  private isWithinCollectionWindow(point: RentHistoryPoint): boolean {
    const referenceDate = point.paidAt || point.updatedAt;

    if (!referenceDate) {
      return false;
    }

    const limit = new Date(`${referenceDate.slice(0, 10)}T23:59:59`);
    limit.setDate(limit.getDate() + 15);
    return new Date() <= limit;
  }

  private async refreshTenantOptions(showError = false): Promise<void> {
    try {
      await this.store.refreshTenants();
    } catch {
      if (showError) {
        this.notice.emit('Impossible de charger les locataires depuis la base.');
      }
    }
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
