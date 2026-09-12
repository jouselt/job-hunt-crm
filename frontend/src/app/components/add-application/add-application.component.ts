import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { JobHuntService } from '../../services/job-hunt.service';
import { Application, Source } from '../../models/application.model';

@Component({
  selector: 'app-add-application',
  imports: [ReactiveFormsModule],
  templateUrl: './add-application.component.html',
  styleUrls: ['./add-application.component.css'],
})
export class AddApplicationComponent implements OnInit {
  form!: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly jobHuntService: JobHuntService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      company: ['', Validators.required],
      role: ['', Validators.required],
      source: ['linkedin' as Source],
      stage: ['applied' as Application['stage']],
      applied_date: [this.toDateISO(new Date()), Validators.required],
      follow_up_date: [''],
      notes: [''],
    });
  }

  private toDateISO(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    const dto: Partial<Application> = {
      ...this.form.value,
      follow_up_date: this.form.value.follow_up_date || null,
    };
    this.jobHuntService.createApplication(dto).subscribe({
      next: () => this.router.navigate(['/list']),
      error: () => {
        /* surface a validation/server error in a real app */
      },
    });
  }
}