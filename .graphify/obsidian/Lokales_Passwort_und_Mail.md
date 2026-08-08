# Lokales Passwort und Mail

> 6 nodes

## Key Concepts

- **sendMail** (3 connections) — `artifacts/api-server/src/services/mailer.ts`
- **createOneTimePassword** (2 connections) — `artifacts/api-server/src/auth/providers/local.ts`
- **assertMailerConfig** (2 connections) — `artifacts/api-server/src/services/mailer.ts`
- **authLink** (2 connections) — `artifacts/api-server/src/services/mailer.ts`
- **Nodemailer-Transport (lazy, TLS erzwungen)** (2 connections) — `artifacts/api-server/src/services/mailer.ts`
- **hashPassword (bcrypt cost 12)** (1 connections) — `artifacts/api-server/src/auth/providers/local.ts`

## Relationships

- No strong cross-community connections detected

## Source Files

- `artifacts/api-server/src/auth/providers/local.ts`
- `artifacts/api-server/src/services/mailer.ts`

## Audit Trail

- EXTRACTED: 6 (50%)
- INFERRED: 6 (50%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*