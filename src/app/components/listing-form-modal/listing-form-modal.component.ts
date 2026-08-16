import {
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  Output,
  signal,
  SimpleChanges,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ListingInput,
  ListingPhoto,
  ListingPropertyType,
  ListingTransactionType,
  MarketplaceListing,
  User,
} from '../../models';

const MAX_PHOTO_SIZE = 5_000_000;
const MAX_STORED_PHOTO_DATA_URL_LENGTH = 950_000;
const INITIAL_IMAGE_MAX_SIDE = 1600;

@Component({
  selector: 'app-listing-form-modal',
  imports: [ReactiveFormsModule],
  templateUrl: './listing-form-modal.component.html',
  styleUrl: './listing-form-modal.component.scss',
})
export class ListingFormModalComponent implements OnChanges {
  @Input({ required: true }) currentUser!: User;
  @Input() listing: MarketplaceListing | null = null;
  @Input() isSaving = false;

  @Output() save = new EventEmitter<ListingInput>();
  @Output() cancel = new EventEmitter<void>();

  private readonly fb = inject(NonNullableFormBuilder);

  readonly photos = signal<ListingPhoto[]>([]);
  readonly error = signal('');

  readonly propertyTypes: Array<{ value: ListingPropertyType; label: string }> = [
    { value: 'LAND', label: 'Terrain' },
    { value: 'BUILDING', label: 'Immeuble' },
    { value: 'HOUSE', label: 'Maison' },
    { value: 'APARTMENT', label: 'Appartement' },
    { value: 'ROOM', label: 'Chambre' },
    { value: 'STUDIO', label: 'Studio' },
    { value: 'OFFICE', label: 'Bureau' },
    { value: 'OTHER', label: 'Autre' },
  ];

  readonly durationUnits = ['jour', 'semaine', 'mois', 'année'];

  readonly form = this.fb.group({
    title: ['', Validators.required],
    transactionType: this.fb.control<ListingTransactionType>('RENT', Validators.required),
    propertyType: this.fb.control<ListingPropertyType>('HOUSE', Validators.required),
    address: ['', Validators.required],
    city: [''],
    district: [''],
    contactPhone: ['', Validators.required],
    landTitleAvailable: [false],
    salePrice: [0],
    monthlyRent: [0],
    rentalDurationValue: [1],
    rentalDurationUnit: ['mois'],
    bedroomCount: [0],
    bathroomCount: [0],
    surfaceArea: [0],
    description: [''],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['listing'] || changes['currentUser']) {
      this.hydrateForm();
    }
  }

  get isEditMode(): boolean {
    return Boolean(this.listing);
  }

  get transactionType(): ListingTransactionType {
    return this.form.controls.transactionType.value;
  }

  async handlePhotoSelection(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';

    if (!files.length) {
      return;
    }

    const oversized = files.find((file) => file.size > MAX_PHOTO_SIZE);

    if (oversized) {
      this.error.set(`La photo "${oversized.name}" dépasse 5 Mo.`);
      return;
    }

    try {
      const readPhotos = await Promise.all(files.map((file) => this.readPhoto(file)));
      this.photos.update((photos) => [...photos, ...readPhotos]);
      this.error.set('');
    } catch {
      this.error.set('Impossible de lire une des photos sélectionnées.');
    }
  }

  removePhoto(photoId: string): void {
    this.photos.update((photos) => photos.filter((photo) => photo.id !== photoId));
  }

  async submit(): Promise<void> {
    if (this.isSaving) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Complète les champs obligatoires de l’annonce.');
      return;
    }

    if (this.photos().length < 3) {
      this.error.set('Ajoute au moins 3 photos du bien.');
      return;
    }

    const value = this.form.getRawValue();

    if (value.transactionType === 'SALE' && Number(value.salePrice) <= 0) {
      this.error.set('Renseigne le prix de vente.');
      return;
    }

    if (value.transactionType === 'RENT') {
      if (Number(value.monthlyRent) <= 0) {
        this.error.set('Renseigne le loyer.');
        return;
      }

      if (Number(value.rentalDurationValue) <= 0 || !value.rentalDurationUnit.trim()) {
        this.error.set('Renseigne la durée de location.');
        return;
      }
    }

    let photos: ListingPhoto[];

    try {
      photos = await this.optimizedPhotosForSave();
      this.photos.set(photos);
    } catch {
      this.error.set(
        'Une photo reste trop lourde après optimisation. Essaie avec une image moins grande.',
      );
      return;
    }

    this.error.set('');
    this.save.emit({
      ownerUserId: this.currentUser.id,
      title: value.title.trim(),
      transactionType: value.transactionType,
      propertyType: value.propertyType,
      address: value.address.trim(),
      city: value.city.trim(),
      district: value.district.trim(),
      contactPhone: value.contactPhone.trim(),
      landTitleAvailable: value.transactionType === 'SALE' && value.landTitleAvailable,
      salePrice: value.transactionType === 'SALE' ? Number(value.salePrice) : 0,
      monthlyRent: value.transactionType === 'RENT' ? Number(value.monthlyRent) : 0,
      rentalDurationValue: value.transactionType === 'RENT' ? Number(value.rentalDurationValue) : 0,
      rentalDurationUnit: value.transactionType === 'RENT' ? value.rentalDurationUnit.trim() : '',
      bedroomCount: Number(value.bedroomCount) || 0,
      bathroomCount: Number(value.bathroomCount) || 0,
      surfaceArea: Number(value.surfaceArea) || 0,
      description: value.description.trim(),
      photos,
    });
  }

  private hydrateForm(): void {
    const listing = this.listing;

    this.form.reset({
      title: listing?.title ?? '',
      transactionType: listing?.transactionType ?? 'RENT',
      propertyType: listing?.propertyType ?? 'HOUSE',
      address: listing?.address ?? '',
      city: listing?.city ?? '',
      district: listing?.district ?? '',
      contactPhone: listing?.contactPhone || this.currentUser?.phone || '',
      landTitleAvailable: listing?.landTitleAvailable ?? false,
      salePrice: listing?.salePrice ?? 0,
      monthlyRent: listing?.monthlyRent ?? 0,
      rentalDurationValue: listing?.rentalDurationValue || 1,
      rentalDurationUnit: listing?.rentalDurationUnit || 'mois',
      bedroomCount: listing?.bedroomCount ?? 0,
      bathroomCount: listing?.bathroomCount ?? 0,
      surfaceArea: listing?.surfaceArea ?? 0,
      description: listing?.description ?? '',
    });
    this.photos.set([...(listing?.photos ?? [])]);
    this.error.set('');
  }

  private async readPhoto(file: File): Promise<ListingPhoto> {
    const optimized = await this.compressImageFile(file);
    const randomId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.round(Math.random() * 100_000)}`;

    return {
      id: `photo-${randomId}`,
      name: this.jpegName(file.name),
      type: 'image/jpeg',
      size: this.estimatedBinarySize(optimized),
      dataUrl: optimized,
    };
  }

  private async optimizedPhotosForSave(): Promise<ListingPhoto[]> {
    return Promise.all(
      this.photos().map(async (photo) => {
        if (photo.dataUrl.length <= MAX_STORED_PHOTO_DATA_URL_LENGTH) {
          return photo;
        }

        const optimized = await this.compressDataUrl(photo.dataUrl);

        return {
          ...photo,
          name: this.jpegName(photo.name),
          type: 'image/jpeg',
          size: this.estimatedBinarySize(optimized),
          dataUrl: optimized,
        };
      }),
    );
  }

  private compressImageFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);

        try {
          resolve(this.encodeImage(image));
        } catch (error) {
          reject(error);
        }
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image illisible'));
      };

      image.src = objectUrl;
    });
  }

  private compressDataUrl(dataUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => {
        try {
          resolve(this.encodeImage(image));
        } catch (error) {
          reject(error);
        }
      };

      image.onerror = () => reject(new Error('Image illisible'));
      image.src = dataUrl;
    });
  }

  private encodeImage(image: HTMLImageElement): string {
    let maxSide = INITIAL_IMAGE_MAX_SIDE;
    let quality = 0.82;
    let dataUrl = '';

    for (let attempt = 0; attempt < 12; attempt += 1) {
      dataUrl = this.renderImage(image, maxSide, quality);

      if (dataUrl.length <= MAX_STORED_PHOTO_DATA_URL_LENGTH) {
        return dataUrl;
      }

      if (quality > 0.58) {
        quality = Math.max(0.58, quality - 0.08);
      } else {
        maxSide = Math.max(900, Math.round(maxSide * 0.82));
        quality = 0.78;
      }
    }

    if (dataUrl.length <= MAX_STORED_PHOTO_DATA_URL_LENGTH) {
      return dataUrl;
    }

    throw new Error('Image trop lourde');
  }

  private renderImage(image: HTMLImageElement, maxSide: number, quality: number): string {
    const ratio = Math.min(maxSide / image.naturalWidth, maxSide / image.naturalHeight, 1);
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas indisponible');
    }

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', quality);
  }

  private estimatedBinarySize(dataUrl: string): number {
    const base64 = dataUrl.split(',')[1] ?? '';
    return Math.round(base64.length * 0.75);
  }

  private jpegName(name: string): string {
    return name.replace(/\.[^.]+$/, '') + '.jpg';
  }
}
