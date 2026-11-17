# Upstream diff review

Authored by Run Edit Run fleet, 2026-11-17 UTC.

Baseline: published v0.5.16 (published 2026-11-17T06:55:05Z).
Reviewed main: 9ab0bb5f30aa4a6c2a40cf0fb83d7dda151e09e2.

- 395b92f1: practice-target action selects the normal saved monitor editor.
- fa0c841 and 63b37f4f: stale assigned checker coverage is distinct from historic target results; enabled destinations receive warnings; Run now refuses when no assigned checker reports. First-contact waiting behavior is preserved.
- 48bf8b9 and 820e6a0d: Responder Alerts uses the member controls; overview includes display name, role is shown and unsupported controls are hidden or explained. The follow-up preserves administrator monitor exports.
- f08a92a2: destination step-up explains enrollment/verification, retains destination input, and offers recovery-code copy/download. Removal confirmation names the member and last-owner refusal explains the constraint.
- 9ab0bb5f: field-report UI/download and import reconciliation enumerate supplied fields and count source checks separately from resources/TLS companions; native-flow steps survive withholding. The documentation explicitly limits synthetic proof and preserves unsupported migration work. The release notes describe these buyer-visible behaviors without describing test/CI/fixture work as product features.

The optional setup wording round is absent from the reviewed main diff, so the release notes omit it. The rer package and pnpm lock both use exactly 0.2.121. Source changes are release metadata only; no clause status, gap or evidence cell is changed. No CLAIM is made. Existing release sections are preserved verbatim.
