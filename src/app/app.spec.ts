import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the login screen', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.componentInstance.store.isInitialized()).toBe(false);
    expect(fixture.nativeElement.querySelector('.app-bootstrap-screen')).toBeTruthy();

    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const loginInputs = Array.from(compiled.querySelectorAll<HTMLInputElement>('.auth-form input'));

    expect(compiled.textContent).toContain('Un espace clair pour suivre tes biens.');
    expect(compiled.querySelector('form')).toBeTruthy();
    expect(compiled.querySelector('button[type="submit"]')?.textContent).toContain('Se connecter');
    expect(loginInputs.map((input) => input.value)).toEqual(['', '']);
    expect(compiled.querySelector('.demo-box')).toBeNull();
    expect(compiled.querySelector('.app-bootstrap-screen')).toBeNull();
  });
});
