import { TestBed } from '@angular/core/testing';
import { ProfilePhotoEditorComponent } from './profile-photo-editor.component';

describe('ProfilePhotoEditorComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfilePhotoEditorComponent],
    }).compileComponents();
  });

  it('shows a profile icon when no photo exists', () => {
    const fixture = TestBed.createComponent(ProfilePhotoEditorComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.profile-photo-avatar app-lucide-icon')).toBeTruthy();
    expect(compiled.textContent).toContain('Ajouter');
  });

  it('shows crop controls after an image is selected', () => {
    const fixture = TestBed.createComponent(ProfilePhotoEditorComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    fixture.componentInstance.sourceDataUrl.set('data:image/png;base64,AA==');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.profile-photo-modal')).toBeTruthy();
    expect(compiled.querySelectorAll('input[type="range"]')).toHaveLength(3);
    expect(compiled.textContent).toContain('Enregistrer la photo');
  });
});
