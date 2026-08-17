import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProfilePhotoInput } from '../../models';
import { LucideIconComponent } from '../lucide-icon.component';

const MAX_PROFILE_PHOTO_SIZE = 5_000_000;
const PROFILE_PHOTO_OUTPUT_SIZE = 512;

@Component({
  selector: 'app-profile-photo-editor',
  imports: [FormsModule, LucideIconComponent],
  templateUrl: './profile-photo-editor.component.html',
  styleUrl: './profile-photo-editor.component.scss',
})
export class ProfilePhotoEditorComponent implements OnChanges {
  @Input() open = false;
  @Input() currentPhoto = '';
  @Input() displayName = '';
  @Input() isSaving = false;
  @Input() serverError = '';

  @Output() openEditor = new EventEmitter<void>();
  @Output() closeEditor = new EventEmitter<void>();
  @Output() savePhoto = new EventEmitter<ProfilePhotoInput>();
  @Output() removePhoto = new EventEmitter<void>();

  readonly sourceDataUrl = signal('');
  readonly sourceName = signal('photo-profil.jpg');
  readonly zoom = signal(1);
  readonly positionX = signal(50);
  readonly positionY = signal(50);
  readonly error = signal('');
  readonly isPreparing = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue === true) {
      this.resetEditor();
    }
  }

  async handleFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    this.error.set('');

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.error.set('Sélectionne une image au format JPEG, PNG ou WebP.');
      input.value = '';
      return;
    }

    if (file.size > MAX_PROFILE_PHOTO_SIZE) {
      this.error.set('La photo ne doit pas dépasser 5 Mo.');
      input.value = '';
      return;
    }

    try {
      const dataUrl = await this.readFileDataUrl(file);
      await this.loadImage(dataUrl);
      this.sourceDataUrl.set(dataUrl);
      this.sourceName.set(file.name || 'photo-profil.jpg');
      this.zoom.set(1);
      this.positionX.set(50);
      this.positionY.set(50);
    } catch {
      this.error.set('Impossible de lire cette image. Essaie avec une autre photo.');
    } finally {
      input.value = '';
    }
  }

  async confirmCrop(): Promise<void> {
    if (!this.sourceDataUrl() || this.isPreparing() || this.isSaving) {
      return;
    }

    this.error.set('');
    this.isPreparing.set(true);

    try {
      const image = await this.loadImage(this.sourceDataUrl());
      const cropSide = Math.min(image.naturalWidth, image.naturalHeight) / this.zoom();
      const maxX = Math.max(0, image.naturalWidth - cropSide);
      const maxY = Math.max(0, image.naturalHeight - cropSide);
      const sourceX = maxX * (this.positionX() / 100);
      const sourceY = maxY * (this.positionY() / 100);
      const canvas = document.createElement('canvas');

      canvas.width = PROFILE_PHOTO_OUTPUT_SIZE;
      canvas.height = PROFILE_PHOTO_OUTPUT_SIZE;

      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Canvas indisponible');
      }

      context.drawImage(
        image,
        sourceX,
        sourceY,
        cropSide,
        cropSide,
        0,
        0,
        PROFILE_PHOTO_OUTPUT_SIZE,
        PROFILE_PHOTO_OUTPUT_SIZE,
      );

      const blob = await this.canvasBlob(canvas);
      const dataUrl = await this.readFileDataUrl(blob);

      this.savePhoto.emit({
        name: this.jpegName(this.sourceName()),
        type: blob.type || 'image/jpeg',
        size: blob.size,
        dataUrl,
      });
    } catch {
      this.error.set('Le recadrage a échoué. Essaie avec une autre image.');
    } finally {
      this.isPreparing.set(false);
    }
  }

  previewTransform(): string {
    return `scale(${this.zoom()})`;
  }

  previewPosition(): string {
    return `${this.positionX()}% ${this.positionY()}%`;
  }

  private resetEditor(): void {
    this.sourceDataUrl.set('');
    this.sourceName.set('photo-profil.jpg');
    this.zoom.set(1);
    this.positionX.set(50);
    this.positionY.set(50);
    this.error.set('');
    this.isPreparing.set(false);
  }

  private readFileDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image invalide'));
      image.src = source;
    });
  }

  private canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Conversion impossible'))),
        'image/jpeg',
        0.88,
      );
    });
  }

  private jpegName(name: string): string {
    return `${name.replace(/\.[^.]+$/, '') || 'photo-profil'}.jpg`;
  }
}
