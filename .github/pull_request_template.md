## Summary

<!-- What changed and why. -->

## Checklist

- [ ] `npm run typecheck` + `npm run lint` pass for the client (also enforced by the pre-commit hook + CI).
- [ ] **Schema change?** Regenerated **both** `supabase/schema.sql` (`npx supabase db dump -f supabase/schema.sql` — needs the linked CLI + Docker running) **and** `client/src/types/database.types.ts`. CI blocks a `database.types.ts` change that isn't accompanied by a `supabase/schema.sql` change.
- [ ] Docs updated if a behavior or convention changed (`CLAUDE.md` / `supabase/README.md`).
