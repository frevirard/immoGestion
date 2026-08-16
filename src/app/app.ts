import { Component, inject } from '@angular/core';
import { ImmoStore } from './immo-store';
import { LoginComponent } from './components/login/login.component';
import { ShellComponent } from './components/shell/shell.component';
import { UserPortalComponent } from './components/user-portal/user-portal.component';

@Component({
  selector: 'app-root',
  imports: [LoginComponent, ShellComponent, UserPortalComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly store = inject(ImmoStore);
}
