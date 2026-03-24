-- Canonical schema convergence:
-- 1) users.role is authoritative; users.is_admin is deprecated compatibility
-- 2) questions is authoritative; mcq_questions is deprecated compatibility

DO $$
DECLARE
  has_users boolean;
  has_role boolean;
  has_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) INTO has_users;

  IF NOT has_users THEN
    RAISE NOTICE '[schema_convergence] public.users not found; skipping users role/admin convergence';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
  ) INTO has_role;

  IF NOT has_role THEN
    ALTER TABLE public.users ADD COLUMN role text;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_admin'
  ) INTO has_is_admin;

  IF has_is_admin THEN
    EXECUTE $sql$
      UPDATE public.users
      SET role = CASE
        WHEN coalesce(is_admin, false) THEN 'admin'
        ELSE 'student'
      END
      WHERE role IS NULL
    $sql$;
  ELSE
    UPDATE public.users
    SET role = 'student'
    WHERE role IS NULL;
  END IF;

  ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'student';
  UPDATE public.users SET role = 'student' WHERE role IS NULL;

  ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE public.users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('student', 'teacher', 'admin', 'school_admin'));

  ALTER TABLE public.users ALTER COLUMN role SET NOT NULL;

  IF has_is_admin THEN
    UPDATE public.users
    SET is_admin = (role = 'admin')
    WHERE is_admin IS DISTINCT FROM (role = 'admin');

    CREATE OR REPLACE FUNCTION public.sync_users_role_is_admin()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      IF NEW.role IS NULL THEN
        NEW.role := CASE WHEN coalesce(NEW.is_admin, false) THEN 'admin' ELSE 'student' END;
      END IF;

      NEW.is_admin := (NEW.role = 'admin');
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_sync_users_role_is_admin ON public.users;
    CREATE TRIGGER trg_sync_users_role_is_admin
    BEFORE INSERT OR UPDATE OF role, is_admin
    ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_users_role_is_admin();

    COMMENT ON COLUMN public.users.is_admin IS 'DEPRECATED: use users.role as canonical authorization field.';
  END IF;
END
$$;

DO $$
DECLARE
  has_questions boolean;
  has_mcq boolean;
  mcq_relkind "char";
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'questions'
  ) INTO has_questions;

  IF NOT has_questions THEN
    RAISE NOTICE '[schema_convergence] public.questions not found; skipping mcq/questions convergence';
    RETURN;
  END IF;

  ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS grade integer;
  ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS lang text DEFAULT 'ru';
  ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

  SELECT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'mcq_questions'
  ) INTO has_mcq;

  IF has_mcq THEN
    SELECT c.relkind
    INTO mcq_relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'mcq_questions'
    LIMIT 1;

    IF mcq_relkind = 'r' THEN
      COMMENT ON TABLE public.mcq_questions IS 'DEPRECATED: canonical question bank is public.questions.';
    END IF;
  ELSE
    EXECUTE $sql$
      CREATE VIEW public.mcq_questions AS
      SELECT
        q.id,
        q.grade,
        q.difficulty,
        coalesce(q.is_active, true) AS active,
        q.question_text AS stem,
        coalesce(q.lang, 'ru') AS lang,
        q.subject,
        coalesce(q.options->>0, '') AS opt1,
        coalesce(q.options->>1, '') AS opt2,
        coalesce(q.options->>2, '') AS opt3,
        coalesce(q.options->>3, '') AS opt4,
        CASE
          WHEN q.correct_answer ~ '^[1-4]$' THEN q.correct_answer::integer
          WHEN q.correct_answer ILIKE 'A' THEN 1
          WHEN q.correct_answer ILIKE 'B' THEN 2
          WHEN q.correct_answer ILIKE 'C' THEN 3
          WHEN q.correct_answer ILIKE 'D' THEN 4
          ELSE 1
        END AS correct
      FROM public.questions q
    $sql$;

    COMMENT ON VIEW public.mcq_questions IS 'DEPRECATED compatibility view over public.questions. New code must query public.questions directly.';
  END IF;
END
$$;
