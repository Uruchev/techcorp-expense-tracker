import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://btfhqhiczelfubwhobbl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0ZmhxaGljemVsZnVid2hvYmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5NDE0OTcsImV4cCI6MjA3NTUxNzQ5N30.2VqEOK8J2MrD6v2xaraJirJNYE215r3vyTL55OEXNko";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
