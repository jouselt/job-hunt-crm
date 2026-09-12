# 07: Job Hunt CRM — Proposal (Angular/NestJS Edition)

## Problem
Job seeking is chaotic: candidates juggle multiple applications, interview stages, recruiter follow-ups, and referral deadlines. Most rely on scattered notes, spreadsheets, or memory — leading to missed opportunities and unprofessional recruiter experiences. A lightweight CRM gives candidates process discipline and recruiters an organized, responsive applicant.

## Goal
Build a **job application tracking web app** that lets candidates log applications, track stages (applied → screened → interview → offer), schedule follow-ups, and view pipeline analytics. Recruiters admire candidates who treat job-seeking as a managed pipeline.

## Target Recruiter Signal
A recruiter asks "Where are you in your job search?" → the candidate opens their CRM, shows stage + next follow-up date → signals organization, professionalism, and process maturity.

## Tech Stack (Angular/NestJS)
- **Framework**: Angular 22 (standalone) + NgRx (optional, for state management) or simple Services; if preferring lighter: just NestJS Services + BehaviorSubject
- **Database**: NestJS + PostgreSQL (self-hosted on AWS/EKS or Supabase) — tables: applications: company, role, stage, applied_date, follow_up_date, notes, source [linkedin| indeed| referral]
- **UI**: Simple forms + pipeline Kanban board (stage columns); calendar follow-up reminders
- **Notifications**: NestJS Edge Function daily cron that checks `follow_up_date <= today` and sends email via SendGrid; optional SMS
- **Deployment**: Angular to Vercel; NestJS + PostgreSQL to AWS/EKS or Supabase free tier

## Timeline
- Week 1: NestJS + PostgreSQL (or Supabase) project + auth; `applications` table schema; basic CRUD form (company, role, stage, date); deploy NestJS API.
- Week 2: Pipeline Kanban (stages as columns); drag-and-drop stage promotion; follow-up date picker; simple calendar view; connect Angular frontend to NestJS API via HttpClient.
- Week 3: Stage analytics: count by stage, time-in-stage distribution; "next follow-ups" list; email reminder hook (NestJS edge function + SendGrid).
- Week 4: Polish: dark mode, responsive; README with recruiter sample flow; deploy both Angular + NestJS; demo script.

## Acceptance Criteria
- [ ] Candidate can add a new job application (company, role, source, stage, follow-up date) via Angular UI → NestJS API
- [ ] Stage can be promoted via Kanban drag-and-drop or buttons (Applied → Screened → Interview → Offer) → NestJS API update
- [ ] "Next follow-ups" list shows applications due for follow-up today/this week → computed in NestJS service or Angular pipe
- [ ] Pipeline overview shows % of applications in each stage → NestJS service computes; Angular displays
- [ ] Live URL (Angular + NestJS API); README with sample recruiter interaction: "Ask me about my search and I'll show you my pipeline"