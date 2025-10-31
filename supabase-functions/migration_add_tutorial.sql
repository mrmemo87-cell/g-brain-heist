-- Add tutorial_completed column to users table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'tutorial_completed'
    ) THEN
        ALTER TABLE users ADD COLUMN tutorial_completed BOOLEAN DEFAULT FALSE;
        UPDATE users SET tutorial_completed = FALSE WHERE tutorial_completed IS NULL;
    END IF;
END $$;
