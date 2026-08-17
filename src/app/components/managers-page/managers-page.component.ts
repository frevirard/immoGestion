import { Component, EventEmitter, inject, Output, computed, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ImmoStore } from '../../immo-store';
import { User, UserRole, VerificationDocument } from '../../models';

type ManagersTab = 'add' | 'users';

@Component({
  selector: 'app-managers-page',
  imports: [ReactiveFormsModule],
  templateUrl: './managers-page.component.html',
  styleUrl: './managers-page.component.scss',
})
export class ManagersPageComponent {
  readonly store = inject(ImmoStore);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly sanitizer = inject(DomSanitizer);

  @Output() readonly notice = new EventEmitter<string>();

  readonly activeTab = signal<ManagersTab>('add');
  readonly selectedDocument = signal<VerificationDocument | null>(null);
  readonly selectedDocumentSafeUrl = signal<SafeResourceUrl | null>(null);
  readonly selectedDocumentUser = signal<User | null>(null);
  readonly documentError = signal('');
  readonly isDocumentLoading = signal(false);
  readonly rejectionUser = signal<User | null>(null);
  readonly rejectionReason = signal('');
  readonly rejectionError = signal('');
  readonly isCreatingManager = signal(false);

  readonly users = computed(() =>
    [...this.store.state().users].sort((first, second) => {
      const pendingDelta = Number(second.verificationStatus === 'PENDING') - Number(first.verificationStatus === 'PENDING');

      if (pendingDelta !== 0) {
        return pendingDelta;
      }

      return first.name.localeCompare(second.name);
    }),
  );

  readonly pendingVerificationCount = computed(
    () => this.store.state().users.filter((user) => user.verificationStatus === 'PENDING').length,
  );

  readonly verifiedDocumentCount = computed(
    () =>
      this.store
        .state()
        .users.filter((user) => user.verificationStatus === 'VERIFIED' && this.hasVerificationDocument(user)).length,
  );

  readonly managerForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  setTab(tab: ManagersTab): void {
    this.activeTab.set(tab);
  }

  async createManager(): Promise<void> {
    if (this.isCreatingManager()) {
      return;
    }

    if (this.managerForm.invalid) {
      this.managerForm.markAllAsTouched();
      return;
    }

    this.isCreatingManager.set(true);

    try {
      const manager = await this.store.addManager(this.managerForm.getRawValue());
      this.managerForm.reset({ name: '', email: '', phone: '', password: '' });
      this.notice.emit(`Gérant ${manager.name} ajouté.`);
      this.activeTab.set('users');
    } catch {
      this.notice.emit('Impossible de créer ce gérant. Vérifie que l’email est unique.');
    } finally {
      this.isCreatingManager.set(false);
    }
  }

  async validateUser(user: User): Promise<void> {
    const validated = await this.store.validateUser(user.id);
    this.notice.emit(`Compte ${validated.name} validé.`);
  }

  async updateRole(user: User, event: Event): Promise<void> {
    const role = (event.target as HTMLSelectElement).value as UserRole;
    const updated = await this.store.updateUserRole(user.id, role);
    this.notice.emit(`Profil de ${updated.name} mis à jour.`);
  }

  async openVerificationDocument(user: User): Promise<void> {
    const admin = this.store.currentUser();

    if (!admin) {
      return;
    }

    this.documentError.set('');
    this.isDocumentLoading.set(true);
    this.selectedDocumentUser.set(user);

    try {
      const document = await this.store.getVerificationDocument(user.id, admin.id);
      this.selectedDocument.set(document);
      this.selectedDocumentSafeUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(document.dataUrl));
    } catch {
      this.selectedDocument.set(null);
      this.selectedDocumentSafeUrl.set(null);
      this.documentError.set('Impossible d’ouvrir la pièce de vérification.');
    } finally {
      this.isDocumentLoading.set(false);
    }
  }

  closeVerificationDocument(): void {
    this.selectedDocument.set(null);
    this.selectedDocumentSafeUrl.set(null);
    this.selectedDocumentUser.set(null);
    this.documentError.set('');
    this.isDocumentLoading.set(false);
  }

  downloadVerificationDocument(): void {
    const document = this.selectedDocument();

    if (!document) {
      return;
    }

    const link = window.document.createElement('a');
    link.href = document.dataUrl;
    link.download = document.documentName || `piece-identite-${document.userId}`;
    link.click();
  }

  async approveVerification(user: User): Promise<void> {
    const admin = this.store.currentUser();

    if (!admin) {
      return;
    }

    try {
      const updated = await this.store.approveVerification(user.id, admin.id);
      this.notice.emit(`Compte ${updated.name} vérifié.`);

      if (this.selectedDocumentUser()?.id === user.id) {
        this.selectedDocumentUser.set(updated);
      }
    } catch {
      this.notice.emit('Impossible de valider cette vérification.');
    }
  }

  openRejectVerification(user: User): void {
    this.rejectionUser.set(user);
    this.rejectionReason.set('');
    this.rejectionError.set('');
  }

  closeRejectVerification(): void {
    this.rejectionUser.set(null);
    this.rejectionReason.set('');
    this.rejectionError.set('');
  }

  async submitRejectVerification(): Promise<void> {
    const admin = this.store.currentUser();
    const user = this.rejectionUser();
    const reason = this.rejectionReason().trim();

    if (!admin || !user) {
      return;
    }

    if (reason.length < 5) {
      this.rejectionError.set('Indique un motif clair avant de rejeter la vérification.');
      return;
    }

    try {
      const updated = await this.store.rejectVerification(user.id, admin.id, reason);
      this.notice.emit(`Vérification de ${updated.name} rejetée.`);

      if (this.selectedDocumentUser()?.id === user.id) {
        this.selectedDocumentUser.set(updated);
      }

      this.closeRejectVerification();
    } catch {
      this.rejectionError.set('Impossible de rejeter cette vérification.');
    }
  }

  assignedCount(managerId: string): number {
    return this.store.properties().filter((property) => property.managerId === managerId).length;
  }

  hasVerificationDocument(user: User): boolean {
    return Boolean(user.verificationDocumentName && (user.verificationDocumentSize ?? 0) > 0);
  }

  canApproveVerification(user: User): boolean {
    return this.hasVerificationDocument(user) && user.verificationStatus !== 'VERIFIED';
  }

  canRejectVerification(user: User): boolean {
    return this.hasVerificationDocument(user) && user.verificationStatus !== 'VERIFIED';
  }

  statusLabel(user: User): string {
    switch (user.status) {
      case 'PENDING':
        return 'En attente';
      case 'DISABLED':
        return 'Désactivé';
      default:
        return 'Validé';
    }
  }

  verificationLabel(user: User): string {
    switch (user.verificationStatus) {
      case 'VERIFIED':
        return 'Vérifié';
      case 'PENDING':
        return 'À vérifier';
      case 'REJECTED':
        return 'Rejeté';
      default:
        return 'Non vérifié';
    }
  }

  roleLabel(role: UserRole): string {
    switch (role) {
      case 'ADMIN':
        return 'Administrateur';
      case 'MANAGER':
        return 'Gérant';
      default:
        return 'Utilisateur';
    }
  }

  documentSizeLabel(size?: number): string {
    const value = size ?? 0;

    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1).replace('.', ',')} Mo`;
    }

    return `${Math.max(1, Math.round(value / 1000))} Ko`;
  }
}
