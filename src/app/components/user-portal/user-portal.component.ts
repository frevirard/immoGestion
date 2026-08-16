import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ImmoStore } from '../../immo-store';
import {
  ListingInput,
  ListingMessage,
  ListingPropertyType,
  ListingTransactionType,
  MarketplaceListing,
  User,
  VerificationRequestInput,
} from '../../models';
import { ListingCardComponent } from '../listing-card/listing-card.component';
import { ListingFormModalComponent } from '../listing-form-modal/listing-form-modal.component';
import { LucideIconComponent, type LucideIconName } from '../lucide-icon.component';

type UserPortalPage = 'home' | 'my-listings' | 'messages' | 'account';
type TransactionFilter = 'ALL' | ListingTransactionType;
type PropertyTypeFilter = 'ALL' | ListingPropertyType;
const LISTING_PAGE_SIZE = 12;
const MAX_VERIFICATION_FILE_SIZE = 5_000_000;
const MAX_VERIFICATION_PDF_SIZE = 700_000;
const MAX_STORED_VERIFICATION_DATA_URL_LENGTH = 950_000;
const VERIFICATION_IMAGE_MAX_SIDE = 1500;
type MessageConversation = {
  key: string;
  listingId: string;
  listing?: MarketplaceListing;
  counterpartId: string;
  counterpartName: string;
  messages: ListingMessage[];
  lastMessage: ListingMessage;
  unreadCount: number;
  updatedAt: string;
};

@Component({
  selector: 'app-user-portal',
  imports: [FormsModule, ListingCardComponent, ListingFormModalComponent, LucideIconComponent],
  templateUrl: './user-portal.component.html',
  styleUrl: './user-portal.component.scss',
})
export class UserPortalComponent {
  readonly store = inject(ImmoStore);

  readonly activePage = signal<UserPortalPage>('home');
  readonly notice = signal('');
  readonly isMenuOpen = signal(false);
  readonly isFilterOpen = signal(false);
  readonly search = signal('');
  readonly transactionFilter = signal<TransactionFilter>('ALL');
  readonly propertyTypeFilter = signal<PropertyTypeFilter>('ALL');
  readonly cityFilter = signal('');
  readonly minPrice = signal<number | null>(null);
  readonly maxPrice = signal<number | null>(null);
  readonly listingPage = signal(1);
  readonly editingListing = signal<MarketplaceListing | null>(null);
  readonly isListingModalOpen = signal(false);
  readonly listingPendingArchive = signal<MarketplaceListing | null>(null);
  readonly selectedListing = signal<MarketplaceListing | null>(null);
  readonly selectedPhotoIndex = signal(0);
  readonly contactListing = signal<MarketplaceListing | null>(null);
  readonly messageBody = signal('');
  readonly messageError = signal('');
  readonly messageSearch = signal('');
  readonly activeConversationKey = signal<string | null>(null);
  readonly chatBody = signal('');
  readonly chatError = signal('');
  readonly accountFirstName = signal('');
  readonly accountLastName = signal('');
  readonly accountUsername = signal('');
  readonly accountPhone = signal('');
  readonly accountEmail = signal('');
  readonly accountBirthDate = signal('');
  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly confirmPassword = signal('');
  readonly accountError = signal('');
  readonly passwordError = signal('');
  readonly verificationError = signal('');
  readonly verificationDocument = signal<VerificationRequestInput | null>(null);
  readonly isSavingListing = signal(false);
  readonly busyListingId = signal('');
  readonly isSendingMessage = signal(false);
  readonly isSendingChatMessage = signal(false);
  readonly isSavingProfile = signal(false);
  readonly isSavingPassword = signal(false);
  readonly isSendingVerification = signal(false);
  readonly isDeletingAccount = signal(false);

  readonly propertyTypes: Array<{ value: PropertyTypeFilter; label: string }> = [
    { value: 'ALL', label: 'Tous les biens' },
    { value: 'LAND', label: 'Terrain' },
    { value: 'BUILDING', label: 'Immeuble' },
    { value: 'HOUSE', label: 'Maison' },
    { value: 'APARTMENT', label: 'Appartement' },
    { value: 'ROOM', label: 'Chambre' },
    { value: 'STUDIO', label: 'Studio' },
    { value: 'OFFICE', label: 'Bureau' },
    { value: 'OTHER', label: 'Autre' },
  ];

  readonly navItems = computed(() => [
    { id: 'home' as const, label: 'Accueil', helper: 'Toutes les annonces', badge: 0 },
    {
      id: 'my-listings' as const,
      label: 'Mes annonces',
      helper: `${this.store.myListings().length} publiée(s)`,
      badge: 0,
    },
    {
      id: 'messages' as const,
      label: 'Messagerie',
      helper: 'Conversations',
      badge: this.store.unreadListingMessagesCount(),
    },
    {
      id: 'account' as const,
      label: 'Mon compte',
      helper: this.accountVerificationLabel(),
      badge: this.store.currentUser()?.verificationStatus === 'PENDING' ? 1 : 0,
    },
  ]);

  readonly filteredListings = computed(() => {
    const search = this.normalize(this.search());
    const city = this.normalize(this.cityFilter());
    const transaction = this.transactionFilter();
    const propertyType = this.propertyTypeFilter();
    const minPrice = this.minPrice();
    const maxPrice = this.maxPrice();

    return this.store.publishedListings().filter((listing) => {
      const price = listing.transactionType === 'SALE' ? listing.salePrice : listing.monthlyRent;
      const haystack = this.normalize(
        [
          listing.title,
          listing.description,
          listing.address,
          listing.city,
          listing.district,
          listing.ownerName,
        ].join(' '),
      );

      return (
        (!search || haystack.includes(search)) &&
        (!city || this.normalize(`${listing.city} ${listing.district}`).includes(city)) &&
        (transaction === 'ALL' || listing.transactionType === transaction) &&
        (propertyType === 'ALL' || listing.propertyType === propertyType) &&
        (minPrice === null || price >= minPrice) &&
        (maxPrice === null || price <= maxPrice)
      );
    });
  });

  readonly totalListingPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredListings().length / LISTING_PAGE_SIZE)),
  );

  readonly currentListingPage = computed(() =>
    Math.min(Math.max(1, this.listingPage()), this.totalListingPages()),
  );

  readonly paginatedListings = computed(() => {
    const start = (this.currentListingPage() - 1) * LISTING_PAGE_SIZE;
    return this.filteredListings().slice(start, start + LISTING_PAGE_SIZE);
  });

  readonly visibleListingPages = computed(() => {
    const total = this.totalListingPages();
    const current = this.currentListingPage();
    const end = Math.min(total, Math.max(5, current + 2));
    const start = Math.max(1, Math.min(current - 2, end - 4));

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });

  readonly messageConversations = computed<MessageConversation[]>(() => {
    const user = this.store.currentUser();

    if (!user) {
      return [];
    }

    const query = this.normalize(this.messageSearch());
    const grouped = new Map<string, Omit<MessageConversation, 'lastMessage' | 'unreadCount' | 'updatedAt'>>();

    for (const message of this.store.myListingMessages()) {
      const counterpartId = message.senderId === user.id ? message.recipientId : message.senderId;
      const counterpartName = message.senderId === user.id ? message.recipientName : message.senderName;
      const key = this.buildConversationKey(message.listingId, counterpartId);
      const existing = grouped.get(key);

      if (existing) {
        existing.messages.push(message);
        continue;
      }

      grouped.set(key, {
        key,
        listingId: message.listingId,
        listing: this.store.getListing(message.listingId),
        counterpartId,
        counterpartName,
        messages: [message],
      });
    }

    return [...grouped.values()]
      .map((conversation) => {
        const messages = [...conversation.messages].sort((first, second) =>
          this.messageSortValue(first.createdAt).localeCompare(this.messageSortValue(second.createdAt)),
        );
        const lastMessage = messages[messages.length - 1];

        return {
          ...conversation,
          messages,
          lastMessage,
          unreadCount: messages.filter(
            (message) => message.recipientId === user.id && !message.readAt,
          ).length,
          updatedAt: lastMessage.createdAt,
        };
      })
      .filter((conversation) => {
        if (!query) {
          return true;
        }

        return this.normalize(
          [
            conversation.listing?.title,
            conversation.listing?.address,
            conversation.listing?.city,
            conversation.listing?.district,
            conversation.counterpartName,
            conversation.lastMessage.body,
          ].join(' '),
        ).includes(query);
      })
      .sort((first, second) => {
        const unread = second.unreadCount - first.unreadCount;

        if (unread !== 0) {
          return unread;
        }

        return this.messageSortValue(second.updatedAt).localeCompare(this.messageSortValue(first.updatedAt));
      });
  });

  readonly activeConversation = computed(() => {
    const conversations = this.messageConversations();
    const activeKey = this.activeConversationKey();

    return activeKey
      ? conversations.find((conversation) => conversation.key === activeKey) ?? null
      : null;
  });

  setPage(page: UserPortalPage): void {
    const wasOnMessages = this.activePage() === 'messages';

    this.activePage.set(page);
    this.notice.set('');

    if (page === 'account') {
      this.loadAccountForm();
    }

    if (page !== 'messages' || !wasOnMessages) {
      this.closeConversation();
    }

    this.closeMenu();
  }

  toggleMenu(): void {
    this.isMenuOpen.update((isOpen) => !isOpen);
  }

  closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  navIcon(page: UserPortalPage): LucideIconName {
    const icons: Record<UserPortalPage, LucideIconName> = {
      home: 'home',
      'my-listings': 'megaphone',
      messages: 'message-circle',
      account: 'circle-user-round',
    };

    return icons[page];
  }

  toggleFilters(): void {
    this.isFilterOpen.update((isOpen) => !isOpen);
  }

  closeFilters(): void {
    this.isFilterOpen.set(false);
  }

  setTransactionFilter(value: TransactionFilter): void {
    this.transactionFilter.set(value);
    this.resetListingPage();
  }

  setPropertyTypeFilter(value: PropertyTypeFilter): void {
    this.propertyTypeFilter.set(value);
    this.resetListingPage();
  }

  setMinPrice(event: Event): void {
    this.minPrice.set(this.readOptionalNumber(event));
    this.resetListingPage();
  }

  setMaxPrice(event: Event): void {
    this.maxPrice.set(this.readOptionalNumber(event));
    this.resetListingPage();
  }

  clearFilters(): void {
    this.search.set('');
    this.transactionFilter.set('ALL');
    this.propertyTypeFilter.set('ALL');
    this.cityFilter.set('');
    this.minPrice.set(null);
    this.maxPrice.set(null);
    this.resetListingPage();
  }

  setSearch(value: string): void {
    this.search.set(value);
    this.resetListingPage();
  }

  setCityFilter(value: string): void {
    this.cityFilter.set(value);
    this.resetListingPage();
  }

  activeFilterCount(): number {
    return [
      this.search().trim(),
      this.cityFilter().trim(),
      this.transactionFilter() !== 'ALL',
      this.propertyTypeFilter() !== 'ALL',
      this.minPrice() !== null,
      this.maxPrice() !== null,
    ].filter(Boolean).length;
  }

  openCreateListing(): void {
    this.closeMenu();
    this.editingListing.set(null);
    this.isListingModalOpen.set(true);
  }

  openEditListing(listing: MarketplaceListing): void {
    this.editingListing.set(listing);
    this.isListingModalOpen.set(true);
  }

  closeListingModal(): void {
    this.isListingModalOpen.set(false);
    this.editingListing.set(null);
  }

  async saveListing(input: ListingInput): Promise<void> {
    const editingListing = this.editingListing();

    if (this.isSavingListing()) {
      return;
    }

    this.isSavingListing.set(true);

    try {
      if (editingListing) {
        await this.store.updateListing(editingListing.id, input);
        this.notice.set('Annonce mise à jour.');
      } else {
        await this.store.addListing(input);
        this.notice.set('Annonce publiée.');
      }

      this.closeListingModal();
      this.activePage.set('my-listings');
    } catch {
      this.notice.set('Impossible d’enregistrer cette annonce. Vérifie les informations.');
    } finally {
      this.isSavingListing.set(false);
    }
  }

  archiveListing(listing: MarketplaceListing): void {
    if (this.busyListingId()) {
      return;
    }

    this.listingPendingArchive.set(listing);
  }

  closeArchiveWarning(): void {
    if (this.busyListingId()) {
      return;
    }

    this.listingPendingArchive.set(null);
  }

  async confirmArchiveListing(): Promise<void> {
    const listing = this.listingPendingArchive();
    const user = this.store.currentUser();

    if (!listing || !user || this.busyListingId()) {
      return;
    }

    this.busyListingId.set(listing.id);

    try {
      await this.store.archiveListing(listing.id, user.id);
      this.notice.set('Annonce archivée.');
      this.listingPendingArchive.set(null);
    } catch {
      this.notice.set('Impossible d’archiver cette annonce.');
    } finally {
      this.busyListingId.set('');
    }
  }

  async restoreListing(listing: MarketplaceListing): Promise<void> {
    const user = this.store.currentUser();

    if (!user || this.busyListingId() || listing.status === 'PUBLISHED') {
      return;
    }

    this.busyListingId.set(listing.id);

    try {
      await this.store.restoreListing(listing.id, user.id);
      this.notice.set('Annonce désarchivée et de nouveau visible.');
    } catch {
      this.notice.set('Impossible de désarchiver cette annonce.');
    } finally {
      this.busyListingId.set('');
    }
  }

  async openListing(listing: MarketplaceListing): Promise<void> {
    const currentUserId = this.store.currentUser()?.id;

    this.selectedPhotoIndex.set(0);
    this.selectedListing.set(listing);

    if (currentUserId && listing.ownerUserId === currentUserId) {
      return;
    }

    try {
      const updatedListing = await this.store.trackListingView(listing.id, currentUserId);
      this.selectedListing.set(updatedListing);
    } catch {
      this.notice.set('La consultation est ouverte, mais la vue n’a pas pu être comptabilisée.');
    }
  }

  closeListing(): void {
    this.selectedListing.set(null);
    this.selectedPhotoIndex.set(0);
  }

  previousSelectedPhoto(event: Event): void {
    event.stopPropagation();
    this.moveSelectedPhoto(-1);
  }

  nextSelectedPhoto(event: Event): void {
    event.stopPropagation();
    this.moveSelectedPhoto(1);
  }

  selectedPhoto(): string {
    const listing = this.selectedListing();
    const photos = listing?.photos ?? [];

    if (!photos.length) {
      return '';
    }

    return photos[Math.min(this.selectedPhotoIndex(), photos.length - 1)]?.dataUrl ?? photos[0].dataUrl;
  }

  openContact(listing: MarketplaceListing): void {
    this.contactListing.set(listing);
    this.messageBody.set('');
    this.messageError.set('');
  }

  closeContact(): void {
    this.contactListing.set(null);
    this.messageBody.set('');
    this.messageError.set('');
  }

  async sendMessage(): Promise<void> {
    const listing = this.contactListing();
    const user = this.store.currentUser();
    const body = this.messageBody().trim();

    if (!listing || !user || this.isSendingMessage()) {
      return;
    }

    if (body.length < 8) {
      this.messageError.set('Écris un message un peu plus précis avant d’envoyer.');
      return;
    }

    this.isSendingMessage.set(true);

    try {
      await this.store.sendListingMessage(listing.id, user.id, body, listing.ownerUserId);
      this.closeConversation();
      this.activePage.set('messages');
      this.notice.set('Message envoyé au propriétaire de l’annonce.');
      this.closeContact();
    } catch {
      this.messageError.set('Impossible d’envoyer le message pour le moment.');
    } finally {
      this.isSendingMessage.set(false);
    }
  }

  async markRead(message: ListingMessage): Promise<void> {
    const user = this.store.currentUser();

    if (!user || message.recipientId !== user.id || message.readAt) {
      return;
    }

    await this.store.markListingMessageRead(message.id, user.id);
  }

  openConversation(conversation: MessageConversation): void {
    this.activeConversationKey.set(conversation.key);
    this.chatBody.set('');
    this.chatError.set('');
    void this.markConversationRead(conversation);
  }

  closeConversation(): void {
    this.activeConversationKey.set(null);
    this.chatBody.set('');
    this.chatError.set('');
  }

  async sendChatMessage(): Promise<void> {
    const conversation = this.activeConversation();
    const user = this.store.currentUser();
    const body = this.chatBody().trim();

    if (!conversation || !user || this.isSendingChatMessage()) {
      return;
    }

    if (body.length < 3) {
      this.chatError.set('Écris une réponse avant d’envoyer.');
      return;
    }

    this.isSendingChatMessage.set(true);

    try {
      await this.store.sendListingMessage(
        conversation.listingId,
        user.id,
        body,
        conversation.counterpartId,
      );
      this.activeConversationKey.set(conversation.key);
      this.chatBody.set('');
      this.chatError.set('');
    } catch {
      this.chatError.set('Impossible d’envoyer la réponse pour le moment.');
    } finally {
      this.isSendingChatMessage.set(false);
    }
  }

  submitChatOnEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;

    if (keyboardEvent.shiftKey) {
      return;
    }

    keyboardEvent.preventDefault();
    void this.sendChatMessage();
  }

  isIncoming(message: ListingMessage): boolean {
    return message.recipientId === this.store.currentUser()?.id;
  }

  async saveAccountProfile(): Promise<void> {
    const user = this.store.currentUser();

    if (!user || this.isSavingProfile()) {
      return;
    }

    this.accountError.set('');

    if (
      !this.accountFirstName().trim() ||
      !this.accountLastName().trim() ||
      !this.accountUsername().trim() ||
      !this.accountPhone().trim() ||
      !this.accountEmail().trim() ||
      !this.accountBirthDate().trim()
    ) {
      this.accountError.set('Tous les champs du profil sont obligatoires, pseudo compris.');
      return;
    }

    if (this.accountUsername().trim().length < 3) {
      this.accountError.set('Le nom d’utilisateur doit contenir au moins 3 caractères.');
      return;
    }

    if (!/^[\p{L}0-9._-]+$/u.test(this.accountUsername().trim())) {
      this.accountError.set('Le nom d’utilisateur ne doit contenir que lettres, chiffres, points, tirets ou underscores.');
      return;
    }

    this.isSavingProfile.set(true);

    try {
      await this.store.updateUserProfile(user.id, {
        username: this.accountUsername().trim(),
        firstName: this.accountFirstName().trim(),
        lastName: this.accountLastName().trim(),
        phone: this.accountPhone().trim(),
        email: this.accountEmail().trim().toLowerCase(),
        birthDate: this.accountBirthDate().trim(),
      });
      this.notice.set('Informations du compte mises à jour.');
    } catch {
      this.accountError.set('Impossible de mettre à jour le compte. Vérifie que l’email et le pseudo sont uniques.');
    } finally {
      this.isSavingProfile.set(false);
    }
  }

  async savePassword(): Promise<void> {
    const user = this.store.currentUser();

    if (!user || this.isSavingPassword()) {
      return;
    }

    this.passwordError.set('');

    if (this.newPassword().length < 6) {
      this.passwordError.set('Le nouveau mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    if (this.newPassword() !== this.confirmPassword()) {
      this.passwordError.set('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    this.isSavingPassword.set(true);

    try {
      await this.store.updatePassword(user.id, {
        currentPassword: this.currentPassword(),
        newPassword: this.newPassword(),
      });
      this.currentPassword.set('');
      this.newPassword.set('');
      this.confirmPassword.set('');
      this.notice.set('Mot de passe mis à jour.');
    } catch {
      this.passwordError.set('Impossible de modifier le mot de passe. Vérifie le mot de passe actuel.');
    } finally {
      this.isSavingPassword.set(false);
    }
  }

  async handleVerificationFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    this.verificationError.set('');
    this.verificationDocument.set(null);

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      this.verificationError.set('La pièce doit être une image ou un PDF.');
      input.value = '';
      return;
    }

    if (file.size > MAX_VERIFICATION_FILE_SIZE) {
      this.verificationError.set('Le fichier dépasse 5 Mo.');
      input.value = '';
      return;
    }

    try {
      const document = file.type.startsWith('image/')
        ? await this.compressVerificationImage(file)
        : await this.readPdfVerificationDocument(file);
      this.verificationDocument.set(document);
    } catch (error) {
      this.verificationError.set(
        error instanceof Error
          ? error.message
          : 'Impossible de préparer cette pièce. Essaie avec un fichier moins lourd.',
      );
      input.value = '';
    }
  }

  async requestAccountVerification(): Promise<void> {
    const user = this.store.currentUser();
    const document = this.verificationDocument();

    if (!user || !document || this.isSendingVerification()) {
      this.verificationError.set('Ajoute d’abord une pièce d’identité.');
      return;
    }

    this.isSendingVerification.set(true);

    try {
      await this.store.requestVerification(user.id, document);
      this.verificationDocument.set(null);
      this.verificationError.set('');
      this.notice.set('Demande de vérification envoyée. Un administrateur pourra la valider.');
    } catch {
      this.verificationError.set('Impossible d’envoyer la vérification pour le moment.');
    } finally {
      this.isSendingVerification.set(false);
    }
  }

  async deleteAccount(): Promise<void> {
    const user = this.store.currentUser();

    if (!user || this.isDeletingAccount()) {
      return;
    }

    const confirmed = confirm(
      'Supprimer ton compte ? Il sera désactivé pendant 60 jours. Une reconnexion avant ce délai annulera la suppression.',
    );

    if (!confirmed) {
      return;
    }

    this.isDeletingAccount.set(true);
    this.accountError.set('');

    try {
      await this.store.deactivateAccount(user.id);
    } catch {
      this.accountError.set('Impossible de programmer la suppression du compte pour le moment.');
      this.isDeletingAccount.set(false);
    }
  }

  canSeeListingViews(listing: MarketplaceListing): boolean {
    return listing.ownerUserId === this.store.currentUser()?.id;
  }

  previousListingPage(): void {
    this.goToListingPage(this.currentListingPage() - 1);
  }

  nextListingPage(): void {
    this.goToListingPage(this.currentListingPage() + 1);
  }

  goToListingPage(page: number): void {
    this.listingPage.set(Math.min(Math.max(1, page), this.totalListingPages()));
  }

  listingRangeLabel(): string {
    const total = this.filteredListings().length;

    if (!total) {
      return '0 annonce';
    }

    const start = (this.currentListingPage() - 1) * LISTING_PAGE_SIZE + 1;
    const end = Math.min(start + LISTING_PAGE_SIZE - 1, total);

    return `${start}–${end} sur ${total} annonce(s)`;
  }

  isOwnerVerified(ownerUserId?: string): boolean {
    return this.store.isUserVerified(ownerUserId);
  }

  accountVerificationLabel(): string {
    switch (this.store.currentUser()?.verificationStatus) {
      case 'VERIFIED':
        return 'Compte vérifié';
      case 'PENDING':
        return 'Vérification en attente';
      case 'REJECTED':
        return 'À renvoyer';
      default:
        return 'Profil & sécurité';
    }
  }

  verificationStatusLabel(): string {
    return this.accountVerificationLabel();
  }

  currentUserDisplayName(): string {
    const user = this.store.currentUser();
    return user?.username || user?.name || 'Utilisateur';
  }

  listingStatusLabel(listing: MarketplaceListing): string {
    switch (listing.status) {
      case 'PUBLISHED':
        return 'Active';
      case 'INACTIVE':
        return 'Désactivée';
      case 'ARCHIVED':
        return 'Archivée';
      default:
        return 'Annonce';
    }
  }

  documentSizeLabel(size: number): string {
    if (size >= 1_000_000) {
      return `${(size / 1_000_000).toFixed(1).replace('.', ',')} Mo`;
    }

    return `${Math.max(1, Math.round(size / 1000))} Ko`;
  }

  conversationSnippet(conversation: MessageConversation): string {
    const prefix = this.isIncoming(conversation.lastMessage) ? '' : 'Vous : ';
    const body = conversation.lastMessage.body.replace(/\s+/g, ' ').trim();
    return `${prefix}${body}`;
  }

  conversationAvatar(conversation: MessageConversation): string {
    return conversation.listing?.photos?.[0]?.dataUrl ?? '';
  }

  userInitials(name?: string): string {
    const parts = (name || 'IP')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    return parts.map((part) => part[0]?.toUpperCase()).join('') || 'IP';
  }

  messageTime(value?: string): string {
    if (!value) {
      return '';
    }

    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = new Date(isDateOnly ? `${value}T00:00:00` : value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    if (isDateOnly) {
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(date);
    }

    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();

    return new Intl.DateTimeFormat(
      'fr-FR',
      sameDay
        ? { hour: '2-digit', minute: '2-digit' }
        : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' },
    ).format(date);
  }

  listingPrice(listing: MarketplaceListing | undefined): string {
    if (!listing) {
      return '';
    }

    const amount = listing.transactionType === 'SALE' ? listing.salePrice : listing.monthlyRent;
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      maximumFractionDigits: 0,
    })
      .format(amount || 0)
      .replace(/\u00A0|\u202F/g, ' ');
  }

  isListingBoostActive(listing: MarketplaceListing): boolean {
    const today = new Date().toISOString().slice(0, 10);
    return Boolean(listing.boosted && (!listing.boostedUntil || listing.boostedUntil >= today));
  }

  logout(): void {
    this.store.logout();
  }

  private moveSelectedPhoto(direction: number): void {
    const listing = this.selectedListing();
    const photoCount = listing?.photos?.length ?? 0;

    if (!photoCount) {
      return;
    }

    this.selectedPhotoIndex.update((index) => (index + direction + photoCount) % photoCount);
  }

  private resetListingPage(): void {
    this.listingPage.set(1);
  }

  private loadAccountForm(): void {
    const user = this.store.currentUser();

    if (!user) {
      return;
    }

    this.accountFirstName.set(user.firstName || user.name.split(' ')[0] || '');
    this.accountLastName.set(user.lastName || user.name.split(' ').slice(1).join(' ') || '');
    this.accountUsername.set(user.username || this.suggestUsername(user));
    this.accountPhone.set(user.phone || '');
    this.accountEmail.set(user.email || '');
    this.accountBirthDate.set(user.birthDate || '');
    this.accountError.set('');
    this.passwordError.set('');
    this.verificationError.set('');
  }

  private suggestUsername(user: User): string {
    const source = user.email?.split('@')[0] || user.name || 'utilisateur';
    const username = source
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 30);

    return username.length >= 3 ? username : `user.${username || 'immo'}`;
  }

  private async readPdfVerificationDocument(file: File): Promise<VerificationRequestInput> {
    if (file.size > MAX_VERIFICATION_PDF_SIZE) {
      throw new Error('Le PDF est trop lourd pour être stocké. Utilise un PDF plus léger ou une image.');
    }

    const dataUrl = await this.readFileDataUrl(file);

    if (dataUrl.length > MAX_STORED_VERIFICATION_DATA_URL_LENGTH) {
      throw new Error('Le PDF est trop lourd pour être stocké.');
    }

    return {
      documentName: file.name,
      documentType: file.type,
      documentSize: file.size,
      dataUrl,
    };
  }

  private async compressVerificationImage(file: File): Promise<VerificationRequestInput> {
    const dataUrl = await this.readFileDataUrl(file);
    const image = await this.loadImage(dataUrl);
    let maxSide = VERIFICATION_IMAGE_MAX_SIDE;
    let quality = 0.82;
    let optimizedDataUrl = this.renderImage(image, maxSide, quality);

    while (optimizedDataUrl.length > MAX_STORED_VERIFICATION_DATA_URL_LENGTH && quality > 0.48) {
      quality -= 0.08;
      optimizedDataUrl = this.renderImage(image, maxSide, quality);
    }

    while (optimizedDataUrl.length > MAX_STORED_VERIFICATION_DATA_URL_LENGTH && maxSide > 720) {
      maxSide = Math.floor(maxSide * 0.84);
      quality = Math.max(quality - 0.04, 0.46);
      optimizedDataUrl = this.renderImage(image, maxSide, quality);
    }

    if (optimizedDataUrl.length > MAX_STORED_VERIFICATION_DATA_URL_LENGTH) {
      throw new Error('L’image reste trop lourde après optimisation.');
    }

    return {
      documentName: this.jpegName(file.name),
      documentType: 'image/jpeg',
      documentSize: this.estimatedBinarySize(optimizedDataUrl),
      dataUrl: optimizedDataUrl,
    };
  }

  private readFileDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
      reader.readAsDataURL(file);
    });
  }

  private loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image illisible.'));
      image.src = dataUrl;
    });
  }

  private renderImage(image: HTMLImageElement, maxSide: number, quality: number): string {
    const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Compression image indisponible.');
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  }

  private estimatedBinarySize(dataUrl: string): number {
    const base64 = dataUrl.split(',')[1] ?? '';
    return Math.floor((base64.length * 3) / 4);
  }

  private jpegName(name: string): string {
    return name.replace(/\.[^.]+$/, '') + '.jpg';
  }

  private async markConversationRead(conversation: MessageConversation): Promise<void> {
    const user = this.store.currentUser();

    if (!user) {
      return;
    }

    const unreadMessages = conversation.messages.filter(
      (message) => message.recipientId === user.id && !message.readAt,
    );

    for (const message of unreadMessages) {
      try {
        await this.store.markListingMessageRead(message.id, user.id);
      } catch {
        this.chatError.set('Certains messages n’ont pas pu être marqués comme lus.');
      }
    }
  }

  private buildConversationKey(listingId: string, counterpartId: string): string {
    return `${listingId}::${counterpartId}`;
  }

  private messageSortValue(value?: string): string {
    return value || '';
  }

  private readOptionalNumber(event: Event): number | null {
    const value = Number((event.target as HTMLInputElement).value);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }
}
