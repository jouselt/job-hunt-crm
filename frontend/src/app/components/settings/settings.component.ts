import { Component, OnInit, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { JobHuntService } from '../../services/job-hunt.service';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule],
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

  ngOnInit(): void {
    this.form = this.fb.group({
      key: ['', Validators.required],
    });
    this.jobHunt.getJevKeyMasked().subscribe({
      next: (res) => {
        this.configured = res.configured;
        this.masked = res.masked;
      },
      error: () => {
        this.configured = false;
        this.masked = null;
      },
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
}
