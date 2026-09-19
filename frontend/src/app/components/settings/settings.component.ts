import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { JobHuntService } from '../../services/job-hunt.service';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class SettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly jobHunt = inject(JobHuntService);

  form!: FormGroup;
  configured = false;
  masked: string | null = null;
  saved = false;
  error: string | null = null;

  profileJson = '';
  profileSaved = false;
  profileError: string | null = null;

  ngOnInit(): void {
    this.form = this.fb.group({ key: ['', Validators.required] });
    this.jobHunt.getJevKeyMasked().subscribe({
      next: (res) => {
        this.configured = res.configured;
        this.masked = res.masked;
      },
      error: () => {},
    });
    this.jobHunt.getProfile().subscribe({
      next: (res) => {
        if (res.profile) this.profileJson = JSON.stringify(res.profile, null, 2);
      },
      error: () => {},
    });
  }

  onSave(): void {
    if (this.form.invalid) return;
    this.saved = false;
    this.error = null;
    this.jobHunt.saveJevKey(this.form.value.key).subscribe({
      next: () => {
        this.saved = true;
        this.configured = true;
        this.form.reset();
        this.jobHunt.getJevKeyMasked().subscribe((res) => {
          this.masked = res.masked;
        });
      },
      error: () => {
        this.error = 'Failed to save key';
      },
    });
  }

  onSaveProfile(): void {
    this.profileSaved = false;
    this.profileError = null;
    let parsed: any;
    try {
      parsed = JSON.parse(this.profileJson);
    } catch {
      this.profileError = 'Invalid JSON';
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      this.profileError = 'Profile must be a JSON object';
      return;
    }
    this.jobHunt.saveProfile(parsed).subscribe({
      next: () => {
        this.profileSaved = true;
      },
      error: () => {
        this.profileError = 'Failed to save profile';
      },
    });
  }
}
